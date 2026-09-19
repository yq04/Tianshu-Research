import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { McpServer, StreamMessageParser, SUPPORTED_PROTOCOL_VERSIONS } from '../protocol/server.js'

describe('MCP JSON-RPC Protocol Layer', () => {
  it('negotiates protocol versions correctly and omits instructions', async () => {
    const server = new McpServer()

    // 1. Exact supported versions
    for (const v of SUPPORTED_PROTOCOL_VERSIONS) {
      const res = await server.handleMessage({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: v },
      })
      assert.equal(res.result.protocolVersion, v)
      assert.equal(res.result.instructions, undefined)
      assert.equal(res.result.serverInfo.name, 'tianshu-research')
    }

    // 2. Unsupported future/past version falls back to 2024-11-05
    const fallbackRes = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'initialize',
      params: { protocolVersion: 'draft-9999-01-01' },
    })
    assert.equal(fallbackRes.result.protocolVersion, '2024-11-05')
  })

  it('handles ping request with empty object', async () => {
    const server = new McpServer()
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'ping',
    })
    assert.deepEqual(res, { jsonrpc: '2.0', id: 10, result: {} })
  })

  it('rejects invalid JSON-RPC payload shapes', async () => {
    const server = new McpServer()

    // Non-object
    const nonObj = await server.handleMessage('ping')
    assert.equal(nonObj.error.code, -32600)

    // Array payload
    const arr = await server.handleMessage([1, 2])
    assert.equal(arr.error.code, -32600)

    // Invalid jsonrpc version
    const badRpc = await server.handleMessage({ jsonrpc: '1.0', id: 1, method: 'ping' })
    assert.equal(badRpc.error.code, -32600)

    // Missing or invalid method
    const badMethod = await server.handleMessage({ jsonrpc: '2.0', id: 2, method: 123 })
    assert.equal(badMethod.error.code, -32600)
  })

  it('ignores notifications and rejects notification with id', async () => {
    const server = new McpServer()

    // Proper notifications have no response
    assert.equal(await server.handleMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }), null)
    assert.equal(await server.handleMessage({ jsonrpc: '2.0', method: 'initialized' }), null)

    // Notification with ID is illegal
    const withId = await server.handleMessage({ jsonrpc: '2.0', id: 99, method: 'notifications/initialized' })
    assert.equal(withId.error.code, -32600)
  })

  it('returns -32601 for unknown methods', async () => {
    const server = new McpServer()
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 100,
      method: 'unknown/action',
    })
    assert.equal(res.error.code, -32601)
    assert.match(res.error.message, /Method not found/)
  })

  it('returns -32601 for unknown tools in tools/call', async () => {
    const server = new McpServer()
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 101,
      method: 'tools/call',
      params: { name: 'nonexistent_tool', arguments: {} },
    })
    assert.equal(res.error.code, -32601)
    assert.match(res.error.message, /Unknown tool/)
  })

  it('validates tool arguments and returns -32602 for invalid inputs', async () => {
    const server = new McpServer()

    // Non-object arguments
    const badArgs = await server.handleMessage({
      jsonrpc: '2.0',
      id: 102,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: 'not-an-object' },
    })
    assert.equal(badArgs.error.code, -32602)

    // Invalid palette id
    const invalidId = await server.handleMessage({
      jsonrpc: '2.0',
      id: 103,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: { id: 999 } },
    })
    assert.equal(invalidId.error.code, -32602)

    // Unknown property
    const unknownProp = await server.handleMessage({
      jsonrpc: '2.0',
      id: 104,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: { id: 1, extraProp: true } },
    })
    assert.equal(unknownProp.error.code, -32602)
  })

  it('dispatches valid tools/call and returns text content', async () => {
    const server = new McpServer()
    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 105,
      method: 'tools/call',
      params: { name: 'journal_palette', arguments: { id: 1 } },
    })
    assert.equal(res.result.isError, false)
    assert.match(res.result.content[0].text, /#7FC97F/)
  })

  describe('StreamMessageParser', () => {
    it('parses newline-delimited JSON streams', () => {
      const messages = []
      const parser = new StreamMessageParser((msg) => messages.push(msg))

      parser.feed('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
      parser.feed('{"jsonrpc":"2.0","id":2,"method":"ping"}\n')

      assert.equal(messages.length, 2)
      assert.equal(messages[0].id, 1)
      assert.equal(messages[1].id, 2)
    })

    it('parses Content-Length framed message streams', () => {
      const messages = []
      const parser = new StreamMessageParser((msg) => messages.push(msg))

      const body = JSON.stringify({ jsonrpc: '2.0', id: 5, method: 'ping' })
      const payload = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`
      parser.feed(payload)

      assert.equal(messages.length, 1)
      assert.equal(messages[0].id, 5)
    })

    it('handles fragmented chunk arrivals for Content-Length messages', () => {
      const messages = []
      const parser = new StreamMessageParser((msg) => messages.push(msg))

      const body = JSON.stringify({ jsonrpc: '2.0', id: 6, method: 'ping' })
      const header = `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n`

      parser.feed(header.slice(0, 10))
      parser.feed(header.slice(10))
      assert.equal(messages.length, 0)

      parser.feed(body.slice(0, 5))
      assert.equal(messages.length, 0)

      parser.feed(body.slice(5))
      assert.equal(messages.length, 1)
      assert.equal(messages[0].id, 6)
    })

    it('reports parse errors on invalid JSON chunks', () => {
      const messages = []
      const parser = new StreamMessageParser((msg) => messages.push(msg))

      parser.feed('{invalid json\n')
      assert.equal(messages.length, 1)
      assert.ok(messages[0].__parseError)
    })
  })
})

