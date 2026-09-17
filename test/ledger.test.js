import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, appendFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  addSource,
  addEvidence,
  addClaim,
  queryEvidence,
  getLedgerSummary,
  getSources,
  getEvidenceList,
  getClaims,
  exportCslJson,
  exportRis,
} from '../ledger/evidence-ledger.js'
import {
  verifyEvidenceLedger,
  renderVerificationReport,
} from '../gates/scientific-verifier.js'
import { ingestDocument } from '../document/document-parser.js'

describe('Evidence Ledger', () => {
  let tmpDir

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-ledger-test-'))
  })

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true })
    }
  })

  it('initially reports 0 for summary in fresh workspace', () => {
    const summary = getLedgerSummary(tmpDir)
    assert.deepEqual(summary, {
      sourcesCount: 0,
      evidenceCount: 0,
      claimsCount: 0,
    })
  })

  it('adds source to sources.jsonl and returns record', () => {
    const source = addSource(tmpDir, {
      id: 'src_attention_2017',
      type: 'paper',
      title: 'Attention Is All You Need',
      authors: ['Vaswani et al.'],
      year: 2017,
      doi: '10.48550/arXiv.1706.03762',
      arxivId: '1706.03762',
    })
    assert.equal(source.id, 'src_attention_2017')
    assert.equal(source.title, 'Attention Is All You Need')
    assert.equal(source.year, 2017)

    const list = getSources(tmpDir)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'src_attention_2017')
  })

  it('rejects adding duplicate source id', () => {
    assert.throws(() => {
      addSource(tmpDir, {
        id: 'src_attention_2017',
        title: 'Duplicate Attention',
      })
    }, /Duplicate source id/)
  })

  it('rejects adding evidence when sourceId does not exist', () => {
    assert.throws(() => {
      addEvidence(tmpDir, {
        id: 'evi_fake_1',
        sourceId: 'non_existent_source',
        excerpt: 'This should fail because source does not exist.',
      })
    }, /Source with id "non_existent_source" not found in sources.jsonl/)
  })

  it('adds evidence when sourceId exists and supports locator', () => {
    const evidence = addEvidence(tmpDir, {
      id: 'evi_trans_1',
      sourceId: 'src_attention_2017',
      locator: { page: 3, section: '3.1', equation: '(1)' },
      relation: 'supports',
      excerpt: 'Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V',
    })
    assert.equal(evidence.id, 'evi_trans_1')
    assert.equal(evidence.locator.page, 3)
    assert.equal(evidence.locator.equation, '(1)')

    const list = getEvidenceList(tmpDir)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'evi_trans_1')
  })

  it('rejects adding duplicate evidence id', () => {
    assert.throws(() => {
      addEvidence(tmpDir, {
        id: 'evi_trans_1',
        sourceId: 'src_attention_2017',
        excerpt: 'Duplicate evidence should fail',
      })
    }, /Duplicate evidence id/)
  })

  it('rejects adding claim when evidenceId does not exist', () => {
    assert.throws(() => {
      addClaim(tmpDir, {
        id: 'claim_fake_1',
        statement: 'Fake claim with missing evidence',
        evidenceIds: ['non_existent_evidence_id'],
      })
    }, /Evidence with id "non_existent_evidence_id" not found in evidence.jsonl/)
  })

  it('adds claim when evidenceIds exist', () => {
    const claim = addClaim(tmpDir, {
      id: 'claim_scaling_1',
      statement: 'Scaled dot-product attention scales logits by sqrt(d_k) to prevent softmax saturation',
      evidenceIds: ['evi_trans_1'],
      status: 'tentative',
    })
    assert.equal(claim.id, 'claim_scaling_1')
    assert.deepEqual(claim.evidenceIds, ['evi_trans_1'])
    assert.equal(claim.status, 'tentative')

    const list = getClaims(tmpDir)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'claim_scaling_1')
  })

  it('rejects adding duplicate claim id', () => {
    assert.throws(() => {
      addClaim(tmpDir, {
        id: 'claim_scaling_1',
        statement: 'Duplicate statement',
        evidenceIds: ['evi_trans_1'],
      })
    }, /Duplicate claim id/)
  })

  it('queries evidence with filters', () => {
    addEvidence(tmpDir, {
      id: 'evi_trans_2',
      sourceId: 'src_attention_2017',
      locator: { section: '3.2' },
      relation: 'elaborates',
      excerpt: 'Multi-head attention allows the model to jointly attend to information from different representation subspaces.',
    })

    const bySource = queryEvidence(tmpDir, { sourceId: 'src_attention_2017' })
    assert.equal(bySource.length, 2)

    const byRelation = queryEvidence(tmpDir, { relation: 'elaborates' })
    assert.equal(byRelation.length, 1)
    assert.equal(byRelation[0].id, 'evi_trans_2')

    const byText = queryEvidence(tmpDir, { text: 'softmax' })
    assert.equal(byText.length, 1)
    assert.equal(byText[0].id, 'evi_trans_1')
  })

  it('accurately reports summary counts', () => {
    const summary = getLedgerSummary(tmpDir)
    assert.equal(summary.sourcesCount, 1)
    assert.equal(summary.evidenceCount, 2)
    assert.equal(summary.claimsCount, 1)
  })

  it('audits tentative ledger integrity via scientific-verifier', () => {
    const audit = verifyEvidenceLedger(tmpDir)
    assert.equal(audit.passed, true)
    assert.equal(audit.metrics.errorsCount, 0)
    assert.equal(audit.metrics.sourcesCount, 1)
    assert.equal(audit.metrics.evidenceCount, 2)
    assert.equal(audit.metrics.claimsCount, 1)
    assert.equal(audit.metrics.locatorCoverageRate, 1)

    const report = renderVerificationReport(audit)
    assert.ok(report.includes('门禁审查通过'))
    assert.ok(report.includes('精准定位覆盖率 (Locator Coverage): 100%'))
  })

  it('fails verification when locator coverage drops below threshold', () => {
    const subTmp = mkdtempSync(join(tmpdir(), 'tianshu-ledger-threshold-'))
    try {
      addSource(subTmp, { id: 's_test', title: 'Test Paper' })
      // 1 evidence with locator, 2 without locator -> coverage = 1/3 = 33% < 90%
      addEvidence(subTmp, { id: 'e1', sourceId: 's_test', locator: { section: '1' }, excerpt: 'Long substantive excerpt 1' })
      addEvidence(subTmp, { id: 'e2', sourceId: 's_test', excerpt: 'Long substantive excerpt 2' })
      addEvidence(subTmp, { id: 'e3', sourceId: 's_test', excerpt: 'Long substantive excerpt 3' })

      const audit = verifyEvidenceLedger(subTmp)
      assert.equal(audit.passed, false)
      assert.ok(audit.violations.some(v => v.type === 'low_locator_coverage'))
    } finally {
      rmSync(subTmp, { recursive: true, force: true })
    }
  })

  it('end-to-end grounding: ingests document, links source, and passes verified claim', () => {
    const subTmp = mkdtempSync(join(tmpdir(), 'tianshu-ledger-grounded-'))
    try {
      const sampleText = '# Attention Study\n\nScaled dot-product attention scales logits by sqrt(d_k) to prevent softmax saturation.'
      ingestDocument(subTmp, 'doc_att_01', sampleText, { title: 'Attention Study' })

      addSource(subTmp, {
        id: 's_grounded',
        title: 'Attention Study',
        documentId: 'doc_att_01',
      })

      addEvidence(subTmp, {
        id: 'e_grounded',
        sourceId: 's_grounded',
        locator: { section: 'Body', charOffset: 20 },
        relation: 'supports',
        excerpt: 'Scaled dot-product attention scales logits by sqrt(d_k) to prevent softmax saturation.',
      })

      addClaim(subTmp, {
        id: 'c_grounded',
        statement: 'Logits are scaled by sqrt(d_k) to avoid softmax gradient vanishing.',
        evidenceIds: ['e_grounded'],
        status: 'verified',
      })

      const audit = verifyEvidenceLedger(subTmp)
      assert.equal(audit.passed, true)
      assert.equal(audit.metrics.groundingMatched, 1)
      assert.equal(audit.metrics.verifiedClaimsCount, 1)

      // Now add an ungrounded excerpt to test failure
      addEvidence(subTmp, {
        id: 'e_ungrounded',
        sourceId: 's_grounded',
        locator: { section: 'Body' },
        relation: 'supports',
        excerpt: 'This completely fictitious sentence never appeared in the text.',
      })
      const auditFail = verifyEvidenceLedger(subTmp)
      assert.equal(auditFail.passed, false)
      assert.ok(auditFail.violations.some(v => v.type === 'ungrounded_excerpt'))
    } finally {
      rmSync(subTmp, { recursive: true, force: true })
    }
  })

  it('detects corrupted JSONL lines as ledger_read_error', () => {
    const subTmp = mkdtempSync(join(tmpdir(), 'tianshu-ledger-corrupt-'))
    try {
      addSource(subTmp, { id: 's_c', title: 'Corrupt Test' })
      const filePath = join(subTmp, '.rivet', 'research', 'sources.jsonl')
      appendFileSync(filePath, '{ bad json line }\n', 'utf8')

      const audit = verifyEvidenceLedger(subTmp)
      assert.equal(audit.passed, false)
      assert.ok(audit.violations.some(v => v.type === 'ledger_read_error'))
    } finally {
      rmSync(subTmp, { recursive: true, force: true })
    }
  })
  it('exports CSL-JSON and RIS standards to .rivet/research/export/', () => {
    const expTmp = mkdtempSync(join(tmpdir(), 'tianshu-export-'))
    try {
      addSource(expTmp, {
        id: 'src_exp',
        title: 'Fourier Basis PINNs for Inverse Problems',
        authors: ['Alice Smith', 'Bob Jones'],
        year: 2025,
        doi: '10.1038/s41598-025-99354-5',
        landingUrl: 'https://nature.com/articles/s41598-025-99354-5',
      })
      addEvidence(expTmp, {
        id: 'evi_exp',
        sourceId: 'src_exp',
        excerpt: 'Fourier bases achieve 10x convergence speed.',
        locator: { section: 'Results', lineStart: 45 },
      })

      // Test CSL-JSON
      const cslRes = exportCslJson(expTmp)
      assert.ok(existsSync(cslRes.filePath))
      assert.equal(cslRes.count, 1)
      const cslData = JSON.parse(readFileSync(cslRes.filePath, 'utf8'))
      assert.equal(cslData.length, 1)
      assert.equal(cslData[0].id, 'src_exp')
      assert.equal(cslData[0].title, 'Fourier Basis PINNs for Inverse Problems')
      assert.equal(cslData[0].author[0].family, 'Smith')
      assert.equal(cslData[0].author[0].given, 'Alice')
      assert.equal(cslData[0].DOI, '10.1038/s41598-025-99354-5')
      assert.ok(cslData[0].note.includes('TianshuEvidence: 1 record(s)'))

      // Test RIS
      const risRes = exportRis(expTmp)
      assert.ok(existsSync(risRes.filePath))
      assert.equal(risRes.count, 1)
      const risContent = readFileSync(risRes.filePath, 'utf8')
      assert.ok(risContent.includes('TY  - JOUR'))
      assert.ok(risContent.includes('TI  - Fourier Basis PINNs for Inverse Problems'))
      assert.ok(risContent.includes('AU  - Alice Smith'))
      assert.ok(risContent.includes('DO  - 10.1038/s41598-025-99354-5'))
      assert.ok(risContent.includes('ER  -'))
    } finally {
      rmSync(expTmp, { recursive: true, force: true })
    }
  })
});
