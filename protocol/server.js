/**
 * Stateful MCP Server core implementation for tianshu-research.
 * Implements connection-level dormant mode, workspace scope validation,
 * protocol version negotiation, robust binary UTF-8 stream framing,
 * and prefix cache defense via frozen tool exposure.
 */

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { generateExposureSnapshot, ACTIVE_TOOLS } from './exposure.js'
import {
  resolveWorkspaceScope,
  ScopeViolationError,
  canonicalizePath,
} from '../scope/workspace-scope.js'
import { assertInvocationAuthorized } from '../scope/invocation-guard.js'
import { runJournalPalette } from '../figure.js'
import { runResearchStatus } from '../tools/research-status.js'
import { runResearchQuery } from '../gateway-query.js'
import { runResearchEvidence } from '../gateway-evidence.js'
import { packToolResult } from './result-envelope.js'
import {
  validateJournalPaletteParams,
  validateResearchStatusParams,
  validateResearchQueryParams,
  validateResearchEvidenceParams,
} from '../contracts/validators.js'

export const SUPPORTED_PROTOCOL_VERSIONS = Object.freeze([
  '2024-11-05',
  '2025-03-26',
  '2025-06-18',
])
export const DEFAULT_PROTOCOL_VERSION = '2024-11-05'

function ok(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function fail(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function uriToLocalPath(uri) {
  if (!uri || typeof uri !== 'string') return null
  if (uri.startsWith('file://')) {
    try {
      return fileURLToPath(uri)
    } catch {
      return uri.replace(/^file:\/\/\/?/, '')
    }
  }
  return uri
}

/**
 * Robust JSON-RPC stream parser handling both newline-delimited JSON
 * and Content-Length framed HTTP/LSP payloads using exact byte-length framing.
 * Completely handles multi-byte UTF-8 sequences (e.g. Chinese characters) without truncation.
 */
export class StreamMessageParser {
  constructor(onMessage) {
    this.onMessage = onMessage
    this.buffer = Buffer.alloc(0)
  }

  feed(chunk) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, 'utf8')
    this.buffer = Buffer.concat([this.buffer, buf])
    this._processBuffer()
  }

  _processBuffer() {
    while (this.buffer.length > 0) {
      // Skip leading whitespace bytes (space, tab, CR, LF)
      let startIdx = 0
      while (
        startIdx < this.buffer.length &&
        (this.buffer[startIdx] === 32 ||
          this.buffer[startIdx] === 9 ||
          this.buffer[startIdx] === 13 ||
          this.buffer[startIdx] === 10)
      ) {
        startIdx++
      }
      if (startIdx > 0) {
        this.buffer = this.buffer.subarray(startIdx)
        if (this.buffer.length === 0) break
      }

      // Check if starts with Content-Length: (case-insensitive ASCII)
      const prefix = this.buffer
        .subarray(0, Math.min(15, this.buffer.length))
        .toString('ascii')
        .toLowerCase()

      if (prefix.startsWith('content-length:')) {
        // Find \r\n\r\n or \n\n delimiter
        let headerEnd = -1
        let delimLen = 4
        for (let i = 0; i <= this.buffer.length - 4; i++) {
          if (
            this.buffer[i] === 13 &&
            this.buffer[i + 1] === 10 &&
            this.buffer[i + 2] === 13 &&
            this.buffer[i + 3] === 10
          ) {
            headerEnd = i
            delimLen = 4
            break
          }
        }
        if (headerEnd === -1) {
          for (let i = 0; i <= this.buffer.length - 2; i++) {
            if (this.buffer[i] === 10 && this.buffer[i + 1] === 10) {
              headerEnd = i
              delimLen = 2
              break
            }
          }
        }

        if (headerEnd === -1) {
          // Incomplete headers, wait for more data
          break
        }

        const headerStr = this.buffer.subarray(0, headerEnd).toString('ascii')
        const match = headerStr.match(/content-length:\s*(\d+)/i)
        if (!match) {
          // Bad header, drop through next newline
          const nextLf = this.buffer.indexOf(10)
          this.buffer = nextLf === -1 ? Buffer.alloc(0) : this.buffer.subarray(nextLf + 1)
          continue
        }

        const contentLength = parseInt(match[1], 10)
        const bodyStart = headerEnd + delimLen
        const totalNeeded = bodyStart + contentLength

        if (this.buffer.length < totalNeeded) {
          // Incomplete body, wait for more bytes
          break
        }

        const bodyBuf = this.buffer.subarray(bodyStart, totalNeeded)
        this.buffer = this.buffer.subarray(totalNeeded)

        const bodyStr = bodyBuf.toString('utf8')
        try {
          const parsed = JSON.parse(bodyStr)
          this.onMessage(parsed)
        } catch (err) {
          this.onMessage({ __parseError: err, raw: bodyStr })
        }
      } else {
        // Line delimited JSON (NDJSON)
        const newlineIdx = this.buffer.indexOf(10) // 0x0A '\n'
        if (newlineIdx === -1) {
          break
        }

        const lineBuf = this.buffer.subarray(0, newlineIdx)
        this.buffer = this.buffer.subarray(newlineIdx + 1)

        const line = lineBuf.toString('utf8').trim()
        if (!line) continue

        try {
          const parsed = JSON.parse(line)
          this.onMessage(parsed)
        } catch (err) {
          this.onMessage({ __parseError: err, raw: line })
        }
      }
    }
  }
}

/**
 * Stateful MCP Server implementing connection-level dormant mode.
 */
export class McpServer {
  constructor(options = {}) {
    this.exposureMode = options.exposureMode || options.exposure || 'connection'
    this.workspace = options.workspace || process.env.TIANSHU_RESEARCH_WORKSPACE || null
    this.cwd = options.cwd || process.cwd()
    this.scopeBarrierTimeoutMs = options.scopeBarrierTimeoutMs ?? 500
    this.clientInfo = null
    this.clientCapabilities = {}
    this.outputStream = null
    this.pendingServerRequests = new Map()
    this.nextRequestId = 1
    this.diagnostics = {}

    this.state = 'negotiating'
    this.scope = null
    this.exposure = null
    this.isExposureFrozen = false

    this.scopeResolutionPromise = new Promise((resolve) => {
      this._resolveScopeBarrier = resolve
    })

    this._resolveInitialScope()
  }

  _resolveInitialScope() {
    if (this.workspace) {
      const candidate = resolveWorkspaceScope({
        workspace: this.workspace,
        source: 'launcher',
        trust: 'launcher-bound',
      })
      this.scope = candidate
      this.state = candidate.isResearchEligible ? 'active' : 'dormant'
      this.freezeExposure(this.state)
      if (this._resolveScopeBarrier) this._resolveScopeBarrier(this.state)
      return
    }

    // Do not auto-enable research based merely on cwd unless explicit .rivet/research.json exists
    const candidate = resolveWorkspaceScope({
      cwd: this.cwd,
      source: 'default',
    })

    if (candidate.isResearchEligible) {
      this.scope = candidate
      this.state = 'active'
    } else {
      this.scope = candidate
      this.state = 'dormant'
    }
  }

  _finalizeScopeDefault() {
    if (this.isExposureFrozen) return
    if (!this.scope) {
      this.scope = resolveWorkspaceScope({
        cwd: this.cwd,
        source: 'default',
      })
      this.state = this.scope.isResearchEligible ? 'active' : 'dormant'
    }
    this.freezeExposure(this.state)
  }

  freezeExposure(status = this.state) {
    if (this.isExposureFrozen) {
      return this.exposure
    }

    const effectiveStatus =
      status === 'active' ? 'active' : status === 'revoked' ? 'revoked' : 'dormant'

    this.exposure = generateExposureSnapshot(effectiveStatus, {
      mode: this.exposureMode,
      scopeId: this.scope?.scopeId,
    })
    this.isExposureFrozen = true

    if (this._resolveScopeBarrier) {
      this._resolveScopeBarrier(effectiveStatus)
    }

    return this.exposure
  }

  revoke() {
    this.state = 'revoked'
    if (this.scope) {
      this.scope.status = 'revoked'
      this.scope.trust = 'revoked'
    }

    // In connection mode, maintain the frozen tool definitions so the LLM prompt cache
    // schema does not shift, but invocation guard blocks all calls.
    this.exposure = generateExposureSnapshot('revoked', {
      mode: this.exposureMode,
      scopeId: this.scope?.scopeId,
    })
  }

  sendMessage(msg) {
    if (this.outputStream) {
      this.outputStream.write(JSON.stringify(msg) + '\n')
    }
  }

  async handleRootsResponse(msg) {
    const roots = msg?.result?.roots

    if (this.isExposureFrozen && this.exposureMode === 'connection') {
      // Hard Rule: Once frozen, late roots responses must NOT alter the public tools list
      this.diagnostics.lateRootsIgnored = roots
      return
    }

    if (!Array.isArray(roots) || roots.length === 0) {
      this.state = 'dormant'
      this.freezeExposure('dormant')
      return
    }

    if (roots.length > 1) {
      // Ambiguous multi-root without single workspace binding remains dormant
      this.state = 'dormant'
      this.freezeExposure('dormant')
      return
    }

    const rootUri = roots[0]?.uri
    const rootPath = uriToLocalPath(rootUri)
    if (!rootPath) {
      this.state = 'dormant'
      this.freezeExposure('dormant')
      return
    }

    const candidate = resolveWorkspaceScope({
      workspace: rootPath,
      source: 'client-roots',
      trust: 'client-exposed',
    })

    if (candidate.isResearchEligible) {
      this.scope = candidate
      this.state = 'active'
      this.freezeExposure('active')
    } else {
      this.scope = candidate
      this.state = 'dormant'
      this.freezeExposure('dormant')
    }
  }

  async handleRootsChangedResponse(msg) {
    const roots = msg?.result?.roots
    const validSingleRoot = Array.isArray(roots) && roots.length === 1
    let shouldRevoke = !validSingleRoot

    if (validSingleRoot) {
      const rootPath = uriToLocalPath(roots[0]?.uri)
      if (!rootPath || canonicalizePath(rootPath) !== this.scope?.canonicalRoot) {
        shouldRevoke = true
      }
    }

    if (shouldRevoke) {
      this.revoke()
    }
  }

  async handleMessage(msg) {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
      return fail(null, -32600, 'Invalid Request: payload must be a JSON object')
    }

    // Check if this message is a response to a server-initiated request (e.g. roots/list)
    if (msg.id !== undefined && msg.id !== null && this.pendingServerRequests.has(msg.id)) {
      const handler = this.pendingServerRequests.get(msg.id)
      this.pendingServerRequests.delete(msg.id)
      await handler(msg)
      return null
    }

    const isNotification = msg.id === undefined || msg.id === null
    const validId = typeof msg.id === 'string' || typeof msg.id === 'number'
    const effectiveId = validId ? msg.id : null

    if (msg.jsonrpc !== '2.0') {
      if (isNotification) return null
      return fail(effectiveId, -32600, "Invalid Request: jsonrpc must be '2.0'")
    }

    if (typeof msg.method !== 'string') {
      if (isNotification) return null
      return fail(effectiveId, -32600, 'Invalid Request: method must be a string')
    }

    const method = msg.method

    if (isNotification) {
      if (method === 'notifications/initialized' || method === 'initialized') {
        if (!this.workspace && this.clientCapabilities?.roots) {
          this.state = 'resolving_scope'
          const reqId = `srv-roots-${this.nextRequestId++}`
          this.pendingServerRequests.set(reqId, (response) => this.handleRootsResponse(response))
          this.sendMessage({
            jsonrpc: '2.0',
            id: reqId,
            method: 'roots/list',
          })

          // Set bounded barrier safety timeout
          setTimeout(() => {
            if (!this.isExposureFrozen) {
              this._finalizeScopeDefault()
            }
          }, this.scopeBarrierTimeoutMs)
        } else if (!this.workspace) {
          this._finalizeScopeDefault()
        }
        return null
      }

      if (method === 'notifications/roots/list_changed' || method === 'roots/list_changed') {
        if (this.state === 'active') {
          if (this.clientCapabilities?.roots) {
            const reqId = `srv-roots-${this.nextRequestId++}`
            this.pendingServerRequests.set(reqId, (response) =>
              this.handleRootsChangedResponse(response)
            )
            this.sendMessage({
              jsonrpc: '2.0',
              id: reqId,
              method: 'roots/list',
            })
          } else {
            this.revoke()
          }
        }
        return null
      }

      return null
    }

    if (!validId) {
      return fail(null, -32600, 'Invalid Request: id must be a string or number')
    }

    if (method.startsWith('notifications/') || method === 'initialized') {
      return fail(effectiveId, -32600, 'Invalid Request: notification method must not include an id')
    }

    try {
      if (method === 'initialize') {
        const clientVersion = msg.params?.protocolVersion
        const negotiatedVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(clientVersion)
          ? clientVersion
          : DEFAULT_PROTOCOL_VERSION

        this.clientCapabilities = msg.params?.capabilities || {}
        this.clientInfo = msg.params?.clientInfo || {}

        return ok(effectiveId, {
          protocolVersion: negotiatedVersion,
          capabilities: {
            tools: {
              listChanged: false,
            },
          },
          serverInfo: {
            name: 'tianshu-research',
            version: '0.2.0',
          },
        })
      }

      if (method === 'ping') {
        return ok(effectiveId, {})
      }

      if (method === 'tools/list') {
        if (!this.isExposureFrozen) {
          if (this.state === 'resolving_scope' && this.scopeResolutionPromise) {
            await Promise.race([
              this.scopeResolutionPromise,
              new Promise((res) => setTimeout(res, this.scopeBarrierTimeoutMs)),
            ])
          }
          if (!this.isExposureFrozen) {
            this._finalizeScopeDefault()
          }
        }
        return ok(effectiveId, { tools: this.exposure.tools })
      }

      if (method === 'tools/call') {
        const name = msg.params?.name
        const rawArgs =
          msg.params && msg.params.arguments !== undefined ? msg.params.arguments : {}

        const KNOWN_TOOLS = [
          'research_query',
          'research_evidence',
          'journal_palette',
          'research_status',
        ]
        if (!KNOWN_TOOLS.includes(name)) {
          return fail(effectiveId, -32601, 'Unknown tool: ' + String(name))
        }

        if (this.state === 'dormant') {
          return fail(
            effectiveId,
            -32601,
            `Tool '${name}' is not available because server is in dormant mode (unauthorized workspace)`
          )
        }

        if (this.state === 'revoked') {
          return fail(
            effectiveId,
            -32600,
            'Operation rejected: Research workspace scope has been revoked'
          )
        }

        if (rawArgs === null || typeof rawArgs !== 'object' || Array.isArray(rawArgs)) {
          return fail(effectiveId, -32602, 'Invalid parameters: arguments must be an object')
        }

        if (name === 'research_query') {
          const validated = validateResearchQueryParams(rawArgs)
          if (!validated.ok) {
            return fail(effectiveId, -32602, validated.error)
          }
          assertInvocationAuthorized('research_query', validated.value.action, validated.value, {
            scope: this.scope,
            state: this.state,
          })
          const res = await runResearchQuery(validated.value)
          return ok(effectiveId, packToolResult(res))
        }

        if (name === 'research_evidence') {
          const validated = validateResearchEvidenceParams(rawArgs)
          if (!validated.ok) {
            return fail(effectiveId, -32602, validated.error)
          }
          const callParams = {
            ...validated.value,
            workspace: validated.value.workspace || this.scope?.canonicalRoot,
          }
          assertInvocationAuthorized('research_evidence', validated.value.action, callParams, {
            scope: this.scope,
            state: this.state,
          })
          const res = await runResearchEvidence(callParams, { scope: this.scope })
          return ok(effectiveId, packToolResult(res))
        }

        if (name === 'journal_palette') {
          const validated = validateJournalPaletteParams(rawArgs)
          if (!validated.ok) {
            return fail(effectiveId, -32602, validated.error)
          }
          assertInvocationAuthorized('journal_palette', 'journal_palette', validated.value, {
            scope: this.scope,
            state: this.state,
          })
          const res = runJournalPalette(validated.value)
          return ok(effectiveId, packToolResult(res))
        }

        if (name === 'research_status') {
          const validated = validateResearchStatusParams(rawArgs)
          if (!validated.ok) {
            return fail(effectiveId, -32602, validated.error)
          }
          const callParams = {
            ...validated.value,
            workspace: validated.value.workspace || this.scope?.canonicalRoot,
          }
          assertInvocationAuthorized('research_status', 'get_summary', callParams, {
            scope: this.scope,
            state: this.state,
          })
          const res = runResearchStatus(callParams, { scope: this.scope })
          return ok(effectiveId, packToolResult(res))
        }

        return fail(effectiveId, -32601, 'Unknown tool: ' + String(name))
      }

      return fail(effectiveId, -32601, 'Method not found: ' + String(method))
    } catch (err) {
      if (err instanceof ScopeViolationError) {
        return fail(effectiveId, -32602, err.message)
      }
      return fail(effectiveId, -32603, err instanceof Error ? err.message : String(err))
    }
  }

  startStdio(stdin = process.stdin, stdout = process.stdout, stderr = process.stderr) {
    this.outputStream = stdout
    const parser = new StreamMessageParser(async (msg) => {
      if (msg.__parseError) {
        if (stderr) stderr.write(`tianshu-research MCP: bad JSON: ${msg.__parseError.message}\n`)
        stdout.write(JSON.stringify(fail(null, -32700, 'Parse error: Invalid JSON')) + '\n')
        return
      }
      try {
        const res = await this.handleMessage(msg)
        if (res) {
          stdout.write(JSON.stringify(res) + '\n')
        }
      } catch (err) {
        if (stderr) stderr.write(`tianshu-research MCP: ${err.message}\n`)
      }
    })

    stdin.on('data', (chunk) => parser.feed(chunk))
    return this
  }
}

export function createMcpServer(options) {
  return new McpServer(options)
}
