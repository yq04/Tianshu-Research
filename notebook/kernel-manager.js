/**
 * Jupyter Kernel Manager for tianshu-research (Phase 9B, Node side).
 *
 * Owns one kernel bridge subprocess (notebook/bridge.py, NDJSON over stdio)
 * per session and exposes an honest, correlation-safe execution API:
 *  - message correlation by msgId (execute requests never cross wires);
 *  - epoch counting (incremented on confirmed restart — fresh kernel state);
 *  - late outputs emitted by the kernel after the reply are captured, never
 *    silently dropped;
 *  - timeout is enforced by the bridge (interrupt + honest "timeout" status);
 *    a dead bridge surfaces as a blocked session, never a synthetic result;
 *  - a missing Python / jupyter_client environment degrades to
 *    { status: 'blocked' } — formal gates must treat it as not runnable.
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createExecutionRecord } from './execution-record.js';

const BRIDGE_PATH = join(dirname(fileURLToPath(import.meta.url)), 'bridge.py');
const DEFAULT_EXECUTE_TIMEOUT_MS = 60_000;
const START_TIMEOUT_MS = 15_000;

function randomId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export class NotebookKernelManager {
  /**
   * @param {object} options
   * @param {string} options.workspace - research workspace root
   * @param {string} [options.sessionName='default']
   * @param {string[]} [options.bridgeCommand] - override spawn command (tests)
   * @param {string} [options.pythonBin='python']
   * @param {string} [options.kernelName='python3']
   * @param {number} [options.startTimeoutMs]
   */
  constructor(options = {}) {
    this.workspace = resolve(options.workspace || process.cwd());
    this.sessionName = options.sessionName || 'default';
    this.bridgeCommand = options.bridgeCommand || [
      options.pythonBin || process.env.TIANSHU_PYTHON || 'python',
      '-u',
      BRIDGE_PATH,
    ];
    this.kernelName = options.kernelName || 'python3';
    this.startTimeoutMs = options.startTimeoutMs || START_TIMEOUT_MS;

    this.child = null;
    this.epoch = 0;
    this.readyConfirmed = false;
    this.unavailableReason = null;
    this.pending = new Map(); // msgId -> { resolve }
    this.lateOutputs = new Map(); // msgId -> output[]
    this.statusWaiters = []; // { resolve, state }
    this.bridgeError = null;
    this.closed = false;
  }

  #send(command) {
    if (!this.child || this.child.killed) {
      throw new Error(`Notebook bridge for session "${this.sessionName}" is not running`);
    }
    this.child.stdin.write(JSON.stringify(command) + '\n');
  }

  #handleLine(line) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      return; // tolerate non-NDJSON noise on stderr-ish output
    }
    switch (event.type) {
      case 'unavailable':
        this.unavailableReason = event.reason || 'notebook bridge unavailable';
        this.#resolveStatusWaiters('unavailable');
        this.#flushPendingBlocked();
        break;
      case 'ready':
        this.readyConfirmed = true;
        this.#resolveStatusWaiters('ready');
        break;
      case 'status': {
        if (event.state === 'started') {
          if (this.epoch === 0) this.epoch = 1;
        } else if (event.state === 'restarted') {
          this.epoch += 1;
        }
        this.#resolveStatusWaiters(event.state);
        break;
      }
      case 'execute_reply': {
        const waiter = this.pending.get(event.msgId);
        if (waiter) {
          this.pending.delete(event.msgId);
          waiter.resolve(this.#normalizeReply(event));
        }
        break;
      }
      case 'late_output': {
        const list = this.lateOutputs.get(event.msgId) || [];
        list.push(event.output);
        this.lateOutputs.set(event.msgId, list);
        break;
      }
      case 'bridge_error':
        this.bridgeError = event.message;
        break;
      default:
        break;
    }
  }

  #resolveStatusWaiters(state) {
    const waiters = this.statusWaiters.filter((w) => w.state === state);
    this.statusWaiters = this.statusWaiters.filter((w) => w.state !== state);
    waiters.forEach((w) => w.resolve({ type: 'status', state }));
  }

  #normalizeReply(event) {
    return {
      msgId: event.msgId,
      status: event.status, // ok | error | timeout
      executionCount: event.executionCount ?? null,
      outputs: Array.isArray(event.outputs) ? event.outputs : [],
      error: event.error || null,
      epoch: this.epoch,
    };
  }

  #flushPendingBlocked() {
    for (const [, waiter] of this.pending) {
      waiter.resolve({ status: 'blocked', reason: this.unavailableReason, outputs: [] });
    }
    this.pending.clear();
  }

  #waitForStatus(state, timeoutMs) {
    return new Promise((resolvePromise, rejectPromise) => {
      let wrappedResolve;
      const timer = setTimeout(() => {
        this.statusWaiters = this.statusWaiters.filter((w) => w.resolve !== wrappedResolve);
        rejectPromise(new Error(`Notebook bridge did not report "${state}" within ${timeoutMs}ms`));
      }, timeoutMs);
      wrappedResolve = (event) => {
        clearTimeout(timer);
        resolvePromise(event);
      };
      this.statusWaiters.push({ state, resolve: wrappedResolve });
    });
  }

  /**
   * Spawns the bridge and waits for `ready` (or an honest `unavailable`).
   * Then starts the kernel session (epoch 1). Returns { ok: true } or
   * { ok: false, blocked: true, reason } — never a fabricated success.
   */
  async ensureStarted() {
    if (this.unavailableReason) {
      return { ok: false, blocked: true, reason: this.unavailableReason };
    }
    if (this.child && !this.child.killed && this.epoch > 0) return { ok: true };

    let child;
    try {
      child = spawn(this.bridgeCommand[0], this.bridgeCommand.slice(1), {
        // Deliberately NOT cwd=workspace: a dead/lagging child must never pin
        // the workspace (or a test temp dir) against deletion on Windows.
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    } catch (err) {
      this.unavailableReason = `failed to spawn notebook bridge: ${err?.message || err}`;
      return { ok: false, blocked: true, reason: this.unavailableReason };
    }

    child.on('error', (err) => {
      this.unavailableReason = `notebook bridge spawn error: ${err?.message || err} (is Python available?)`;
      this.#flushPendingBlocked();
    });
    child.on('exit', (code) => {
      if (this.pending.size > 0) {
        this.unavailableReason = this.unavailableReason
          || `notebook bridge exited unexpectedly (code ${code})`;
        this.#flushPendingBlocked();
      }
      this.child = null;
    });

    const readline = createInterface({ input: child.stdout });
    readline.on('line', (line) => this.#handleLine(line));
    child.stderr.on('data', () => {}); // drained; bridge keeps stderr for tracebacks

    this.child = child;
    try {
      await Promise.race([
        this.#waitForStatus('ready', this.startTimeoutMs),
        this.#waitForStatus('unavailable', this.startTimeoutMs),
      ]);
    } catch {
      // neither ready nor unavailable arrived in time — fall through to blocked
    }
    if (this.unavailableReason) {
      return { ok: false, blocked: true, reason: this.unavailableReason };
    }
    if (!this.readyConfirmed) {
      this.unavailableReason = `notebook bridge failed to become ready within ${this.startTimeoutMs}ms`;
      return { ok: false, blocked: true, reason: this.unavailableReason };
    }
    if (this.epoch === 0) {
      try {
        this.#send({ type: 'start', kernelName: this.kernelName });
        await this.#waitForStatus('started', this.startTimeoutMs);
      } catch (err) {
        this.unavailableReason = `notebook kernel failed to start: ${err?.message || err}`;
        return { ok: false, blocked: true, reason: this.unavailableReason };
      }
    }
    return { ok: true };
  }

  /**
   * Executes code in the kernel. Resolves with:
   *   { status: 'ok' | 'error' | 'timeout' | 'blocked', outputs, error?, epoch }
   * 'blocked' means the environment genuinely cannot run notebooks — callers
   * must surface it as such and never fabricate a receipt.
   */
  async execute(code, { timeoutMs = DEFAULT_EXECUTE_TIMEOUT_MS } = {}) {
    const started = await this.ensureStarted();
    if (!started.ok) {
      return { status: 'blocked', reason: started.reason, outputs: [], epoch: this.epoch };
    }
    const msgId = randomId('nbmsg');
    const reply = await new Promise((resolvePromise) => {
      this.pending.set(msgId, { resolve: resolvePromise });
      try {
        this.#send({ type: 'execute', msgId, code: String(code ?? ''), timeoutMs });
      } catch (err) {
        this.pending.delete(msgId);
        resolvePromise({ status: 'blocked', reason: err?.message || String(err), outputs: [] });
      }
    });
    return reply;
  }

  /** Outputs that arrived after the reply for a given msgId. */
  takeLateOutputs(msgId) {
    const list = this.lateOutputs.get(msgId) || [];
    this.lateOutputs.delete(msgId);
    return list;
  }

  /** Interrupts the current cell (if any). */
  async interrupt() {
    if (!this.child) return { ok: false };
    this.#send({ type: 'interrupt' });
    try {
      await this.#waitForStatus('interrupted', 5000);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  /**
   * Restarts to a fresh kernel. Confirmations bump the epoch; the promise
   * resolves only after the bridge reports `restarted`.
   */
  async restart() {
    const started = await this.ensureStarted();
    if (!started.ok) {
      return { ok: false, blocked: true, reason: started.reason };
    }
    this.#send({ type: 'restart', kernelName: this.kernelName });
    try {
      await this.#waitForStatus('restarted', this.startTimeoutMs);
      return { ok: true, epoch: this.epoch };
    } catch (err) {
      return { ok: false, error: err?.message || String(err) };
    }
  }

  /** Shuts the kernel and bridge down. Idempotent, never waits on a dead child. */
  async shutdown() {
    this.closed = true;
    const child = this.child;
    this.child = null;
    this.pending.clear();
    if (!child) return { ok: true };
    try {
      if (child.exitCode === null && !child.killed) {
        child.stdin.write(JSON.stringify({ type: 'shutdown' }) + '\n');
        await new Promise((resolve) => setTimeout(resolve, 50)); // grace for clean exit
      }
    } catch {
      // stdin already gone — the bridge is dead; nothing to wait for
    }
    try {
      child.kill();
    } catch {
      // already gone
    }
    return { ok: true };
  }

  isRunning() {
    return Boolean(this.child && !this.child.killed);
  }
}

/**
 * Session registry: one manager + execution record per (workspace, session).
 */
const SESSION_REGISTRY = new Map();

export function getNotebookSession(workspace, sessionName = 'default', options = {}) {
  const key = `${resolve(workspace)}::${sessionName}`;
  if (!SESSION_REGISTRY.has(key)) {
    const manager = new NotebookKernelManager({ workspace, sessionName, ...options });
    SESSION_REGISTRY.set(key, {
      manager,
      sessionName,
      workspace: resolve(workspace),
      record: createExecutionRecord(sessionName),
    });
  }
  return SESSION_REGISTRY.get(key);
}

/** Shuts down all sessions in this process (used by tests and teardown). */
export async function shutdownAllNotebookSessions() {
  const entries = [...SESSION_REGISTRY.values()];
  SESSION_REGISTRY.clear();
  await Promise.all(entries.map((entry) => entry.manager.shutdown()));
}
