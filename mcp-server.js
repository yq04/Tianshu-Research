#!/usr/bin/env node
/**
 * First-party stdio MCP server for the desktop MCP 服务 page.
 * Same OA lookup as the plugin tools; no Smithery / extra npm package.
 * Speaks newline-delimited JSON-RPC 2.0 (MCP SDK StdioClientTransport).
 */
import { createInterface } from 'node:readline'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { runJournalPalette } from './figure.js'
import { runPaperLookup, runPaperSearch } from './search.js'
import { runResearchStatus } from './tools/research-status.js'
import { runResearchQuery } from './gateway-query.js'
import { runResearchEvidence } from './gateway-evidence.js'
import { runResearchCompute } from './compute/compute-gateway.js'
import { runResearchDocument } from './gateway-document.js'
import { runResearchJob } from './gateway-job.js'
import {
  JOURNAL_PALETTE_SCHEMA,
  PAPER_LOOKUP_SCHEMA,
  PAPER_SEARCH_SCHEMA,
  RESEARCH_STATUS_SCHEMA,
  RESEARCH_QUERY_SCHEMA,
  RESEARCH_EVIDENCE_SCHEMA,
  RESEARCH_COMPUTE_SCHEMA,
  RESEARCH_DOCUMENT_SCHEMA,
  RESEARCH_JOB_SCHEMA,
  TOOL_DESCRIPTIONS,
  validateJournalPaletteParams,
  validatePaperLookupParams,
  validatePaperSearchParams,
  validateResearchStatusParams,
  validateResearchQueryParams,
  validateResearchEvidenceParams,
  validateResearchComputeParams,
  validateResearchDocumentParams,
  validateResearchJobParams,
} from './tool-contracts.js'

const PROTOCOL = '2024-11-05'

export const MCP_TOOLS = [
  {
    name: 'research_status',
    description: TOOL_DESCRIPTIONS.research_status,
    inputSchema: RESEARCH_STATUS_SCHEMA,
  },
  {
    name: 'research_query',
    description: TOOL_DESCRIPTIONS.research_query,
    inputSchema: RESEARCH_QUERY_SCHEMA,
  },
  {
    name: 'research_evidence',
    description: TOOL_DESCRIPTIONS.research_evidence,
    inputSchema: RESEARCH_EVIDENCE_SCHEMA,
  },
  {
    name: 'paper_search',
    description: TOOL_DESCRIPTIONS.paper_search,
    inputSchema: PAPER_SEARCH_SCHEMA,
  },
  {
    name: 'paper_lookup',
    description: TOOL_DESCRIPTIONS.paper_lookup,
    inputSchema: PAPER_LOOKUP_SCHEMA,
  },
  {
    name: 'journal_palette',
    description: TOOL_DESCRIPTIONS.journal_palette,
    inputSchema: JOURNAL_PALETTE_SCHEMA,
  },
  {
    name: 'research_compute',
    description: TOOL_DESCRIPTIONS.research_compute,
    inputSchema: RESEARCH_COMPUTE_SCHEMA,
  },
  {
    name: 'research_document',
    description: TOOL_DESCRIPTIONS.research_document,
    inputSchema: RESEARCH_DOCUMENT_SCHEMA,
  },
  {
    name: 'research_job',
    description: TOOL_DESCRIPTIONS.research_job,
    inputSchema: RESEARCH_JOB_SCHEMA,
  },
]

function ok(id, result) {
  return { jsonrpc: '2.0', id, result }
}

function fail(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}

function asText(result) {
  return {
    content: [{ type: 'text', text: result.content }],
    isError: result.isError === true,
  }
}

export async function handleMcpMessage(msg) {
  if (!msg || typeof msg !== 'object' || Array.isArray(msg)) {
    return fail(null, -32600, 'Invalid Request: payload must be a JSON object')
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

  // Legitimate notifications (no id)
  if (isNotification) {
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
      return ok(effectiveId, {
        protocolVersion: PROTOCOL,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'tianshu-research', version: '0.1.0' },
        instructions:
          'OA literature screening (arXiv / OpenAlex), Evidence Ledger, and journal figure palettes. Use research_query or research_evidence for research tasks; journal_palette for hex colors. Wait for the user to pick a paper. Do not write a paper. Do not use web_search as a scholarly library.',
      })
    }
    if (method === 'ping') return ok(effectiveId, {})
    if (method === 'tools/list') return ok(effectiveId, { tools: MCP_TOOLS })
    if (method === 'tools/call') {
      const name = msg.params?.name
      const rawArgs = msg.params ? (msg.params.arguments === undefined ? {} : msg.params.arguments) : {}

      if (name === 'research_status') {
        const validated = validateResearchStatusParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(runResearchStatus(validated.value)))
      }
      if (name === 'research_query') {
        const validated = validateResearchQueryParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runResearchQuery(validated.value)))
      }
      if (name === 'research_evidence') {
        const validated = validateResearchEvidenceParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runResearchEvidence(validated.value)))
      }
      if (name === 'paper_search') {
        const validated = validatePaperSearchParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runPaperSearch(validated.value)))
      }
      if (name === 'paper_lookup') {
        const validated = validatePaperLookupParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runPaperLookup(validated.value)))
      }
      if (name === 'journal_palette') {
        const validated = validateJournalPaletteParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(runJournalPalette(validated.value)))
      }
      if (name === 'research_compute') {
        const validated = validateResearchComputeParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runResearchCompute(validated.value)))
      }
      if (name === 'research_document') {
        const validated = validateResearchDocumentParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runResearchDocument(validated.value)))
      }
      if (name === 'research_job') {
        const validated = validateResearchJobParams(rawArgs)
        if (!validated.ok) {
          return fail(effectiveId, -32602, validated.error)
        }
        return ok(effectiveId, asText(await runResearchJob(validated.value)))
      }
      return fail(effectiveId, -32601, 'Unknown tool: ' + String(name))
    }
    return fail(effectiveId, -32601, 'Method not found: ' + String(method))
  } catch (err) {
    return fail(effectiveId, -32603, err instanceof Error ? err.message : String(err))
  }
}

function startStdio() {
  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity })
  rl.on('line', (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try {
      msg = JSON.parse(trimmed)
    } catch (err) {
      process.stderr.write('tianshu-research MCP: bad JSON: ' + (err instanceof Error ? err.message : String(err)) + '\n')
      process.stdout.write(JSON.stringify(fail(null, -32700, 'Parse error: Invalid JSON')) + '\n')
      return
    }
    Promise.resolve(handleMcpMessage(msg)).then((res) => {
      if (res) process.stdout.write(JSON.stringify(res) + '\n')
    }).catch((err) => {
      process.stderr.write('tianshu-research MCP: ' + (err instanceof Error ? err.message : String(err)) + '\n')
    })
  })
}

const invokedDirectly = Boolean(process.argv[1])
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url
if (invokedDirectly) startStdio()
