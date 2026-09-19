/**
 * Test Suite: Versioned Operation Graph & GraphPatch (Phase 7)
 * Validates CAS concurrency control, transitive supersession,
 * cycle rejection, and immutable preservation of prior evidence.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createRevisionedGraph } from '../workflows/graph.js';
import { applyGraphPatch } from '../workflows/graph-patch.js';

describe('Phase 7: Versioned Operation Graph & GraphPatch', () => {
  it('initializes graph with revision 1 and instance semantics', () => {
    const graph = createRevisionedGraph({
      nodes: [
        { nodeId: 'node_inspect_1', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
        { nodeId: 'node_fit_1', operationId: 'statistics.fit@1', kind: 'operation', dependsOn: ['node_inspect_1'] },
      ],
    });

    assert.equal(graph.revision, 1);
    assert.equal(graph.getNodes().length, 2);
    assert.equal(graph.getActiveNodes().length, 2);
    assert.equal(graph.getNode('node_inspect_1').status, 'ready');
    assert.equal(graph.getNode('node_fit_1').status, 'pending');
  });

  it('applies valid GraphPatch and advances revision', () => {
    const graph = createRevisionedGraph({
      nodes: [
        { nodeId: 'node_inspect_1', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
      ],
    });

    // Mark inspect completed
    graph.markNodeStatus('node_inspect_1', 'completed', {
      outputs: { rowCount: 100, anomalyDetected: true },
    });

    const patch = {
      taskId: 'test_task_1',
      baseRevision: 1,
      reason: 'Anomaly detected, branch to theoretical check and human calibration',
      appendNodes: [
        {
          nodeId: 'node_theory_1',
          operationId: 'theory.dimension@1',
          kind: 'operation',
          dependsOn: ['node_inspect_1'],
        },
        {
          nodeId: 'node_human_1',
          operationId: 'human.calibration@1',
          kind: 'human-input',
          dependsOn: ['node_inspect_1'],
        },
      ],
    };

    const result = applyGraphPatch(graph, patch);

    assert.equal(result.success, true);
    assert.equal(result.baseRevision, 1);
    assert.equal(result.newRevision, 2);
    assert.equal(graph.revision, 2);
    assert.equal(graph.getNodes().length, 3);
    assert.equal(graph.getActiveNodes().length, 3);

    // Both appended nodes should be ready because their dependency node_inspect_1 is completed
    assert.equal(graph.getNode('node_theory_1').status, 'ready');
    assert.equal(graph.getNode('node_human_1').status, 'ready');
  });

  it('strictly rejects patch on CAS conflict (stale baseRevision)', () => {
    const graph = createRevisionedGraph({
      nodes: [
        { nodeId: 'node_1', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
      ],
    });

    // Simulate graph already at revision 2
    graph.revision = 2;

    const patchWithStaleBase = {
      taskId: 'test_task_cas',
      baseRevision: 1, // Stale!
      appendNodes: [
        { nodeId: 'node_2', operationId: 'data.prepare@1', kind: 'operation', dependsOn: ['node_1'] },
      ],
    };

    assert.throws(
      () => applyGraphPatch(graph, patchWithStaleBase),
      (err) => {
        assert.equal(err.code, 'CAS_CONFLICT');
        assert.equal(err.currentRevision, 2);
        assert.equal(err.baseRevision, 1);
        return true;
      }
    );

    // Graph remains intact and unchanged
    assert.equal(graph.revision, 2);
    assert.equal(graph.getNodes().length, 1);
  });

  it('enforces transitive invalidation while preserving prior receipts and claims', () => {
    const graph = createRevisionedGraph({
      nodes: [
        { nodeId: 'node_1', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
        { nodeId: 'node_2', operationId: 'data.prepare@1', kind: 'operation', dependsOn: ['node_1'] },
        { nodeId: 'node_3', operationId: 'statistics.fit@1', kind: 'operation', dependsOn: ['node_2'] },
        { nodeId: 'node_independent', operationId: 'literature.survey@1', kind: 'operation', dependsOn: [] },
      ],
    });

    // Mark nodes 1, 2, 3 as completed with outputs and receipts
    graph.markNodeStatus('node_1', 'completed', { outputs: { rawCount: 500 } });
    graph.markNodeStatus('node_2', 'completed', { outputs: { cleanedCount: 450 } });
    graph.markNodeStatus('node_3', 'completed', {
      outputs: { r2: 0.42, conclusion: 'Weak fit, possible bad filter' },
    });

    // Supersede node_2 (data.prepare was flawed)
    const patch = {
      taskId: 'task_transitive',
      baseRevision: 1,
      reason: 'Filter formula corrected, superseding prior prep and downstream fit',
      supersedeNodeIds: ['node_2'],
      appendNodes: [
        {
          nodeId: 'node_2_v2',
          operationId: 'data.prepare@1',
          kind: 'operation',
          dependsOn: ['node_1'],
        },
        {
          nodeId: 'node_3_v2',
          operationId: 'statistics.fit@1',
          kind: 'operation',
          dependsOn: ['node_2_v2'],
        },
      ],
    };

    const result = applyGraphPatch(graph, patch);

    assert.equal(result.success, true);
    assert.equal(graph.revision, 2);

    // node_2 was explicitly superseded
    const n2 = graph.getNode('node_2');
    assert.equal(n2.status, 'superseded');
    assert.equal(n2.supersededReason, patch.reason);
    // Crucial: Old outputs and receipts are PRESERVED!
    assert.equal(n2.outputs.cleanedCount, 450);

    // node_3 was transitively superseded (because it depended on node_2)
    const n3 = graph.getNode('node_3');
    assert.equal(n3.status, 'superseded');
    assert.equal(n3.outputs.r2, 0.42);
    assert.equal(n3.outputs.conclusion, 'Weak fit, possible bad filter');

    // Independent node was untouched
    assert.equal(graph.getNode('node_independent').status, 'ready');

    // Active nodes now: node_1, node_independent, node_2_v2, node_3_v2
    const active = graph.getActiveNodes();
    assert.equal(active.length, 4);
    assert.ok(active.some((n) => n.id === 'node_2_v2'));
    assert.ok(active.some((n) => n.id === 'node_3_v2'));
    assert.ok(!active.some((n) => n.id === 'node_2'));
    assert.ok(!active.some((n) => n.id === 'node_3'));

    // Total nodes in graph contains all 6 (full history preserved!)
    assert.equal(graph.getNodes().length, 6);
  });

  it('rejects patch introducing a cycle into active graph and rolls back', () => {
    const graph = createRevisionedGraph({
      nodes: [
        { nodeId: 'node_A', operationId: 'data.inspect@1', kind: 'operation', dependsOn: [] },
        { nodeId: 'node_B', operationId: 'data.prepare@1', kind: 'operation', dependsOn: ['node_A'] },
      ],
    });

    const cyclicPatch = {
      taskId: 'task_cycle',
      baseRevision: 1,
      appendNodes: [
        // node_C depends on B, but node_D depends on C, and node_B is made to depend on D?
        // Let's add C depends on B, and D depends on C, and E depends on D, and another cycle:
        { nodeId: 'node_C', operationId: 'op.c', kind: 'operation', dependsOn: ['node_D'] },
        { nodeId: 'node_D', operationId: 'op.d', kind: 'operation', dependsOn: ['node_C'] },
      ],
    };

    assert.throws(
      () => applyGraphPatch(graph, cyclicPatch),
      /Cyclic dependency detected/
    );

    // Revision should NOT advance on failure
    assert.equal(graph.revision, 1);
    assert.equal(graph.getActiveNodes().length, 2);
  });
});
