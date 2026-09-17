import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  parseDocument,
  readSection,
  locateText,
  ingestDocument,
  loadDocument,
} from '../document/document-parser.js'
import { runResearchDocument } from '../gateway-document.js'

const SAMPLE_PAPER = `# Fracture Toughness Analysis of High-Entropy Alloys

Abstract
High-entropy alloys exhibit superior mechanical properties at cryogenic temperatures. We evaluate stress intensity factor K_I under plain strain.

1. Introduction
High-entropy alloys (HEAs) have gained wide attention due to exceptional strength and ductility. Linear elastic fracture mechanics (LEFM) governs crack propagation.

2. Experimental Methods
Compact tension specimens were machined according to ASTM E399 standards. Quasi-static tensile tests were carried out at 77 Kelvin.

3. Results and Discussion
The measured critical fracture toughness K_IC reaches 220 MPa*m^(1/2), confirming excellent damage tolerance.

4. Conclusion
Cryogenic fracture resistance in HEAs is primarily driven by nano-twinning and deformation-induced phase transformation.
`

describe('Document Parser Core', () => {
  it('parses structured sections, abstract, and titles accurately', () => {
    const parsed = parseDocument(SAMPLE_PAPER)
    assert.equal(parsed.title, 'Fracture Toughness Analysis of High-Entropy Alloys')
    assert.ok(parsed.abstract.includes('High-entropy alloys exhibit superior mechanical properties'))
    assert.ok(parsed.sections.length >= 4)
    assert.equal(parsed.sections[0].title, '1. Introduction')
  })

  it('reads specific sections by index or heading', () => {
    const parsed = parseDocument(SAMPLE_PAPER)
    const sec1 = readSection(parsed, 1)
    assert.equal(sec1.title, '1. Introduction')
    assert.ok(sec1.content.includes('Linear elastic fracture mechanics'))

    const secResults = readSection(parsed, 'Results and Discussion')
    assert.ok(secResults.title.includes('Results and Discussion'))
    assert.ok(secResults.content.includes('220 MPa*m^(1/2)'))
  })

  it('locates exact text snippet with page and section locator', () => {
    const parsed = parseDocument(SAMPLE_PAPER)
    const matches = locateText(parsed, 'ASTM E399')
    assert.equal(matches.length, 1)
    assert.equal(matches[0].locator.section, '2. Experimental Methods')
    assert.equal(matches[0].locator.page, undefined)
    assert.ok(matches[0].locator.lineStart > 0)
    assert.ok(matches[0].locator.charOffset > 0)
    assert.ok(matches[0].snippet.includes('ASTM E399 standards'))
  })

  it('rejects PDF content fail-closed with clear guidance', () => {
    assert.throws(() => {
      parseDocument('%PDF-1.4 binary stream mock')
    }, /检测到 PDF 格式/)
  })

  it('rejects unsafe docId containing path separators or traversal', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-doc-safe-'))
    try {
      assert.throws(() => {
        ingestDocument(tmp, '../evil_id', 'text')
      }, /docId must be a safe single-segment identifier/)
      assert.throws(() => {
        ingestDocument(tmp, 'sub/dir', 'text')
      }, /docId must be a safe single-segment identifier/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('ingests and loads document round-trip in workspace', () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-doc-test-'))
    try {
      const record = ingestDocument(tmp, 'doc_astm_01', SAMPLE_PAPER, {
        title: 'Fracture Toughness Analysis of High-Entropy Alloys',
        doi: '10.1016/j.actamat.2026.01.001',
      })
      assert.equal(record.id, 'doc_astm_01')
      assert.equal(record.meta.title, 'Fracture Toughness Analysis of High-Entropy Alloys')

      const loaded = loadDocument(tmp, 'doc_astm_01')
      assert.equal(loaded.meta.id, 'doc_astm_01')
      assert.equal(loaded.parsed.sections.length, record.meta.sections.length)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})

describe('Research Document Gateway', () => {
  it('inspect action returns markdown outline and metadata', async () => {
    const res = await runResearchDocument({
      action: 'inspect',
      text: SAMPLE_PAPER,
    })
    assert.equal(res.isError, undefined)
    assert.match(res.content, /科学文献结构概览/)
    assert.match(res.content, /章节大纲/)
    assert.equal(res.data.sections.length >= 4, true)
  })

  it('read_section action extracts section text', async () => {
    const res = await runResearchDocument({
      action: 'read_section',
      text: SAMPLE_PAPER,
      section: 2,
    })
    assert.equal(res.isError, undefined)
    assert.match(res.content, /Experimental Methods/)
    assert.ok(res.data.content.includes('ASTM E399'))
  })

  it('locate_text action finds target phrases', async () => {
    const res = await runResearchDocument({
      action: 'locate_text',
      text: SAMPLE_PAPER,
      query: 'fracture toughness',
    })
    assert.equal(res.isError, undefined)
    assert.match(res.content, /找到 .* 处匹配点/)
    assert.ok(res.data.matches.length >= 1)
  })

  it('ingest action writes to workspace and allows subsequent query by docId', async () => {
    const tmp = mkdtempSync(join(tmpdir(), 'tianshu-gateway-doc-'))
    try {
      const ingestRes = await runResearchDocument({
        action: 'ingest',
        workspace: tmp,
        docId: 'paper_hea_2026',
        text: SAMPLE_PAPER,
        title: 'Fracture Toughness Analysis',
      })
      assert.equal(ingestRes.isError, undefined)
      assert.match(ingestRes.content, /论文文档已入库索引/)

      const inspectRes = await runResearchDocument({
        action: 'inspect',
        workspace: tmp,
        docId: 'paper_hea_2026',
      })
      assert.equal(inspectRes.isError, undefined)
      assert.match(inspectRes.content, /Fracture Toughness Analysis/)
    } finally {
      rmSync(tmp, { recursive: true, force: true })
    }
  })
})
