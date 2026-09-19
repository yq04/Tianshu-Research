/**
 * Scientific Operation Directed Acyclic Graph (DAG) for tianshu-research.
 * Constructs execution graphs for planned operations, ensures acyclic dependencies,
 * tracks node execution state, revision tracking, and determines ready tasks in topological order.
 */

export const NODE_STATUSES = Object.freeze([
  'pending',
  'ready',
  'running',
  'completed',
  'failed',
  'cancelled',
  'blocked',
  'superseded',
  'awaiting_input',
]);

export const NODE_KINDS = Object.freeze([
  'operation',
  'hypothesis',
  'decision',
  'review',
  'human-input',
]);

/**
 * Derives default dependency edges for an operation sequence.
 */
function deriveDependencies(operations = [], nodes = []) {
  const opMap = new Map();
  for (const n of nodes) {
    opMap.set(n.operationId, n.id);
  }

  for (const n of nodes) {
    const op = n.operationId;

    if (op === 'data.prepare@1') {
      if (opMap.has('data.inspect@1')) n.dependsOn.push(opMap.get('data.inspect@1'));
    } else if (op === 'statistics.compare@1' || op === 'statistics.fit@1') {
      if (opMap.has('data.prepare@1')) {
        n.dependsOn.push(opMap.get('data.prepare@1'));
      } else if (opMap.has('data.inspect@1')) {
        n.dependsOn.push(opMap.get('data.inspect@1'));
      }
    } else if (op === 'uncertainty.propagate@1') {
      if (opMap.has('statistics.fit@1')) {
        n.dependsOn.push(opMap.get('statistics.fit@1'));
      } else if (opMap.has('data.inspect@1')) {
        n.dependsOn.push(opMap.get('data.inspect@1'));
      }
    } else if (op === 'theory.symbolic@1') {
      if (opMap.has('theory.dimension@1')) n.dependsOn.push(opMap.get('theory.dimension@1'));
    } else if (op === 'theory.limit@1' || op === 'theory.numeric-check@1') {
      if (opMap.has('theory.symbolic@1')) {
        n.dependsOn.push(opMap.get('theory.symbolic@1'));
      } else if (opMap.has('theory.dimension@1')) {
        n.dependsOn.push(opMap.get('theory.dimension@1'));
      }
    } else if (op === 'benchmark.run@1') {
      if (opMap.has('benchmark.plan@1')) n.dependsOn.push(opMap.get('benchmark.plan@1'));
    } else if (op === 'benchmark.compare@1') {
      if (opMap.has('benchmark.run@1')) n.dependsOn.push(opMap.get('benchmark.run@1'));
    } else if (op === 'figure.render@1') {
      if (opMap.has('benchmark.compare@1')) {
        n.dependsOn.push(opMap.get('benchmark.compare@1'));
      } else if (opMap.has('statistics.fit@1')) {
        n.dependsOn.push(opMap.get('statistics.fit@1'));
      } else if (opMap.has('statistics.compare@1')) {
        n.dependsOn.push(opMap.get('statistics.compare@1'));
      } else if (opMap.has('data.inspect@1')) {
        n.dependsOn.push(opMap.get('data.inspect@1'));
      }
    } else if (op === 'hypothesis.test') {
      if (opMap.has('hypothesis.formulate')) n.dependsOn.push(opMap.get('hypothesis.formulate'));
    } else if (op === 'hypothesis.evaluate') {
      if (opMap.has('hypothesis.test')) n.dependsOn.push(opMap.get('hypothesis.test'));
    } else if (op === 'hypothesis.revise') {
      if (opMap.has('hypothesis.evaluate')) n.dependsOn.push(opMap.get('hypothesis.evaluate'));
    } else if (op === 'research_query.resolve_paper') {
      if (opMap.has('research_query.search_papers')) n.dependsOn.push(opMap.get('research_query.search_papers'));
    } else if (op === 'research_evidence.ingest_document') {
      if (opMap.has('research_query.resolve_paper')) n.dependsOn.push(opMap.get('research_query.resolve_paper'));
    } else if (op === 'research_evidence.read_section') {
      if (opMap.has('research_evidence.ingest_document')) n.dependsOn.push(opMap.get('research_evidence.ingest_document'));
    } else if (op === 'research_evidence.add_source') {
      if (opMap.has('research_query.resolve_paper')) n.dependsOn.push(opMap.get('research_query.resolve_paper'));
    } else if (op === 'research_evidence.add_evidence') {
      if (opMap.has('research_evidence.add_source')) n.dependsOn.push(opMap.get('research_evidence.add_source'));
    } else if (op === 'research_evidence.add_claim') {
      if (opMap.has('research_evidence.add_evidence')) n.dependsOn.push(opMap.get('research_evidence.add_evidence'));
    }
  }
}

/**
 * Creates an Operation Graph from a RouteDecision or explicit nodes.
 */
export function createOperationGraph(routeDecision = {}, options = {}) {
  const operations = Array.isArray(routeDecision?.operations) ? routeDecision.operations : [];
  const primary = routeDecision?.primary || 'literature';
  let revision = typeof options.revision === 'number' && options.revision > 0 ? options.revision : 1;

  const nodeMap = new Map();
  const rawNodes = [];

  // If explicit nodes are provided in options
  if (Array.isArray(options.nodes)) {
    for (const raw of options.nodes) {
      const id = String(raw.id || raw.nodeId);
      const node = {
        id,
        nodeId: id,
        operationId: raw.operationId || id,
        kind: NODE_KINDS.includes(raw.kind) ? raw.kind : 'operation',
        paradigm: raw.paradigm || primary,
        dependsOn: Array.isArray(raw.dependsOn) ? [...raw.dependsOn] : [],
        status: NODE_STATUSES.includes(raw.status) ? raw.status : 'pending',
        inputs: raw.inputs ? { ...raw.inputs } : {},
        outputs: raw.outputs ? { ...raw.outputs } : {},
        claimRefs: Array.isArray(raw.claimRefs) ? [...raw.claimRefs] : [],
        assumptionRefs: Array.isArray(raw.assumptionRefs) ? [...raw.assumptionRefs] : [],
        requiredGates: Array.isArray(raw.requiredGates) ? [...raw.requiredGates] : [],
        effects: Array.isArray(raw.effects) ? [...raw.effects] : [],
        budgetReservation: raw.budgetReservation || undefined,
        error: raw.error || null,
        revision: typeof raw.revision === 'number' ? raw.revision : revision,
        supersededBy: raw.supersededBy || null,
        supersededAtRevision: raw.supersededAtRevision || null,
        supersededReason: raw.supersededReason || null,
      };
      rawNodes.push(node);
      nodeMap.set(id, node);
    }
  } else {
    // Generate nodes from operations list
    operations.forEach((opId, index) => {
      const slug = String(opId).replace(/[@.:-]/g, '_');
      const id = 'node_' + index + '_' + slug;
      let kind = 'operation';
      if (String(opId).startsWith('hypothesis.')) kind = 'hypothesis';
      if (String(opId).startsWith('human.')) kind = 'human-input';

      const node = {
        id,
        nodeId: id,
        operationId: opId,
        kind,
        paradigm: primary,
        dependsOn: [],
        status: 'pending',
        inputs: {},
        outputs: {},
        claimRefs: [],
        assumptionRefs: [],
        requiredGates: [],
        effects: [],
        error: null,
        revision,
        supersededBy: null,
        supersededAtRevision: null,
        supersededReason: null,
      };
      rawNodes.push(node);
      nodeMap.set(id, node);
    });

    // Attach dependencies
    if (options.dependencies && typeof options.dependencies === 'object') {
      for (const [nodeId, deps] of Object.entries(options.dependencies)) {
        if (nodeMap.has(nodeId)) {
          nodeMap.get(nodeId).dependsOn = Array.isArray(deps) ? [...deps] : [];
        }
      }
    } else {
      deriveDependencies(operations, rawNodes);
    }
  }

  // Set initially ready nodes (active nodes with 0 dependencies)
  for (const node of rawNodes) {
    if (node.status === 'pending' && node.dependsOn.length === 0) {
      node.status = 'ready';
    }
  }

  // Graph Object
  const graph = {
    get revision() {
      return revision;
    },
    set revision(val) {
      if (typeof val === 'number' && val >= 1) revision = val;
    },

    getNodes() {
      return Array.from(nodeMap.values());
    },

    getActiveNodes() {
      return Array.from(nodeMap.values()).filter((n) => n.status !== 'superseded');
    },

    getNode(id) {
      return nodeMap.get(id) || null;
    },

    addNode(nodeData) {
      const id = String(nodeData.id || nodeData.nodeId);
      if (nodeMap.has(id)) {
        const existing = nodeMap.get(id);
        if (existing.status !== 'superseded') {
          throw new Error('Node with ID "' + id + '" already exists in graph!');
        }
      }
      const node = {
        id,
        nodeId: id,
        operationId: nodeData.operationId || id,
        kind: NODE_KINDS.includes(nodeData.kind) ? nodeData.kind : 'operation',
        paradigm: nodeData.paradigm || primary,
        dependsOn: Array.isArray(nodeData.dependsOn) ? [...nodeData.dependsOn] : [],
        status: NODE_STATUSES.includes(nodeData.status) ? nodeData.status : 'pending',
        inputs: nodeData.inputs ? { ...nodeData.inputs } : {},
        outputs: nodeData.outputs ? { ...nodeData.outputs } : {},
        claimRefs: Array.isArray(nodeData.claimRefs) ? [...nodeData.claimRefs] : [],
        assumptionRefs: Array.isArray(nodeData.assumptionRefs) ? [...nodeData.assumptionRefs] : [],
        requiredGates: Array.isArray(nodeData.requiredGates) ? [...nodeData.requiredGates] : [],
        effects: Array.isArray(nodeData.effects) ? [...nodeData.effects] : [],
        budgetReservation: nodeData.budgetReservation || undefined,
        error: nodeData.error || null,
        revision: typeof nodeData.revision === 'number' ? nodeData.revision : revision,
        supersededBy: nodeData.supersededBy || null,
        supersededAtRevision: nodeData.supersededAtRevision || null,
        supersededReason: nodeData.supersededReason || null,
      };

      // Check initial readiness
      if (node.status === 'pending') {
        const allCompleted = node.dependsOn.every((depId) => {
          const dep = nodeMap.get(depId);
          return dep && dep.status === 'completed';
        });
        if (allCompleted) {
          node.status = 'ready';
        }
      }

      nodeMap.set(id, node);
      return node;
    },

    supersedeNode(id, reason = 'superseded', atRevision = null) {
      const node = nodeMap.get(id);
      if (!node) throw new Error('Unknown node: ' + id);
      node.status = 'superseded';
      node.supersededReason = reason;
      node.supersededAtRevision = atRevision || revision;
      return node;
    },

    /**
     * Returns execution order of ACTIVE nodes via Kahn's topological sort.
     * Throws Error if cyclic.
     */
    getExecutionOrder() {
      const activeNodes = Array.from(nodeMap.values()).filter((n) => n.status !== 'superseded');
      const activeIds = new Set(activeNodes.map((n) => n.id));

      const inDegree = new Map();
      const adj = new Map();

      for (const node of activeNodes) {
        // Filter dependencies to only active nodes or completed older nodes
        const activeDeps = node.dependsOn.filter((depId) => {
          const dep = nodeMap.get(depId);
          return dep && dep.status !== 'superseded';
        });
        inDegree.set(node.id, activeDeps.length);
        adj.set(node.id, []);
      }

      for (const node of activeNodes) {
        for (const depId of node.dependsOn) {
          if (adj.has(depId)) {
            adj.get(depId).push(node.id);
          }
        }
      }

      const queue = [];
      for (const [id, deg] of inDegree.entries()) {
        if (deg === 0) queue.push(id);
      }

      const order = [];
      while (queue.length > 0) {
        const curr = queue.shift();
        order.push(curr);

        for (const neighbor of adj.get(curr) || []) {
          const newDeg = inDegree.get(neighbor) - 1;
          inDegree.set(neighbor, newDeg);
          if (newDeg === 0) {
            queue.push(neighbor);
          }
        }
      }

      if (order.length !== activeNodes.length) {
        throw new Error('Cyclic dependency detected in scientific operation graph!');
      }

      return order;
    },

    getReadyNodes() {
      return Array.from(nodeMap.values()).filter((node) => {
        if (node.status === 'superseded') return false;
        if (node.status !== 'pending' && node.status !== 'ready') return false;
        return node.dependsOn.every((depId) => {
          const dep = nodeMap.get(depId);
          return dep && dep.status === 'completed';
        });
      });
    },

    markNodeStatus(id, status, payload = {}) {
      const node = nodeMap.get(id);
      if (!node) throw new Error('Unknown node: ' + id);
      if (!NODE_STATUSES.includes(status)) throw new Error('Invalid status: ' + status);

      node.status = status;
      if (payload.outputs) node.outputs = { ...node.outputs, ...payload.outputs };
      if (payload.error) node.error = String(payload.error);

      if (status === 'completed') {
        // Evaluate active dependent nodes
        for (const other of nodeMap.values()) {
          if (other.status === 'pending' && other.dependsOn.includes(id)) {
            const allSatisfied = other.dependsOn.every((d) => {
              const dep = nodeMap.get(d);
              return dep && dep.status === 'completed';
            });
            if (allSatisfied) {
              other.status = 'ready';
            }
          }
        }
      } else if (status === 'failed') {
        // Mark downstream dependent nodes as blocked
        for (const other of nodeMap.values()) {
          if (other.status !== 'superseded' && other.dependsOn.includes(id) && (other.status === 'pending' || other.status === 'ready')) {
            other.status = 'blocked';
          }
        }
      }

      return node;
    },

    isCompleted() {
      const active = this.getActiveNodes();
      return active.length > 0 && active.every((n) => n.status === 'completed');
    },

    hasFailures() {
      return this.getActiveNodes().some((n) => n.status === 'failed' || n.status === 'blocked');
    },

    toJSON() {
      return {
        revision,
        primary,
        nodes: Array.from(nodeMap.values()),
        executionOrder: this.getExecutionOrder(),
      };
    },
  };

  // Validate that initial graph is a valid DAG
  graph.getExecutionOrder();

  return graph;
}

/**
 * Creates a revisioned graph directly with instance semantics.
 */
export function createRevisionedGraph(options = {}) {
  return createOperationGraph({ primary: options.primary || 'empirical' }, options);
}

