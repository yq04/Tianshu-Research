/**
 * Host Adapter for Workflow Node Execution in tianshu-research.
 * Encapsulates execution across registered operations, hypothesis lifecycles,
 * human-in-the-loop pauses, and local test mocks.
 */

import { dispatchOperation } from '../operations/dispatcher.js';
import { aggregateReview, evaluateReviewGate } from '../integration/review-contracts.js';

export class HostAdapter {
  constructor(options = {}) {
    this.workspace = options.workspace || process.cwd();
    this.handlers = new Map(options.handlers ? Object.entries(options.handlers) : []);
    this.operationDispatcher = options.operationDispatcher || dispatchOperation;
  }

  /**
   * Registers a custom handler for an operationId or node kind.
   */
  registerHandler(key, handler) {
    if (typeof handler !== 'function') {
      throw new Error('Handler must be a function');
    }
    this.handlers.set(key, handler);
  }

  /**
   * Resolves dynamic inputs referencing upstream node outputs ({ fromNode, output }).
   */
  resolveInputs(inputs = {}, graph = null) {
    if (!inputs || typeof inputs !== 'object') return {};
    const resolved = {};

    for (const [k, v] of Object.entries(inputs)) {
      if (v && typeof v === 'object' && typeof v.fromNode === 'string') {
        if (graph) {
          const upNode = graph.getNode(v.fromNode);
          if (upNode && upNode.outputs) {
            resolved[k] = v.output ? upNode.outputs[v.output] : upNode.outputs;
          } else {
            resolved[k] = undefined;
          }
        } else {
          resolved[k] = undefined;
        }
      } else {
        resolved[k] = v;
      }
    }

    return resolved;
  }

  /**
   * Executes a single ResearchNode within the provided execution context.
   */
  async executeNode(node, context = {}) {
    const graph = context.graph || null;
    const resolvedInputs = this.resolveInputs(node.inputs, graph);

    // 1. Check custom handler
    if (this.handlers.has(node.operationId)) {
      return await this.handlers.get(node.operationId)(node, {
        ...context,
        resolvedInputs,
        workspace: this.workspace,
      });
    }
    if (this.handlers.has(node.kind)) {
      return await this.handlers.get(node.kind)(node, {
        ...context,
        resolvedInputs,
        workspace: this.workspace,
      });
    }

    // 2. Built-in semantics by kind
    switch (node.kind) {
      case 'human-input': {
        return {
          status: 'awaiting_input',
          prompt: resolvedInputs.prompt || resolvedInputs.question || 'Human input required',
          schema: resolvedInputs.schema,
          defaultAnswer: resolvedInputs.defaultAnswer,
          fields: resolvedInputs.fields || [],
        };
      }

      case 'decision': {
        const choice = resolvedInputs.choice || resolvedInputs.condition || 'proceed';
        return {
          status: 'completed',
          data: { decision: choice, evaluatedAt: new Date().toISOString() },
        };
      }

      case 'review': {
        // Review nodes are decided by Council review contracts, never by a
        // hardcoded approval. Without supplied verdicts the node parks in
        // awaiting_input so the host can dispatch a council (or a human chair).
        const verdicts = Array.isArray(resolvedInputs.verdicts) ? resolvedInputs.verdicts : [];
        const reviewRequest = resolvedInputs.reviewRequest || resolvedInputs.request;

        if (!reviewRequest || verdicts.length === 0) {
          return {
            status: 'awaiting_input',
            prompt: resolvedInputs.prompt || `Council review required for node "${node.id}"`,
            schema: resolvedInputs.schema || {
              type: 'object',
              properties: {
                reviewRequest: { type: 'object' },
                verdicts: { type: 'array' },
              },
              required: ['reviewRequest', 'verdicts'],
            },
            defaultAnswer: undefined,
            fields: resolvedInputs.fields || [],
          };
        }

        try {
          const aggregate = aggregateReview(reviewRequest, verdicts);
          const gate = evaluateReviewGate(reviewRequest, verdicts);
          const approved = aggregate.status === 'approved';
          return {
            status: approved ? 'completed' : 'failed',
            data: {
              reviewStatus: aggregate.status,
              reason: aggregate.reason,
              gateStatus: gate.gateStatus,
              tally: aggregate.tally,
              quorumMet: aggregate.quorumMet,
              counterevidence: aggregate.counterevidence,
            },
            issues: approved ? [] : [`Review outcome: ${aggregate.status} (${aggregate.reason})`],
          };
        } catch (err) {
          return {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }

      case 'hypothesis': {
        return {
          status: 'completed',
          data: {
            hypothesisId: resolvedInputs.hypothesisId || node.nodeId,
            state: resolvedInputs.targetState || 'formulated',
            ...resolvedInputs,
          },
        };
      }

      case 'operation':
      default: {
        try {
          const result = await this.operationDispatcher(node.operationId, resolvedInputs, {
            workspace: this.workspace,
            ...context,
          });

          if (result.status === 'blocked' || result.status === 'failed') {
            return {
              status: 'failed',
              error: result.summary || 'Operation failed',
              issues: result.issues || [],
              data: result.data || null,
            };
          }

          return {
            status: 'completed',
            data: result.data || result,
            receipt: result.receipt || null,
          };
        } catch (err) {
          return {
            status: 'failed',
            error: err instanceof Error ? err.message : String(err),
          };
        }
      }
    }
  }
}

