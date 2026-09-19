/**
 * Test Suite: End-to-End Mixed Dynamic Research Lifecycle (Phase 7)
 * Implements Section 17.2 of task_plan.md:
 * Wind tunnel CSV anomaly -> Multi-hypothesis & Theory -> Human Calibration ->
 * Benchmark correction -> Statistical evaluation -> Negative findings preserved.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ResearchWorkflowStore } from '../workflows/store.js';
import { WorkflowScheduler } from '../workflows/scheduler.js';
import { HostAdapter } from '../workflows/host-adapter.js';

describe('Phase 7: End-to-End Mixed Dynamic Research Lifecycle (Section 17.2)', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-mixed-e2e-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('runs complete dynamic mixed research loop from raw anomaly to validated deliverable', async () => {
    const taskId = 'task_wind_tunnel_anomaly_007';
    const store = new ResearchWorkflowStore({ workspace: tempDir, taskId });

    // Step 1: Initial task creation with data inspection
    store.appendEvent({
      kind: 'TASK_CREATED',
      revision: 1,
      payload: {
        primary: 'empirical',
        budgets: { maxRuns: 15, maxIterations: 5, maxParallelRuns: 2 },
        nodes: [
          {
            nodeId: 'node_inspect',
            operationId: 'data.inspect@1',
            kind: 'operation',
            dependsOn: [],
            inputs: { dataset: 'wind_tunnel_mach085.csv' },
          },
        ],
      },
    });

    const adapter = new HostAdapter({ workspace: tempDir });

    // Mock handler for data inspection detecting anomaly
    adapter.registerHandler('data.inspect@1', async (node) => {
      return {
        status: 'completed',
        data: {
          rowCount: 2400,
          anomaly: 'Mach 0.85 drag spike exceeds theoretical limit by 3.8x',
          affectedMachRange: [0.83, 0.87],
        },
      };
    });

    // Mock handler for theoretical dimensional & limit checking
    adapter.registerHandler('theory.dimension@1', async (node, ctx) => {
      // Refutes H1 (unit error) and notes H3 (sensor drift) is dimensionally plausible
      return {
        status: 'completed',
        data: {
          h1Refuted: true,
          h1Reason: 'Pressure coefficient units (kPa vs Pa) contradict raw voltage sensor specs',
          dimensionallyConsistent: ['H2_shockwave_boundary', 'H3_thermal_sensor_drift'],
        },
      };
    });

    // Mock handler for benchmark correction
    adapter.registerHandler('benchmark.run@1', async (node, ctx) => {
      return {
        status: 'completed',
        data: {
          baselineMSE: 0.184,
          driftCompensatedMSE: 0.012,
          improvementRatio: '15.3x',
        },
      };
    });

    // Mock handler for statistical uncertainty and effect evaluation
    adapter.registerHandler('statistics.compare@1', async (node, ctx) => {
      return {
        status: 'completed',
        data: {
          cohensD: 3.42,
          pValue: 0.00012,
          confidenceInterval95: [3.18, 3.66],
          conclusion: 'Thermal drift compensation conclusively explains anomalous spike; H1 permanently refuted.',
        },
      };
    });

    // Initialize scheduler
    const scheduler = new WorkflowScheduler({
      taskId,
      workspace: tempDir,
      store,
      hostAdapter: adapter,
    });

    // Phase 1: Run initial inspection
    const step1 = await scheduler.step();
    assert.equal(step1.executed[0].nodeId, 'node_inspect');
    assert.equal(step1.executed[0].status, 'completed');
    assert.ok(scheduler.graph.getNode('node_inspect').outputs.anomaly.includes('drag spike'));

    // Phase 2: Dynamic GraphPatch (Revision 1 -> 2)
    // Branching into 3 competing hypotheses, theoretical check, and human calibration
    const patchRev2 = {
      taskId,
      baseRevision: 1,
      reason: 'Anomaly detected in wind tunnel CSV: generate competing hypotheses & check theory',
      appendNodes: [
        {
          nodeId: 'node_hyp_h1',
          operationId: 'hypothesis.formulate',
          kind: 'hypothesis',
          dependsOn: ['node_inspect'],
          inputs: { hypothesis: 'H1: Pressure transducer unit mismatch (kPa vs Pa)' },
        },
        {
          nodeId: 'node_theory_check',
          operationId: 'theory.dimension@1',
          kind: 'operation',
          dependsOn: ['node_hyp_h1'],
          inputs: { checkEquation: 'Cp = (p - p_inf) / (0.5 * rho * V^2)' },
        },
        {
          nodeId: 'node_human_calibration',
          operationId: 'human.calibration@1',
          kind: 'human-input',
          dependsOn: ['node_inspect'],
          inputs: { prompt: 'Verify sensor zero-point calibration record at Mach 0.85' },
        },
      ],
    };

    const patchResult1 = scheduler.applyPatch(patchRev2);
    assert.equal(patchResult1.success, true);
    assert.equal(patchResult1.newRevision, 2);
    assert.equal(scheduler.graph.revision, 2);

    // Phase 3: Step through hypothesis formulation and theory check
    // The human calibration node will request input, while theory check runs
    await scheduler.step(); // node_hyp_h1 and node_human_calibration dispatched
    await scheduler.step(); // node_theory_check dispatched

    // Verify theory check completed and refuted H1
    const theoryOut = scheduler.graph.getNode('node_theory_check').outputs;
    assert.equal(theoryOut.h1Refuted, true);

    // Verify human calibration is paused in awaiting_input
    assert.equal(scheduler.graph.getNode('node_human_calibration').status, 'awaiting_input');

    // Phase 4: Human-in-the-loop input provided
    const humanInput = {
      sensorZeroVerified: true,
      thermocoupleDriftDetected: true,
      driftCoeff: 0.048,
      technician: 'Senior Wind Tunnel Specialist',
    };
    const inputRes = scheduler.provideHumanInput('node_human_calibration', humanInput);
    assert.equal(inputRes.success, true);
    assert.equal(scheduler.graph.getNode('node_human_calibration').status, 'completed');

    // Phase 5: Dynamic GraphPatch (Revision 2 -> 3)
    // Now apply minimal correction benchmark and statistical evaluation
    const patchRev3 = {
      taskId,
      baseRevision: 2,
      reason: 'Human calibration confirmed thermal drift: append correction benchmark and statistical validation',
      appendNodes: [
        {
          nodeId: 'node_benchmark_drift',
          operationId: 'benchmark.run@1',
          kind: 'operation',
          dependsOn: ['node_theory_check', 'node_human_calibration'],
          inputs: { model: 'polynomial_thermal_compensation' },
        },
        {
          nodeId: 'node_statistical_eval',
          operationId: 'statistics.compare@1',
          kind: 'operation',
          dependsOn: ['node_benchmark_drift'],
          inputs: { target: 'drift_compensation_significance' },
        },
      ],
    };

    const patchResult2 = scheduler.applyPatch(patchRev3);
    assert.equal(patchResult2.success, true);
    assert.equal(patchResult2.newRevision, 3);
    assert.equal(scheduler.graph.revision, 3);

    // Phase 6: Run to completion
    const finalRun = await scheduler.runToCompletion();
    assert.equal(finalRun.status, 'completed');
    assert.equal(scheduler.graph.isCompleted(), true);

    // Phase 7: Comprehensive Invariant & Audit Trail Verification
    // 1. All 7 nodes across all phases are preserved
    const allNodes = scheduler.graph.getNodes();
    assert.equal(allNodes.length, 6);

    // 2. Prior negative finding (H1 refutation) is permanently preserved in outputs
    const theoryNode = scheduler.graph.getNode('node_theory_check');
    assert.equal(theoryNode.outputs.h1Refuted, true);
    assert.ok(theoryNode.outputs.h1Reason.includes('contradict raw voltage'));

    // 3. Final statistical evaluation confirms strong significance
    const statNode = scheduler.graph.getNode('node_statistical_eval');
    assert.equal(statNode.outputs.cohensD, 3.42);
    assert.equal(statNode.outputs.pValue, 0.00012);

    // 4. Full Event Sourcing recovery verification
    // Replay from on-disk journal from scratch and assert 100% parity
    const replayStore = new ResearchWorkflowStore({ workspace: tempDir, taskId });
    replayStore.loadEvents();

    assert.equal(replayStore.events.length >= 10, true);
    assert.equal(replayStore.revision, 3);
    assert.equal(replayStore.status, 'completed');

    const replayedGraph = replayStore.projectedGraph;
    assert.equal(replayedGraph.getNode('node_statistical_eval').status, 'completed');
    assert.deepEqual(
      replayedGraph.getNode('node_statistical_eval').outputs,
      statNode.outputs
    );
    assert.deepEqual(
      replayedGraph.getNode('node_theory_check').outputs,
      theoryNode.outputs
    );
  });
});
