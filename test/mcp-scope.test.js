import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { McpServer } from '../protocol/server.js'
import { runInit, runCheckConfig } from '../cli/research.js'

describe('MCP Project Isolation and Scope Enforcement', () => {
  let tempBase

  before(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'tianshu-research-scope-test-'))
  })

  after(() => {
    try {
      rmSync(tempBase, { recursive: true, force: true })
    } catch {
      // ignore cleanup errors on Windows
    }
  })

  it('enters dormant mode and returns empty tools list in unconfigured directory', async () => {
    const plainDir = join(tempBase, 'plain-web-project')
    mkdirSync(plainDir, { recursive: true })

    const server = new McpServer({ cwd: plainDir })
    assert.equal(server.state, 'dormant')

    const init = await server.handleMessage({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2024-11-05' },
    })
    assert.equal(init.result.serverInfo.name, 'tianshu-research')
    assert.equal(init.result.instructions, undefined)

    const list = await server.handleMessage({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
    })
    assert.deepEqual(list.result.tools, [])

    const call = await server.handleMessage({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'research_query', arguments: { action: 'search_papers', query: 'ai' } },
    })
    assert.equal(call.error.code, -32601)
    assert.match(call.error.message, /dormant mode/)
  })

  it('activates and exposes 4 gateways when workspace has .rivet/research.json', async () => {
    const researchDir = join(tempBase, 'research-project-manifest')
    mkdirSync(researchDir, { recursive: true })

    // Initialize using CLI helper
    const initRes = runInit(researchDir)
    assert.equal(initRes.success, true)

    const checkRes = runCheckConfig(researchDir)
    assert.equal(checkRes.valid, true)

    const server = new McpServer({ cwd: researchDir })
    assert.equal(server.state, 'active')

    const list = await server.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/list',
    })
    assert.equal(list.result.tools.length, 4)
    const names = list.result.tools.map((t) => t.name)
    assert.deepEqual(names.sort(), [
      'journal_palette',
      'research_evidence',
      'research_query',
      'research_status',
    ])
  })

  it('activates and exposes 4 gateways when explicitly passed --workspace', async () => {
    const researchDir = join(tempBase, 'explicit-workspace-target')
    mkdirSync(researchDir, { recursive: true })

    // Non-research cwd
    const plainCwd = join(tempBase, 'unrelated-cwd')
    mkdirSync(plainCwd, { recursive: true })

    const server = new McpServer({
      cwd: plainCwd,
      workspace: researchDir,
    })
    assert.equal(server.state, 'active')

    const list = await server.handleMessage({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/list',
    })
    assert.equal(list.result.tools.length, 4)
  })

  it('activates via roots/list negotiation from client roots capability', async () => {
    const researchDir = join(tempBase, 'client-roots-target')
    mkdirSync(researchDir, { recursive: true })
    runInit(researchDir)

    const plainCwd = join(tempBase, 'plain-client-cwd')
    mkdirSync(plainCwd, { recursive: true })

    const server = new McpServer({ cwd: plainCwd })
    assert.equal(server.state, 'dormant')

    // Client initializes advertising roots capability
    await server.handleMessage({
      jsonrpc: '2.0',
      id: 30,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { roots: { listChanged: true } },
      },
    })

    // Client sends initialized notification
    await server.handleMessage({
      jsonrpc: '2.0',
      method: 'notifications/initialized',
    })

    // Simulate client response to roots/list request
    const fileUri = pathToFileURL(researchDir).href
    await server.handleRootsResponse({
      result: {
        roots: [{ uri: fileUri, name: 'client-roots-target' }],
      },
    })

    assert.equal(server.state, 'active')
    const list = await server.handleMessage({
      jsonrpc: '2.0',
      id: 31,
      method: 'tools/list',
    })
    assert.equal(list.result.tools.length, 4)
  })

  it('intercepts cross-directory escaping tool invocations with -32602', async () => {
    const researchDir = join(tempBase, 'active-project')
    mkdirSync(researchDir, { recursive: true })
    runInit(researchDir)

    const server = new McpServer({ cwd: researchDir })
    assert.equal(server.state, 'active')

    const evilOutsidePath = resolve(tempBase, 'evil-outside-dir')

    const call = await server.handleMessage({
      jsonrpc: '2.0',
      id: 40,
      method: 'tools/call',
      params: {
        name: 'research_evidence',
        arguments: {
          action: 'add_source',
          workspace: evilOutsidePath,
          source: { id: 's1', title: 'Escape Attempt' },
        },
      },
    })

    assert.equal(call.error.code, -32602)
    assert.match(call.error.message, /outside authorized workspace root/)
  })

  it('rejects invocations after scope revocation with clear error', async () => {
    const researchDir = join(tempBase, 'revocation-target')
    mkdirSync(researchDir, { recursive: true })
    runInit(researchDir)

    const server = new McpServer({ cwd: researchDir })
    assert.equal(server.state, 'active')

    server.revoke()
    assert.equal(server.state, 'revoked')

    const call = await server.handleMessage({
      jsonrpc: '2.0',
      id: 50,
      method: 'tools/call',
      params: {
        name: 'research_query',
        arguments: { action: 'search_papers', query: 'superconductivity' },
      },
    })

    assert.equal(call.error.code, -32600)
    assert.match(call.error.message, /Research workspace scope has been revoked/)
  })
})

