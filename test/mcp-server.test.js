import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleMcpMessage, MCP_TOOLS } from '../mcp-server.js'
import { interpolateRgb, resolvePalette, runJournalPalette } from '../figure.js'

describe('tianshu-research MCP stdio protocol', () => {
  it('initialize + tools/list advertise paper_search, paper_lookup, journal_palette', async () => {
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
    assert.deepEqual(names.sort(), ['journal_palette', 'paper_lookup', 'paper_search'])
    assert.equal(MCP_TOOLS.length, 3)
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

  it('tools/call paper_search with empty query returns -32602 invalid params', async () => {
    const res = await handleMcpMessage({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'paper_search', arguments: { query: '' } },
    })
    assert.equal(res.error.code, -32602)
    assert.match(res.error.message, /query/)
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
    assert.match(res.result.content[0].text, /TheBestColor\('akun', 1\)/)
  })
})

describe('thebestcolor palettes', () => {
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
})



