/**
 * Versioned Graph Patch Engine with CAS Verification & Transitive Invalidation for tianshu-research.
 * Implements atomic patch application, concurrency conflict rejection, acyclic validation,
 * and immutable preservation of prior evidence and receipts.
 */

/**
 * Finds all downstream node IDs that transitively depend on the given targetNodeId.
 */
export function findTransitiveDependents(graph, targetNodeId) {
  const nodes = graph.getNodes();
  const dependents = new Set();
  const queue = [targetNodeId];

  while (queue.length > 0) {
    const curr = queue.shift();
    for (const n of nodes) {
      if (n.status !== 'superseded' && n.dependsOn.includes(curr) && !dependents.has(n.id)) {
        dependents.add(n.id);
        queue.push(n.id);
      }
    }
  }

  return Array.from(dependents);
}

/**
 * Applies a GraphPatch to the current graph after passing CAS verification,
 * dependency integrity, and acyclic topological validation.
 */
export function applyGraphPatch(currentGraph, patch = {}, options = {}) {
  if (!currentGraph || typeof currentGraph !== 'object') {
    throw new Error('currentGraph must be a valid Graph instance');
  }
  if (!patch || typeof patch !== 'object') {
    throw new Error('patch must be an object');
  }

  const baseRevision = typeof patch.baseRevision === 'number' ? patch.baseRevision : 1;
  const currentRevision = currentGraph.revision;

  // 1. CAS Concurrency Check
  if (!options.skipCas && currentRevision !== baseRevision) {
    const err = new Error(
      `CAS conflict: current graph revision is ${currentRevision}, but patch baseRevision is ${baseRevision}`
    );
    err.code = 'CAS_CONFLICT';
    err.currentRevision = currentRevision;
    err.baseRevision = baseRevision;
    throw err;
  }

  const supersedeList = Array.isArray(patch.supersedeNodeIds) ? patch.supersedeNodeIds : [];
  const appendNodes = Array.isArray(patch.appendNodes) ? patch.appendNodes : [];
  const reason = patch.reason || 'superseded_by_patch';
  const nextRevision = currentRevision + 1;

  // 2. Validate all supersede targets exist
  for (const supId of supersedeList) {
    const existing = currentGraph.getNode(supId);
    if (!existing) {
      const err = new Error(`Cannot supersede unknown node "${supId}"`);
      err.code = 'NODE_NOT_FOUND';
      throw err;
    }
  }

  // Snapshot active state for rollback in case of validation failure
  const preSnapshot = currentGraph.getNodes().map((n) => ({
    id: n.id,
    status: n.status,
    supersededBy: n.supersededBy,
    supersededAtRevision: n.supersededAtRevision,
    supersededReason: n.supersededReason,
  }));

  const allSuperseded = new Set();

  try {
    // 3. Mark explicitly superseded nodes and transitively dependent nodes
    for (const supId of supersedeList) {
      allSuperseded.add(supId);
      currentGraph.supersedeNode(supId, reason, nextRevision);

      const transitive = findTransitiveDependents(currentGraph, supId);
      for (const tId of transitive) {
        allSuperseded.add(tId);
        currentGraph.supersedeNode(tId, `transitive_dependency_superseded_by_${supId}`, nextRevision);
      }
    }

    // 4. Validate appended nodes
    const allAppendIds = new Set(appendNodes.map((n) => String(n.id || n.nodeId)));
    const seenAppendIds = new Set();

    for (const nodeData of appendNodes) {
      const id = String(nodeData.id || nodeData.nodeId);
      if (!id || id === 'undefined') {
        throw new Error('Append node requires valid nodeId or id');
      }
      if (seenAppendIds.has(id)) {
        throw new Error(`Duplicate nodeId "${id}" in appendNodes`);
      }
      seenAppendIds.add(id);

      const existing = currentGraph.getNode(id);
      if (existing && existing.status !== 'superseded') {
        throw new Error(`Active node "${id}" already exists in graph`);
      }

      // Check dependsOn: must not depend on a superseded node unless that superseded node is also replaced
      const deps = Array.isArray(nodeData.dependsOn) ? nodeData.dependsOn : [];
      for (const depId of deps) {
        const depNode = currentGraph.getNode(depId);
        const inAppend = allAppendIds.has(depId);
        if (!depNode && !inAppend) {
          throw new Error(`Appended node "${id}" depends on unknown node "${depId}"`);
        }
        if (depNode && depNode.status === 'superseded' && !inAppend) {
          throw new Error(`Appended node "${id}" cannot depend on superseded node "${depId}"`);
        }
      }
    }

    // 5. Append new nodes to graph
    for (const nodeData of appendNodes) {
      currentGraph.addNode({
        ...nodeData,
        revision: nextRevision,
      });
    }

    // 6. Cycle detection on active graph
    currentGraph.getExecutionOrder();

    // 7. Success: advance revision
    currentGraph.revision = nextRevision;

    return {
      success: true,
      baseRevision,
      newRevision: nextRevision,
      reasonEventId: patch.reasonEventId || undefined,
      supersededNodeIds: Array.from(allSuperseded),
      appendedNodeIds: Array.from(allAppendIds),
    };
  } catch (err) {
    // Rollback on any failure
    for (const snap of preSnapshot) {
      const n = currentGraph.getNode(snap.id);
      if (n) {
        n.status = snap.status;
        n.supersededBy = snap.supersededBy;
        n.supersededAtRevision = snap.supersededAtRevision;
        n.supersededReason = snap.supersededReason;
      }
    }
    // Remove any nodes added during this patch attempt
    for (const nodeData of appendNodes) {
      const id = String(nodeData.id || nodeData.nodeId);
      // If node wasn't in preSnapshot, mark superseded/remove from map
      if (!preSnapshot.some((s) => s.id === id)) {
        const n = currentGraph.getNode(id);
        if (n) n.status = 'superseded';
      }
    }
    throw err;
  }
}

