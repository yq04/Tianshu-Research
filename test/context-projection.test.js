/**
 * Test Suite: CVM Context Projection (Phase 8, plugin side)
 * Validates one-way deterministic projection of research facts into
 * CVM-compatible shapes: claim revisions & counterevidence accuracy,
 * byte-stable digests (prefix-cache safety), and read-only discipline.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addEvidenceV2, addClaimV2 } from '../ledger/evidence-v2.js';
import { ResearchWorkflowStore } from '../workflows/store.js';
import {
  CVM_PROJECTION_SCHEMA_VERSION,
  PROJECTION_DIRECTION,
  projectClaim,
  projectResearchContext,
  projectWorkflowTask,
  serializeProjection,
  verifyProjectionIntegrity,
} from '../integration/context-projection.js';

describe('Phase 8: CVM Context Projection', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-projection-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('projects an empty workspace to a stable, honest zero-state', () => {
    const p1 = projectResearchContext(tempDir);
    const p2 = projectResearchContext(tempDir);

    assert.equal(p1.schemaVersion, CVM_PROJECTION_SCHEMA_VERSION);
    assert.equal(p1.direction, PROJECTION_DIRECTION);
    assert.deepEqual(p1.claims, []);
    assert.deepEqual(p1.tasks, []);
    assert.deepEqual(p1.signals, []);
    assert.equal(p1.summary.claimCount, 0);
    assert.equal(p1.summary.evidenceCount, 0);
    // Deterministic: identical facts -> identical digest (prefix-cache safety)
    assert.equal(p1.digest, p2.digest);
    assert.ok(verifyProjectionIntegrity(p1));
  });

  it('projects claim revisions and counterevidence accurately', () => {
    const evSupport = addEvidenceV2(tempDir, {
      id: 'ev_support_1',
      kind: 'empirical',
      relation: 'supports',
      statement: 'Experiment A reproduces the prediction.',
    });
    const evRefute = addEvidenceV2(tempDir, {
      id: 'ev_refute_1',
      kind: 'empirical',
      relation: 'refutes',
      statement: 'Experiment B contradicts the prediction.',
    });
    addClaimV2(tempDir, {
      id: 'clm_contested',
      kind: 'empirical',
      statement: 'Method X improves accuracy by 5%.',
      evidenceIds: ['ev_support_1', 'ev_refute_1'],
      conclusion: 'supported',
      meta: { revision: 3 },
    });

    const projection = projectResearchContext(tempDir);
    assert.equal(projection.claims.length, 1);
    const claim = projection.claims[0];

    assert.equal(claim.id, 'clm_contested');
    assert.equal(claim.revision, 3);
    assert.equal(claim.evidenceCount, 2);
    assert.equal(claim.supportCount, 1);
    assert.equal(claim.refuteCount, 1);
    assert.deepEqual(claim.refutingEvidenceIds, ['ev_refute_1']);
    assert.deepEqual(claim.supportingEvidenceIds, ['ev_support_1']);
    assert.equal(claim.contested, true);
    // Honest projection: "supported" while refuting evidence exists -> conflict flag
    assert.equal(claim.conclusionConflict, true);

    const conflictSignals = projection.signals.filter((s) => s.kind === 'counterevidence_conflict');
    assert.equal(conflictSignals.length, 1);
    assert.equal(conflictSignals[0].target, 'clm_contested');
    assert.ok(verifyProjectionIntegrity(projection));
  });

  it('does not flag conflict for a refuted claim recorded honestly', () => {
    addEvidenceV2(tempDir, { id: 'ev_r', kind: 'empirical', relation: 'refutes', statement: 'No effect.' });
    addClaimV2(tempDir, {
      id: 'clm_refuted_ok',
      statement: 'Hypothesis H1.',
      evidenceIds: ['ev_r'],
      conclusion: 'refuted',
    });

    const projection = projectResearchContext(tempDir);
    const claim = projection.claims[0];
    assert.equal(claim.contested, true);
    // A negative result honestly recorded as refuted is NOT a conflict.
    assert.equal(claim.conclusionConflict, false);
  });

  it('produces byte-identical projections across calls (no wall-clock leakage)', () => {
    addEvidenceV2(tempDir, { id: 'ev_a', kind: 'benchmark', relation: 'supports', statement: 'S1' });
    addClaimV2(tempDir, { id: 'clm_a', statement: 'Claim A', evidenceIds: ['ev_a'], conclusion: 'supported' });

    const s1 = serializeProjection(projectResearchContext(tempDir));
    const s2 = serializeProjection(projectResearchContext(tempDir));
    assert.equal(s1, s2);
    assert.ok(!s1.includes('generatedAt'));
    assert.ok(!s1.includes('projectedAt'));

    // Mutating a returned projection must not corrupt the store view
    const p = projectResearchContext(tempDir);
    assert.throws(() => {
      'use strict';
      p.schemaVersion = 999;
    }, TypeError);
  });

  it('detects tampering via digest verification', () => {
    addClaimV2(tempDir, { id: 'clm_t', statement: 'Original statement', conclusion: 'proposed' });
    const projection = projectResearchContext(tempDir);
    assert.ok(verifyProjectionIntegrity(projection));

    const tampered = { ...projection, claims: [{ ...projection.claims[0], conclusion: 'supported' }] };
    assert.equal(verifyProjectionIntegrity(tampered), false);
  });

  it('projects workflow task state from the event journal', () => {
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId: 'task_p8' });
    store.appendEvent({
      kind: 'TASK_CREATED',
      payload: { title: 'P8 task', graph: { nodes: [{ id: 'n1' }] } },
    });
    store.appendEvent({ kind: 'NODE_STARTED', payload: { nodeId: 'n1' } });
    store.appendEvent({ kind: 'NODE_COMPLETED', payload: { nodeId: 'n1' } });

    const active = projectWorkflowTask(tempDir, 'task_p8');
    assert.equal(active.status, 'active');
    assert.equal(active.nodeStatuses.n1, 'completed');
    assert.equal(active.budgetExhausted, false);
    assert.equal(active.revision, 1);

    store.appendEvent({ kind: 'BUDGET_EXHAUSTED', payload: { dimension: 'maxRuns' } });
    store.appendEvent({ kind: 'WORKFLOW_COMPLETED', payload: { partial: true } });

    const done = projectWorkflowTask(tempDir, 'task_p8');
    assert.equal(done.status, 'completed');
    assert.equal(done.budgetExhausted, true);
    assert.equal(done.revision, 1);

    const projection = projectResearchContext(tempDir);
    const budgetSignals = projection.signals.filter((s) => s.kind === 'budget_exhausted');
    assert.equal(budgetSignals.length, 1);
    assert.equal(budgetSignals[0].target, 'task_p8');
    assert.equal(projection.tasks.length, 1);
    assert.equal(projection.summary.taskCount, 1);

    assert.equal(projectWorkflowTask(tempDir, 'missing_task'), null);
  });

  it('is strictly read-only: projecting creates no new research files', () => {
    addClaimV2(tempDir, { id: 'clm_ro', statement: 'Read-only check', conclusion: 'proposed' });

    const before = listWorkspaceFiles(tempDir);
    projectResearchContext(tempDir);
    projectResearchContext(tempDir);
    const after = listWorkspaceFiles(tempDir);

    assert.deepEqual(after, before);
  });

  it('supports ledger-free and task-free projection variants', () => {
    addClaimV2(tempDir, { id: 'clm_v', statement: 'Variant', conclusion: 'proposed' });
    const p = projectResearchContext(tempDir, { includeLedger: false, includeTasks: false });
    assert.deepEqual(p.ledgerEntries, []);
    assert.deepEqual(p.tasks, []);
    assert.equal(p.claims.length, 1);
  });
});

function listWorkspaceFiles(dir) {
  const files = [];
  const walk = (d) => {
    if (!existsSync(d)) return;
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const full = join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full.slice(dir.length));
    }
  };
  walk(dir);
  return files.sort();
}
