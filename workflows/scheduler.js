/**
 * Resilient Workflow Scheduler & Breakpoint Resume for tianshu-research.
 * Implements deterministic topological dispatch, budget-gated reservations,
 * non-blocking human-in-the-loop pauses, and seamless event-sourced resumption.
 */

import { ResearchWorkflowStore } from './store.js';
import { HostAdapter } from './host-adapter.js';
import { ResearchBudgetManager } from './budget.js';

export class WorkflowScheduler {
  constructor(options = {}) {
    this.taskId = options.taskId || options.store?.taskId || 'default_task';
    this.workspace = options.workspace || options.store?.workspace || process.cwd();
    this.store = options.store || new ResearchWorkflowStore({ workspace: this.workspace, taskId: this.taskId });
    this.graph = options.graph || this.store.projectedGraph;
    this.budgetManager = options.budgetManager || this.store.projectedBudget || new ResearchBudgetManager(options.budget);
    this.hostAdapter = options.hostAdapter || new HostAdapter({ workspace: this.workspace });
  }

  /**
   * Advances the workflow by one scheduling tick.
   * Executes available ready nodes within parallelism and budget limits.
   */
  async step() {
    // 1. Check budget exhaustion
    const exhaustCheck = this.budgetManager.checkExhausted();
    if (exhaustCheck.exhausted) {
      this.store.appendEvent({
        kind: 'BUDGET_EXHAUSTED',
        payload: {
          reason: exhaustCheck.reason,
          metric: exhaustCheck.metric,
          summary: this.budgetManager.getSummary(),
        },
      });
      return {
        stopped: true,
        reason: 'BUDGET_EXHAUSTED',
        detail: exhaustCheck,
        partialDelivery: true,
        budgetSummary: this.budgetManager.getSummary(),
      };
    }

    // 2. Discover ready nodes
    const readyNodes = this.graph.getReadyNodes();

    // 3. Handle stop conditions if no ready nodes
    if (readyNodes.length === 0) {
      const activeNodes = this.graph.getActiveNodes();
      const waitingInputNodes = activeNodes.filter((n) => n.status === 'awaiting_input');
      if (waitingInputNodes.length > 0) {
        return {
          stopped: true,
          awaitingInput: true,
          waitingNodes: waitingInputNodes.map((n) => n.id),
          summary: 'Workflow paused awaiting human input on ' + waitingInputNodes.length + ' node(s)',
        };
      }

      if (this.graph.isCompleted()) {
        return {
          stopped: true,
          completed: true,
          summary: 'All active nodes successfully completed',
        };
      }

      if (this.graph.hasFailures()) {
        return {
          stopped: true,
          failed: true,
          failedNodes: activeNodes.filter((n) => n.status === 'failed' || n.status === 'blocked').map((n) => n.id),
          summary: 'Workflow stopped due to node failures or blocks',
        };
      }

      return {
        stopped: true,
        summary: 'No ready nodes available to execute',
      };
    }

    // 4. Dispatch ready nodes respecting parallel limit
    const maxParallel = this.budgetManager.budget.maxParallelRuns || 2;
    const batch = readyNodes.slice(0, maxParallel);
    const stepResults = [];

    for (const node of batch) {
      // 4.1 Handle Human-in-the-loop nodes
      if (node.kind === 'human-input') {
        this.graph.markNodeStatus(node.id, 'awaiting_input');
        this.store.appendEvent({
          kind: 'HUMAN_INPUT_REQUESTED',
          payload: {
            nodeId: node.id,
            prompt: node.inputs?.prompt || 'Input requested by workflow',
            schema: node.inputs?.schema,
            defaultAnswer: node.inputs?.defaultAnswer,
          },
        });
        stepResults.push({
          nodeId: node.id,
          status: 'awaiting_input',
        });
        // Crucial: continue to next node in batch so independent branches are not blocked!
        continue;
      }

      // 4.2 Budget Reservation for executable node
      const canRes = this.budgetManager.canReserve({ runs: 1 });
      if (!canRes.allowed) {
        this.store.appendEvent({
          kind: 'BUDGET_EXHAUSTED',
          payload: {
            reason: canRes.reason,
            metric: canRes.metric,
            summary: this.budgetManager.getSummary(),
          },
        });
        return {
          stopped: true,
          reason: 'BUDGET_EXHAUSTED',
          detail: canRes,
          partialDelivery: true,
          budgetSummary: this.budgetManager.getSummary(),
        };
      }

      const resId = `res_${node.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      this.budgetManager.reserve(resId, { runs: 1 });
      this.store.appendEvent({
        kind: 'BUDGET_RESERVED',
        payload: { reservationId: resId, nodeId: node.id },
      });

      // 4.3 Transition to running
      this.graph.markNodeStatus(node.id, 'running');
      this.store.appendEvent({
        kind: 'NODE_STARTED',
        payload: { nodeId: node.id, operationId: node.operationId },
      });

      // 4.4 Execution via HostAdapter
      const startMs = Date.now();
      try {
        const execResult = await this.hostAdapter.executeNode(node, {
          graph: this.graph,
          store: this.store,
        });
        const durationSec = Math.max(0.001, (Date.now() - startMs) / 1000);

        if (execResult.status === 'awaiting_input') {
          this.budgetManager.release(resId);
          this.graph.markNodeStatus(node.id, 'awaiting_input');
          this.store.appendEvent({
            kind: 'HUMAN_INPUT_REQUESTED',
            payload: { nodeId: node.id, ...execResult },
          });
          stepResults.push({ nodeId: node.id, status: 'awaiting_input' });
        } else if (execResult.status === 'completed') {
          this.budgetManager.commit(resId, { runs: 1, wallSeconds: durationSec });
          this.graph.markNodeStatus(node.id, 'completed', { outputs: execResult.data });
          this.store.appendEvent({
            kind: 'NODE_COMPLETED',
            payload: {
              nodeId: node.id,
              outputs: execResult.data,
              receipt: execResult.receipt,
              durationSec,
            },
          });
          stepResults.push({ nodeId: node.id, status: 'completed', data: execResult.data });
        } else {
          // Failed
          this.budgetManager.commit(resId, { runs: 1, wallSeconds: durationSec, isFailure: true });
          this.graph.markNodeStatus(node.id, 'failed', { error: execResult.error });
          this.store.appendEvent({
            kind: 'NODE_FAILED',
            payload: {
              nodeId: node.id,
              error: execResult.error,
              issues: execResult.issues,
              durationSec,
            },
          });
          stepResults.push({ nodeId: node.id, status: 'failed', error: execResult.error });
        }
      } catch (err) {
        const durationSec = Math.max(0.001, (Date.now() - startMs) / 1000);
        this.budgetManager.commit(resId, { runs: 1, wallSeconds: durationSec, isFailure: true });
        const errMsg = err instanceof Error ? err.message : String(err);
        this.graph.markNodeStatus(node.id, 'failed', { error: errMsg });
        this.store.appendEvent({
          kind: 'NODE_FAILED',
          payload: { nodeId: node.id, error: errMsg, durationSec },
        });
        stepResults.push({ nodeId: node.id, status: 'failed', error: errMsg });
      }
    }

    return {
      stopped: false,
      executed: stepResults,
      readyRemaining: this.graph.getReadyNodes().length,
    };
  }

  /**
   * Loops until workflow reaches a terminal state, pauses for human input, or exhausts budget.
   */
  async runToCompletion({ maxTicks = 100 } = {}) {
    let tickCount = 0;
    let lastStep = null;

    while (tickCount < maxTicks) {
      tickCount++;
      lastStep = await this.step();
      if (lastStep.stopped) {
        break;
      }
    }

    const activeNodes = this.graph.getActiveNodes();
    const completedNodes = activeNodes.filter((n) => n.status === 'completed');
    const failedNodes = activeNodes.filter((n) => n.status === 'failed' || n.status === 'blocked');
    const awaitingInputNodes = activeNodes.filter((n) => n.status === 'awaiting_input');
    const pendingNodes = activeNodes.filter((n) => n.status === 'pending' || n.status === 'ready');

    let finalStatus = 'running';
    if (lastStep?.completed || this.graph.isCompleted()) {
      finalStatus = 'completed';
      this.store.appendEvent({ kind: 'WORKFLOW_COMPLETED', payload: { completedAt: new Date().toISOString() } });
    } else if (lastStep?.reason === 'BUDGET_EXHAUSTED') {
      finalStatus = 'halted_budget_exhausted';
      this.store.appendEvent({ kind: 'WORKFLOW_HALTED', payload: { reason: 'BUDGET_EXHAUSTED' } });
    } else if (awaitingInputNodes.length > 0) {
      finalStatus = 'awaiting_input';
    } else if (failedNodes.length > 0) {
      finalStatus = 'failed';
    }

    return {
      status: finalStatus,
      tickCount,
      completedNodes: completedNodes.map((n) => n.id),
      failedNodes: failedNodes.map((n) => n.id),
      awaitingInputNodes: awaitingInputNodes.map((n) => n.id),
      pendingNodes: pendingNodes.map((n) => n.id),
      partialDelivery: finalStatus !== 'completed',
      budgetSummary: this.budgetManager.getSummary(),
      graph: this.graph.toJSON(),
      reason: lastStep?.reason || lastStep?.summary,
    };
  }

  /**
   * Responds to an awaiting_input node, stores input, and resumes downstream execution.
   */
  provideHumanInput(nodeId, inputData = {}) {
    const node = this.graph.getNode(nodeId);
    if (!node) {
      throw new Error(`Unknown node: "${nodeId}"`);
    }
    if (node.status !== 'awaiting_input') {
      throw new Error(`Node "${nodeId}" is not in awaiting_input status (current: ${node.status})`);
    }

    this.graph.markNodeStatus(nodeId, 'completed', { outputs: inputData });
    this.store.appendEvent({
      kind: 'HUMAN_INPUT_PROVIDED',
      payload: {
        nodeId,
        inputData,
        providedAt: new Date().toISOString(),
      },
    });

    return {
      success: true,
      nodeId,
      node: this.graph.getNode(nodeId),
      nextReady: this.graph.getReadyNodes().map((n) => n.id),
    };
  }

  /**
   * Applies a dynamic GraphPatch to the running workflow.
   */
  applyPatch(patch) {
    return this.store.applyPatch(patch);
  }

  /**
   * Resumes workflow from event journal on disk (Event Sourcing).
   * Completed nodes are preserved without re-execution.
   */
  static async resumeWorkflow(taskId, { workspace = process.cwd(), hostAdapter = null } = {}) {
    const store = new ResearchWorkflowStore({ workspace, taskId });
    store.loadEvents();

    if (!store.projectedGraph) {
      throw new Error(`Cannot resume workflow "${taskId}": no valid graph events found in journal.`);
    }

    // Recover nodes stuck in running status (due to prior crash/kill)
    for (const node of store.projectedGraph.getActiveNodes()) {
      if (node.status === 'running') {
        node.status = 'ready';
      }
    }

    const scheduler = new WorkflowScheduler({
      taskId,
      workspace,
      store,
      graph: store.projectedGraph,
      budgetManager: store.projectedBudget,
      hostAdapter: hostAdapter || new HostAdapter({ workspace }),
    });

    return scheduler;
  }
}

