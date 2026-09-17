import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleMcpMessage, MCP_TOOLS } from '../mcp-server.js'
import { interpolateRgb, resolvePalette, runJournalPalette } from '../figure.js'

describe('tianshu-research MCP stdio protocol', () => {
  it('initialize + tools/list advertise research gateway, ledger, search, and palettes', async () => {
    const init = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'test', version: '0' } },
    })
    assert.equal(init.result.serverInfo.name, 'tianshu-research')
    assert.equal(init.result.protocolVersion, '2024-11-05')
    assert.ok(init.result.capabilities.tools)

    const listed = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'tools/list' })
    const names = listed.result.tools.map((t) => t.name)
    assert.deepEqual(names.sort(), [
      'journal_palette',
      'research_evidence',
      'research_query',
      'research_status',
    ])
    assert.equal(MCP_TOOLS.length, 4)
  })

  it('negotiates unsupported protocol version to 2024-11-05', async () => {
    const init = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'initialize',
      params: { protocolVersion: 'future-version-999' },
    })
    assert.equal(init.result.protocolVersion, '2024-11-05')
  })

  it('ignores notifications and rejects unknown methods', async () => {
    assert.equal(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
    assert.equal(await handleMcpMessage({ jsonrpc: '2.0', method: 'initialized' }), null)
    const notificationWithId = await handleMcpMessage({ jsonrpc: '2.0', id: 99, method: 'notifications/initialized' })
    assert.equal(notificationWithId.error.code, -32600)
    const bad = await handleMcpMessage({ jsonrpc: '2.0', id: 3, method: 'nope' })
    assert.equal(bad.error.code, -32601)
  })

  it('rejects invalid JSON-RPC payload shapes', async () => {
    const arr = await handleMcpMessage([1, 2, 3])
    assert.equal(arr.error.code, -32600)
    const badRpc = await handleMcpMessage({ jsonrpc: '1.0', id: 1, method: 'ping' })
    assert.equal(badRpc.error.code, -32600)
    const nonObj = await handleMcpMessage('hello')
    assert.equal(nonObj.error.code, -32600)
  })

  it('tools/call paper_search returns -32601 unknown tool', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'paper_search', arguments: { query: '' } },
    })
    assert.equal(res.error.code, -32601)
    assert.match(res.error.message, /Unknown tool: paper_search/)
  })

  it('tools/call rejects explicit null arguments and unknown properties', async () => {
    const nullArgs = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: { name: 'research_query', arguments: null },
    })
    assert.equal(nullArgs.error.code, -32602)

    const unknownProp = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 41,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: { id: 1, extraProp: 'bad' } },
    })
    assert.equal(unknownProp.error.code, -32602)
    assert.match(unknownProp.error.message, /Unknown property: extraProp/)
  })

  it('tools/call journal_palette returns ColorBrewer Accent for id=1', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: { id: 1 } },
    })
    assert.equal(res.result.isError, false)
    assert.match(res.result.content[0].text, /#7FC97F/)
    assert.match(res.result.content[0].text, /#F0027F/)
    assert.match(res.result.content[0].text, /journal_palette\(1\)/)
  })

  it('tools/call research_status returns environment status', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: { name: 'research_status', arguments: {} },
    })
    assert.equal(res.result.isError, false)
    assert.match(res.result.content[0].text, /天枢科研运行状态/)
  })
})

describe('journal_palette palettes', () => {
  it('id 1 matches ColorBrewer Accent exactly', () => {
    const p = resolvePalette({ id: 1 })
    assert.deepEqual(p.hex, [
      '#7FC97F', '#BEAED4', '#FDC086', '#FFFF99',
      '#386CB0', '#F0027F', '#BF5B17', '#666666',
    ])
  })

  it('name=viridis and role=heatmap resolve to pack ids', () => {
    assert.equal(resolvePalette({ name: 'viridis' }).id, '66')
    assert.equal(resolvePalette({ role: 'heatmap' }).id, '45')
    const cb = resolvePalette({ role: 'colorblind' })
    assert.equal(cb.id, 'okabe_ito')
    assert.equal(cb.hex[0], '#E69F00')
    assert.equal(cb.hex.length, 8)
  })

  it('empty args lists roles instead of dumping 100 palettes', () => {
    const text = runJournalPalette({}).content
    assert.match(text, /colorblind/)
    assert.match(text, /aliases:/)
    assert.equal(text.includes('#7FC97F'), false)
  })

  it('map mode interpolates without inventing extra discrete names', () => {
    const mapped = interpolateRgb(['#000000', '#FFFFFF'], 5)
    assert.equal(mapped.length, 5)
    assert.equal(mapped[0], '#000000')
    assert.equal(mapped[4], '#FFFFFF')
    assert.equal(mapped[2], '#808080')
  })

  it('rejects out-of-range ids and invalid types', () => {
    const badZero = runJournalPalette({ id: 0 })
    assert.equal(badZero.isError, true)
    const badTooLarge = runJournalPalette({ id: 101 })
    assert.equal(badTooLarge.isError, true)
    const badBool = runJournalPalette({ id: true })
    assert.equal(badBool.isError, true)
    const selectorConflict = runJournalPalette({ id: 1, role: 'colorblind' })
    assert.equal(selectorConflict.isError, true)
  })

  it('rejects discrete n exceeding palette length', () => {
    const badN = runJournalPalette({ id: 1, n: 20 })
    assert.equal(badN.isError, true)
    assert.match(badN.content, /exceeds palette length/)
  })

  it('formats discrete with n using Python slice and clean MATLAB comment', () => {
    const res = runJournalPalette({ id: 1, n: 4 })
    assert.equal(res.isError, false)
    assert.match(res.content, /journal_palette\(1\)\[:4\]/)
    assert.match(res.content, /MATLAB: % Hex array:/)
  })
})
