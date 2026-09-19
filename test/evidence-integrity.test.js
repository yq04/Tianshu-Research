import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunReceipt, verifyRunReceipt } from '../jobs/run-receipt.js';
import { evaluateProjectGates } from '../gates/evaluator.js';
import { addEvidenceV2, addClaimV2 } from '../ledger/evidence-v2.js';
import { saveArtifact } from '../ledger/artifact-store.js';

describe('Phase 6B: Evidence Integrity, Anti-Tamper & Checksum Verification', () => {
  let tmpDir;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-ev-integrity-'));
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('computes truthful integrityChecksum and maintains backward-compatible receiptSignature alias', () => {
    const receipt = createRunReceipt({
      runId: 'receipt_truth_1',
      operationId: 'benchmark.run@1',
      specDigest: 'sha256_mock_spec_abc',
      status: 'completed',
      exitCode: 0,
      metrics: { stdoutBytes: 120, stderrBytes: 0 },
    });

    assert.ok(receipt.integrityChecksum);
    assert.equal(typeof receipt.integrityChecksum, 'string');
    assert.equal(receipt.integrityChecksum.length, 64);
    // Alias must match exactly
    assert.equal(receipt.receiptSignature, receipt.integrityChecksum);

    const check = verifyRunReceipt(receipt);
    assert.equal(check.valid, true);
  });

  it('rejects fraudulent receipts claiming status completed with non-zero exitCode', () => {
    const fraudReceipt = {
      schemaVersion: 2,
      runId: 'fraud_run_1',
      operationId: 'benchmark.run@1',
      status: 'completed',
      exitCode: 1,
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      durationMs: 100,
      outputs: [],
      metrics: { stdoutBytes: 0, stderrBytes: 0, exitCode: 1 },
      integrityChecksum: 'some_checksum',
      receiptSignature: 'some_checksum',
    };

    const check = verifyRunReceipt(fraudReceipt);
    assert.equal(check.valid, false);
    assert.ok(check.reason.includes('Fraudulent receipt'));
  });

  it('detects tampering when payload fields are modified after checksum calculation', () => {
    const original = createRunReceipt({
      runId: 'tamper_target_run',
      operationId: 'theory.dimension@1',
      status: 'completed',
      exitCode: 0,
    });

    // 1. Tamper exit code
    const tamperedExit = { ...original, exitCode: 2 };
    assert.equal(verifyRunReceipt(tamperedExit).valid, false);

    // 2. Tamper duration
    const tamperedDuration = { ...original, durationMs: 999999 };
    assert.equal(verifyRunReceipt(tamperedDuration).valid, false);

    // 3. Tamper checksum string
    const tamperedChecksum = { ...original, integrityChecksum: 'f'.repeat(64), receiptSignature: 'f'.repeat(64) };
    const checkSig = verifyRunReceipt(tamperedChecksum);
    assert.equal(checkSig.valid, false);
    assert.ok(checkSig.reason.includes('mismatch'));
  });

  it('evaluates provenance-integrity gate and fails upon dangling evidence references', () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-ev-dangling-'));

    addEvidenceV2(subWs, {
      id: 'ev_valid_1',
      kind: 'empirical',
      statement: 'Valid evidence record',
    });

    // Claim references both valid and non-existent evidence
    addClaimV2(subWs, {
      id: 'clm_dangling_1',
      kind: 'empirical',
      statement: 'Claim with phantom evidence link',
      evidenceIds: ['ev_valid_1', 'phantom_evidence_id_999'],
      conclusion: 'supported',
    });

    const evalRes = evaluateProjectGates(subWs);
    const provGate = evalRes.results.find(r => r.gateId === 'provenance-integrity');
    assert.ok(provGate);
    assert.equal(provGate.status, 'fail');
    assert.ok(provGate.checks.some(c => c.code === 'DANGLING_EVIDENCE_REFERENCE'));
    assert.equal(evalRes.report.verificationStatus, 'fail');

    rmSync(subWs, { recursive: true, force: true });
  });

  it('evaluates provenance-integrity gate and fails if declared artifact does not exist on disk', () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-ev-missing-art-'));

    addEvidenceV2(subWs, {
      id: 'ev_ghost_art',
      kind: 'empirical',
      statement: 'Evidence declaring missing disk artifact',
      artifactId: 'art_ghost_not_on_disk_xyz',
      relativePath: '.rivet/research/v2/artifacts/ghost.csv',
    });
    addClaimV2(subWs, {
      id: 'clm_ghost_art',
      kind: 'empirical',
      statement: 'Claim based on ghost artifact',
      evidenceIds: ['ev_ghost_art'],
      conclusion: 'supported',
    });

    const evalRes = evaluateProjectGates(subWs);
    const provGate = evalRes.results.find(r => r.gateId === 'provenance-integrity');
    assert.ok(provGate);
    assert.equal(provGate.status, 'fail');
    assert.ok(provGate.checks.some(c => c.code === 'ARTIFACT_NOT_FOUND'));

    rmSync(subWs, { recursive: true, force: true });
  });

  it('passes provenance-integrity gate when real artifact exists on disk', () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-ev-real-art-'));

    const art = saveArtifact(subWs, 'col1,col2\n10,20\n', {
      kind: 'dataset',
      mediaType: 'text/csv',
      filename: 'real_test_data.csv',
    });

    addEvidenceV2(subWs, {
      id: 'ev_real_art',
      kind: 'empirical',
      statement: 'Evidence backed by real disk artifact',
      artifactId: art.id,
      sha256: art.sha256,
      relativePath: art.relativePath,
    });
    addClaimV2(subWs, {
      id: 'clm_real_art',
      kind: 'empirical',
      statement: 'Claim backed by real disk artifact',
      evidenceIds: ['ev_real_art'],
      conclusion: 'supported',
    });

    const evalRes = evaluateProjectGates(subWs);
    const provGate = evalRes.results.find(r => r.gateId === 'provenance-integrity');
    assert.ok(provGate);
    assert.equal(provGate.status, 'pass');

    rmSync(subWs, { recursive: true, force: true });
  });
});

