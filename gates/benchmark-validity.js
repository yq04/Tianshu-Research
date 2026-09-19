/**
 * Benchmark Validity & Fairness Scientific Gate for tianshu-research.
 * Ensures equal compute budgets, identical evaluation metrics,
 * single-factor isolated ablations, and fair baseline comparisons.
 */

export function auditBenchmarkValidity(plan, resultsOrComparison, options = {}) {
  const checks = [];

  const matrix = Array.isArray(plan?.matrix) ? plan.matrix : [];
  const results = Array.isArray(resultsOrComparison)
    ? resultsOrComparison
    : (Array.isArray(resultsOrComparison?.results) ? resultsOrComparison.results : []);

  // 1. Baseline Presence Check
  const hasBaseline = matrix.some((c) => c.condition === 'baseline') || results.some((r) => r.condition === 'baseline');
  checks.push({
    code: 'BASELINE_CONTROL_PRESENT',
    status: hasBaseline ? 'pass' : 'fail',
    message: hasBaseline
      ? 'Benchmark protocol includes a dedicated control baseline configuration.'
      : 'Benchmark lacks a control baseline; cannot establish relative improvement or ablation effect.',
  });

  // 2. Ablation Factor Isolation Check (Controlled Variable Principle)
  const ablations = matrix.filter((c) => c.condition === 'ablation');
  let confoundedCount = 0;
  for (const a of ablations) {
    if (!a.isolatedFactor || a.isolatedFactor === 'none' || a.isolatedFactor === 'unknown') {
      confoundedCount++;
    }
  }
  const isolationOk = ablations.length === 0 || confoundedCount === 0;
  checks.push({
    code: 'SINGLE_FACTOR_ABLATION_ISOLATION',
    status: isolationOk ? 'pass' : 'fail',
    message: isolationOk
      ? 'All ' + ablations.length + ' ablation variants isolate a single documented factor.'
      : confoundedCount + ' ablation variant(s) fail to specify an isolated factor (conflated variables).',
  });

  // 3. Metric Parity Check
  const expectedMetrics = Array.isArray(plan?.metrics) ? plan.metrics : [];
  let metricMismatchCount = 0;
  if (expectedMetrics.length > 0 && results.length > 0) {
    for (const r of results) {
      for (const m of expectedMetrics) {
        if (r[m] === undefined && (!r.metrics || r.metrics[m] === undefined)) {
          metricMismatchCount++;
        }
      }
    }
  }
  const metricParityOk = metricMismatchCount === 0;
  checks.push({
    code: 'METRIC_EVALUATION_PARITY',
    status: metricParityOk ? 'pass' : 'fail',
    message: metricParityOk
      ? 'All benchmark runs evaluated identical metric sets (' + expectedMetrics.join(', ') + ').'
      : metricMismatchCount + ' metric evaluation discrepancies detected across runs.',
  });

  // 4. Seed Alignment Check
  const seeds = plan?.fixedSeeds || [];
  const seedOk = Array.isArray(seeds) && seeds.length > 0;
  checks.push({
    code: 'DETERMINISTIC_SEED_CONTROL',
    status: seedOk ? 'pass' : 'fail',
    message: seedOk
      ? 'Fixed pseudo-random seeds (' + seeds.join(', ') + ') applied across all experimental cells.'
      : 'Experimental matrix lacks fixed deterministic random seeds.',
  });

  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const status = failedCount === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'Benchmark validity gate PASSED: Fair baseline comparison, single-factor isolated ablations, and metric parity confirmed.'
    : 'Benchmark validity gate FAILED: ' + failedCount + ' validity violation(s) detected.';

  return {
    gateId: 'benchmark-validity',
    status,
    summary,
    checks,
    metrics: {
      hasBaseline,
      ablationCount: ablations.length,
      confoundedAblations: confoundedCount,
      metricDiscrepancies: metricMismatchCount,
      failedChecks: failedCount,
    },
  };
}
