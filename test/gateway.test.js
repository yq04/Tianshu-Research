import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs'
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

    it('ingests document and links documentId via research_evidence gateway', async () => {
      const ingRes = await runResearchEvidence({
        action: 'ingest_document',
        workspace: tmpDir,
        docId: 'doc_gw_test',
        text: '# ResNet Study\n\nDeep residual learning framework.',
      })
      assert.equal(ingRes.isError, undefined)
      assert.ok(ingRes.content.includes('论文材料已导入索引库'))

      const sRes = await runResearchEvidence({
        action: 'add_source',
        workspace: tmpDir,
        id: 'paper_gw_doc',
        title: 'Deep Residual Learning Paper',
        documentId: 'doc_gw_test',
      })
      assert.equal(sRes.isError, undefined)
      assert.equal(sRes.data.documentId, 'doc_gw_test')
    })
  })

  describe('Phase 4 Acceptance: Short, Medium, and Long Workflows', () => {
    let acceptDir

    before(() => {
      acceptDir = mkdtempSync(join(tmpdir(), 'tianshu-accept-test-'))
    })

    after(() => {
      if (acceptDir && existsSync(acceptDir)) {
        rmSync(acceptDir, { recursive: true, force: true })
      }
    })

    it('Short usage: query returns paper info without writing research files', async () => {
      const mockFetch = async () => ({
        ok: true,
        text: async () => `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.99999v1</id>
    <title>Short Query Sample</title>
    <summary>Short query zero-write test.</summary>
    <author><name>Scientist</name></author>
    <published>2023-01-01T00:00:00Z</published>
    <link href="http://arxiv.org/abs/2301.99999v1" rel="alternate" type="text/html"/>
  </entry>
</feed>`,
      })

      const res = await runResearchQuery({ action: 'resolve_paper', id: '2301.99999' }, mockFetch)
      assert.equal(res.isError, undefined)
      assert.ok(res.content.includes('Short Query Sample'))
      assert.equal(existsSync(join(acceptDir, '.rivet')), false)
    })

    it('Medium usage: saves structured reading card as markdown without ledger jsonl', () => {
      const noteDir = join(acceptDir, '.rivet', 'research', 'notes')
      mkdirSync(noteDir, { recursive: true })
      const cardPath = join(noteDir, 'reading_card_pinn.md')
      const cardText = [
        '### 论文基础信息',
        '- **标题**: PINN Study',
        '- **阅读范围**: 仅摘要',
        '### 四行核心提炼',
        '1. **研究问题**: PINN 训练收敛性',
        '2. **方法**: 残差加权物理损失',
        '3. **主要结论**: 达到指定容差内收敛',
        '4. **局限**: 高频分量衰减慢',
      ].join('\n')
      writeFileSync(cardPath, cardText, 'utf8')

      assert.equal(existsSync(cardPath), true)
      const readBack = readFileSync(cardPath, 'utf8')
      assert.ok(readBack.includes('PINN Study'))
      assert.ok(readBack.includes('仅摘要'))
      assert.equal(existsSync(join(acceptDir, '.rivet', 'research', 'sources.jsonl')), false)
    })

    it('Long usage: ledger grounding gate transitions from red to green', async () => {
      const redDir = mkdtempSync(join(tmpdir(), 'tianshu-accept-red-'))
      const greenDir = mkdtempSync(join(tmpdir(), 'tianshu-accept-green-'))

      try {
        // Red case: verified claim with missing locator and qualifies relation
        await runResearchEvidence({
          action: 'add_source',
          workspace: redDir,
          id: 'src_red',
          title: 'Unchecked Paper',
        })
        await runResearchEvidence({
          action: 'add_evidence',
          workspace: redDir,
          id: 'evi_red',
          sourceId: 'src_red',
          relation: 'qualifies',
          excerpt: 'Some claim without locator.',
        })
        await runResearchEvidence({
          action: 'add_claim',
          workspace: redDir,
          id: 'claim_red',
          statement: 'Hypothesis claimed verified without proof.',
          evidenceIds: ['evi_red'],
          status: 'verified',
        })

        const vRed = await runResearchEvidence({
          action: 'verify_ledger',
          workspace: redDir,
        })
        assert.equal(vRed.data.passed, false)
        assert.ok(vRed.content.includes('门禁审查未通过'))

        // Green case: ingested document, grounded source, valid locator, supports relation
        const fullText = '# Navier Stokes\n\nSection 2: Exact analytical solution established in domain Omega.'
        await runResearchEvidence({
          action: 'ingest_document',
          workspace: greenDir,
          docId: 'doc_ns_01',
          text: fullText,
        })
        await runResearchEvidence({
          action: 'add_source',
          workspace: greenDir,
          id: 'src_green',
          title: 'Navier Stokes Exact Solution',
          documentId: 'doc_ns_01',
        })
        await runResearchEvidence({
          action: 'add_evidence',
          workspace: greenDir,
          id: 'evi_green',
          sourceId: 'src_green',
          relation: 'supports',
          locator: { section: 'Section 2', lineStart: 3, lineEnd: 3 },
          excerpt: 'Exact analytical solution established in domain Omega.',
        })
        await runResearchEvidence({
          action: 'add_claim',
          workspace: greenDir,
          id: 'claim_green',
          statement: 'Domain Omega has exact analytical solution.',
          evidenceIds: ['evi_green'],
          status: 'verified',
        })

        const vGreen = await runResearchEvidence({
          action: 'verify_ledger',
          workspace: greenDir,
        })
        assert.equal(vGreen.data.passed, true)
        assert.ok(vGreen.content.includes('门禁审查通过'))
        assert.equal(vGreen.data.metrics.groundingChecked, 1)
        assert.equal(vGreen.data.metrics.groundingMatched, 1)
      } finally {
        rmSync(redDir, { recursive: true, force: true })
        rmSync(greenDir, { recursive: true, force: true })
      }
    })
    it('reads sections with read_section and limits token output to maxChars', async () => {
      const ws = mkdtempSync(join(tmpdir(), 'tianshu-gw-readsec-'))
      try {
        const samplePaper = '# Title: Deep PINN\n\n## Abstract\n\nPINNs integrate physical laws into loss functions.\n\n## Introduction\n\nHere is extensive text explaining the method in detail. ' + 'Lorem ipsum '.repeat(300) + '\n\n## Results\n\nConvergence rate 99.8% achieved.';
        await runResearchEvidence({
          action: 'ingest_document',
          workspace: ws,
          docId: 'doc_pinn',
          text: samplePaper,
        })

        // Read Introduction with default maxChars 2000
        const res = await runResearchEvidence({
          action: 'read_section',
          workspace: ws,
          docId: 'doc_pinn',
          section: 'Introduction',
          maxChars: 500,
        })
        assert.ok(!res.isError)
        assert.equal(res.data.returnedChars, 500)
        assert.equal(res.data.hasMore, true)
        assert.ok(res.content.includes('已截断至上限 500 字符'))
        assert.ok(res.content.includes('### 《Title: Deep PINN》 § Introduction'))

        // Test export_csl_json & export_ris via gateway
        await runResearchEvidence({
          action: 'add_source',
          workspace: ws,
          id: 'src_gw',
          title: 'GW Test',
          year: 2025,
        })
        const cslGw = await runResearchEvidence({ action: 'export_csl_json', workspace: ws })
        assert.ok(cslGw.content.includes('已导出 1 篇文献至 CSL-JSON'))
        const risGw = await runResearchEvidence({ action: 'export_ris', workspace: ws })
        assert.ok(risGw.content.includes('已导出 1 篇文献至 RIS 格式'))
      } finally {
        rmSync(ws, { recursive: true, force: true })
      }
    })
  })
})
