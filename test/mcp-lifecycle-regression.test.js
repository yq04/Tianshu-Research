import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { McpServer, StreamMessageParser, SUPPORTED_PROTOCOL_VERSIONS } from '../protocol/server.js'

describe('Phase 6A: MCP Lifecycle and Scope Regression Suite', () => {
  let tempBase

  before(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'tianshu-lifecycle-test-'))
  })

  after(() => {
    try {
      rmSync(tempBase, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('maintains tool list stability: late roots response does NOT alter frozen empty exposure', async () => {
    const plainDir = join(tempBase, 'plain-project-late')
    mkdirSync(plainDir, { recursive: true })

    const validResearchDir = join(tempBase, 'valid-research-late')
    mkdirSync(join(validResearchDir, '.rivet'), { recursive: true })
    writeFileSync(
      join(validResearchDir, '.rivet', 'research.json'),
      JSON.stringify({ schemaVersion: 1, enabled: true }),
      'utf8'
    )

    // Start server in unconfigured directory
    const server = new McpServer({ cwd: plainDir, scopeBarrierTimeoutMs: 50 })

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: { roots: { listChanged: true } } },
    })

    // First tools/list call freezes exposure as dormant ([])
    const list1 = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })
    assert.equal(list1.result.tools.length, 0)
    assert.equal(server.isExposureFrozen, true)
    assert.equal(server.state, 'dormant')

    // Simulate late roots response from client pointing to an authorized research directory
    await server.handleRootsResponse({
      id: 'srv-roots-1',
      result: {
        roots: [{ uri: pathToFileURL(validResearchDir).href, name: 'Research' }],
      },
    })

    // In connection mode, frozen exposure MUST NOT drift from 0 to 4
    const list2 = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    })
    assert.equal(list2.result.tools.length, 0, 'Late roots response must not alter frozen dormant tool list')
    assert.ok(server.diagnostics.lateRootsIgnored, 'Diagnostics should record ignored late roots')
  })

  it('revokes tool execution capability on notifications/roots/list_changed when root is removed', async () => {
    const researchDir = join(tempBase, 'active-research-revocation')
    mkdirSync(join(researchDir, '.rivet'), { recursive: true })
    writeFileSync(
      join(researchDir, '.rivet', 'research.json'),
      JSON.stringify({ schemaVersion: 1, enabled: true }),
      'utf8'
    )

    const server = new McpServer({ workspace: researchDir })
    assert.equal(server.state, 'active')

    await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: { roots: { listChanged: true } } },
    })

    const list = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })
    assert.equal(list.result.tools.length, 4)

    // Capture outbound server messages
    const outbound = []
    server.outputStream = {
      write: (data) => outbound.push(JSON.parse(data.trim())),
    }

    // Client notifies roots list changed (notification must return null, no JSON-RPC response)
    const notifRes = await server.handleMessage({
      jsonrpc: '2.0',
      method: 'notifications/roots/list_changed',
    })
    assert.equal(notifRes, null, 'JSON-RPC notifications must not produce a response')

    // Server should have initiated roots/list query
    assert.ok(outbound.length >= 1)
    const rootsQuery = outbound.find((m) => m.method === 'roots/list')
    assert.ok(rootsQuery, 'Server should query roots/list upon notification')

    // Client responds with empty roots (roots revoked / closed)
    await server.handleMessage({
      jsonrpc: '2.0',
      id: rootsQuery.id,
      result: { roots: [] },
    })

    assert.equal(server.state, 'revoked')

    // In connection mode, tools schema remains stable to preserve prefix cache
    const listAfterRevoke = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/list',
    })
    assert.equal(listAfterRevoke.result.tools.length, 4)

    // But invoking any tool is immediately rejected
    const callRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: {
        name: 'research_query',
        arguments: { action: 'search_papers', query: 'sample' },
      },
    })
    assert.equal(callRes.error.code, -32600)
    assert.match(callRes.error.message, /revoked/i)
  })

  it('correctly handles multi-byte UTF-8 Content-Length framing without truncation', (t, done) => {
    const received = []
    const parser = new StreamMessageParser((msg) => received.push(msg))

    const chineseMessage = {
      jsonrpc: '2.0',
      id: 888,
      method: 'tools/call',
      params: {
        name: 'journal_palette',
        arguments: { id: 1, note: '天枢科研物理作用域与多字节分帧测试' },
      },
    }

    const jsonStr = JSON.stringify(chineseMessage)
    const byteLen = Buffer.byteLength(jsonStr, 'utf8')
    assert.ok(byteLen > jsonStr.length, 'UTF-8 byte length must be greater than string character length')

    const header = `Content-Length: ${byteLen}\r\n\r\n`
    const fullPayload = Buffer.concat([
      Buffer.from(header, 'ascii'),
      Buffer.from(jsonStr, 'utf8'),
    ])

    // Feed in 3 fragmented pieces, slicing through Chinese character byte boundaries
    const part1 = fullPayload.subarray(0, header.length + 10)
    const part2 = fullPayload.subarray(header.length + 10, header.length + 25)
    const part3 = fullPayload.subarray(header.length + 25)

    parser.feed(part1)
    assert.equal(received.length, 0, 'Should buffer incomplete frame')

    parser.feed(part2)
    assert.equal(received.length, 0, 'Should buffer incomplete frame across multi-byte boundary')

    parser.feed(part3)
    assert.equal(received.length, 1, 'Should emit complete message once all bytes arrive')
    assert.equal(received[0].id, 888)
    assert.equal(received[0].params.arguments.note, '天枢科研物理作用域与多字节分帧测试')
    done()
  })

  it('strictly validates protocol versions and cleans up unsupported drafts', () => {
    assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2024-11-05'))
    assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-03-26'))
    assert.ok(SUPPORTED_PROTOCOL_VERSIONS.includes('2025-06-18'))
    assert.equal(
      SUPPORTED_PROTOCOL_VERSIONS.includes('2025-03-01'),
      false,
      'Erroneous 2025-03-01 date must not be advertised'
    )
  })
})
