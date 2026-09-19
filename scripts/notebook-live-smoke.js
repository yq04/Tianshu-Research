#!/usr/bin/env node
/**
 * Notebook Live Smoke for tianshu-research (Phase 9B).
 *
 * End-to-end validation against a REAL Jupyter kernel (ipykernel) through the
 * real bridge.py — no fake bridge, no fixtures. Read-only: the kernel runs
 * in-memory cells only; nothing is written outside the workspace run dirs.
 *
 * Executed checks:
 *   1. arithmetic execution       -> ok + execute_result
 *   2. in-session hidden state    -> assignment + read works within an epoch
 *   3. stream outputs             -> print() captured as stream
 *   4. honest cell errors         -> ZeroDivisionError surfaced, not faked
 *   5. restart clears state       -> epoch bumps, NameError afterwards
 *   6. clean fresh-kernel replay  -> deterministic record reproduces
 *
 * Requires the declared optional deps: pip install -r requirements-notebook.txt
 * Usage: node scripts/notebook-live-smoke.js
 */

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotebookKernelManager } from '../notebook/kernel-manager.js';
import { createExecutionRecord, recordExecution, saveNotebookDocument } from '../notebook/execution-record.js';
import { replayExecutionRecord } from '../notebook/replay.js';

const SELF_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

function check(name, ok, evidence) {
  return { name, status: ok ? 'PASS' : 'FAIL', evidence };
}

async function pollTerminal(manager, runIdRef, { maxMs = 60_000 } = {}) {
  // execute() itself resolves with the reply, so nothing to poll here;
  // kept for symmetry with remote backends.
  return runIdRef;
}

async function main() {
  const workspace = mkdtempSync(join(tmpdir(), 'tianshu-nb-live-'));
  const manager = new NotebookKernelManager({ workspace, sessionName: 'live-smoke' });
  const results = [];

  try {
    // 1. Arithmetic execution through the real kernel.
    const reply1 = await manager.execute('2 + 3', { timeoutMs: 60_000 });
    const result5 = reply1.outputs.find((o) => o.kind === 'execute_result');
    results.push(check('kernel.execute.arithmetic', reply1.status === 'ok' && result5?.repr === '5', { status: reply1.status, repr: result5?.repr, epoch: reply1.epoch }));

    // 2. Hidden state within one epoch.
    await manager.execute('X = 21', { timeoutMs: 30_000 });
    const reply2 = await manager.execute('X * 2', { timeoutMs: 30_000 });
    const result42 = reply2.outputs.find((o) => o.kind === 'execute_result');
    results.push(check('kernel.hiddenstate.within-epoch', reply2.status === 'ok' && result42?.repr === '42', { repr: result42?.repr }));

    // 3. Stream outputs.
    const reply3 = await manager.execute("print('hello smoke')", { timeoutMs: 30_000 });
    const stream = reply3.outputs.find((o) => o.kind === 'stream');
    results.push(check('kernel.stream.capture', reply3.status === 'ok' && (stream?.text || '').includes('hello smoke'), { text: stream?.text?.trim() }));

    // 4. Honest error surfacing.
    const reply4 = await manager.execute('1/0', { timeoutMs: 30_000 });
    results.push(check('kernel.error.honest', reply4.status === 'error' && reply4.error?.ename === 'ZeroDivisionError', { ename: reply4.error?.ename }));

    // 5. Restart: epoch bumps, hidden state cleared, NameError is truth.
    const before = manager.epoch;
    const restartRes = await manager.restart();
    const after = await manager.execute('X', { timeoutMs: 30_000 });
    results.push(check('kernel.restart.clears-state', restartRes.ok && manager.epoch === before + 1 && after.status === 'error' && after.error?.ename === 'NameError', { epochBefore: before, epochAfter: manager.epoch, ename: after.error?.ename }));

    // 6. Clean fresh-kernel replay of a deterministic record (in-memory record,
    //    mirroring the replay gate used by notebook.replay@1).
    const record = createExecutionRecord('live-replay');
    recordExecution(record, { code: 'A = 6', reply: { status: 'ok', outputs: [], epoch: 1 } });
    recordExecution(record, { code: 'A * 7', reply: { status: 'ok', outputs: [{ kind: 'execute_result', repr: '42' }], epoch: 1 } });
    const replayManager = new NotebookKernelManager({ workspace, sessionName: 'live-smoke:replay' });
    const report = await replayExecutionRecord(record, replayManager);
    results.push(check('kernel.replay.reproduced', report.verdict === 'reproduced' && report.gateStatus === 'pass' && report.comparedCells === 2, { verdict: report.verdict, gateStatus: report.gateStatus, comparedCells: report.comparedCells }));
    await replayManager.shutdown();
  } catch (err) {
    results.push(check('smoke.transport', 'FAIL', err instanceof Error ? err.message : String(err)));
  } finally {
    await manager.shutdown();
  }

  const executed = results.filter((r) => r.status !== 'SKIPPED');
  const failed = executed.filter((r) => r.status === 'FAIL');
  for (const r of results) {
    console.log(`[${r.status}] ${r.name}${r.evidence ? ' — ' + JSON.stringify(r.evidence).slice(0, 160) : ''}`);
  }
  console.log(`Notebook live smoke: ${executed.length - failed.length}/${executed.length} executed checks passed.`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
