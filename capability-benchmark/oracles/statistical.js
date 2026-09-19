/**
 * Statistical-conclusion oracle (Phase 11, scoring side).
 *
 * Rewards the HONEST conclusion recomputed from verified raw statistics.
 * In particular, a non-significant result (p >= alpha) correctly reported as
 * 'not_significant' is a legitimate full-score answer — negative results are
 * first-class. Claiming 'significant' while the verified p-value says
 * otherwise is a verdict mismatch (p-hacking) and scores zero.
 */

import { verifyGroupComparison, verdictFromPValue } from './verify.js';

export function scoreStatistical(submitted, task, context) {
  const params = task.oracle?.params || {};
  const alpha = params.alpha ?? 0.05;
  const method = params.method ?? 'welch';

  const dataset = context.loadDataset(task.datasetRef);
  const verification = verifyGroupComparison(submitted?.rawOutput, dataset, { method, alpha });
  if (!verification.ok) {
    return { score: 0, code: verification.code, reason: verification.reason };
  }

  const truthVerdict = verdictFromPValue(verification.truth.pValue, alpha);
  const claimed = submitted?.conclusion;

  if (claimed === truthVerdict) {
    const honestNegative = truthVerdict === 'not_significant';
    return {
      score: 1,
      code: 'PASS',
      reason: honestNegative
        ? 'Honest non-significant conclusion — negative result scored in full'
        : 'Conclusion matches the verified statistics',
      truth: { pValue: verification.truth.pValue, verdict: truthVerdict },
    };
  }

  return {
    score: 0,
    code: 'VERDICT_MISMATCH',
    reason: `claimed "${claimed}" but verified statistics say "${truthVerdict}"` +
      (claimed === 'significant' && truthVerdict === 'not_significant' ? ' (p-hacking)' : ''),
    truth: { pValue: verification.truth.pValue, verdict: truthVerdict },
  };
}
