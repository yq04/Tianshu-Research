/**
 * Persistent Run Store for tianshu-research.
 * Tracks run lifecycle states, process IDs, RunSpecs, receipts, and artifacts.
 * Guarantees that non-existent runs return null (mapped to not_found),
 * and prevents hallucinated 'completed' states for unknown jobs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export function getRunsDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'runs');
}

export function getRunDir(workspace = process.cwd(), runId) {
  return join(getRunsDir(workspace), String(runId).trim());
}

/**
 * Records a new run record or updates an existing one.
 */
export function recordRun(workspace, runRecord = {}) {
  const ws = resolve(workspace || process.cwd());
  const runId = String(runRecord.runId || '').trim();
  if (!runId) {
    throw new Error('runId is required to record a run');
  }

  const runDir = getRunDir(ws, runId);
  mkdirSync(runDir, { recursive: true });

  const metaPath = join(runDir, 'run_meta.json');
  let existing = {};
  if (existsSync(metaPath)) {
    try {
      existing = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {}
  }

  const merged = {
    ...existing,
    ...runRecord,
    runId,
    updatedAt: new Date().toISOString(),
  };

  if (!merged.createdAt) {
    merged.createdAt = new Date().toISOString();
  }

  writeFileSync(metaPath, JSON.stringify(merged, null, 2), 'utf8');

  // If spec is provided, ensure run_spec.json exists
  if (runRecord.spec) {
    writeFileSync(join(runDir, 'run_spec.json'), JSON.stringify(runRecord.spec, null, 2), 'utf8');
  }

  // If receipt is provided, ensure run_receipt.json exists
  if (runRecord.receipt) {
    writeFileSync(join(runDir, 'run_receipt.json'), JSON.stringify(runRecord.receipt, null, 2), 'utf8');
  }

  return merged;
}

/**
 * Updates an existing run record with patch fields.
 */
export function updateRun(workspace, runId, patch = {}) {
  const ws = resolve(workspace || process.cwd());
  const rId = String(runId || '').trim();
  if (!rId) {
    throw new Error('runId is required to update run');
  }

  const current = getRun(ws, rId);
  if (!current) {
    return null;
  }

  return recordRun(ws, {
    ...current,
    ...patch,
    runId: rId,
  });
}

/**
 * Retrieves a run record by runId. Returns null if not found.
 */
export function getRun(workspace, runId) {
  const ws = resolve(workspace || process.cwd());
  const rId = String(runId || '').trim();
  if (!rId) return null;

  const runDir = getRunDir(ws, rId);
  if (!existsSync(runDir)) {
    return null;
  }

  const metaPath = join(runDir, 'run_meta.json');
  let meta = null;
  if (existsSync(metaPath)) {
    try {
      meta = JSON.parse(readFileSync(metaPath, 'utf8'));
    } catch {}
  }

  // Also check run_receipt.json and run_spec.json for fallback/enrichment
  const receiptPath = join(runDir, 'run_receipt.json');
  let receipt = null;
  if (existsSync(receiptPath)) {
    try {
      receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
    } catch {}
  }

  const specPath = join(runDir, 'run_spec.json');
  let spec = null;
  if (existsSync(specPath)) {
    try {
      spec = JSON.parse(readFileSync(specPath, 'utf8'));
    } catch {}
  }

  if (!meta && !receipt && !spec) {
    return null;
  }

  const status = meta?.status || receipt?.status || (spec ? 'running' : 'unknown');

  return {
    runId: rId,
    status,
    spec: meta?.spec || spec,
    receipt: meta?.receipt || receipt,
    pid: meta?.pid,
    startTime: meta?.startTime || receipt?.startTime,
    endTime: meta?.endTime || receipt?.endTime,
    exitCode: meta?.exitCode ?? receipt?.exitCode,
    error: meta?.error ?? receipt?.error,
    artifacts: meta?.artifacts || receipt?.outputs || [],
    metrics: meta?.metrics || receipt?.metrics,
    createdAt: meta?.createdAt,
    updatedAt: meta?.updatedAt,
  };
}

/**
 * Lists all recorded runs in the workspace.
 */
export function listRuns(workspace) {
  const ws = resolve(workspace || process.cwd());
  const runsDir = getRunsDir(ws);
  if (!existsSync(runsDir)) {
    return [];
  }

  const entries = readdirSync(runsDir, { withFileTypes: true });
  const runs = [];
  for (const ent of entries) {
    if (ent.isDirectory()) {
      const r = getRun(ws, ent.name);
      if (r) runs.push(r);
    }
  }

  return runs.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
}
