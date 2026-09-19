/**
 * Test Suite: Capability Benchmark Harness (Phase 11, plugin side)
 * Verifies the honest-scoring invariants offline: hash-pinned datasets,
 * fabricated receipts fail, p-hacking fails, negative results score in full,
 * failures stay in the denominator, model/budget grouping never merges, and
 * reports are deterministic. No network, no model calls.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, copyFileSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadDatasetManifest, loadSuiteTasks, runSuiteReplay, scoreTrial, writeReport } from '../capability-benchmark/harness.js';
import { serializeBenchmarkReport } from '../capability-benchmark/report.js';
import { getOracle } from '../capability-benchmark/oracles/registry.js';

const BENCH_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'capability-benchmark');
const PLUGIN_DIR = join(BENCH_DIR, '..');

describe('Phase 11: Capability Benchmark Harness', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-bench-test-'));
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  describe('dataset pinning', () => {
    it('verifies the intact manifest (fixture/hash/license/split fixed)', () => {
      const { manifest, manifestDigest } = loadDatasetManifest('smoke', BENCH_DIR);
      assert.ok(manifestDigest);
      for (const entry of Object.values(manifest.datasets)) {
        assert.match(entry.sha256, /^[0-9a-f]{64}$/);
        assert.ok(entry.license);
        assert.equal(entry.split, 'smoke');
      }
    });

    it('refuses to run against silently-changed dataset bytes', () => {
      const fakeBench = join(tempDir, 'capability-benchmark');
      mkdirSync(join(fakeBench, 'datasets', 'files'), { recursive: true });
      copyFileSync(join(BENCH_DIR, 'datasets', 'manifest.json'), join(fakeBench, 'datasets', 'manifest.json'));
      copyFileSync(join(BENCH_DIR, 'datasets', 'files', 'nonsignificant-groups.json'), join(fakeBench, 'datasets', 'files', 'nonsignificant-groups.json'));
      copyFileSync(join(BENCH_DIR, 'datasets', 'files', 'identical-yield-claim.json'), join(fakeBench, 'datasets', 'files', 'identical-yield-claim.json'));

      // Tamper with a dataset AFTER copying the manifest that pins it.
      const ds = JSON.parse(readFileSync(join(fakeBench, 'datasets', 'files', 'nonsignificant-groups.json'), 'utf8'));
      ds.groupA[0] = 99.9;
      writeFileSync(join(fakeBench, 'datasets', 'files', 'nonsignificant-groups.json'), JSON.stringify(ds, null, 2));

      assert.throws(() => loadDatasetManifest('smoke', fakeBench), /hash mismatch/);
    });
  });

  describe('oracles (anti-fabrication & honest negatives)', () => {
    const tasks = () => loadSuiteTasks('smoke', BENCH_DIR);
    const taskBy = (id) => tasks().find((t) => t.taskId === id);
    const context = {
      loadDataset: (ref) => JSON.parse(readFileSync(join(BENCH_DIR, 'datasets', 'files', `${ref}.json`), 'utf8')),
    };

    const trueRaw = { method: 'welch', alpha: 0.05, statistic: 0.0927, pValue: 0.928034 };

    it('scores an honest non-significant conclusion in full (negative result)', () => {
      const oracle = getOracle('statistical');
      const out = oracle(
        { conclusion: 'not_significant', rawOutput: trueRaw },
        taskBy('stats-nonsignificance@smoke'),
        context,
      );
      assert.equal(out.score, 1);
      assert.equal(out.code, 'PASS');
      assert.match(out.reason, /negative result|Honest/i);
    });

    it('fails p-hacking: claiming significant against a non-significant p-value', () => {
      const oracle = getOracle('statistical');
      const out = oracle(
        { conclusion: 'significant', rawOutput: trueRaw },
        taskBy('stats-nonsignificance@smoke'),
        context,
      );
      assert.equal(out.score, 0);
      assert.equal(out.code, 'VERDICT_MISMATCH');
      assert.match(out.reason, /p-hacking/);
    });

    it('fails a fabricated receipt whose statistics contradict the dataset', () => {
      const oracle = getOracle('statistical');
      const out = oracle(
        { conclusion: 'not_significant', rawOutput: { ...trueRaw, pValue: 0.001 } },
        taskBy('stats-nonsignificance@smoke'),
        context,
      );
      assert.equal(out.score, 0);
      assert.equal(out.code, 'FABRICATED_STATISTICS');
      assert.match(out.reason, /contradicts/);
    });

    it('fails a trial without a raw receipt instead of trusting the narrative', () => {
      const oracle = getOracle('statistical');
      const out = oracle(
        { conclusion: 'not_significant' },
        taskBy('stats-nonsignificance@smoke'),
        context,
      );
      assert.equal(out.score, 0);
      assert.equal(out.code, 'INCOMPLETE_RECEIPT');
    });

    it('fails a fabricated dimensional receipt (raw check contradicts the checker)', () => {
      const oracle = getOracle('dimension');
      const wrong = oracle(
        { verdict: 'consistent', rawOutput: { consistent: true } },
        taskBy('dimension-mismatch@smoke'),
        context,
      );
      assert.equal(wrong.score, 0);
      assert.equal(wrong.code, 'FABRICATED_CHECK');

      const honest = oracle(
        { verdict: 'inconsistent', rawOutput: { consistent: false } },
        taskBy('dimension-mismatch@smoke'),
        context,
      );
      assert.equal(honest.score, 1);
    });

    it('scores an honest refutation in full (negative result as first-class)', () => {
      const oracle = getOracle('exact');
      const ok = oracle(
        { conclusion: 'refuted', rawOutput: { method: 'welch', alpha: 0.05, pValue: 0 } },
        taskBy('refute-identical-yield@smoke'),
        context,
      );
      assert.equal(ok.score, 1);
      assert.match(ok.reason, /refutation/);

      const wrong = oracle(
        { conclusion: 'supported', rawOutput: { method: 'welch', alpha: 0.05, pValue: 0 } },
        taskBy('refute-identical-yield@smoke'),
        context,
      );
      assert.equal(wrong.score, 0);
      assert.equal(wrong.code, 'WRONG_ANSWER');
    });

    it('attributes unknown tasks and oracles as failures, never drops them', () => {
      const unknownTask = scoreTrial({ taskId: 'nope@smoke', submitted: {} }, tasks(), context);
      assert.equal(unknownTask.score, 0);
      assert.equal(unknownTask.code, 'UNKNOWN_TASK');

      const badTask = { taskId: 'x@smoke', oracle: { type: 'nonexistent' } };
      const unknownOracle = scoreTrial({ taskId: 'x@smoke', submitted: {} }, [badTask], context);
      assert.equal(unknownOracle.score, 0);
      assert.equal(unknownOracle.code, 'UNKNOWN_ORACLE');
    });
  });

  describe('suite aggregation', () => {
    let result;

    beforeEach(() => {
      result = runSuiteReplay({ suite: 'smoke', benchDir: BENCH_DIR });
    });

    it('keeps failed and errored trials in the denominator', () => {
      const { report } = result;
      assert.equal(report.totals.trials, 11);
      assert.equal(report.totals.passed, 5);
      assert.equal(report.totals.failed, 6);
      assert.equal(report.totals.erroredTrials, 1); // malformed file, reported not hidden
      const modelC = report.groups.find((g) => g.modelId === 'modelC');
      assert.equal(modelC.total, 1);
      assert.equal(modelC.score, 0); // crashed trial counted, not removed
    });

    it('never merges different models or budgets into one row', () => {
      const { report } = result;
      assert.equal(report.groups.length, 4);
      const modelA_b1 = report.groups.find((g) => g.modelId === 'modelA' && g.budgetId === 'budget-b1');
      const modelA_b2 = report.groups.find((g) => g.modelId === 'modelA' && g.budgetId === 'budget-b2');
      assert.equal(modelA_b1.total, 8);
      assert.equal(modelA_b1.score, 0.375);
      assert.equal(modelA_b2.total, 1);
      assert.equal(modelA_b2.score, 1);
      assert.ok(report.groups.every((g) => g.modelId && g.budgetId));
    });

    it('accounts main-model usage separately from council/compaction sidecars', () => {
      const { report } = result;
      const modelA_b1 = report.groups.find((g) => g.modelId === 'modelA' && g.budgetId === 'budget-b1');
      assert.equal(modelA_b1.usage.mainModel.inputTokens, 1200);
      assert.equal(modelA_b1.usage.mainModel.cacheReadTokens, 900);
      assert.equal(modelA_b1.usage.sidecar.council.inputTokens, 200);
      assert.equal(modelA_b1.usage.sidecar.compaction.inputTokens, 0);
    });

    it('produces byte-identical reports across runs (no wall-clock leakage)', () => {
      const a = serializeBenchmarkReport(result.report);
      const b = serializeBenchmarkReport(runSuiteReplay({ suite: 'smoke', benchDir: BENCH_DIR }).report);
      assert.equal(a, b);
      assert.ok(!a.includes('generatedAt'));
    });
  });

  describe('mode discipline & CLI', () => {
    it('refuses live mode instead of fabricating results', () => {
      assert.throws(() => runSuiteReplay({ suite: 'smoke', mode: 'live', benchDir: BENCH_DIR }), /Refusing to fabricate/);
    });

    it('runs end-to-end via the CLI and writes a deterministic report', () => {
      const out = execFileSync(process.execPath, [join(BENCH_DIR, 'harness.js'), '--suite', 'smoke', '--mode', 'replay', '--offline'], {
        cwd: tempDir,
        encoding: 'utf8',
      });
      assert.match(out, /5\/11 trials passed/);
      assert.match(out, /modelA@budget-b1: 3\/8/);
      const reportPath = join(tempDir, '.rivet', 'research', 'benchmark', 'smoke-report.json');
      assert.ok(existsSync(reportPath));
      const report = JSON.parse(readFileSync(reportPath, 'utf8'));
      assert.ok(out.includes(`Digest: ${report.digest}`));
    });
  });
});
