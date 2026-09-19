#!/usr/bin/env node
/**
 * Fake notebook bridge for OFFLINE deterministic tests (Phase 9B).
 * Implements the same NDJSON protocol as notebook/bridge.py with canned
 * behaviors keyed by markers in the executed code:
 *   'ECHO:<text>' -> ok + stream output <text>
 *   'FAIL'        -> error cell (ValueError/FAIL)
 *   'HANG'        -> replies 'timeout' shortly after the deadline
 *   'LATE'        -> ok, then a late_output arrives after the reply
 *   'X = 1'       -> hidden state assignment
 *   'X'           -> reads hidden state (NameError before assignment)
 * Anything else  -> ok with empty outputs.
 * 'RESTART_WIPES' semantics are implicit: restart resets hidden state.
 */

import readline from 'node:readline';

let hiddenState;
let counter = 0;

const emit = (event) => process.stdout.write(JSON.stringify(event) + '\n');

emit({ type: 'ready', protocolVersion: 1 });

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let cmd;
  try {
    cmd = JSON.parse(line);
  } catch {
    emit({ type: 'bridge_error', message: 'malformed command' });
    return;
  }

  switch (cmd.type) {
    case 'start':
      emit({ type: 'status', state: 'started' });
      break;

    case 'restart':
      hiddenState = undefined;
      counter = 0;
      emit({ type: 'status', state: 'restarted' });
      break;

    case 'interrupt':
      emit({ type: 'status', state: 'interrupted' });
      break;

    case 'shutdown':
      emit({ type: 'status', state: 'shutdown' });
      process.exit(0);
      break;

    case 'execute': {
      const code = String(cmd.code ?? '');
      counter += 1;
      const finishOk = (outputs, extraExecutionCount = counter) => {
        emit({ type: 'execute_reply', msgId: cmd.msgId, status: 'ok', executionCount: extraExecutionCount, outputs });
      };

      if (code.startsWith('ECHO:')) {
        finishOk([{ kind: 'stream', name: 'stdout', text: code.slice(5) }]);
        return;
      }
      if (code.includes('FAIL')) {
        emit({
          type: 'execute_reply',
          msgId: cmd.msgId,
          status: 'error',
          executionCount: counter,
          outputs: [{ kind: 'error', ename: 'ValueError', evalue: 'FAIL' }],
          error: { ename: 'ValueError', evalue: 'FAIL' },
        });
        return;
      }
      if (code.includes('HANG')) {
        const deadline = Number(cmd.timeoutMs ?? 60000) + 120;
        setTimeout(() => {
          emit({
            type: 'execute_reply',
            msgId: cmd.msgId,
            status: 'timeout',
            executionCount: null,
            outputs: [{ kind: 'stream', name: 'stdout', text: 'partial' }],
            error: { ename: 'CellTimeout', evalue: 'deadline exceeded' },
          });
        }, deadline);
        return;
      }
      if (code.includes('LATE')) {
        finishOk([{ kind: 'stream', name: 'stdout', text: 'done' }]);
        setTimeout(() => {
          emit({ type: 'late_output', msgId: cmd.msgId, output: { kind: 'stream', name: 'stdout', text: 'late flush' } });
        }, 30);
        return;
      }
      if (code.trim() === 'X = 1') {
        hiddenState = 1;
        finishOk([]);
        return;
      }
      if (code.trim() === 'X') {
        if (hiddenState === undefined) {
          emit({
            type: 'execute_reply',
            msgId: cmd.msgId,
            status: 'error',
            executionCount: counter,
            outputs: [{ kind: 'error', ename: 'NameError', evalue: "name 'X' is not defined" }],
            error: { ename: 'NameError', evalue: "name 'X' is not defined" },
          });
        } else {
          finishOk([{ kind: 'execute_result', repr: String(hiddenState), executionCount: counter }]);
        }
        return;
      }
      finishOk([]);
      break;
    }

    default:
      emit({ type: 'bridge_error', message: 'unknown command type: ' + String(cmd.type) });
  }
});
