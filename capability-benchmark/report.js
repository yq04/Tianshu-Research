/**
 * Deterministic benchmark report builder (Phase 11).
 *
 * Aggregation invariants:
 *  - trials are grouped by (modelId, budgetId): different models or budgets
 *    NEVER merge into one comparison row;
 *  - failed and errored trials stay in the denominator (score 0) — no
 *    selective deletion of failures;
 *  - cost accounting separates main-model usage from sidecar usage
 *    (council / compaction) — they are never summed into one bucket;
 *  - output is canonical JSON with a content digest and no wall-clock fields,
 *    so two runs over identical inputs are byte-identical.
 */

import { canonicalJson, computePayloadDigest } from '../workflows/events.js';

export const REPORT_SCHEMA_VERSION = 1;

function emptyUsage() {
  return {
    mainModel: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0 },
    sidecar: { council: { inputTokens: 0, outputTokens: 0 }, compaction: { inputTokens: 0, outputTokens: 0 } },
  };
}

function addUsage(target, usage) {
  if (!usage || typeof usage !== 'object') return;
  const mm = usage.mainModel || {};
  target.usage.mainModel.inputTokens += Number(mm.inputTokens) || 0;
  target.usage.mainModel.outputTokens += Number(mm.outputTokens) || 0;
  target.usage.mainModel.cacheReadTokens += Number(mm.cacheReadTokens) || 0;
  for (const channel of ['council', 'compaction']) {
    const src = usage.sidecar?.[channel] || {};
    target.usage.sidecar[channel].inputTokens += Number(src.inputTokens) || 0;
    target.usage.sidecar[channel].outputTokens += Number(src.outputTokens) || 0;
  }
}

/**
 * Builds the report from scored trial results.
 * @param {object} options
 * @param {Array} options.trialResults - [{ trialId, trialFile, taskId, modelId, budgetId, score, code, reason, status, usage }]
 * @param {Array} options.trialErrors - [{ trialFile, error }]
 * @param {string} options.suite
 * @param {string} options.mode
 * @param {string} options.manifestDigest
 */
export function buildBenchmarkReport({ trialResults = [], trialErrors = [], suite, mode, manifestDigest }) {
  const byGroup = new Map();
  for (const t of trialResults) {
    const key = `${t.modelId}::${t.budgetId}`;
    if (!byGroup.has(key)) {
      byGroup.set(key, {
        modelId: t.modelId,
        budgetId: t.budgetId,
        trials: [],
        usage: emptyUsage(),
      });
    }
    const group = byGroup.get(key);
    group.trials.push(t);
    addUsage(group, t.usage);
  }

  const groups = [...byGroup.values()]
    .map((g) => {
      const total = g.trials.length;
      const passed = g.trials.filter((t) => t.score === 1).length;
      const failed = total - passed;
      const byTask = {};
      for (const t of g.trials) {
        byTask[t.taskId] = byTask[t.taskId] || { passed: 0, total: 0 };
        byTask[t.taskId].total += 1;
        byTask[t.taskId].passed += t.score === 1 ? 1 : 0;
      }
      return {
        modelId: g.modelId,
        budgetId: g.budgetId,
        score: total > 0 ? Number((passed / total).toFixed(4)) : 0,
        passed,
        failed,
        total, // failures included: failed trials are never removed from the denominator
        usage: g.usage,
        byTask: Object.fromEntries(Object.entries(byTask).sort(([a], [b]) => (a < b ? -1 : 1))),
      };
    })
    .sort((a, b) => (a.modelId === b.modelId ? (a.budgetId < b.budgetId ? -1 : 1) : a.modelId < b.modelId ? -1 : 1));

  const body = {
    schemaVersion: REPORT_SCHEMA_VERSION,
    suite,
    mode,
    manifestDigest,
    groups,
    trialErrors: [...trialErrors].sort((a, b) => (a.trialFile < b.trialFile ? -1 : 1)),
    totals: {
      trials: trialResults.length,
      passed: trialResults.filter((t) => t.score === 1).length,
      failed: trialResults.filter((t) => t.score !== 1).length,
      erroredTrials: trialErrors.length,
    },
  };
  return Object.freeze({ ...body, digest: computePayloadDigest(body) });
}

/**
 * Canonical byte-stable serialization of a report.
 */
export function serializeBenchmarkReport(report) {
  return canonicalJson(report);
}
