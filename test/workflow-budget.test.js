/**
 * Test Suite: Multi-dimensional Research Budget & Graceful Halting (Phase 7)
 * Validates budget reservations, failure/retry accounting,
 * and graceful partial delivery when quotas are exhausted.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchBudgetManager } from '../workflows/budget.js';
import { ResearchWorkflowStore } from '../workflows/store.js';
import { WorkflowScheduler } from '../workflows/scheduler.js';
import { HostAdapter } from '../workflows/host-adapter.js';

describe('Phase 7: Multi-dimensional Research Budget & Graceful Halting', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-budget-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('manages budget reservation, commit, release, and parallelism enforcement', () => {
    const manager = new ResearchBudgetManager({
      maxRuns: 3,
      maxParallelRuns: 2,
      maxIterations: 5,
    });

    // Reserve first slot
    const res1 = manager.reserve('res_1', { runs: 1 });
    assert.equal(res1.runs, 1);
    assert.equal(manager.activeReservations.size, 1);
    assert.equal(manager.reserved.runs, 1);

    // Reserve second slot
    const res2 = manager.reserve('res_2', { runs: 1 });
    assert.equal(manager.activeReservations.size, 2);
    assert.equal(manager.reserved.runs, 2);

    // Attempting third slot violates maxParallelRuns (limit 2)
    assert.throws(
      () => manager.reserve('res_3', { runs: 1 }),
      (err) => {
        assert.equal(err.code, 'BUDGET_EXHAUSTED');
        assert.equal(err.metric, 'maxParallelRuns');
        return true;
      }
    );

    // Commit res1 with failure
    manager.commit('res_1', { runs: 1, wallSeconds: 0.5, isFailure: true });
    assert.equal(manager.consumed.runs, 1);
    assert.equal(manager.consumed.failedRuns, 1);
    assert.equal(manager.activeReservations.size, 1);

    // Release res2 without committing
    manager.release('res_2');
    assert.equal(manager.activeReservations.size, 0);
    assert.equal(manager.reserved.runs, 0);
    assert.equal(manager.consumed.runs, 1);
  });

  it('accounts failed runs and retries towards consumed budget', async () => {
    const taskId = 'task_budget_failure_accounting';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        budgets: { maxRuns: 2 },
        nodes: [
          { nodeId: 'flaky_node_1', operationId: 'flaky.op@1', kind: 'operation', dependsOn: [] },
          { nodeId: 'downstream_node', operationId: 'downstream.op@1', kind: 'operation', dependsOn: ['flaky_node_1'] },
        ],
      },
    });

    const adapter = new HostAdapter({ workspace: tempDir });
    adapter.registerHandler('flaky.op@1', async () => {
      return { status: 'failed', error: 'Sensor hardware timeout' };
    });

    const scheduler = new WorkflowScheduler({
      taskId,
      workspace: tempDir,
      store,
      hostAdapter: adapter,
    });

    const stepRes = await scheduler.step();
    assert.equal(stepRes.executed[0].status, 'failed');

    const summary = scheduler.budgetManager.getSummary();
    assert.equal(summary.consumed.runs, 1);
    assert.equal(summary.consumed.failedRuns, 1);
    assert.equal(scheduler.graph.getNode('flaky_node_1').status, 'failed');
    assert.equal(scheduler.graph.getNode('downstream_node').status, 'blocked');
  });

  it('halts gracefully upon budget exhaustion and delivers partial results without infinite loops', async () => {
    const taskId = 'task_budget_exhaustion';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        budgets: { maxRuns: 2, maxParallelRuns: 1 },
        nodes: [
          { nodeId: 'node_1', operationId: 'op_1', kind: 'operation', dependsOn: [] },
          { nodeId: 'node_2', operationId: 'op_2', kind: 'operation', dependsOn: ['node_1'] },
          { nodeId: 'node_3', operationId: 'op_3', kind: 'operation', dependsOn: ['node_2'] },
          { nodeId: 'node_4', operationId: 'op_4', kind: 'operation', dependsOn: ['node_3'] },
        ],
      },
    });

    const executionLog = [];
    const adapter = new HostAdapter({ workspace: tempDir });
    adapter.registerHandler('op_1', async () => {
      executionLog.push('op_1');
      return { status: 'completed', data: { preliminaryData: 'ok' } };
    });
    adapter.registerHandler('op_2', async () => {
      executionLog.push('op_2');
      return { status: 'completed', data: { secondaryData: 'ok' } };
    });
    adapter.registerHandler('op_3', async () => {
      executionLog.push('op_3');
      return { status: 'completed', data: { tertiaryData: 'ok' } };
    });

    const scheduler = new WorkflowScheduler({
      taskId,
      workspace: tempDir,
      store,
      hostAdapter: adapter,
    });

    // Run to completion with maxRuns = 2
    const runResult = await scheduler.runToCompletion();

    // Must halt cleanly with halted_budget_exhausted
    assert.equal(runResult.status, 'halted_budget_exhausted');
    assert.equal(runResult.partialDelivery, true);

    // Completed nodes: node_1 and node_2
    assert.deepEqual(runResult.completedNodes, ['node_1', 'node_2']);
    assert.deepEqual(executionLog, ['op_1', 'op_2']);

    // Pending nodes that were cut off by budget limit: node_3 and node_4
    assert.ok(runResult.pendingNodes.includes('node_3'));
    assert.ok(runResult.pendingNodes.includes('node_4'));

    // Verify budget consumed exactly maxRuns limit
    const budgetSummary = scheduler.budgetManager.getSummary();
    assert.equal(budgetSummary.consumed.runs, 2);
    assert.equal(budgetSummary.exhaustion.exhausted, true);
    assert.equal(budgetSummary.exhaustion.metric, 'runs');

    // Partial outputs are fully intact
    assert.deepEqual(scheduler.graph.getNode('node_1').outputs, { preliminaryData: 'ok' });
    assert.deepEqual(scheduler.graph.getNode('node_2').outputs, { secondaryData: 'ok' });
  });
});
