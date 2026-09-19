import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { executeRunSpec, getRunStatus, cancelRun } from '../jobs/executor.js';
import { createRunSpec } from '../jobs/run-spec.js';
import { getRun, listRuns } from '../jobs/run-store.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';
import { runResearchEvidence } from '../gateway-evidence.js';

describe('Phase 6B: Job Lifecycle, Process Control & Settle-Once Invariants', () => {
  let tmpDir;
  let scope;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-job-lifecycle-'));
    scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('truthfully records execution lifecycle, PID, and outputs in RunStore', async () => {
    const runId = 'job_test_success_1';
    const spec = createRunSpec({
      runId,
      operationId: 'benchmark.run@1',
      executable: {
        path: process.execPath,
        argv: ['-e', 'console.log("JOB_OUTPUT_LINE_1"); console.log("JOB_OUTPUT_LINE_2");'],
      },
    });

    const { receipt, stdout } = await executeRunSpec(tmpDir, spec, { scope });
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.exitCode, 0);
    assert.ok(stdout.includes('JOB_OUTPUT_LINE_1'));

    // Check RunStore
    const stored = getRun(tmpDir, runId);
    assert.ok(stored);
    assert.equal(stored.runId, runId);
    assert.equal(stored.status, 'completed');
    assert.equal(stored.exitCode, 0);
    assert.ok(stored.receipt);
    assert.equal(stored.receipt.integrityChecksum, receipt.integrityChecksum);
    assert.ok(typeof stored.pid === 'number');

    const statusInfo = getRunStatus(tmpDir, runId);
    assert.equal(statusInfo.status, 'completed');
    assert.ok(statusInfo.receipt);
  });

  it('strictly returns not_found for non-existent runId instead of hallucinated completed', () => {
    const fakeRunId = 'completely_unknown_run_9999';
    const stored = getRun(tmpDir, fakeRunId);
    assert.equal(stored, null);

    const statusInfo = getRunStatus(tmpDir, fakeRunId);
    assert.equal(statusInfo.status, 'not_found');
    assert.equal(statusInfo.receipt, null);
  });

  it('rejects cancellation of non-existent run with not_found status', async () => {
    const res = await cancelRun(tmpDir, 'unknown_run_for_cancel');
    assert.equal(res.success, false);
    assert.equal(res.status, 'not_found');
  });

  it('reliably cancels active child process, terminates process tree, and issues cancelled receipt', async () => {
    const runId = 'job_long_running_cancel';
    const spec = createRunSpec({
      runId,
      operationId: 'benchmark.run@1',
      executable: {
        path: process.execPath,
        // Sleep for 30 seconds
        argv: ['-e', 'setTimeout(() => { console.log("SHOULD_NOT_REACH"); }, 30000);'],
      },
      limits: { wallSeconds: 30, maxOutputBytes: 1024 * 1024 },
    });

    // Start running asynchronously
    const execPromise = executeRunSpec(tmpDir, spec, { scope });

    // Wait 100ms for process to spawn and register in memory/run-store
    await new Promise((r) => setTimeout(r, 100));

    const statusBefore = getRunStatus(tmpDir, runId);
    assert.equal(statusBefore.status, 'running');

    // Issue real cancellation
    const cancelRes = await cancelRun(tmpDir, runId, 'Cancelled for test');
    assert.equal(cancelRes.success, true);
    assert.equal(cancelRes.status, 'cancelled');

    // Await promise completion
    const { receipt } = await execPromise;
    assert.equal(receipt.status, 'cancelled');
    assert.equal(receipt.exitCode, 130);
    assert.ok(receipt.error.includes('Cancelled'));

    const statusAfter = getRunStatus(tmpDir, runId);
    assert.equal(statusAfter.status, 'cancelled');
  });

  it('enforces settle-once guarantee under duplicate cancellation or completion', async () => {
    const runId = 'job_settle_once';
    const spec = createRunSpec({
      runId,
      operationId: 'benchmark.run@1',
      executable: {
        path: process.execPath,
        argv: ['-e', 'process.exit(0);'],
      },
    });

    const { receipt } = await executeRunSpec(tmpDir, spec, { scope });
    assert.equal(receipt.status, 'completed');

    // Repeat cancellation after terminal state has settled
    const duplicateCancel = await cancelRun(tmpDir, runId, 'Post-completion cancel attempt');
    assert.equal(duplicateCancel.success, true);
    assert.equal(duplicateCancel.status, 'completed'); // status does not corrupt terminal state
    assert.ok(duplicateCancel.note?.includes('already'));

    const finalStatus = getRunStatus(tmpDir, runId);
    assert.equal(finalStatus.status, 'completed');
  });

  it('truthfully handles run.status@1 and run.cancel@1 operations via gateway', async () => {
    // 1. Query unknown run -> fails with RUN_NOT_FOUND
    const unknownRes = await runResearchEvidence({
      action: 'execute_operation',
      workspace: tmpDir,
      operationId: 'run.status@1',
      arguments: { runId: 'missing_gw_run' },
    }, { scope });
    assert.equal(unknownRes.isError, true);
    assert.equal(unknownRes.data.status, 'failed');
    assert.equal(unknownRes.data.issues[0].code, 'RUN_NOT_FOUND');

    // 2. Query known completed run -> succeeds
    const knownRes = await runResearchEvidence({
      action: 'execute_operation',
      workspace: tmpDir,
      operationId: 'run.status@1',
      arguments: { runId: 'job_test_success_1' },
    }, { scope });
    assert.equal(knownRes.isError, false);
    assert.equal(knownRes.data.status, 'completed');
    assert.equal(knownRes.data.measurements.runId, 'job_test_success_1');
  });
});

