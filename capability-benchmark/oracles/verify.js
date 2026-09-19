/**
 * Shared oracle verification helpers (Phase 11, scoring side).
 * Anti-fabrication: raw statistics claimed in a trial receipt are RE-COMPUTED
 * from the hash-pinned dataset with the plugin's own deterministic statistics
 * module. A receipt that does not match reality fails — never the submitted
 * narrative alone.
 */

import { compareTwoGroups } from '../../data/statistics.js';

export const P_VALUE_TOLERANCE = 1e-3;

/**
 * Recomputes a Welch/Student comparison from a dataset record and verifies a
 * trial's raw statistics against it.
 * @returns {{ ok: boolean, code?: string, reason?: string, truth?: object }}
 */
export function verifyGroupComparison(rawOutput, dataset, { method = 'welch', alpha = 0.05 } = {}) {
  if (!rawOutput || typeof rawOutput !== 'object') {
    return { ok: false, code: 'INCOMPLETE_RECEIPT', reason: 'rawOutput is required: the trial must carry the actual computed statistics' };
  }
  if (typeof rawOutput.pValue !== 'number' || !Number.isFinite(rawOutput.pValue)) {
    return { ok: false, code: 'INCOMPLETE_RECEIPT', reason: 'rawOutput.pValue must be a finite number' };
  }

  const truth = compareTwoGroups({
    groupA: dataset.groupA,
    groupB: dataset.groupB,
    method,
    alpha,
  });
  const truthP = Number(truth.pValue);

  if (Math.abs(rawOutput.pValue - truthP) > P_VALUE_TOLERANCE) {
    return {
      ok: false,
      code: 'FABRICATED_STATISTICS',
      reason: `receipt pValue ${rawOutput.pValue} contradicts the dataset truth ${truthP} (tolerance ${P_VALUE_TOLERANCE})`,
      truth,
    };
  }
  return { ok: true, truth };
}

/**
 * Maps a true p-value to the canonical verdict vocabulary.
 */
export function verdictFromPValue(pValue, alpha = 0.05) {
  return pValue < alpha ? 'significant' : 'not_significant';
}
