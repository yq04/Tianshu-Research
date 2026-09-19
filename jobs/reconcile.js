/**
 * Run Reconciliation for tianshu-research (Phase 10).
 *
 * After a disconnect/crash, the run store may hold runs whose true state
 * lives with the backend. Reconciliation asks the BACKEND for authority and
 * updates the store truthfully:
 *
 *   backend says completed/failed/... + receipt -> ingested into the store
 *   backend says not_found                      -> run marked 'orphaned'
 *                                                  (NEVER upgraded to completed)
 *   backend itself unreachable                  -> store left untouched,
 *                                                  run reported 'unreachable'
 *
 * Honesty rule: reconciliation may only move a run DOWN the trust ladder
 * (running -> orphaned) or fill in a verified terminal receipt. It never
 * fabricates success.
 */

import { resolve } from 'node:path';
import { listRuns, updateRun } from './run-store.js';

export async function reconcileRuns({ workspace, backend, runIds } = {}) {
  const ws = resolve(workspace || process.cwd());
  const all = listRuns(ws);
  const inFlight = all.filter((r) => ['queued', 'running'].includes(r.status));
  const targets = (runIds && runIds.length > 0)
    ? inFlight.filter((r) => runIds.includes(r.runId))
    : inFlight;

  const report = { checked: 0, ingested: [], orphaned: [], stillRunning: [], unreachable: [] };

  for (const run of targets) {
    report.checked += 1;
    let answer;
    try {
      answer = await backend.query(ws, run.runId);
    } catch (err) {
      // Backend down / transport failure: leave the store untouched.
      report.unreachable.push({ runId: run.runId, error: err instanceof Error ? err.message : String(err) });
      continue;
    }

    if (!answer || answer.status === 'not_found') {
      // The backend does not know this run: the local 'running' state is a
      // lie left by a crash. Mark orphaned — an honest dead end, never 'completed'.
      updateRun(ws, run.runId, {
        status: 'orphaned',
        error: 'reconciliation: backend has no record of this run; it was never verified to complete',
      });
      report.orphaned.push(run.runId);
      continue;
    }

    if (answer.status === 'unreachable') {
      report.unreachable.push({ runId: run.runId, error: answer.error || 'backend reported unreachable' });
      continue;
    }

    if (['completed', 'failed', 'cancelled', 'timed_out'].includes(answer.status)) {
      updateRun(ws, run.runId, {
        status: answer.status,
        exitCode: answer.receipt?.exitCode,
        endTime: answer.receipt?.endTime || new Date().toISOString(),
        receipt: answer.receipt || undefined,
      });
      report.ingested.push({ runId: run.runId, status: answer.status });
      continue;
    }

    // still queued/running on the backend — nothing to change
    report.stillRunning.push(run.runId);
  }

  return report;
}
