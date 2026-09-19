/**
 * Test Suite: Workflow Persistence, Event Journal & Resume (Phase 7)
 * Validates Event Sourcing state reconstruction, crash resume with node reuse,
 * and non-blocking human-in-the-loop pauses.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchWorkflowStore } from '../workflows/store.js';
import { WorkflowScheduler } from '../workflows/scheduler.js';
import { HostAdapter } from '../workflows/host-adapter.js';

describe('Phase 7: Workflow Persistence, Event Journal & Breakpoint Resume', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-resume-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('records monotonic events in journal and reconstructs full state via event sourcing', () => {
    const taskId = 'task_journal_101';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    // 1. Append TASK_CREATED
    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        nodes: [
          { nodeId: 'node_inspect', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
          { nodeId: 'node_fit', operationId: 'statistics.fit@1', kind: 'operation', dependsOn: ['node_inspect'] },
        ],
      },
    });

    // 2. Append NODE_STARTED and NODE_COMPLETED
    store.appendEvent({
      kind: 'NODE_STARTED',
      payload: { nodeId: 'node_inspect' },
    });
    store.appendEvent({
      kind: 'NODE_COMPLETED',
      payload: {
        nodeId: 'node_inspect',
        outputs: { rowCount: 1500, cols: ['speed', 'drag'] },
      },
    });

    // Check on-disk file
    const journalPath = store.getEventFilePath();
    assert.ok(existsSync(journalPath));
    const lines = readFileSync(journalPath, 'utf8').trim().split('\n');
    assert.equal(lines.length, 3);

    // 3. Create a brand new store and reload from disk
    const freshStore = new ResearchWorkflowStore({ workspace: tempDir, taskId });
    freshStore.loadEvents();

    assert.equal(freshStore.events.length, 3);
    assert.equal(freshStore.revision, 1);
    assert.equal(freshStore.status, 'active');

    const graph = freshStore.projectedGraph;
    assert.ok(graph);
    assert.equal(graph.getNode('node_inspect').status, 'completed');
    assert.deepEqual(graph.getNode('node_inspect').outputs, { rowCount: 1500, cols: ['speed', 'drag'] });
    // node_fit should have automatically become ready because node_inspect is completed!
    assert.equal(graph.getNode('node_fit').status, 'ready');
  });

  it('resumes workflow after interruption, reusing completed nodes without re-running', async () => {
    const taskId = 'task_crash_recovery';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        nodes: [
          { nodeId: 'step_1', operationId: 'op_step_1', kind: 'operation', dependsOn: [] },
          { nodeId: 'step_2', operationId: 'op_step_2', kind: 'operation', dependsOn: ['step_1'] },
          { nodeId: 'step_3', operationId: 'op_step_3', kind: 'operation', dependsOn: ['step_2'] },
        ],
      },
    });

    const executionCounter = { step_1: 0, step_2: 0, step_3: 0 };
    const adapter = new HostAdapter({ workspace: tempDir });

    adapter.registerHandler('op_step_1', async () => {
      executionCounter.step_1++;
      return { status: 'completed', data: { val: 42 } };
    });
    adapter.registerHandler('op_step_2', async () => {
      executionCounter.step_2++;
      return { status: 'completed', data: { val: 84 } };
    });
    adapter.registerHandler('op_step_3', async () => {
      executionCounter.step_3++;
      return { status: 'completed', data: { val: 126 } };
    });

    // Session 1: Run step 1 only
    const scheduler1 = new WorkflowScheduler({
      taskId,
      workspace: tempDir,
      store,
      hostAdapter: adapter,
    });

    const stepRes1 = await scheduler1.step();
    assert.equal(stepRes1.executed[0].nodeId, 'step_1');
    assert.equal(executionCounter.step_1, 1);
    assert.equal(executionCounter.step_2, 0);

    // Simulate process kill / restart!
    // Session 2: Resume from persistent store
    const resumedScheduler = await WorkflowScheduler.resumeWorkflow(taskId, {
      workspace: tempDir,
      hostAdapter: adapter,
    });

    // Verify step_1 is already completed with outputs restored
    assert.equal(resumedScheduler.graph.getNode('step_1').status, 'completed');
    assert.equal(resumedScheduler.graph.getNode('step_1').outputs.val, 42);
    // step_2 is ready to go
    assert.equal(resumedScheduler.graph.getNode('step_2').status, 'ready');

    // Run to completion in resumed session
    const runResult = await resumedScheduler.runToCompletion();
    assert.equal(runResult.status, 'completed');
    assert.equal(resumedScheduler.graph.isCompleted(), true);

    // Crucial: step_1 was NOT re-executed! It was executed exactly once!
    assert.equal(executionCounter.step_1, 1);
    assert.equal(executionCounter.step_2, 1);
    assert.equal(executionCounter.step_3, 1);
  });

  it('pauses at human-input node while independent branches continue, then resumes when input provided', async () => {
    const taskId = 'task_human_in_loop';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        nodes: [
          // Branch A: needs human input then runs downstream A2
          { nodeId: 'human_prompt', operationId: 'human.input@1', kind: 'human-input', dependsOn: [], inputs: { prompt: 'Confirm sensor recalibration factors' } },
          { nodeId: 'downstream_A', operationId: 'data.recalibrated_fit@1', kind: 'operation', dependsOn: ['human_prompt'] },
          // Branch B: independent branch that does NOT depend on human input
          { nodeId: 'independent_B', operationId: 'theory.dimension@1', kind: 'operation', dependsOn: [] },
        ],
      },
    });

    const adapter = new HostAdapter({ workspace: tempDir });
    let independentExecuted = false;
    let downstreamExecuted = false;

    adapter.registerHandler('theory.dimension@1', async () => {
      independentExecuted = true;
      return { status: 'completed', data: { dimensionCheck: 'passed' } };
    });

    adapter.registerHandler('data.recalibrated_fit@1', async (node, ctx) => {
      downstreamExecuted = true;
      const humanAnswer = ctx.graph.getNode('human_prompt').outputs;
      return { status: 'completed', data: { calibrationFactor: humanAnswer.factor, fit: 'perfect' } };
    });

    const scheduler = new WorkflowScheduler({
      taskId,
      workspace: tempDir,
      store,
      hostAdapter: adapter,
    });

    // Step 1: human_prompt requested, but independent_B ALSO runs without being blocked!
    const step1 = await scheduler.step();
    assert.equal(scheduler.graph.getNode('human_prompt').status, 'awaiting_input');
    assert.equal(scheduler.graph.getNode('independent_B').status, 'completed');
    assert.equal(independentExecuted, true);
    assert.equal(downstreamExecuted, false);

    // Step 2: Now only human_prompt is blocking downstream_A. Next step reports awaiting input.
    const step2 = await scheduler.step();
    assert.equal(step2.awaitingInput, true);
    assert.ok(step2.waitingNodes.includes('human_prompt'));

    // Human provides input!
    const inputRes = scheduler.provideHumanInput('human_prompt', { factor: 1.052, calibratedBy: 'LabEngineer' });
    assert.equal(inputRes.success, true);
    assert.equal(scheduler.graph.getNode('human_prompt').status, 'completed');
    assert.equal(scheduler.graph.getNode('downstream_A').status, 'ready');

    // Step 3: downstream_A now executes and finishes the workflow!
    const step3 = await scheduler.step();
    assert.equal(scheduler.graph.getNode('downstream_A').status, 'completed');
    assert.equal(downstreamExecuted, true);
    assert.equal(scheduler.graph.getNode('downstream_A').outputs.calibrationFactor, 1.052);
    assert.equal(scheduler.graph.isCompleted(), true);
  });
});
