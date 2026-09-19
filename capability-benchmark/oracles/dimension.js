/**
 * Dimensional-consistency oracle (Phase 11, scoring side).
 * Re-runs the plugin's own deterministic dimensional checker on the task's
 * lhs/rhs, verifies the trial's raw receipt matches reality, then scores the
 * submitted verdict against the truth.
 */

import { checkDimensions } from '../../compute/compute-gateway.js';

export function scoreDimension(submitted, task) {
  const params = task.oracle?.params || {};
  const lhs = params.lhs;
  const rhs = params.rhs;
  if (!lhs || !rhs) {
    throw new Error(`Task ${task.taskId}: dimension oracle requires oracle.params.lhs/rhs`);
  }

  if (!submitted?.rawOutput || typeof submitted.rawOutput !== 'object') {
    return { score: 0, code: 'INCOMPLETE_RECEIPT', reason: 'rawOutput is required (the actual consistency check result)' };
  }

  const truth = checkDimensions(lhs, rhs, params.symbols || {});
  const truthVerdict = truth.consistent ? 'consistent' : 'inconsistent';

  if (typeof submitted.rawOutput.consistent !== 'boolean' || submitted.rawOutput.consistent !== truth.consistent) {
    return {
      score: 0,
      code: 'FABRICATED_CHECK',
      reason: `receipt says consistent=${JSON.stringify(submitted.rawOutput.consistent)} but the deterministic checker says ${truth.consistent}`,
      truth: { verdict: truthVerdict },
    };
  }

  if (submitted.verdict === truthVerdict) {
    return { score: 1, code: 'PASS', reason: 'Verdict matches the deterministic dimensional check', truth: { verdict: truthVerdict } };
  }
  return {
    score: 0,
    code: 'VERDICT_MISMATCH',
    reason: `claimed "${submitted.verdict}" but the checker says "${truthVerdict}"`,
    truth: { verdict: truthVerdict },
  };
}
