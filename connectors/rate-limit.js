/**
 * Rate Limiters for tianshu-research connectors (Phase 9A).
 *
 * - MinIntervalRateLimiter: serialized in-process limiter (min gap between calls).
 * - CrossProcessRateLimiter: min-gap limiter across processes via a lock file,
 *   required by the arXiv API terms of use ("no more than one request every
 *   three seconds" per machine, not per process).
 *
 * Both are dependency-free and honor honest waiting: they never skip a call,
 * they only delay it. Stale locks (crashed holder) are taken over after a
 * bounded timeout so a crashed run cannot wedge future runs forever.
 */

import { existsSync, mkdirSync, openSync, closeSync, readFileSync, writeFileSync, unlinkSync, utimesSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

const DEFAULT_POLL_MS = 25;
const LOCK_POLL_MS = 20;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * In-process serialized limiter enforcing a minimum interval between calls.
 */
export class MinIntervalRateLimiter {
  constructor({ minIntervalMs = 3000 } = {}) {
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.lastRequestAt = 0;
    this.queue = Promise.resolve();
  }

  /**
   * Runs fn serialized, waiting so that consecutive calls are at least
   * minIntervalMs apart.
   */
  schedule(fn) {
    const run = async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestAt;
      if (this.lastRequestAt > 0 && elapsed < this.minIntervalMs) {
        await sleep(this.minIntervalMs - elapsed);
      }
      this.lastRequestAt = Date.now();
      return fn();
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => {});
    return next;
  }
}

function readJsonSafe(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Cross-process min-interval limiter backed by a lock file directory.
 *
 * Layout inside `lockDir` (default: <workspace>/.rivet/research/rate-limits):
 *   <name>.lock    — mutex; holder id + acquiredAt; O_EXCL creation
 *   <name>.state   — { lastRequestAt } written while holding the mutex
 *
 * Acquisition protocol:
 *   1. Create <name>.lock exclusively (O_EXCL). If it exists, take it over
 *      when older than staleMs (crashed holder), otherwise poll.
 *   2. Read state.lastRequestAt; sleep until lastRequestAt + minIntervalMs.
 *   3. Write new lastRequestAt BEFORE running fn (the request is considered
 *      issued at acquisition time), release the lock, then run fn.
 */
export class CrossProcessRateLimiter {
  constructor({ name, minIntervalMs = 3000, lockDir, staleMs = 60_000, pollMs = LOCK_POLL_MS, sleepFn = sleep } = {}) {
    if (!name || typeof name !== 'string') {
      throw new Error('CrossProcessRateLimiter requires a lock name');
    }
    this.name = name;
    this.minIntervalMs = Math.max(0, Number(minIntervalMs) || 0);
    this.lockDir = lockDir || join(process.cwd(), '.rivet', 'research', 'rate-limits');
    this.staleMs = Math.max(1000, Number(staleMs) || 60_000);
    this.pollMs = Math.max(1, Number(pollMs) || LOCK_POLL_MS);
    this.sleepFn = sleepFn;
    this.holderId = `pid-${process.pid}-${randomBytes(3).toString('hex')}`;
  }

  get lockPath() {
    return join(this.lockDir, `${this.name}.lock`);
  }

  get statePath() {
    return join(this.lockDir, `${this.name}.state`);
  }

  ensureDir() {
    mkdirSync(this.lockDir, { recursive: true });
  }

  lockAgeMs() {
    try {
      const st = statSync(this.lockPath);
      return Date.now() - st.mtimeMs;
    } catch {
      return 0;
    }
  }

  /**
   * Attempts to create the lock exclusively. Returns true when acquired.
   */
  tryAcquireLock() {
    this.ensureDir();
    if (existsSync(this.lockPath)) {
      // Take over a stale lock from a crashed holder.
      if (this.lockAgeMs() > this.staleMs) {
        try {
          unlinkSync(this.lockPath);
        } catch {
          return false; // another process won the takeover race
        }
      }
      return false;
    }
    try {
      const fd = openSync(this.lockPath, 'wx');
      writeFileSync(fd, JSON.stringify({ holder: this.holderId, acquiredAt: Date.now() }), 'utf8');
      closeSync(fd);
      return true;
    } catch {
      return false; // EEXIST: lost the race
    }
  }

  async acquireLock() {
    // Bounded total wait: staleMs (lock takeover) + minIntervalMs + slack.
    const deadline = Date.now() + this.staleMs + this.minIntervalMs + 30_000;
    while (!this.tryAcquireLock()) {
      if (Date.now() > deadline) {
        throw new Error(`Rate limit lock "${this.name}" could not be acquired (stale holder or contention); refusing to bypass the source rate limit.`);
      }
      await this.sleepFn(this.pollMs);
    }
  }

  releaseLock() {
    try {
      unlinkSync(this.lockPath);
    } catch {
      // Already released by a takeover; nothing to do.
    }
  }

  /**
   * Schedules fn so that across all processes sharing lockDir, calls are at
   * least minIntervalMs apart. Resolves with fn's result.
   */
  async schedule(fn) {
    await this.acquireLock();
    let waitMs = 0;
    try {
      const state = readJsonSafe(this.statePath);
      const lastRequestAt = Number(state?.lastRequestAt) || 0;
      if (lastRequestAt > 0) {
        const elapsed = Date.now() - lastRequestAt;
        if (elapsed < this.minIntervalMs) {
          waitMs = this.minIntervalMs - elapsed;
          if (waitMs > 0) await this.sleepFn(waitMs);
        }
      }
      writeFileSync(this.statePath, JSON.stringify({ lastRequestAt: Date.now(), holder: this.holderId }), 'utf8');
    } finally {
      this.releaseLock();
    }
    return fn();
  }
}

/**
 * Test helper: force a lock file to look stale.
 */
export function ageLockFile(lockDir, name, ageMs) {
  const lockPath = join(lockDir, `${name}.lock`);
  if (!existsSync(lockPath)) return;
  const past = new Date(Date.now() - ageMs);
  utimesSync(lockPath, past, past);
}
