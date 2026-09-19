/**
 * Test Suite: Backend Contract (Phase 10, plugin side)
 * Offline validation of the backend execution contract: submit idempotency,
 * truthful query/cancel, tenant isolation with cross-tenant refusal, honest
 * not_found, and the support-claim discipline of the registry.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertBackendContract, guardBackend, CrossTenantRefusalError, BackendError } from '../jobs/backends/interface.js';
import { createLocalProcessBackend } from '../jobs/backends/local-process.js';
import { getBackend, listBackends, registerBackend } from '../jobs/backends/registry.js';
import { createRunSpec } from '../jobs/run-spec.js';
import { getRun } from '../jobs/run-store.js';
import { createResourcePolicy, assertRunAllowed, PolicyViolationError } from '../jobs/resource-policy.js';

describe('Phase 10: Backend Contract', () => {
  let tempDir;
  let tenantA;
  let tenantB;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-backend-test-'));
    tenantA = join(tempDir, 'ws-a');
    tenantB = join(tempDir, 'ws-b');
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  /** In-memory "remote" backend for contract tests. */
  function makeFakeRemoteBackend() {
    const runs = new Map(); // backendRunId -> { owner, status, receipt, executions }
    const byKey = new Map(); // idempotency key -> backendRunId
    let seq = 0;
    return {
      name: 'fake-remote',
      supported: true,
      capabilities: ['cpu', 'simulated-remote'],
      executions: 0,
      async submit({ tenant, spec, idempotencyKey }) {
        const key = `${tenant}::${idempotencyKey}`;
        if (byKey.has(key)) {
          return { backendRunId: byKey.get(key), status: runs.get(byKey.get(key)).status, idempotentReplay: true };
        }
        seq += 1;
        const backendRunId = `remote-${seq}`;
        byKey.set(key, backendRunId);
        runs.set(backendRunId, { owner: tenant, status: 'running', receipt: null, spec });
        this.executions += 1;
        return { backendRunId, status: 'queued' };
      },
      async query(tenant, backendRunId) {
        const run = runs.get(backendRunId);
        if (!run) return { status: 'not_found' };
        return { status: run.status, receipt: run.receipt };
      },
      async cancel(tenant, backendRunId, reason) {
        const run = runs.get(backendRunId);
        if (!run) return { ok: false, status: 'not_found' };
        run.status = 'cancelled';
        run.receipt = { exitCode: 130, error: reason };
        return { ok: true, status: 'cancelled' };
      },
      _finish(backendRunId, status, receipt) {
        runs.get(backendRunId).status = status;
        runs.get(backendRunId).receipt = receipt;
      },
    };
  }

  it('enforces the structural contract', () => {
    assertBackendContract(createLocalProcessBackend());
    assert.throws(
      () => assertBackendContract({ name: 'x', supported: true, capabilities: [] }),
      /submit\(\) must be a function/,
    );
    assert.throws(
      () => assertBackendContract({ name: 'x', capabilities: [], submit() {}, query() {}, cancel() {} }),
      /supported must be a boolean/,
    );
    assert.throws(
      () => assertBackendContract({ name: 'x', supported: false, capabilities: [], submit() {}, query() {}, cancel() {} }),
      /must declare a reason/,
    );
  });

  it('rejects cross-tenant query and cancel (fail-closed)', async () => {
    const fake = makeFakeRemoteBackend();
    const guarded = guardBackend(fake);
    const { backendRunId } = await guarded.submit({ tenant: tenantA, spec: { runId: 'r1' }, idempotencyKey: 'k1' });

    await assert.rejects(() => guarded.query(tenantB, backendRunId), CrossTenantRefusalError);
    await assert.rejects(() => guarded.cancel(tenantB, backendRunId, 'nope'), CrossTenantRefusalError);
    // Owner access remains fine.
    const res = await guarded.query(tenantA, backendRunId);
    assert.equal(res.status, 'running');
  });

  it('reports unknown runs as not_found — never fabricates a terminal state', async () => {
    const guarded = guardBackend(makeFakeRemoteBackend());
    const res = await guarded.query(tenantA, 'remote-never-submitted');
    assert.equal(res.status, 'not_found');
  });

  it('submit is idempotent: same key replays the same run without re-execution', async () => {
    const fake = makeFakeRemoteBackend();
    const guarded = guardBackend(fake);
    const spec = { runId: 'r-1' };

    const first = await guarded.submit({ tenant: tenantA, spec, idempotencyKey: 'same-key' });
    const second = await guarded.submit({ tenant: tenantA, spec, idempotencyKey: 'same-key' });

    assert.equal(first.backendRunId, second.backendRunId);
    assert.equal(second.idempotentReplay, true);
    assert.equal(fake.executions, 1, 'idempotent replay must not re-execute');
  });

  it('local backend executes truthfully: completed and failed receipts', async () => {
    const backend = guardBackend(createLocalProcessBackend());

    const okSpec = createRunSpec({
      runId: 'local-ok',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'console.log("done")'] },
      limits: { wallSeconds: 30 },
    });
    const submitted = await backend.submit({ tenant: tenantA, spec: okSpec, idempotencyKey: 'ok' });
    assert.equal(submitted.backendRunId, 'local-ok');

    let okState = await backend.query(tenantA, 'local-ok');
    for (let i = 0; i < 100 && !['completed', 'failed'].includes(okState.status); i++) {
      await new Promise((r) => setTimeout(r, 50));
      okState = await backend.query(tenantA, 'local-ok');
    }
    assert.equal(okState.status, 'completed');
    assert.equal(okState.receipt.exitCode, 0);

    const badSpec = createRunSpec({
      runId: 'local-bad',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'process.exit(3)'] },
      limits: { wallSeconds: 30 },
    });
    await backend.submit({ tenant: tenantA, spec: badSpec, idempotencyKey: 'bad' });
    let badState = await backend.query(tenantA, 'local-bad');
    for (let i = 0; i < 100 && !['completed', 'failed'].includes(badState.status); i++) {
      await new Promise((r) => setTimeout(r, 50));
      badState = await backend.query(tenantA, 'local-bad');
    }
    assert.equal(badState.status, 'failed');
    assert.equal(badState.receipt.exitCode, 3);
  });

  it('local backend cancels a long run with an honest receipt', async () => {
    const backend = guardBackend(createLocalProcessBackend());
    const spec = createRunSpec({
      runId: 'local-long',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'setInterval(() => {}, 100)'] },
      limits: { wallSeconds: 60 },
    });
    await backend.submit({ tenant: tenantA, spec, idempotencyKey: 'long' });
    await new Promise((r) => setTimeout(r, 300)); // let it start

    const cancelRes = await backend.cancel(tenantA, 'local-long', 'contract test cancellation');
    assert.equal(cancelRes.ok, true);
    assert.equal(cancelRes.status, 'cancelled');

    const state = await backend.query(tenantA, 'local-long');
    assert.equal(state.status, 'cancelled');
    assert.equal(state.receipt.exitCode, 130);
  });

  it('registry marks unverified distributed backends as NOT supported', async () => {
    const local = getBackend('local-process');
    assert.ok(local);
    assert.equal(local.supported, true);

    for (const name of ['torchrun-elastic', 'jax-multiproc', 'slurm-remote']) {
      const b = getBackend(name);
      assert.ok(b, `${name} declared`);
      assert.equal(b.supported, false, `${name} must not claim support without verification`);
      assert.ok(b.reason.length > 10);
      await assert.rejects(() => b.submit({ tenant: tenantA, spec: { runId: 'x' } }), /not supported/);
    }
    const names = listBackends().map((b) => b.name);
    assert.deepEqual(names.sort(), ['jax-multiproc', 'local-process', 'slurm-remote', 'torchrun-elastic']);
  });

  it('registerBackend rejects contract-violating backends', () => {
    assert.throws(() => registerBackend({ name: 'broken' }), /violates the contract/);
  });

  it('resource policy refuses out-of-policy runs (fail-closed)', () => {
    const policy = createResourcePolicy({ workspace: tenantA, maxWallSeconds: 100, maxOutputBytes: 8192, maxConcurrentRuns: 2 });

    // The allowed case must reference a real file inside the workspace.
    mkdirSync(tenantA, { recursive: true });
    writeFileSync(join(tenantA, 'tool.exe'), 'placeholder');
    const okSpec = createRunSpec({
      runId: 'p1',
      operationId: 'benchmark.run@1',
      executable: { path: join(tenantA, 'tool.exe'), argv: [] },
      limits: { wallSeconds: 50, maxOutputBytes: 2048 },
    });
    assert.equal(assertRunAllowed(policy, okSpec, { activeRunCount: 1 }), true);

    assert.throws(
      () => assertRunAllowed(policy, { ...okSpec, limits: { wallSeconds: 5000 } }, {}),
      (e) => e instanceof PolicyViolationError && e.code === 'WALL_TIME_EXCEEDED',
    );
    assert.throws(
      () => assertRunAllowed(policy, { ...okSpec, limits: { wallSeconds: 50, maxOutputBytes: 99999 } }, {}),
      (e) => e.code === 'OUTPUT_BUDGET_EXCEEDED',
    );
    assert.throws(
      () => assertRunAllowed(policy, okSpec, { activeRunCount: 2 }),
      (e) => e.code === 'CONCURRENCY_EXCEEDED',
    );

    const outside = createRunSpec({
      runId: 'p2',
      operationId: 'benchmark.run@1',
      executable: { path: join(tempDir, 'outside.exe'), argv: [] },
      limits: { wallSeconds: 10, maxOutputBytes: 2048 },
    });
    assert.throws(
      () => assertRunAllowed(policy, outside, {}),
      (e) => e.code === 'EXECUTABLE_OUTSIDE_WORKSPACE',
    );

    const missing = createRunSpec({
      runId: 'p3',
      operationId: 'benchmark.run@1',
      executable: { path: join(tenantA, 'missing.exe'), argv: [] },
      limits: { wallSeconds: 10, maxOutputBytes: 2048 },
    });
    assert.throws(
      () => assertRunAllowed(policy, missing, {}),
      (e) => e.code === 'EXECUTABLE_MISSING',
    );
  });

  it('executor enforces an injected resource policy before spawning', async () => {
    const { executeRunSpec } = await import('../jobs/executor.js');
    const { getRunStatus } = await import('../jobs/executor.js');

    const policy = createResourcePolicy({ workspace: tenantA, maxWallSeconds: 100 });

    // Wall-time refusal: no process is spawned, the refusal is recorded honestly.
    const overSpec = createRunSpec({
      runId: 'policy-refused',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'console.log("should never run")'] },
      limits: { wallSeconds: 5000, maxOutputBytes: 2048 },
    });
    const refused = await executeRunSpec(tenantA, overSpec, { resourcePolicy: policy });
    assert.equal(refused.receipt.status, 'failed');
    assert.match(refused.receipt.error, /RESOURCE_POLICY_REFUSED \(WALL_TIME_EXCEEDED\)/);
    const stored = getRunStatus(tenantA, 'policy-refused');
    assert.equal(stored.status, 'failed');
    assert.match(stored.receipt.error, /RESOURCE_POLICY_REFUSED/);

    // Without a policy the same spec executes (policy is strictly opt-in).
    const unconstrained = await executeRunSpec(tenantA, overSpec, {});
    assert.equal(unconstrained.receipt.status, 'completed');
  });

  it('resource policy concurrency ceiling counts only active runs', async () => {
    const { executeRunSpec, countActiveRuns } = await import('../jobs/executor.js');
    mkdirSync(tenantA, { recursive: true }); // spawn cwd must exist

    const policy = createResourcePolicy({ workspace: tenantA, maxConcurrentRuns: 1, allowedExecutables: [process.execPath] });
    const blocker = createRunSpec({
      runId: 'policy-blocker',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'setTimeout(() => {}, 1500)'] },
      limits: { wallSeconds: 30, maxOutputBytes: 2048 },
    });
    const inFlight = executeRunSpec(tenantA, blocker, { resourcePolicy: policy });

    // Wait until the blocker is actually active.
    for (let i = 0; i < 100 && countActiveRuns(tenantA) === 0; i++) {
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.ok(countActiveRuns(tenantA) >= 1);

    const second = createRunSpec({
      runId: 'policy-second',
      operationId: 'benchmark.run@1',
      executable: { path: process.execPath, argv: ['-e', 'console.log("no")'] },
      limits: { wallSeconds: 30, maxOutputBytes: 2048 },
    });
    const refused = await executeRunSpec(tenantA, second, { resourcePolicy: policy });
    assert.match(refused.receipt.error, /CONCURRENCY_EXCEEDED/);

    await inFlight; // settle the blocker
  });
});
