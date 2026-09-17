import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
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
} from '../ledger/evidence-ledger.js'
import {
  verifyEvidenceLedger,
  renderVerificationReport,
} from '../gates/scientific-verifier.js'

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
      status: 'verified',
    })
    assert.equal(claim.id, 'claim_scaling_1')
    assert.deepEqual(claim.evidenceIds, ['evi_trans_1'])
    assert.equal(claim.status, 'verified')

    const list = getClaims(tmpDir)
    assert.equal(list.length, 1)
    assert.equal(list[0].id, 'claim_scaling_1')
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

  it('audits ledger integrity via scientific-verifier', () => {
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
})
