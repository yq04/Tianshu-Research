/**
 * Notebook Execution Records for tianshu-research (Phase 9B).
 *
 * Append-style record of interactive cell executions for one kernel session,
 * persisted as a deterministic JSON document under
 * <workspace>/.rivet/research/notebook/<session>.record.json.
 *
 * Formal replay eligibility (a prerequisite for treating a session's outputs
 * as reproducible evidence):
 *  - all cells ran in the same kernel epoch (no restart mid-session);
 *  - cells executed in strictly increasing order (out-of-order cells can
 *    depend on hidden state and MUST disqualify the formal gate);
 *  - every recorded cell finished 'ok' (error / timeout / aborted cells
 *    cannot be verified semantically by a fresh replay).
 *
 * A record that fails eligibility is still kept verbatim — negative and
 * messy results are first-class artifacts — the formal gate just refuses.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EXECUTION_RECORD_SCHEMA_VERSION = 1;

export function getNotebookDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'notebook');
}

export function createExecutionRecord(sessionName = 'default') {
  return {
    schemaVersion: EXECUTION_RECORD_SCHEMA_VERSION,
    sessionName,
    cells: [],
  };
}

/**
 * Appends one executed cell to the record.
 * `reply` is the normalized kernel reply: { status, outputs, error, epoch }.
 * Timestamps are deliberately excluded: replay comparison stays deterministic.
 */
export function recordExecution(record, { code, reply }) {
  if (!record || !Array.isArray(record.cells)) {
    throw new Error('recordExecution requires an execution record');
  }
  const outputs = (reply.outputs || []).map((o) => ({
    kind: o.kind || 'stream',
    name: o.name,
    text: o.text,
    repr: o.repr,
    ename: o.ename,
    evalue: o.evalue,
  }));
  record.cells.push({
    cellIndex: record.cells.length,
    code: String(code ?? ''),
    epoch: reply.epoch ?? null,
    status: reply.status, // ok | error | timeout | blocked
    outputs,
    error: reply.error
      ? { ename: reply.error.ename || null, evalue: reply.error.evalue || null }
      : null,
  });
  return record;
}

/**
 * Formal replay eligibility analysis.
 * @returns {{ eligible: boolean, reasons: string[] }}
 */
export function analyzeRecordForReplay(record) {
  const reasons = [];
  const cells = record?.cells || [];
  if (cells.length === 0) {
    reasons.push('RECORD_EMPTY');
  }

  const epochs = new Set(cells.map((c) => c.epoch));
  if (epochs.size > 1) {
    reasons.push('MULTI_EPOCH_SESSION');
  }

  for (let i = 1; i < cells.length; i++) {
    if (cells[i].cellIndex <= cells[i - 1].cellIndex) {
      reasons.push('OUT_OF_ORDER_CELLS');
      break;
    }
  }

  const bad = cells.filter((c) => c.status !== 'ok');
  if (bad.length > 0) {
    reasons.push(`NON_OK_CELLS(${bad.map((c) => c.status).join(',')})`);
  }

  return { eligible: reasons.length === 0, reasons };
}

/**
 * Persists a record (or replay report) under the notebook directory.
 */
export function saveNotebookDocument(workspace, name, document) {
  const dir = getNotebookDir(workspace);
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${name}.json`);
  writeFileSync(path, JSON.stringify(document, null, 2), 'utf8');
  return path;
}

/**
 * Loads a persisted notebook document; returns null when absent (never
 * synthesizes one).
 */
export function loadNotebookDocument(workspace, name) {
  const path = join(getNotebookDir(workspace), `${name}.json`);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}
