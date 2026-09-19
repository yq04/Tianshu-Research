import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { McpServer } from '../protocol/server.js'

describe('Phase 6A: Four Gateways Scope and Result Envelope Integrity Suite', () => {
  let tempBase
  let authorizedDir
  let outsideDir

  before(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'tianshu-gw-test-'))
    authorizedDir = join(tempBase, 'auth-research')
    outsideDir = join(tempBase, 'outside-zone')
    mkdirSync(authorizedDir, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })

    mkdirSync(join(authorizedDir, '.rivet'), { recursive: true })
    writeFileSync(
      join(authorizedDir, '.rivet', 'research.json'),
      JSON.stringify({ schemaVersion: 1, enabled: true }),
      'utf8'
    )
  })

  after(() => {
    try {
      rmSync(tempBase, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('preserves structured calculation and gate report data in MCP response envelope', async () => {
    const server = new McpServer({ workspace: authorizedDir })

    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 10,
      method: 'tools/call',
      params: {
        name: 'research_status',
        arguments: {},
      },
    })

    assert.equal(res.result.isError, false)
    assert.ok(Array.isArray(res.result.content), 'Content must be an array of blocks')
    assert.ok(res.result.content[0].text.includes('天枢科研运行状态'))

    // Key Phase 6A verification: structured data must NOT be dropped by asText
    assert.ok(res.result.data, 'result.data must be retained in MCP response')
    assert.ok(res.result.structuredContent, 'structuredContent must be retained for MCP extensions')
    assert.equal(res.result.data.workspace, server.scope.canonicalRoot)
    assert.equal(res.result.data.scope.scopeId, server.scope.scopeId)
  })

  it('intercepts document ingestion with escaping sourcePath via research_evidence', async () => {
    const server = new McpServer({ workspace: authorizedDir })

    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 20,
      method: 'tools/call',
      params: {
        name: 'research_evidence',
        arguments: {
          action: 'ingest_document',
          docId: 'doc-sample',
          sourcePath: join(outsideDir, 'unauthorized-doc.pdf'),
        },
      },
    })

    assert.ok(res.error, 'Should reject out-of-scope sourcePath')
    assert.equal(res.error.code, -32602)
    assert.match(res.error.message, /outside authorized workspace root/)
  })

  it('intercepts CSL/RIS export with escaping outputPath via research_evidence', async () => {
    const server = new McpServer({ workspace: authorizedDir })

    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 21,
      method: 'tools/call',
      params: {
        name: 'research_evidence',
        arguments: {
          action: 'export_csl_json',
          outputPath: join(outsideDir, 'leaked.csl.json'),
        },
      },
    })

    assert.ok(res.error, 'Should reject out-of-scope outputPath')
    assert.equal(res.error.code, -32602)
    assert.match(res.error.message, /outside authorized workspace root/)
  })

  it('intercepts execute_operation with escaping datasetPath in nested arguments', async () => {
    const server = new McpServer({ workspace: authorizedDir })

    const res = await server.handleMessage({
      jsonrpc: '2.0',
      id: 22,
      method: 'tools/call',
      params: {
        name: 'research_evidence',
        arguments: {
          action: 'execute_operation',
          operationId: 'theory.dimension@1',
          arguments: {
            datasetPath: join(outsideDir, 'secret-dataset.csv'),
          },
        },
      },
    })

    assert.ok(res.error, 'Should reject escaping datasetPath')
    assert.equal(res.error.code, -32602)
    assert.match(res.error.message, /outside authorized workspace root/)
  })

  it('allows self-contained journal_palette execution in dormant mode', async () => {
    const unconfiguredDir = join(tempBase, 'unconfigured')
    mkdirSync(unconfiguredDir, { recursive: true })

    const server = new McpServer({ cwd: unconfiguredDir })
    assert.equal(server.state, 'dormant')

    // journal_palette in active server works
    const activeServer = new McpServer({ workspace: authorizedDir })
    const res = await activeServer.handleMessage({
      jsonrpc: '2.0',
      id: 30,
      method: 'tools/call',
      params: {
        name: 'journal_palette',
        arguments: { id: 1 },
      },
    })

    assert.equal(res.result.isError, false)
    assert.match(res.result.content[0].text, /#7FC97F/)
  })
})
