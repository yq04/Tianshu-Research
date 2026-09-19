/**
 * Benchmark Comparison & Ablation Analysis for tianshu-research.
 * Compares baseline and ablation runs, calculates metric deltas and percentage changes,
 * and produces structured ranking matrices.
 */

export function compareBenchmarkRuns(resultsOrSuite, options = {}) {
  const results = Array.isArray(resultsOrSuite)
    ? resultsOrSuite
    : (Array.isArray(resultsOrSuite?.results) ? resultsOrSuite.results : []);

  if (results.length === 0) {
    return {
      ranking: [],
      comparisonMatrix: {},
      summary: 'No benchmark runs available to compare.',
    };
  }

  const primaryMetric = options.primaryMetric || 'accuracy';
  const higherIsBetter = options.higherIsBetter ?? true;

  // Identify baseline run
  const baselineRun = results.find((r) => r.condition === 'baseline' || String(r.variantName).toLowerCase().includes('baseline')) || results[0];
  const baselineVal = Number(baselineRun[primaryMetric] ?? 0);

  // Group by variant to average across seeds if multiple
  const variantMap = new Map();
  for (const r of results) {
    const name = r.variantName || r.runId;
    if (!variantMap.has(name)) {
      variantMap.set(name, {
        variantName: name,
        condition: r.condition || 'ablation',
        isolatedFactor: r.isolatedFactor || 'unknown',
        runs: [],
      });
    }
    variantMap.get(name).runs.push(r);
  }

  const comparisonMatrix = {};
  const aggregatedVariants = [];

  for (const [name, info] of variantMap.entries()) {
    const runs = info.runs;
    const avgMetrics = {};
    const keys = new Set();
    runs.forEach((r) => Object.keys(r).forEach((k) => keys.add(k)));

    for (const k of keys) {
      const numericVals = runs.map((r) => Number(r[k])).filter((v) => !isNaN(v));
      if (numericVals.length > 0) {
        avgMetrics[k] = Number((numericVals.reduce((a, b) => a + b, 0) / numericVals.length).toFixed(4));
      }
    }

    const currentScore = Number(avgMetrics[primaryMetric] ?? 0);
    const delta = Number((currentScore - baselineVal).toFixed(4));
    const pctChange = baselineVal !== 0 ? Number(((delta / Math.abs(baselineVal)) * 100).toFixed(2)) : 0;

    const entry = {
      variantName: name,
      condition: info.condition,
      isolatedFactor: info.isolatedFactor,
      metrics: avgMetrics,
      primaryScore: currentScore,
      deltaVsBaseline: delta,
      percentChangeVsBaseline: pctChange,
      runCount: runs.length,
      runIds: runs.map((r) => r.runId),
    };

    comparisonMatrix[name] = entry;
    aggregatedVariants.push(entry);
  }

  // Sort ranking
  aggregatedVariants.sort((a, b) => {
    return higherIsBetter
      ? b.primaryScore - a.primaryScore
      : a.primaryScore - b.primaryScore;
  });

  const bestVariant = aggregatedVariants[0];

  return {
    primaryMetric,
    higherIsBetter,
    baselineVariant: baselineRun.variantName,
    ranking: aggregatedVariants,
    comparisonMatrix,
    bestVariant: bestVariant.variantName,
    bestScore: bestVariant.primaryScore,
    bestRunId: bestVariant.runIds[0],
    summary: 'Benchmark comparison complete: ' + aggregatedVariants.length + ' variants evaluated. Best: ' + bestVariant.variantName + ' (' + primaryMetric + ' = ' + bestVariant.primaryScore + ').',
  };
}
