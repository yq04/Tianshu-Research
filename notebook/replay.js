/**
 * Clean Fresh-Kernel Replay for tianshu-research (Phase 9B).
 *
 * Interactive exploration and formal reproduction are different activities:
 *  - exploration may run cells out of order, restart kernels mid-way, and
 *    rely on hidden state;
 *  - formal reproduction re-runs the recorded cells IN ORDER in a FRESH
 *    kernel (new epoch) and compares outputs semantically.
 *
 * Discipline:
 *  - A record that is not replay-eligible (out-of-order cells, multi-epoch,
 *    non-ok cells) yields verdict 'not_comparable' — the formal gate refuses
 *    honestly instead of pretending equivalence.
 *  - Output comparison covers stream text, error identity, and execute_result
 *    reprs. Timestamps and execution counts are excluded (non-semantic).
 *  - Kernel unavailability yields 'blocked' — never a fabricated verdict.
 */

import { analyzeRecordForReplay } from './execution-record.js';

/**
 * Compares normalized output lists from the original run and the replay.
 * Non-semantic fields (executionCount) are ignored.
 */
export function compareCellOutputs(originalOutputs, replayOutputs) {
  const norm = (list) =>
    (list || []).map((o) => {
      if (o.kind === 'stream') return { kind: 'stream', name: o.name, text: o.text };
      if (o.kind === 'error') return { kind: 'error', ename: o.ename, evalue: o.evalue };
      if (o.kind === 'execute_result') return { kind: 'execute_result', repr: o.repr };
      if (o.kind === 'display_data') return { kind: 'display_data', repr: o.repr };
      return { kind: o.kind };
    });
  const a = JSON.stringify(norm(originalOutputs));
  const b = JSON.stringify(norm(replayOutputs));
  return a === b;
}

/**
 * Runs every recorded cell in order in a fresh kernel and compares outputs.
 *
 * @param {object} record - execution record (from execution-record.js)
 * @param {object} manager - NotebookKernelManager (should be a FRESH session)
 * @returns {Promise<object>} replay report
 *   verdict: 'reproduced' | 'diverged' | 'not_comparable' | 'blocked'
 *   gateStatus: 'pass' | 'fail' | 'inconclusive' | 'blocked'
 */
export async function replayExecutionRecord(record, manager) {
  const analysis = analyzeRecordForReplay(record);
  if (!analysis.eligible) {
    return {
      verdict: 'not_comparable',
      gateStatus: 'inconclusive',
      reasons: analysis.reasons,
      comparedCells: 0,
    };
  }

  const started = await manager.ensureStarted();
  if (!started.ok) {
    return {
      verdict: 'blocked',
      gateStatus: 'blocked',
      reasons: [started.reason || 'kernel unavailable'],
      comparedCells: 0,
    };
  }

  const restartRes = await manager.restart();
  if (!restartRes.ok) {
    return {
      verdict: 'blocked',
      gateStatus: 'blocked',
      reasons: [`fresh kernel restart failed: ${restartRes.error || restartRes.reason || 'unknown'}`],
      comparedCells: 0,
    };
  }

  const cellResults = [];
  let allMatch = true;

  for (const cell of record.cells) {
    const reply = await manager.execute(cell.code, { timeoutMs: 60000 });
    if (reply.status === 'blocked') {
      return {
        verdict: 'blocked',
        gateStatus: 'blocked',
        reasons: [reply.reason || 'kernel unavailable mid-replay'],
        comparedCells: cellResults.length,
      };
    }
    const outputsMatch = compareCellOutputs(cell.outputs, reply.outputs);
    const statusMatch = reply.status === cell.status;
    const match = outputsMatch && statusMatch;
    if (!match) allMatch = false;

    cellResults.push({
      cellIndex: cell.cellIndex,
      originalStatus: cell.status,
      replayStatus: reply.status,
      outputsMatch,
      match,
      replayError: reply.error ? { ename: reply.error.ename, evalue: reply.error.evalue } : null,
    });
  }

  return {
    verdict: allMatch ? 'reproduced' : 'diverged',
    gateStatus: allMatch ? 'pass' : 'fail',
    reasons: allMatch ? [] : ['CELL_DIVERGENCE'],
    comparedCells: cellResults.length,
    cells: cellResults,
    replayEpoch: manager.epoch,
  };
}
