/**
 * Event Journal & Research Workflow Store for tianshu-research.
 * Implements append-only event persistence, 100% event sourcing state projection,
 * and CAS concurrency control.
 */

import { existsSync, mkdirSync, readFileSync, appendFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import {
  createResearchEvent,
  deserializeEvent,
  serializeEvent,
} from './events.js';
import { createRevisionedGraph } from './graph.js';
import { applyGraphPatch } from './graph-patch.js';
import { ResearchBudgetManager } from './budget.js';

export class ResearchWorkflowStore {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.taskId = String(options.taskId || 'default_task').trim();
    this.events = [];
    this.idempotencyMap = new Map();

    this.projectedGraph = null;
    this.projectedBudget = null;
    this.status = 'uninitialized';
    this.revision = 1;
  }

  /**
   * Resolves the on-disk event journal file path:
   * <workspace>/.rivet/research/events/<taskId>.jsonl
   */
  getEventFilePath() {
    return resolve(this.workspace, '.rivet', 'research', 'events', `${this.taskId}.jsonl`);
  }

  ensureDir() {
    const filePath = this.getEventFilePath();
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    return filePath;
  }

  /**
   * Appends an event to the journal and updates projection.
   * Handles idempotency keys deterministically.
   */
  appendEvent(eventInput = {}) {
    this.ensureDir();

    // Check idempotency
    if (eventInput.idempotencyKey && this.idempotencyMap.has(eventInput.idempotencyKey)) {
      return this.idempotencyMap.get(eventInput.idempotencyKey);
    }

    const seq = this.events.length + 1;
    const revision = eventInput.revision || this.revision || 1;

    const event = createResearchEvent({
      ...eventInput,
      taskId: this.taskId,
      seq,
      revision,
    });

    const filePath = this.getEventFilePath();
    appendFileSync(filePath, serializeEvent(event) + '\n', 'utf8');

    this.events.push(event);
    this.idempotencyMap.set(event.idempotencyKey, event);

    this.applyEventToProjection(event);
    return event;
  }

  /**
   * Loads all events from the on-disk journal and replays state.
   */
  loadEvents() {
    const filePath = this.getEventFilePath();
    this.events = [];
    this.idempotencyMap.clear();
    this.projectedGraph = null;
    this.projectedBudget = null;
    this.status = 'uninitialized';
    this.revision = 1;

    if (existsSync(filePath)) {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0);
      for (const line of lines) {
        const evt = deserializeEvent(line);
        if (evt) {
          this.events.push(evt);
          this.idempotencyMap.set(evt.idempotencyKey, evt);
        }
      }
      this.events.sort((a, b) => a.seq - b.seq);
    }

    // Replay projection from sequence 1 to N
    for (const evt of this.events) {
      this.applyEventToProjection(evt);
    }

    return this.events;
  }

  /**
   * Projects a single event into in-memory workflow state.
   */
  applyEventToProjection(event) {
    const { kind, payload, revision } = event;

    switch (kind) {
      case 'TASK_CREATED': {
        const graphData = payload.graph || {};
        const nodes = Array.isArray(graphData.nodes)
          ? graphData.nodes
          : (Array.isArray(payload.nodes) ? payload.nodes : undefined);

        this.projectedGraph = createRevisionedGraph({
          primary: payload.primary || graphData.primary || 'empirical',
          revision: revision || 1,
          nodes,
          dependencies: payload.dependencies,
        });

        this.projectedBudget = new ResearchBudgetManager(payload.budgets || {});
        this.revision = revision || 1;
        this.status = 'active';
        break;
      }

      case 'NODE_SCHEDULED': {
        if (this.projectedGraph && payload.nodeId) {
          const node = this.projectedGraph.getNode(payload.nodeId);
          if (node && node.status === 'pending') {
            node.status = 'ready';
          }
        }
        break;
      }

      case 'NODE_STARTED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'running');
        }
        break;
      }

      case 'NODE_COMPLETED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'completed', {
            outputs: payload.outputs,
          });
        }
        break;
      }

      case 'NODE_FAILED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'failed', {
            error: payload.error,
          });
        }
        break;
      }

      case 'NODE_CANCELLED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'cancelled');
        }
        break;
      }

      case 'PATCH_APPLIED': {
        if (this.projectedGraph && payload.patch) {
          const targetRev = payload.patchResult?.newRevision || ((payload.patch.baseRevision ?? 1) + 1);
          if (this.projectedGraph.revision < targetRev) {
            applyGraphPatch(this.projectedGraph, payload.patch, { skipCas: true });
            this.revision = this.projectedGraph.revision;
            if (this.projectedBudget) {
              this.projectedBudget.recordIteration();
            }
          }
        }
        break;
      }

      case 'HUMAN_INPUT_REQUESTED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'awaiting_input');
          this.status = 'awaiting_input';
        }
        break;
      }

      case 'HUMAN_INPUT_PROVIDED': {
        if (this.projectedGraph && payload.nodeId) {
          this.projectedGraph.markNodeStatus(payload.nodeId, 'completed', {
            outputs: payload.outputs || payload.inputData,
          });
          // If no remaining awaiting_input nodes, resume active
          const hasWaiting = this.projectedGraph.getNodes().some((n) => n.status === 'awaiting_input');
          if (!hasWaiting && this.status === 'awaiting_input') {
            this.status = 'active';
          }
        }
        break;
      }

      case 'BUDGET_RESERVED': {
        if (this.projectedBudget && payload.reservationId) {
          try {
            this.projectedBudget.reserve(payload.reservationId, payload.requirements || { runs: 1 });
          } catch {
            // Already reserved in active session
          }
        }
        break;
      }

      case 'BUDGET_COMMITTED': {
        if (this.projectedBudget && payload.reservationId) {
          this.projectedBudget.commit(payload.reservationId, payload.actual || {});
        }
        break;
      }

      case 'BUDGET_RELEASED': {
        if (this.projectedBudget && payload.reservationId) {
          this.projectedBudget.release(payload.reservationId);
        }
        break;
      }

      case 'BUDGET_EXHAUSTED': {
        this.status = 'halted';
        break;
      }

      case 'WORKFLOW_COMPLETED': {
        this.status = 'completed';
        break;
      }

      case 'WORKFLOW_HALTED': {
        this.status = 'halted';
        break;
      }
    }
  }

  /**
   * Applies a GraphPatch under CAS concurrency control.
   */
  applyPatch(patch) {
    if (!this.projectedGraph) {
      throw new Error('Workflow not initialized. Cannot apply patch.');
    }

    // 1. Verify CAS and structural validity
    const patchResult = applyGraphPatch(this.projectedGraph, patch, { skipCas: false });

    // 2. Append PATCH_APPLIED event to journal
    const evt = this.appendEvent({
      kind: 'PATCH_APPLIED',
      revision: patchResult.newRevision,
      payload: {
        patch,
        patchResult,
      },
      causedBy: patch.reasonEventId,
    });

    return {
      ...patchResult,
      event: evt,
    };
  }

  getState() {
    return {
      taskId: this.taskId,
      revision: this.revision,
      status: this.status,
      graph: this.projectedGraph,
      budget: this.projectedBudget ? this.projectedBudget.getSummary() : null,
      budgetManager: this.projectedBudget,
      lastSeq: this.events.length,
      eventCount: this.events.length,
    };
  }
}

