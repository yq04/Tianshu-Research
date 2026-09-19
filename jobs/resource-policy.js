/**
 * Resource Policy for tianshu-research job execution (Phase 10).
 *
 * Fail-closed guard applied before a run is admitted to any backend:
 * wall-time / output-size ceilings, executable containment inside the
 * workspace, and concurrency caps. A run that exceeds policy is REFUSED —
 * policy violations are honest refusals, never silently clamped.
 */

import { resolve, sep, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';

export class PolicyViolationError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'PolicyViolationError';
    this.code = code;
  }
}

export function createResourcePolicy({
  workspace,
  maxWallSeconds = 3600,
  maxOutputBytes = 64 * 1024 * 1024,
  maxConcurrentRuns = 4,
  maxMemoryBytes = Number.POSITIVE_INFINITY,
} = {}) {
  if (!workspace) throw new PolicyViolationError('resource policy requires a workspace root', 'POLICY_INVALID');
  return {
    workspaceRoot: resolve(workspace),
    maxWallSeconds,
    maxOutputBytes,
    maxConcurrentRuns,
    maxMemoryBytes,
  };
}

function assertInsideWorkspace(workspaceRoot, execPath) {
  const rootWithSep = workspaceRoot.endsWith(sep) ? workspaceRoot : workspaceRoot + sep;
  const resolved = resolve(execPath);
  if (!resolved.startsWith(rootWithSep)) {
    throw new PolicyViolationError(
      `executable "${resolved}" is outside the workspace root "${workspaceRoot}" — refusing to execute`,
      'EXECUTABLE_OUTSIDE_WORKSPACE',
    );
  }
  if (!existsSync(resolved)) {
    throw new PolicyViolationError(`executable "${resolved}" does not exist on disk`, 'EXECUTABLE_MISSING');
  }
  return resolved;
}

/**
 * Validates a RunSpec against the policy. Throws PolicyViolationError on the
 * first violation. `activeRunCount` enables the concurrency ceiling.
 */
export function assertRunAllowed(policy, spec, { activeRunCount = 0 } = {}) {
  if (!policy || !spec) throw new PolicyViolationError('policy and spec are required', 'POLICY_INVALID');

  if (activeRunCount >= policy.maxConcurrentRuns) {
    throw new PolicyViolationError(
      `concurrency ceiling reached (${activeRunCount}/${policy.maxConcurrentRuns}); refusing to admit run ${spec.runId}`,
      'CONCURRENCY_EXCEEDED',
    );
  }

  const wallSeconds = Number(spec.limits?.wallSeconds);
  if (Number.isFinite(wallSeconds) && wallSeconds > policy.maxWallSeconds) {
    throw new PolicyViolationError(
      `wall time ${wallSeconds}s exceeds policy ceiling ${policy.maxWallSeconds}s`,
      'WALL_TIME_EXCEEDED',
    );
  }

  const maxOutputBytes = Number(spec.limits?.maxOutputBytes);
  if (Number.isFinite(maxOutputBytes) && maxOutputBytes > policy.maxOutputBytes) {
    throw new PolicyViolationError(
      `output budget ${maxOutputBytes} bytes exceeds policy ceiling ${policy.maxOutputBytes} bytes`,
      'OUTPUT_BUDGET_EXCEEDED',
    );
  }

  if (spec.executable?.path) {
    const p = spec.executable.path;
    if (!isAbsolute(p) && !p.startsWith('./') && !p.startsWith('../')) {
      // Bare command names (e.g. "python") are resolved by the OS; only
      // path-like executables are containment-checked.
    } else {
      assertInsideWorkspace(policy.workspaceRoot, p);
    }
  }

  return true;
}
