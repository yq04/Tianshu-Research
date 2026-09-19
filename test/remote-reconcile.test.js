/**
 * Test Suite: Run Reconciliation (Phase 10, plugin side)
 * Simulates a disconnect/crash between the local run store and a "remote"
 * backend. Verifies that reconciliation trusts only the backend: verified
 * terminal receipts are ingested, unknown runs become honestly 'orphaned'
 * (never completed), unreachable backends leave the store untouched, and
 * re-reconciliation is a no-op.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reconcileRuns } from '../jobs/reconcile.js';
import { recordRun, getRun } from '../jobs/run-store.js';
import { guardBackend } from '../jobs/backends/interface.js';

describe('Phase 10: Remote Reconciliation', () => {
  let tempDir;
  let ws;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-reconcile-test-'));
    ws = join(tempDir, 'ws');
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  /**
   * A "remote" backend that survives local crashes. Callers manipulate its
   * in-memory bookkeeping directly to simulate what truly happened remotely.
   */
  function makeSurvivingRemote() {
    const remote = new Map();
    let reachable = true;
    return {
      name: 'fake-surviving-remote',
      supported: true,
      capabilities: ['cpu'],
      backend: {
        name: 'fake-surviving-remote',
        supported: true,
        capabilities: ['cpu'],
        async submit() {
          throw new Error('not used in reconcile tests');
        },
        async query(_tenant, backendRunId) {
          if (!reachable) throw new Error('transport down (simulated disconnect)');
          const run = remote.get(backendRunId);
          if (!run) return { status: 'not_found' };
          return { status: run.status, receipt: run.receipt };
        },
        async cancel() {
          return { ok: true, status: 'cancelled' };
        },
      },
      _set(runId, status, receipt) {
        remote.set(runId, { status, receipt });
      },
      _setReachable(v) {
        reachable = v;
      },
    };
  }

  it('ingests verified terminal receipts after a simulated crash', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);

    // Local store believes two runs are in flight (crash lost the outcomes).
    recordRun(ws, { runId: 'r-ok', status: 'running' });
    recordRun(ws, { runId: 'r-fail', status: 'running' });
    // Remote truth: one completed, one failed — with real receipts.
    remote._set('r-ok', 'completed', { exitCode: 0, endTime: '2026-09-19T00:00:00Z' });
    remote._set('r-fail', 'failed', { exitCode: 2, endTime: '2026-09-19T00:00:01Z' });

    const report = await reconcileRuns({ workspace: ws, backend });
    assert.equal(report.checked, 2);
    assert.deepEqual(report.ingested.map((i) => i.runId).sort(), ['r-fail', 'r-ok']);

    const ok = getRun(ws, 'r-ok');
    assert.equal(ok.status, 'completed');
    assert.equal(ok.receipt.exitCode, 0);
    const fail = getRun(ws, 'r-fail');
    assert.equal(fail.status, 'failed');
    assert.equal(fail.receipt.exitCode, 2);
  });

  it('marks backend-unknown runs as orphaned — never completed', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);

    recordRun(ws, { runId: 'r-ghost', status: 'running' });
    // Backend has no idea this run exists.

    const report = await reconcileRuns({ workspace: ws, backend });
    assert.deepEqual(report.orphaned, ['r-ghost']);
    const ghost = getRun(ws, 'r-ghost');
    assert.equal(ghost.status, 'orphaned');
    assert.match(ghost.error, /never verified to complete/);
  });

  it('leaves the store untouched when the backend is unreachable', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);

    recordRun(ws, { runId: 'r-disconnected', status: 'running' });
    remote._set('r-disconnected', 'completed', { exitCode: 0 }); // remote knows, but transport is down
    remote._setReachable(false);

    const report = await reconcileRuns({ workspace: ws, backend });
    assert.equal(report.unreachable.length, 1);
    assert.equal(report.ingested.length, 0);

    const run = getRun(ws, 'r-disconnected');
    assert.equal(run.status, 'running', 'unreachable backend must not change local state');

    // Transport recovers: the same reconcile call now ingests the truth.
    remote._setReachable(true);
    const report2 = await reconcileRuns({ workspace: ws, backend });
    assert.deepEqual(report2.ingested.map((i) => i.runId), ['r-disconnected']);
    assert.equal(getRun(ws, 'r-disconnected').status, 'completed');
  });

  it('reports still-running backend jobs without changing the store', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);

    recordRun(ws, { runId: 'r-active', status: 'running' });
    remote._set('r-active', 'running', null);

    const report = await reconcileRuns({ workspace: ws, backend });
    assert.deepEqual(report.stillRunning, ['r-active']);
    assert.equal(getRun(ws, 'r-active').status, 'running');
  });

  it('is idempotent: re-reconciling a settled store checks nothing', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);

    recordRun(ws, { runId: 'r-one', status: 'running' });
    remote._set('r-one', 'completed', { exitCode: 0 });

    const first = await reconcileRuns({ workspace: ws, backend });
    assert.equal(first.checked, 1);
    const second = await reconcileRuns({ workspace: ws, backend });
    assert.equal(second.checked, 0, 'no in-flight runs remain after ingestion');
  });

  it('is scoped to the given workspace (tenant isolation)', async () => {
    const remote = makeSurvivingRemote();
    const backend = guardBackend(remote.backend);
    const otherWs = join(tempDir, 'other-ws');

    recordRun(ws, { runId: 'mine', status: 'running' });
    recordRun(otherWs, { runId: 'theirs', status: 'running' });
    remote._set('mine', 'completed', { exitCode: 0 });

    const report = await reconcileRuns({ workspace: ws, backend });
    assert.deepEqual(report.ingested.map((i) => i.runId), ['mine']);
    assert.equal(getRun(otherWs, 'theirs').status, 'running', 'another workspace must not be touched');
  });
});
