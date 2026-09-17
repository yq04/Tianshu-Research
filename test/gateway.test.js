import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runResearchQuery } from '../gateway-query.js'
import { runResearchEvidence } from '../gateway-evidence.js'
import { runResearchStatus } from '../tools/research-status.js'
import {
  validateResearchQueryParams,
  validateResearchEvidenceParams,
  validateResearchStatusParams,
} from '../tool-contracts.js'

describe('Gateway and Status Tools', () => {
  let tmpDir

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-gateway-test-'))
  })

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  describe('research_status tool & validator', () => {
    it('validates parameters strictly', () => {
      assert.equal(validateResearchStatusParams({}).ok, true)
      assert.equal(validateResearchStatusParams({ workspace: tmpDir }).ok, true)
      assert.equal(validateResearchStatusParams({ extra: 1 }).ok, false)
    })

    it('returns formatted status and metadata', () => {
      const res = runResearchStatus({ workspace: tmpDir })
      assert.ok(res.content.includes('天枢科研运行状态'))
      assert.ok(res.content.includes('arXiv'))
      assert.ok(res.content.includes('OpenAlex'))
      assert.equal(res.data.ledger.sourcesCount, 0)
    })
  })

  describe('research_query gateway & validator', () => {
    it('validates search_papers and resolve_paper actions', () => {
      const vSearch = validateResearchQueryParams({ action: 'search_papers', query: 'transformer' })
      assert.equal(vSearch.ok, true)
      assert.equal(vSearch.value.query, 'transformer')

      const vResolve = validateResearchQueryParams({ action: 'resolve_paper', id: '1706.03762' })
      assert.equal(vResolve.ok, true)
      assert.equal(vResolve.value.id, '1706.03762')

      const vBadAction = validateResearchQueryParams({ action: 'unknown_action' })
      assert.equal(vBadAction.ok, false)

      const vMissingQuery = validateResearchQueryParams({ action: 'search_papers' })
      assert.equal(vMissingQuery.ok, false)
    })

    it('routes resolve_paper with mock fetch', async () => {
      const mockFetch = async () => ({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.00001v1</id>
    <title>Mock Quantum Paper</title>
    <summary>Testing research query gateway.</summary>
    <author><name>Alice Smith</name></author>
    <published>2023-01-01T00:00:00Z</published>
    <link href="http://arxiv.org/abs/2301.00001v1" rel="alternate" type="text/html"/>
    <link title="pdf" href="http://arxiv.org/pdf/2301.00001v1" rel="related" type="application/pdf"/>
  </entry>
</feed>`,
      })

      const res = await runResearchQuery({ action: 'resolve_paper', id: '2301.00001' }, mockFetch)
      assert.equal(res.isError, undefined)
      assert.ok(res.content.includes('Mock Quantum Paper'))
    })
  })

  describe('research_evidence gateway & validator', () => {
    it('validates research_evidence actions strictly', () => {
      const v1 = validateResearchEvidenceParams({
        action: 'add_source',
        id: 's1',
        title: 'Title 1',
      })
      assert.equal(v1.ok, true)

      const vBad = validateResearchEvidenceParams({
        action: 'add_source',
        id: 's1',
      })
      assert.equal(vBad.ok, false)
    })

    it('performs full evidence lifecycle via gateway', async () => {
      const sRes = await runResearchEvidence({
        action: 'add_source',
        workspace: tmpDir,
        id: 'paper_gw_1',
        title: 'Deep Residual Learning',
        authors: ['He et al.'],
        year: 2016,
      })
      assert.ok(sRes.content.includes('Deep Residual Learning'))

      const eRes = await runResearchEvidence({
        action: 'add_evidence',
        workspace: tmpDir,
        id: 'evi_gw_1',
        sourceId: 'paper_gw_1',
        locator: { page: 4, equation: '(1)' },
        excerpt: 'y = F(x, {W_i}) + x',
      })
      assert.ok(eRes.content.includes('evi_gw_1'))
      assert.ok(eRes.content.includes('paper_gw_1'))

      const cRes = await runResearchEvidence({
        action: 'add_claim',
        workspace: tmpDir,
        id: 'claim_gw_1',
        statement: 'Residual mapping makes deep network optimization significantly easier.',
        evidenceIds: ['evi_gw_1'],
      })
      assert.ok(cRes.content.includes('claim_gw_1'))

      const qRes = await runResearchEvidence({
        action: 'query_evidence',
        workspace: tmpDir,
        sourceId: 'paper_gw_1',
      })
      assert.ok(qRes.content.includes('y = F(x, {W_i}) + x'))

      const sumRes = await runResearchEvidence({
        action: 'get_summary',
        workspace: tmpDir,
      })
      assert.equal(sumRes.data.sourcesCount, 1)
      assert.equal(sumRes.data.evidenceCount, 1)
      assert.equal(sumRes.data.claimsCount, 1)

      const vRes = await runResearchEvidence({
        action: 'verify_ledger',
        workspace: tmpDir,
      })
      assert.equal(vRes.data.passed, true)
      assert.ok(vRes.content.includes('门禁审查通过'))
      assert.equal(vRes.data.metrics.locatorCoverageRate, 1)
    })
  })
})
