/**
 * Deterministic Job Executor for tianshu-research.
 * Executes RunSpec jobs via safe child process spawning or inline operator dispatch.
 * Records truthful stdout/stderr accounting and produces immutable RunReceipts.
 * Enforces settle-once concurrency guards, real process-tree termination on cancellation,
 * and truthful status reporting backed by RunStore.
 */

import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRunReceipt } from './run-receipt.js';
import { dispatchOperation } from '../operations/dispatcher.js';
import { saveArtifact } from '../ledger/artifact-store.js';
import { recordRun, updateRun, getRun } from './run-store.js';
import { terminateProcessTree } from './process-control.js';

const activeRuns = new Map();

export function getRunDir(workspace = process.cwd(), runId) {
  return join(resolve(workspace), '.rivet', 'research', 'runs', runId);
}

/**
 * Executes a RunSpec and returns a verifiable RunReceipt.
 */
export async function executeRunSpec(workspace, spec, options = {}) {
  const ws = resolve(workspace || process.cwd());
  const runId = spec.runId;
  const runDir = getRunDir(ws, runId);
  mkdirSync(runDir, { recursive: true });

  // 1. Persist RunSpec
  writeFileSync(join(runDir, 'run_spec.json'), JSON.stringify(spec, null, 2), 'utf8');

  const startTime = new Date().toISOString();
  recordRun(ws, {
    runId,
    spec,
    status: 'running',
    startTime,
  });

  // 2. Branch: Executable child process
  if (spec.executable && spec.executable.path) {
    const execPath = spec.executable.path;
    const argv = spec.executable.argv || [];
    const timeoutMs = (spec.limits?.wallSeconds || 60) * 1000;
    const maxBytes = spec.limits?.maxOutputBytes || 1024 * 1024;
    const activeKey = `${ws}::${runId}`;

    return new Promise((resolvePromise) => {
      let stdoutBuf = '';
      let stderrBuf = '';
      let settled = false;
      let timer = null;

      let child;
      try {
        child = spawn(execPath, argv, {
          cwd: ws,
          shell: false, // strictly avoid shell string interpolation
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        });
      } catch (err) {
        const endTime = new Date().toISOString();
        const receipt = createRunReceipt({
          runId,
          operationId: spec.operationId,
          specDigest: spec.specDigest,
          status: 'failed',
          exitCode: 1,
          startTime,
          endTime,
          metrics: { stdoutBytes: 0, stderrBytes: 0 },
          error: 'Failed to spawn process: ' + (err instanceof Error ? err.message : String(err)),
        });
        writeFileSync(join(runDir, 'run_receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');
        recordRun(ws, {
          runId,
          status: 'failed',
          exitCode: 1,
          endTime,
          receipt,
        });
        return resolvePromise({ receipt, error: err });
      }

      recordRun(ws, {
        runId,
        pid: child.pid,
        status: 'running',
      });

      function settle(finalStatus, exitCode, errorMsg, isTimeout = false, isCancel = false) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        activeRuns.delete(activeKey);

        const endTime = new Date().toISOString();
        const resolvedExitCode = isTimeout ? 124 : (isCancel ? 130 : (typeof exitCode === 'number' ? exitCode : 1));
        const effectiveStatus = (resolvedExitCode === 0 && !isTimeout && !isCancel) ? 'completed' : (isCancel ? 'cancelled' : (isTimeout ? 'timed_out' : 'failed'));

        // Write logs
        writeFileSync(join(runDir, 'stdout.log'), stdoutBuf, 'utf8');
        writeFileSync(join(runDir, 'stderr.log'), stderrBuf, 'utf8');

        // Save stdout as artifact if non-empty
        const outputs = [];
        if (stdoutBuf.length > 0) {
          try {
            const art = saveArtifact(ws, stdoutBuf, {
              kind: 'report',
              mediaType: 'text/plain',
              filename: 'stdout.txt',
              producedByRunId: runId,
            });
            outputs.push(art);
          } catch {}
        }

        const receipt = createRunReceipt({
          runId,
          operationId: spec.operationId,
          specDigest: spec.specDigest,
          status: effectiveStatus,
          exitCode: resolvedExitCode,
          startTime,
          endTime,
          outputs,
          metrics: {
            stdoutBytes: Buffer.byteLength(stdoutBuf),
            stderrBytes: Buffer.byteLength(stderrBuf),
          },
          error: errorMsg || (isTimeout ? 'Process exceeded wall time limit of ' + (timeoutMs / 1000) + 's' : (isCancel ? 'Process cancelled by user' : (resolvedExitCode !== 0 ? 'Process exited with code ' + resolvedExitCode : undefined))),
        });

        writeFileSync(join(runDir, 'run_receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');

        recordRun(ws, {
          runId,
          status: effectiveStatus,
          exitCode: resolvedExitCode,
          endTime,
          receipt,
          artifacts: outputs,
          metrics: receipt.metrics,
        });

        resolvePromise({ receipt, stdout: stdoutBuf, stderr: stderrBuf, error: errorMsg });
      }

      const activeEntry = {
        child,
        settle,
        cancelRequested: false,
        cancelReason: null,
      };
      activeRuns.set(activeKey, activeEntry);

      timer = setTimeout(async () => {
        if (child.pid) {
          await terminateProcessTree(child.pid);
        }
        settle('timed_out', 124, 'Process exceeded wall time limit of ' + (timeoutMs / 1000) + 's', true, false);
      }, timeoutMs);

      child.stdout.on('data', (chunk) => {
        if (stdoutBuf.length < maxBytes) {
          stdoutBuf += chunk.toString('utf8');
        }
      });

      child.stderr.on('data', (chunk) => {
        if (stderrBuf.length < maxBytes) {
          stderrBuf += chunk.toString('utf8');
        }
      });

      child.on('close', (code, signal) => {
        if (activeEntry.cancelRequested) {
          settle('cancelled', 130, activeEntry.cancelReason || 'Process cancelled by user', false, true);
          return;
        }
        const exitCode = (code !== null && code !== undefined) ? code : (signal ? 128 : 1);
        const status = exitCode === 0 ? 'completed' : 'failed';
        settle(status, exitCode, exitCode !== 0 ? 'Process exited with code ' + exitCode + (signal ? ' (signal: ' + signal + ')' : '') : undefined);
      });

      child.on('error', (err) => {
        settle('failed', 1, err.message);
      });
    });
  }

  // 3. Branch: Inline operation execution
  const opResult = await dispatchOperation(spec.operationId, spec.parameters, {
    workspace: ws,
    scope: options.scope,
  });

  const endTime = new Date().toISOString();
  const exitCode = opResult.status === 'completed' ? 0 : 1;
  const status = opResult.status === 'completed' ? 'completed' : 'failed';

  const receipt = createRunReceipt({
    runId,
    operationId: spec.operationId,
    specDigest: spec.specDigest,
    status,
    exitCode,
    startTime,
    endTime,
    outputs: opResult.artifacts || [],
    metrics: {
      stdoutBytes: 0,
      stderrBytes: 0,
      resourceUsage: opResult.measurements || {},
    },
    error: opResult.issues?.find(i => i.severity === 'error')?.message,
  });

  writeFileSync(join(runDir, 'run_receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');
  recordRun(ws, {
    runId,
    status,
    exitCode,
    endTime,
    receipt,
    artifacts: opResult.artifacts || [],
    metrics: receipt.metrics,
  });

  return { receipt, result: opResult };
}

/**
 * Cancels a running job and records a cancelled RunReceipt.
 */
export async function cancelRun(workspace, runId, reason = 'User requested cancellation') {
  const ws = resolve(workspace || process.cwd());
  const rId = String(runId || '').trim();
  const run = getRun(ws, rId);
  if (!run) {
    return { success: false, status: 'not_found', error: 'Run ' + rId + ' not found in workspace' };
  }

  const activeKey = `${ws}::${rId}`;
  const active = activeRuns.get(activeKey);

  if (['completed', 'failed', 'cancelled', 'timed_out'].includes(run.status)) {
    return { success: true, status: run.status, note: 'Run already in terminal state' };
  }

  if (active) {
    active.cancelRequested = true;
    active.cancelReason = reason;
    if (active.child && active.child.pid) {
      await terminateProcessTree(active.child.pid);
    }
    active.settle('cancelled', 130, reason, false, true);
    return { success: true, status: 'cancelled', runId: rId, reason };
  }

  if (run.pid) {
    await terminateProcessTree(run.pid);
  }

  const receipt = createRunReceipt({
    runId: rId,
    operationId: run.spec?.operationId || 'unknown',
    specDigest: run.spec?.specDigest || '',
    status: 'cancelled',
    exitCode: 130,
    startTime: run.startTime || new Date().toISOString(),
    endTime: new Date().toISOString(),
    metrics: { stdoutBytes: 0, stderrBytes: 0 },
    error: reason,
  });

  const runDir = getRunDir(ws, rId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'run_receipt.json'), JSON.stringify(receipt, null, 2), 'utf8');

  updateRun(ws, rId, {
    status: 'cancelled',
    exitCode: 130,
    endTime: new Date().toISOString(),
    receipt,
  });

  return { success: true, status: 'cancelled', runId: rId, reason };
}

export function getRunStatus(workspace, runId) {
  const ws = resolve(workspace || process.cwd());
  const run = getRun(ws, runId);
  if (!run) {
    return { status: 'not_found', receipt: null };
  }
  return {
    status: run.status,
    receipt: run.receipt || null,
    metrics: run.metrics || null,
    exitCode: run.exitCode,
    pid: run.pid,
  };
}
