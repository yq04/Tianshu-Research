/**
 * Statistical Validity Scientific Gate for tianshu-research.
 * Audits method applicability, effect size reporting, and confidence interval bounds.
 *
 * CRITICAL RULE (task_plan.md 7.4):
 * p >= alpha is a legitimate scientific result. Method validity passes,
 * and the conclusion is truthfully recorded as inconclusive/unsupported.
 * It is strictly forbidden to fail the gate because p is not significant!
 */

export function auditStatisticalValidity(statResult, options = {}) {
  if (!statResult || typeof statResult !== 'object') {
    return {
      gateId: 'statistical-validity',
      status: 'fail',
      summary: 'Statistical validity audit failed: missing or invalid statistical result object.',
      checks: [{ code: 'INVALID_RESULT', status: 'fail', message: 'No statistical result provided' }],
    };
  }

  const checks = [];

  // 1. Sample adequacy
  const nA = Number(statResult.nA ?? 0);
  const nB = Number(statResult.nB ?? 0);
  const sampleOk = nA >= 2 && nB >= 2;
  checks.push({
    code: 'SAMPLE_SIZE_VALID',
    status: sampleOk ? 'pass' : 'fail',
    message: sampleOk
      ? 'Sample sizes (nA=' + nA + ', nB=' + nB + ') are adequate for two-group inference.'
      : 'Insufficient sample size (nA=' + nA + ', nB=' + nB + '); minimum 2 required per group.',
  });

  // 2. Effect size reporting
  const hasEffectSize = typeof statResult.effectSize === 'number' && !isNaN(statResult.effectSize) && Boolean(statResult.effectMetric);
  checks.push({
    code: 'EFFECT_SIZE_REPORTED',
    status: hasEffectSize ? 'pass' : 'fail',
    message: hasEffectSize
      ? 'Effect size reported (' + statResult.effectMetric + ' = ' + statResult.effectSize + ').'
      : 'Effect size or effect metric missing from analysis output.',
  });

  // 3. Confidence interval reporting
  const ci = statResult.confidenceInterval;
  const hasCI = Array.isArray(ci) && ci.length === 2 && !isNaN(ci[0]) && !isNaN(ci[1]) && ci[0] <= ci[1];
  checks.push({
    code: 'CONFIDENCE_INTERVAL_REPORTED',
    status: hasCI ? 'pass' : 'fail',
    message: hasCI
      ? 'Confidence interval reported [' + ci[0] + ', ' + ci[1] + '].'
      : 'Confidence interval missing or invalid.',
  });

  // 4. Alpha specified
  const alpha = Number(statResult.alpha);
  const alphaOk = !isNaN(alpha) && alpha > 0 && alpha <= 0.5;
  checks.push({
    code: 'PRE_SPECIFIED_ALPHA',
    status: alphaOk ? 'pass' : 'fail',
    message: alphaOk
      ? 'Significance threshold alpha explicitly pre-specified (' + alpha + ').'
      : 'Invalid or missing alpha threshold.',
  });

  // 5. CRITICAL: Objective Non-Significance Honored
  // If p >= alpha, verify that the conclusion is truthful (inconclusive / not claiming false positive).
  // The gate PASSES because the methodology and reporting are sound!
  const pVal = Number(statResult.pValue);
  const isNonSig = !isNaN(pVal) && !isNaN(alpha) && pVal >= alpha;
  if (isNonSig) {
    const conclusionValid = statResult.conclusion === 'inconclusive' || statResult.conclusion === 'unsupported' || !statResult.significant;
    checks.push({
      code: 'OBJECTIVE_NON_SIGNIFICANCE_HONORED',
      status: conclusionValid ? 'pass' : 'fail',
      message: conclusionValid
        ? 'Non-significant result (p = ' + pVal + ' >= ' + alpha + ') is documented truthfully without p-hacking or false claims. Method validity remains intact.'
        : 'Non-significant result (p = ' + pVal + ' >= ' + alpha + ') falsely claimed positive significance.',
    });
  } else {
    checks.push({
      code: 'SIGNIFICANT_RESULT_REPORTED',
      status: 'pass',
      message: 'Statistically significant difference detected (p = ' + pVal + ' < ' + alpha + ').',
    });
  }

  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const status = failedCount === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'Statistical validity gate PASSED: ' + statResult.method + ' test with ' + statResult.effectMetric + ' and CI properly reported.'
    : 'Statistical validity gate FAILED: ' + failedCount + ' methodological or reporting violation(s).';

  return {
    gateId: 'statistical-validity',
    status,
    summary,
    checks,
    metrics: {
      method: statResult.method,
      statistic: statResult.statistic,
      pValue: statResult.pValue,
      effectSize: statResult.effectSize,
      significant: statResult.significant,
      failedChecks: failedCount,
    },
  };
}
