/**
 * Local Process Backend (Phase 10).
 *
 * Runs RunSpecs as local child processes by delegating to the existing
 * deterministic executor (safe spawn, settle-once, real process-tree
 * termination, truthful receipts). The backend adds:
 *  - fire-and-forget submit: returns immediately while the run executes;
 *  - submit idempotency: the same (tenant, idempotencyKey) never re-executes;
 *  - tenant namespacing: runs are keyed per workspace; cross-tenant access
 *    is refused by the guard (and re-checked here against the store);
 *  - query/cancel backed by the truthful run-store, never fabricated.
 */

import { resolve } from 'node:path';
import { executeRunSpec, cancelRun, getRunStatus } from '../executor.js';
import { recordRun, getRun } from '../run-store.js';
import { BackendError, BackendUnavailableError } from './interface.js';

export function createLocalProcessBackend() {
  const idempotent = new Map(); // idempotency key -> { backendRunId, status }

  return {
    name: 'local-process',
    supported: true,
    reason: undefined,
    capabilities: ['cpu', 'inline-operations'],

    __idempotentLookup(key) {
      return idempotent.get(key);
    },

    __rememberIdempotent(key, result) {
      idempotent.set(key, result);
    },

    async submit({ tenant, spec, idempotencyKey }) {
      const ws = resolve(tenant);
      const runId = spec?.runId;
      if (!runId) {
        throw new BackendError('local-process backend requires spec.runId', { code: 'CONTRACT_VIOLATION' });
      }

      // Idempotency: same key + same runId replays without re-execution.
      const key = `${ws}::${idempotencyKey ?? runId}`;
      const prior = idempotent.get(key);
      if (prior && prior.backendRunId === runId) {
        return { backendRunId: runId, status: 'running', idempotentReplay: true };
      }
      if (prior && prior.backendRunId !== runId) {
        throw new BackendError(
          `idempotency key "${idempotencyKey}" already bound to run ${prior.backendRunId}`,
          { code: 'IDEMPOTENCY_CONFLICT' },
        );
      }

      recordRun(ws, {
        runId,
        spec,
        status: 'queued',
        backend: 'local-process',
      });

      // Fire-and-forget: the executor records truthful receipts itself.
      const execution = executeRunSpec(ws, spec).catch((err) => {
        recordRun(ws, {
          runId,
          status: 'failed',
          error: err instanceof Error ? err.message : String(err),
        });
      });

      // Keep the promise attached so an unhandled rejection can never occur;
      // query() reads the authoritative state from the run store.
      void execution;

      idempotent.set(key, { backendRunId: runId, status: 'running' });
      return { backendRunId: runId, status: 'queued' };
    },

    async query(tenant, backendRunId) {
      const ws = resolve(tenant);
      const run = getRun(ws, backendRunId);
      if (!run) return { status: 'not_found' };
      const statusInfo = getRunStatus(ws, backendRunId);
      return {
        status: statusInfo.status, // queued/running/completed/failed/cancelled/timed_out
        receipt: statusInfo.receipt || undefined,
        exitCode: statusInfo.exitCode,
        pid: statusInfo.pid,
      };
    },

    async cancel(tenant, backendRunId, reason) {
      const ws = resolve(tenant);
      const res = await cancelRun(ws, backendRunId, reason);
      if (!res.success && res.status === 'not_found') {
        return { ok: false, status: 'not_found' };
      }
      return { ok: true, status: res.status };
    },

    /**
     * Authoritative reconciliation for suspected-orphaned runs: a run whose
     * receipt file exists on disk is recovered truthfully; a run the store
     * never finished is reported as it truly is ('running' is NOT upgraded).
     */
    async reconcile(tenant, backendRunIds) {
      const ws = resolve(tenant);
      const out = {};
      for (const runId of backendRunIds || []) {
        out[runId] = await this.query(ws, runId);
      }
      return out;
    },
  };
}
