/**
 * Exact-answer oracle (Phase 11, scoring side).
 * Full score requires the submitted conclusion to equal the pinned answer key
 * AND the receipt's raw statistics (when the task pins a dataset) to survive
 * anti-fabrication verification. Used for negative-result tasks where the
 * correct answer is 'refuted' — honest refutation scores in full.
 */

import { verifyGroupComparison, verdictFromPValue } from './verify.js';

export function scoreExact(submitted, task, context) {
  const params = task.oracle?.params || {};
  const answerKey = params.answerKey;
  if (answerKey === undefined) {
    throw new Error(`Task ${task.taskId}: exact oracle requires oracle.params.answerKey`);
  }

  if (!submitted?.rawOutput || typeof submitted.rawOutput !== 'object') {
    return { score: 0, code: 'INCOMPLETE_RECEIPT', reason: 'rawOutput is required: even exact-answer tasks must show their evidence' };
  }

  let truthExtra;
  if (params.verify?.kind === 'group_comparison') {
    const dataset = context.loadDataset(params.verify.datasetRef || task.datasetRef);
    const verification = verifyGroupComparison(submitted.rawOutput, dataset, {
      method: params.verify.method ?? 'welch',
      alpha: params.verify.alpha ?? 0.05,
    });
    if (!verification.ok) {
      return { score: 0, code: verification.code, reason: verification.reason };
    }
    truthExtra = { pValue: verification.truth.pValue, verdict: verdictFromPValue(verification.truth.pValue, params.verify.alpha ?? 0.05) };
  }

  if (submitted.conclusion === answerKey) {
    return {
      score: 1,
      code: 'PASS',
      reason: answerKey === 'refuted'
        ? 'Honest refutation — negative result scored in full'
        : 'Answer matches the pinned key',
      truth: truthExtra,
    };
  }
  return {
    score: 0,
    code: 'WRONG_ANSWER',
    reason: `claimed "${submitted.conclusion}" but the pinned answer is "${answerKey}"`,
    truth: truthExtra,
  };
}
