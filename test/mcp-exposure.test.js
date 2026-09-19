import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateExposureSnapshot,
  ACTIVE_TOOLS,
  ACTIVE_TOOLS_DIGEST,
  EMPTY_TOOLS_DIGEST,
} from '../protocol/exposure.js'
import {
  RESEARCH_QUERY_SCHEMA,
  RESEARCH_EVIDENCE_SCHEMA,
  JOURNAL_PALETTE_SCHEMA,
  RESEARCH_STATUS_SCHEMA,
  TOOL_DESCRIPTIONS,
} from '../contracts/registry.js'

describe('MCP Exposure Snapshot and Prefix Cache Defense', () => {
  describe('dormant exposure snapshot', () => {
    it('returns empty tools and undefined instructions to defend prompt context', () => {
      const snapshot = generateExposureSnapshot('dormant')
      assert.equal(snapshot.status, 'dormant')
      assert.deepEqual(snapshot.tools, [])
      assert.deepEqual(snapshot.toolNames, [])
      assert.equal(snapshot.instructions, undefined)
      assert.equal(snapshot.canonicalToolsDigest, EMPTY_TOOLS_DIGEST)
      assert.equal(snapshot.contractVersion, 'research-v2')
    })
  })

  describe('active exposure snapshot', () => {
    it('returns exactly the 4 authoritative gateways without instructions', () => {
      const snapshot = generateExposureSnapshot('active', { scopeId: 'scope-test-123' })
      assert.equal(snapshot.status, 'active')
      assert.equal(snapshot.scopeId, 'scope-test-123')
      assert.equal(snapshot.instructions, undefined)
      assert.equal(snapshot.tools.length, 4)
      assert.deepEqual(snapshot.toolNames, [
        'research_query',
        'research_evidence',
        'journal_palette',
        'research_status',
      ])
      assert.equal(snapshot.canonicalToolsDigest, ACTIVE_TOOLS_DIGEST)
    })

    it('matches authoritative schemas and descriptions from registry', () => {
      const toolMap = new Map(ACTIVE_TOOLS.map((t) => [t.name, t]))

      assert.deepEqual(toolMap.get('research_query').inputSchema, RESEARCH_QUERY_SCHEMA)
      assert.equal(toolMap.get('research_query').description, TOOL_DESCRIPTIONS.research_query)

      assert.deepEqual(toolMap.get('research_evidence').inputSchema, RESEARCH_EVIDENCE_SCHEMA)
      assert.equal(toolMap.get('research_evidence').description, TOOL_DESCRIPTIONS.research_evidence)

      assert.deepEqual(toolMap.get('journal_palette').inputSchema, JOURNAL_PALETTE_SCHEMA)
      assert.equal(toolMap.get('journal_palette').description, TOOL_DESCRIPTIONS.journal_palette)

      assert.deepEqual(toolMap.get('research_status').inputSchema, RESEARCH_STATUS_SCHEMA)
      assert.equal(toolMap.get('research_status').description, TOOL_DESCRIPTIONS.research_status)
    })

    it('generates a stable, reproducible SHA-256 fingerprint across calls', () => {
      const s1 = generateExposureSnapshot('active')
      const s2 = generateExposureSnapshot('active')
      assert.equal(s1.canonicalToolsDigest, s2.canonicalToolsDigest)
      assert.equal(s1.canonicalToolsDigest, ACTIVE_TOOLS_DIGEST)
      assert.equal(s1.canonicalToolsDigest.length, 64)
    })
  })

  describe('revoked exposure snapshot', () => {
    it('retains stubs in connection mode to prevent schema shifts but marks status revoked', () => {
      const snapshot = generateExposureSnapshot('revoked')
      assert.equal(snapshot.status, 'revoked')
      assert.equal(snapshot.tools.length, 4)
      assert.equal(snapshot.instructions, undefined)
      assert.equal(snapshot.canonicalToolsDigest, ACTIVE_TOOLS_DIGEST)
    })
  })

  describe('error handling', () => {
    it('throws on invalid status', () => {
      assert.throws(() => generateExposureSnapshot('unknown_status'), /Invalid exposure status/)
    })
  })
})

