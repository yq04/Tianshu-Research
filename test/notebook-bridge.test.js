/**
 * Test Suite: Notebook Bridge & Clean Replay (Phase 9B, plugin side)
 * Fully offline: a fake bridge fixture emulates the NDJSON kernel protocol,
 * including hidden state, late outputs, timeouts, and restart semantics.
 * Missing-kernel environments must degrade to honest `blocked`, never a
 * fabricated receipt.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NotebookKernelManager, getNotebookSession, shutdownAllNotebookSessions } from '../notebook/kernel-manager.js';
import {
  createExecutionRecord,
  recordExecution,
  analyzeRecordForReplay,
  saveNotebookDocument,
  loadNotebookDocument,
} from '../notebook/execution-record.js';
import { replayExecutionRecord, compareCellOutputs } from '../notebook/replay.js';
import { dispatchOperation } from '../operations/dispatcher.js';

const FIXTURE_DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const FAKE_BRIDGE = join(FIXTURE_DIR, 'fake-bridge.mjs');

describe('Phase 9B: Notebook Bridge & Clean Replay', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-notebook-test-'));
  });

  afterEach(async () => {
    await shutdownAllNotebookSessions();
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  const makeManager = (sessionName = 'default', extra = {}) =>
    new NotebookKernelManager({
      workspace: tempDir,
      sessionName,
      bridgeCommand: [process.execPath, FAKE_BRIDGE],
      startTimeoutMs: 10_000,
      ...extra,
    });

  const fakeReply = (status = 'ok', outputs = [], epoch = 1) => ({ status, outputs, epoch });

  it('starts a session, executes a cell, and reports honest outputs', async () => {
    const manager = makeManager();
    const reply = await manager.execute('ECHO:hello kernel');
    assert.equal(reply.status, 'ok');
    assert.equal(reply.epoch, 1);
    assert.equal(reply.outputs[0].text, 'hello kernel');
    assert.equal(reply.outputs[0].kind, 'stream');
    await manager.shutdown();
  });

  it('counts epochs across restarts (fresh kernel state)', async () => {
    const manager = makeManager();
    await manager.execute('X = 1');
    const before = await manager.execute('X');
    assert.equal(before.status, 'ok');
    assert.equal(before.outputs[0].repr, '1');

    const restartRes = await manager.restart();
    assert.equal(restartRes.ok, true);
    assert.equal(manager.epoch, 2);

    // Hidden state is gone after the restart — honest NameError, not stale data.
    const after = await manager.execute('X');
    assert.equal(after.status, 'error');
    assert.equal(after.error.ename, 'NameError');
    assert.equal(after.epoch, 2);
    await manager.shutdown();
  });

  it('reports cell errors honestly instead of faking success', async () => {
    const manager = makeManager();
    const reply = await manager.execute('1/0  # FAIL');
    assert.equal(reply.status, 'error');
    assert.equal(reply.error.ename, 'ValueError');
    assert.ok(reply.outputs.some((o) => o.kind === 'error'));
    await manager.shutdown();
  });

  it('enforces the cell deadline and reports timeout', async () => {
    const manager = makeManager();
    const reply = await manager.execute('while True: pass  # HANG', { timeoutMs: 300 });
    assert.equal(reply.status, 'timeout');
    assert.equal(reply.error.ename, 'CellTimeout');
    assert.equal(reply.outputs[0].text, 'partial'); // partial outputs preserved
    await manager.shutdown();
  });

  it('captures late outputs that arrive after the reply', async () => {
    const manager = makeManager();
    const reply = await manager.execute('LATE');
    assert.equal(reply.status, 'ok');
    await new Promise((r) => setTimeout(r, 120));
    const late = manager.takeLateOutputs(reply.msgId);
    assert.equal(late.length, 1);
    assert.equal(late[0].text, 'late flush');
    assert.equal(manager.takeLateOutputs(reply.msgId).length, 0); // drained
    await manager.shutdown();
  });

  it('degrades to honest blocked when the kernel environment is unavailable', async () => {
    const manager = makeManager('broken', {
      bridgeCommand: [process.execPath, '-e', 'console.log(JSON.stringify({type:"unavailable",reason:"jupyter_client not installed (fake)"}))'],
      startTimeoutMs: 5_000,
    });
    const reply = await manager.execute('1+1');
    assert.equal(reply.status, 'blocked');
    assert.match(reply.reason, /jupyter_client/);
    await manager.shutdown();
  });

  describe('execution record eligibility', () => {
    it('accepts a monotonic single-epoch all-ok record', () => {
      const record = createExecutionRecord('s');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'b=2', reply: fakeReply('ok', [], 1) });
      const analysis = analyzeRecordForReplay(record);
      assert.equal(analysis.eligible, true);
      assert.deepEqual(analysis.reasons, []);
    });

    it('refuses out-of-order cells (hidden-state risk)', () => {
      const record = createExecutionRecord('s');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'b=2', reply: fakeReply('ok', [], 1) });
      record.cells[0].cellIndex = 5; // executed after cell 1 -> non-monotonic order
      const analysis = analyzeRecordForReplay(record);
      assert.equal(analysis.eligible, false);
      assert.ok(analysis.reasons.includes('OUT_OF_ORDER_CELLS'));
    });

    it('refuses multi-epoch sessions and non-ok cells', () => {
      const record = createExecutionRecord('s');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'b=2', reply: fakeReply('error', [], 2) });
      const analysis = analyzeRecordForReplay(record);
      assert.equal(analysis.eligible, false);
      assert.ok(analysis.reasons.includes('MULTI_EPOCH_SESSION'));
      assert.ok(analysis.reasons.some((r) => r.startsWith('NON_OK_CELLS')));
    });

    it('refuses an empty record', () => {
      const analysis = analyzeRecordForReplay(createExecutionRecord('s'));
      assert.equal(analysis.eligible, false);
      assert.ok(analysis.reasons.includes('RECORD_EMPTY'));
    });
  });

  describe('clean fresh-kernel replay', () => {
    it('compares outputs ignoring non-semantic fields', () => {
      const a = [{ kind: 'stream', name: 'stdout', text: 'x' }];
      const b = [{ kind: 'stream', name: 'stdout', text: 'x' }];
      assert.equal(compareCellOutputs(a, b), true);
      const withCount = [{ kind: 'execute_result', repr: '1', executionCount: 7 }];
      const withCount2 = [{ kind: 'execute_result', repr: '1', executionCount: 99 }];
      assert.equal(compareCellOutputs(withCount, withCount2), true);
      assert.equal(compareCellOutputs(a, [{ kind: 'stream', name: 'stdout', text: 'y' }]), false);
    });

    it('reproduces an eligible record in a fresh kernel', async () => {
      const record = createExecutionRecord('ok-session');
      recordExecution(record, { code: 'X = 1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'ECHO:done', reply: fakeReply('ok', [{ kind: 'stream', name: 'stdout', text: 'done' }], 1) });
      recordExecution(record, { code: 'X', reply: fakeReply('ok', [{ kind: 'execute_result', repr: '1' }], 1) });

      const replayManager = makeManager('ok-session:replay');
      const report = await replayExecutionRecord(record, replayManager);
      assert.equal(report.verdict, 'reproduced');
      assert.equal(report.gateStatus, 'pass');
      assert.equal(report.comparedCells, 3);
      assert.ok(report.cells.every((c) => c.match));
      await replayManager.shutdown();
    });

    it('diverges honestly when the record depends on hidden state outside the record', async () => {
      // The original session read X successfully, but the assignment happened
      // in an EARLIER session that is not part of this record. A fresh kernel
      // cannot reproduce a read of state it never saw — the replay must
      // report divergence, never fabricate equivalence.
      const record = createExecutionRecord('hidden');
      recordExecution(record, {
        code: 'X',
        reply: fakeReply('ok', [{ kind: 'execute_result', repr: '1' }], 1),
      });

      const replayManager = makeManager('hidden:replay');
      const report = await replayExecutionRecord(record, replayManager);
      assert.equal(report.verdict, 'diverged');
      assert.equal(report.gateStatus, 'fail');
      assert.equal(report.cells[0].match, false);
      assert.equal(report.cells[0].replayStatus, 'error');
      assert.equal(report.cells[0].replayError.ename, 'NameError');
      await replayManager.shutdown();
    });

    it('refuses the formal gate for out-of-order records without pretending', async () => {
      const record = createExecutionRecord('ooo');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'b=2', reply: fakeReply('ok', [], 1) });
      record.cells[0].cellIndex = 9;

      const replayManager = makeManager('ooo:replay');
      const report = await replayExecutionRecord(record, replayManager);
      assert.equal(report.verdict, 'not_comparable');
      assert.equal(report.gateStatus, 'inconclusive');
      assert.ok(report.reasons.includes('OUT_OF_ORDER_CELLS'));
      await replayManager.shutdown();
    });

    it('reports blocked honestly when the kernel environment is missing', async () => {
      const record = createExecutionRecord('blocked');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });

      const replayManager = makeManager('blocked:replay', {
        bridgeCommand: [process.execPath, '-e', 'console.log(JSON.stringify({type:"unavailable",reason:"jupyter_client not installed (fake)"}))'],
        startTimeoutMs: 5_000,
      });
      const report = await replayExecutionRecord(record, replayManager);
      assert.equal(report.verdict, 'blocked');
      assert.equal(report.gateStatus, 'blocked');
      await replayManager.shutdown();
    });
  });

  describe('operation catalogue integration', () => {
    it('notebook.execute@1 executes, records, and persists the session record', async () => {
      getNotebookSession(tempDir, 'default', { bridgeCommand: [process.execPath, FAKE_BRIDGE], startTimeoutMs: 10_000 });
      const res = await dispatchOperation('notebook.execute@1', { code: 'ECHO:via dispatcher' }, { workspace: tempDir });

      assert.equal(res.status, 'completed');
      assert.equal(res.data.status, 'ok');
      assert.ok(res.data.recordPath);
      const persisted = loadNotebookDocument(tempDir, 'default.record');
      assert.ok(persisted);
      assert.equal(persisted.cells.length, 1);
      assert.equal(persisted.cells[0].outputs[0].text, 'via dispatcher');
    });

    it('notebook.execute@1 blocks honestly when the kernel is unavailable', async () => {
      getNotebookSession(tempDir, 'broken-session', {
        bridgeCommand: [process.execPath, '-e', 'console.log(JSON.stringify({type:"unavailable",reason:"jupyter_client not installed (fake)"}))'],
        startTimeoutMs: 5_000,
      });
      const res = await dispatchOperation('notebook.execute@1', { code: '1+1', sessionName: 'broken-session' }, { workspace: tempDir });
      assert.equal(res.status, 'blocked');
      assert.match(res.summary, /jupyter_client/);
      assert.ok(res.issues.some((i) => i.code === 'KERNEL_UNAVAILABLE'));
    });

    it('notebook.replay@1 returns a fail gate for diverging records', async () => {
      const record = createExecutionRecord('diverge');
      recordExecution(record, { code: 'X', reply: fakeReply('ok', [{ kind: 'execute_result', repr: '1' }], 1) });
      saveNotebookDocument(tempDir, 'diverge.record', record);

      getNotebookSession(tempDir, 'diverge.record:replay', { bridgeCommand: [process.execPath, FAKE_BRIDGE], startTimeoutMs: 10_000 });
      const res = await dispatchOperation('notebook.replay@1', { recordName: 'diverge.record' }, { workspace: tempDir });

      assert.equal(res.status, 'completed');
      assert.equal(res.data.verdict, 'diverged');
      assert.equal(res.data.gateStatus, 'fail');
      assert.ok(res.issues.some((i) => i.code === 'REPLAY_DIVERGED'));
      assert.ok(existsSync(join(tempDir, '.rivet', 'research', 'notebook', 'diverge.record.replay.json')));
    });

    it('notebook.replay@1 is inconclusive (not comparable) for out-of-order records', async () => {
      const record = createExecutionRecord('ooo2');
      recordExecution(record, { code: 'a=1', reply: fakeReply('ok', [], 1) });
      recordExecution(record, { code: 'b=2', reply: fakeReply('ok', [], 1) });
      record.cells[0].cellIndex = 4;
      saveNotebookDocument(tempDir, 'ooo2.record', record);

      const res = await dispatchOperation('notebook.replay@1', { recordName: 'ooo2.record' }, { workspace: tempDir });
      assert.equal(res.status, 'completed');
      assert.equal(res.data.verdict, 'not_comparable');
      assert.equal(res.data.gateStatus, 'inconclusive');
    });

    it('notebook.replay@1 fails honestly when the record does not exist', async () => {
      const res = await dispatchOperation('notebook.replay@1', { recordName: 'nope.record' }, { workspace: tempDir });
      assert.equal(res.status, 'failed');
      assert.ok(res.issues.some((i) => i.code === 'RECORD_NOT_FOUND'));
    });

    it('notebook.execute@1 fails honestly on cell errors and persists them', async () => {
      getNotebookSession(tempDir, 'default', { bridgeCommand: [process.execPath, FAKE_BRIDGE], startTimeoutMs: 10_000 });
      const res = await dispatchOperation('notebook.execute@1', { code: 'raise RuntimeError  # FAIL' }, { workspace: tempDir });
      assert.equal(res.status, 'failed');
      assert.equal(res.data.status, 'error');
      assert.ok(res.issues.some((i) => i.code === 'CELL_ERROR'));
      const persisted = loadNotebookDocument(tempDir, 'default.record');
      assert.equal(persisted.cells.at(-1).status, 'error');
    });
  });
});
