import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runResearchEvidence } from '../gateway-evidence.js';
import { addEvidenceV2, addClaimV2 } from '../ledger/evidence-v2.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';
import { dispatchOperation } from '../operations/dispatcher.js';

describe('Phase 6B: Gateway Science E2E Verification & Gate Closure', () => {
  let tmpDir;
  let scope;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-gw-sci-e2e-'));
    scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('rejects synthetic pass for theoretical claim when equation is missing', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-noeq-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    addEvidenceV2(subWs, {
      id: 'ev_theory_empty',
      kind: 'theoretical',
      statement: 'Pure conceptual theoretical hypothesis without math',
    });
    addClaimV2(subWs, {
      id: 'clm_theory_empty',
      kind: 'theoretical',
      statement: 'Conceptual hypothesis is true',
      evidenceIds: ['ev_theory_empty'],
      conclusion: 'supported',
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'inconclusive');
    const dimGate = res.data.results.find(r => r.gateId === 'dimensional-consistency');
    assert.ok(dimGate);
    assert.equal(dimGate.status, 'inconclusive');
    assert.ok(dimGate.checks.some(c => c.code === 'NO_EQUATION_FOR_AUDIT'));

    rmSync(subWs, { recursive: true, force: true });
  });

  it('fails dimensional-consistency gate when equation has inconsistent dimensions', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-baddim-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    addEvidenceV2(subWs, {
      id: 'ev_theory_bad',
      kind: 'theoretical',
      statement: 'force equals area',
      equation: 'force = area',
    });
    addClaimV2(subWs, {
      id: 'clm_theory_bad',
      kind: 'theoretical',
      statement: 'Force directly scales as surface area',
      evidenceIds: ['ev_theory_bad'],
      conclusion: 'supported',
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'fail');
    const dimGate = res.data.results.find(r => r.gateId === 'dimensional-consistency');
    assert.ok(dimGate);
    assert.equal(dimGate.status, 'fail');
    assert.ok(dimGate.summary.includes('FAILED'));

    rmSync(subWs, { recursive: true, force: true });
  });

  it('passes dimensional-consistency gate when equation is physically homogeneous', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-gooddim-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    addEvidenceV2(subWs, {
      id: 'ev_theory_good',
      kind: 'theoretical',
      statement: 'force equals mass times acceleration',
      equation: 'force = mass * acceleration',
    });
    addClaimV2(subWs, {
      id: 'clm_theory_good',
      kind: 'theoretical',
      statement: 'Newton second law holds dimensionally',
      evidenceIds: ['ev_theory_good'],
      conclusion: 'supported',
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'pass');
    const dimGate = res.data.results.find(r => r.gateId === 'dimensional-consistency');
    assert.ok(dimGate);
    assert.equal(dimGate.status, 'pass');

    rmSync(subWs, { recursive: true, force: true });
  });

  it('returns inconclusive for empirical claim lacking dataset and statistical results', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-noemp-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    addEvidenceV2(subWs, {
      id: 'ev_emp_1',
      kind: 'empirical',
      statement: 'Model achieves 95% accuracy on dataset',
    });
    addClaimV2(subWs, {
      id: 'clm_emp_1',
      kind: 'empirical',
      statement: 'Performance is superior to baseline',
      evidenceIds: ['ev_emp_1'],
      conclusion: 'supported',
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'inconclusive');
    const dqGate = res.data.results.find(r => r.gateId === 'data-quality');
    const statGate = res.data.results.find(r => r.gateId === 'statistical-validity');
    assert.equal(dqGate?.status, 'inconclusive');
    assert.equal(statGate?.status, 'inconclusive');

    rmSync(subWs, { recursive: true, force: true });
  });

  it('correctly passes statistical validity for p >= alpha while recording inconclusive scientific conclusion', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-statnon-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    // Legitimate statistical test: nA=20, nB=20, valid effect size, but p = 0.28 (not significant)
    const validStatResult = {
      method: 'welch_t_test',
      nA: 20,
      nB: 20,
      effectSize: 0.15,
      effectMetric: 'cohens_d',
      confidenceInterval: [ -0.1, 0.4 ],
      pValue: 0.28,
      alpha: 0.05,
      significant: false,
      conclusion: 'inconclusive',
    };

    const csvPath = join(subWs, 'data.csv');
    writeFileSync(csvPath, 'id,group,score\n1,A,10\n2,A,12\n3,B,11\n4,B,13\n', 'utf8');

    addEvidenceV2(subWs, {
      id: 'ev_stat_1',
      kind: 'empirical',
      statement: 'Two group evaluation completed',
      datasetPath: csvPath,
      statResult: validStatResult,
    });
    addClaimV2(subWs, {
      id: 'clm_stat_1',
      kind: 'empirical',
      statement: 'Treatment produces substantial gain over control',
      evidenceIds: ['ev_stat_1'],
      conclusion: 'inconclusive', // truthful scientific status for p >= alpha
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'pass');
    const statGate = res.data.results.find(r => r.gateId === 'statistical-validity');
    assert.equal(statGate?.status, 'pass');
    assert.ok(statGate.checks.some(c => c.code === 'OBJECTIVE_NON_SIGNIFICANCE_HONORED'));

    rmSync(subWs, { recursive: true, force: true });
  });

  it('fails reproducibility gate for benchmark claim when execution receipts are missing', async () => {
    const subWs = mkdtempSync(join(tmpdir(), 'tianshu-sci-nobench-'));
    const subScope = resolveWorkspaceScope({ workspace: subWs, explicitTrust: true });

    addEvidenceV2(subWs, {
      id: 'ev_bench_1',
      kind: 'benchmark',
      statement: 'Latency measured across 5 runs',
      plan: { matrix: [{ condition: 'baseline', isolatedFactor: 'baseline' }] },
    });
    addClaimV2(subWs, {
      id: 'clm_bench_1',
      kind: 'benchmark',
      statement: 'Latency reduced by 30%',
      evidenceIds: ['ev_bench_1'],
      conclusion: 'supported',
    });

    const res = await runResearchEvidence({
      action: 'verify_project',
      workspace: subWs,
    }, { scope: subScope });

    assert.equal(res.data.verificationStatus, 'fail');
    const reproGate = res.data.results.find(r => r.gateId === 'reproducibility');
    assert.equal(reproGate?.status, 'fail');
    assert.ok(reproGate.summary.includes('No execution receipts'));

    rmSync(subWs, { recursive: true, force: true });
  });

  it('executes data.prepare@1 via gateway and produces real transformed artifacts', async () => {
    const testData = [
      { id: '1', name: 'sensor_a', val: '10.5' },
      { id: '2', name: 'sensor_b', val: null },
      { id: '3', name: 'sensor_c', val: '25.0' },
    ];
    const rawCsv = join(tmpDir, 'raw_sensors.csv');
    writeFileSync(rawCsv, 'id,name,val\n1,sensor_a,10.5\n2,sensor_b,\n3,sensor_c,25.0\n', 'utf8');

    const res = await runResearchEvidence({
      action: 'execute_operation',
      workspace: tmpDir,
      operationId: 'data.prepare@1',
      arguments: {
        datasetPath: rawCsv,
        operations: [
          { type: 'drop_na', column: 'val' },
          { type: 'select_columns', columns: ['id', 'val'] },
        ],
      },
    }, { scope });

    assert.equal(res.isError, false);
    assert.equal(res.data.status, 'completed');
    assert.equal(res.data.measurements.rowsBefore, 3);
    assert.equal(res.data.measurements.rowsAfter, 2);
    assert.deepEqual(res.data.measurements.columns, ['id', 'val']);
    assert.ok(res.data.artifacts.length > 0);
  });

  it('rejects benchmark.run@1 without executable and eliminates synthetic metrics', async () => {
    const res = await dispatchOperation('benchmark.run@1', {
      parameters: { variant: 'fast' },
    }, { workspace: tmpDir, scope });

    assert.equal(res.status, 'failed');
    assert.equal(res.issues[0].code, 'EXECUTABLE_REQUIRED');
    assert.equal(res.measurements.accuracy, undefined); // 0.85 must never appear!
  });
});
