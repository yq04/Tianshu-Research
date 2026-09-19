/**
 * Benchmark Protocol & Experimental Matrix Planner for tianshu-research.
 * Generates deterministic experimental matrices ensuring controlled ablation factors,
 * fixed random seeds, and compute budget constraints.
 */

export function createBenchmarkPlan(options = {}) {
  const name = options.name || 'Benchmark_Protocol_' + Date.now().toString(36);
  const planId = 'bench_plan_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  const tasks = Array.isArray(options.tasks) && options.tasks.length > 0
    ? options.tasks
    : ['default_task'];

  const baselines = Array.isArray(options.baselines) && options.baselines.length > 0
    ? options.baselines
    : ['baseline_full'];

  const ablations = Array.isArray(options.ablations)
    ? options.ablations
    : [];

  const metrics = Array.isArray(options.metrics) && options.metrics.length > 0
    ? options.metrics
    : ['accuracy', 'loss', 'latencyMs'];

  const fixedSeeds = Array.isArray(options.fixedSeeds) && options.fixedSeeds.length > 0
    ? options.fixedSeeds
    : [42];

  const budget = {
    maxRuns: options.budget?.maxRuns || 50,
    wallSeconds: options.budget?.wallSeconds || 300,
  };

  const matrix = [];

  for (const task of tasks) {
    for (const seed of fixedSeeds) {
      // 1. Add baseline runs
      for (const b of baselines) {
        const bName = typeof b === 'string' ? b : (b.name || 'baseline');
        const bParams = typeof b === 'object' ? (b.parameters || {}) : {};
        matrix.push({
          runId: planId + '_base_' + bName + '_s' + seed,
          condition: 'baseline',
          variantName: bName,
          task,
          seed,
          isolatedFactor: 'none (control baseline)',
          parameters: { ...bParams, task, seed, condition: 'baseline' },
          metrics,
        });
      }

      // 2. Add ablation runs (controlled single-factor variations)
      for (const a of ablations) {
        const aName = typeof a === 'string' ? a : (a.name || 'ablation_' + matrix.length);
        const aFactor = typeof a === 'object' ? (a.isolatedFactor || a.factor || aName) : aName;
        const aParams = typeof a === 'object' ? (a.parameters || {}) : {};
        matrix.push({
          runId: planId + '_ablation_' + aName + '_s' + seed,
          condition: 'ablation',
          variantName: aName,
          task,
          seed,
          isolatedFactor: aFactor,
          parameters: { ...aParams, task, seed, condition: 'ablation', isolatedFactor: aFactor },
          metrics,
        });
      }
    }
  }

  return {
    planId,
    name,
    createdAt: new Date().toISOString(),
    budget,
    tasks,
    baselines,
    ablations,
    metrics,
    fixedSeeds,
    matrix,
    runCount: matrix.length,
    summary: 'Benchmark plan [' + name + '] created with ' + matrix.length + ' experimental cells across ' + tasks.length + ' task(s).',
  };
}
