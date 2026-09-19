import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { aggregateGateReport, renderGateReport } from '../gates/report.js';
import { getGateDescriptor, listGateDescriptors } from '../gates/registry.js';
import { runResearchEvidence } from '../gateway-evidence.js';
import { addEvidenceV2, addClaimV2 } from '../ledger/evidence-v2.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';

describe('Phase 3: Composable Scientific Gate Report', () => {
  let tmpDir;
  let scope;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-gates-test-'));
    scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('provides authoritative gate definitions in registry', () => {
    const dimGate = getGateDescriptor('dimensional-consistency');
    assert.ok(dimGate);
    assert.equal(dimGate.defaultRequired, true);
    assert.ok(dimGate.applicableParadigms.includes('theoretical'));

    const allGates = listGateDescriptors();
    assert.ok(allGates.length >= 8);
  });

  it('returns not_applicable for empty projects without claims (no false green pass)', () => {
    const report = aggregateGateReport({ results: [], claims: [], targetIds: [] });
    assert.equal(report.verificationStatus, 'not_applicable');
    assert.equal(report.executionStatus, 'completed');
    assert.ok(report.summary.includes('not_applicable'));
  });

  it('enforces strict inconclusive aggregation (cannot downgrade or forge to pass)', () => {
    const report = aggregateGateReport({
      results: [
        { gateId: 'provenance-integrity', status: 'pass', summary: 'Artifacts verified' },
        { gateId: 'statistical-validity', status: 'inconclusive', summary: 'Sample size too small' },
      ],
      claims: [{ id: 'clm_1' }],
      targetIds: ['clm_1'],
    });

    assert.equal(report.verificationStatus, 'inconclusive');
    assert.ok(report.unresolved.some(u => u.includes('statistical-validity')));
  });

  it('fails overall verification if any gate fails or has tool error', () => {
    const failReport = aggregateGateReport({
      results: [
        { gateId: 'provenance-integrity', status: 'pass' },
        { gateId: 'dimensional-consistency', status: 'fail', summary: 'Incompatible dimensions' },
      ],
      claims: [{ id: 'clm_1' }],
    });
    assert.equal(failReport.verificationStatus, 'fail');

    const errReport = aggregateGateReport({
      results: [
        { gateId: 'reproducibility', status: 'error', summary: 'Process timed out' },
      ],
      claims: [{ id: 'clm_1' }],
    });
    assert.equal(errReport.executionStatus, 'error');
    assert.equal(errReport.verificationStatus, 'fail');
  });

  it('reports pass only when all applicable gates pass', () => {
    const passReport = aggregateGateReport({
      results: [
        { gateId: 'provenance-integrity', status: 'pass', summary: 'Hashes match' },
        { gateId: 'dimensional-consistency', status: 'pass', summary: 'LHS = RHS' },
      ],
      claims: [{ id: 'clm_1' }],
      targetIds: ['clm_1'],
    });

    assert.equal(passReport.verificationStatus, 'pass');
    assert.equal(passReport.executionStatus, 'completed');
    assert.equal(passReport.unresolved.length, 0);

    const rendered = renderGateReport(passReport);
    assert.ok(rendered.includes('PASS'));
    assert.ok(rendered.includes('Hashes match'));
  });

  it('runs verify_project and plan_workflow via gateway', async () => {
    // 1. Empty workspace verify_project -> not_applicable
    const emptyVerify = await runResearchEvidence({
      action: 'verify_project',
      workspace: tmpDir,
    }, { scope });
    assert.equal(emptyVerify.isError, undefined);
    assert.equal(emptyVerify.data.verificationStatus, 'not_applicable');

    // 2. plan_workflow for theoretical objective
    const planRes = await runResearchEvidence({
      action: 'plan_workflow',
      workspace: tmpDir,
      objective: '推导并检验应力边界极限与量纲一致性',
    }, { scope });
    assert.equal(planRes.isError, undefined);
    assert.equal(planRes.data.primary, 'theoretical');
    assert.ok(planRes.data.operations.includes('theory.dimension@1'));

    // 3. Add valid evidence & claim then verify
    addEvidenceV2(tmpDir, {
      id: 'ev_theory_1',
      kind: 'theoretical',
      statement: 'force equals stress times area',
    });
    addClaimV2(tmpDir, {
      id: 'clm_theory_1',
      kind: 'theoretical',
      statement: 'Navier-Cauchy equation maintains dimensional balance',
      evidenceIds: ['ev_theory_1'],
      conclusion: 'supported',
    });

    const verifyWithTargets = await runResearchEvidence({
      action: 'verify_project',
      workspace: tmpDir,
    }, { scope });

    assert.equal(verifyWithTargets.isError, undefined);
    assert.equal(verifyWithTargets.data.verificationStatus, 'pass');
    assert.ok(verifyWithTargets.content.includes('PASS'));
  });
});
