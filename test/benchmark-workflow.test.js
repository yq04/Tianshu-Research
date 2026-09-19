/**
 * Phase 4C: Engineering Benchmark & Ablation Closed Loop Test Suite.
 * Verifies benchmark matrix planning, batch execution with verifiable RunReceipts,
 * metric deltas & ablation ranking, and reproducibility & benchmark validity gate audits.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { createBenchmarkPlan } from '../benchmark/plan.js';
import { runBenchmarkSuite } from '../benchmark/runner.js';
import { compareBenchmarkRuns } from '../benchmark/compare.js';
import { auditReproducibility } from '../gates/reproducibility.js';
import { auditBenchmarkValidity } from '../gates/benchmark-validity.js';
import { verifyRunReceipt } from '../jobs/run-receipt.js';
import { dispatchOperation } from '../operations/dispatcher.js';

describe('Phase 4C: Engineering Benchmark & Ablation Closed Loop', () => {
  let testDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'rivet-phase4c-'));
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('generates structured benchmark matrix with baseline and single-factor ablations', () => {
    const plan = createBenchmarkPlan({
      name: 'Transformer_Architecture_Ablation',
      tasks: ['glue_mrpc'],
      baselines: [{ name: 'baseline_standard', parameters: { layers: 12, attention: 'full', warmup: true } }],
      ablations: [
        { name: 'ablation_no_warmup', isolatedFactor: 'warmup_schedule', parameters: { warmup: false } },
        { name: 'ablation_linear_attn', isolatedFactor: 'attention_mechanism', parameters: { attention: 'linear' } },
      ],
      metrics: ['accuracy', 'f1', 'latencyMs'],
      fixedSeeds: [42, 100],
      budget: { maxRuns: 10, wallSeconds: 120 },
    });

    assert.ok(plan.planId.startsWith('bench_plan_'));
    // 1 task * 2 seeds * (1 baseline + 2 ablations) = 6 cells
    assert.equal(plan.runCount, 6);
    assert.equal(plan.matrix.length, 6);

    const baselineCell = plan.matrix.find((c) => c.condition === 'baseline');
    assert.ok(baselineCell);
    assert.equal(baselineCell.variantName, 'baseline_standard');

    const ablationCells = plan.matrix.filter((c) => c.condition === 'ablation');
    assert.equal(ablationCells.length, 4);
    assert.ok(ablationCells.every((c) => Boolean(c.isolatedFactor)));

    // Gate: Benchmark Validity
    const bv = auditBenchmarkValidity(plan, []);
    assert.equal(bv.status, 'pass');
    assert.equal(bv.gateId, 'benchmark-validity');
  });

  it('executes benchmark suite producing authentic, cryptographically signed RunReceipts', async () => {
    const plan = createBenchmarkPlan({
      name: 'Mini_Benchmark',
      tasks: ['task_eval'],
      baselines: ['baseline'],
      ablations: [
        { name: 'no_cache', isolatedFactor: 'cache' },
      ],
      metrics: ['accuracy', 'latencyMs'],
      fixedSeeds: [42],
    });

    // Run suite using evaluator function
    const suiteResult = await runBenchmarkSuite(testDir, plan, {
      evaluator: async (cell) => {
        const isBase = cell.condition === 'baseline';
        return {
          accuracy: isBase ? 0.88 : 0.81,
          latencyMs: isBase ? 15.2 : 24.8,
        };
      },
    });

    assert.equal(suiteResult.totalRuns, 2);
    assert.equal(suiteResult.completedCount, 2);
    assert.equal(suiteResult.failedCount, 0);
    assert.equal(suiteResult.receipts.length, 2);

    for (const receipt of suiteResult.receipts) {
      assert.equal(receipt.status, 'completed');
      assert.equal(receipt.exitCode, 0);
      assert.ok(receipt.receiptSignature);
      const verify = verifyRunReceipt(receipt);
      assert.equal(verify.valid, true);
    }

    // Gate: Reproducibility
    const repro = auditReproducibility(suiteResult.receipts);
    assert.equal(repro.status, 'pass');
    assert.equal(repro.gateId, 'reproducibility');
  });

  it('compares benchmark runs, calculates metric deltas and percentage changes, and ranks variants', () => {
    const runs = [
      { runId: 'r1', variantName: 'baseline', condition: 'baseline', accuracy: 0.90, latencyMs: 20 },
      { runId: 'r2', variantName: 'pruned_30', condition: 'ablation', isolatedFactor: 'pruning', accuracy: 0.87, latencyMs: 14 },
      { runId: 'r3', variantName: 'quantized_int8', condition: 'ablation', isolatedFactor: 'quantization', accuracy: 0.89, latencyMs: 12 },
    ];

    const comp = compareBenchmarkRuns(runs, {
      primaryMetric: 'accuracy',
      higherIsBetter: true,
    });

    assert.equal(comp.bestVariant, 'baseline');
    assert.equal(comp.ranking.length, 3);
    assert.equal(comp.ranking[0].variantName, 'baseline');
    assert.equal(comp.ranking[1].variantName, 'quantized_int8');
    assert.equal(comp.ranking[2].variantName, 'pruned_30');

    // Verify deltas and percent changes
    const qEntry = comp.comparisonMatrix['quantized_int8'];
    assert.equal(qEntry.deltaVsBaseline, -0.01);
    assert.ok(Math.abs(qEntry.percentChangeVsBaseline - (-1.11)) < 0.1);

    const pEntry = comp.comparisonMatrix['pruned_30'];
    assert.equal(pEntry.deltaVsBaseline, -0.03);
  });

  it('fails reproducibility gate on tampered receipts or non-zero exit codes', () => {
    const badReceipts = [
      {
        schemaVersion: 2,
        runId: 'crashed_run',
        operationId: 'benchmark.run@1',
        status: 'failed',
        exitCode: 137, // OOM kill
        startTime: new Date().toISOString(),
        endTime: new Date().toISOString(),
        durationMs: 100,
        outputs: [],
        metrics: { stdoutBytes: 0, stderrBytes: 50 },
        receiptSignature: 'fake_sig',
      },
    ];

    const repro = auditReproducibility(badReceipts);
    assert.equal(repro.status, 'fail');
    const exitCheck = repro.checks.find((c) => c.code === 'NON_ZERO_EXIT_CODE');
    assert.ok(exitCheck);
    assert.equal(exitCheck.status, 'fail');
  });

  it('fails benchmark validity gate when ablation factor is confounded or missing', () => {
    const invalidPlan = {
      planId: 'plan_invalid',
      matrix: [
        { runId: 'r_base', condition: 'baseline', variantName: 'baseline' },
        { runId: 'r_ab1', condition: 'ablation', variantName: 'ab1', isolatedFactor: 'unknown' },
      ],
      metrics: ['score'],
      fixedSeeds: [42],
    };

    const bv = auditBenchmarkValidity(invalidPlan, []);
    assert.equal(bv.status, 'fail');
    const isoCheck = bv.checks.find((c) => c.code === 'SINGLE_FACTOR_ABLATION_ISOLATION');
    assert.ok(isoCheck);
    assert.equal(isoCheck.status, 'fail');
  });

  it('executes benchmark operations via dispatcher end-to-end', async () => {
    // 1. benchmark.plan@1
    const planOp = await dispatchOperation('benchmark.plan@1', {
      name: 'Dispatcher_Benchmark',
      tasks: ['vision_cls'],
      baselines: ['resnet50'],
      ablations: ['resnet50_no_skip'],
      metrics: ['top1_acc'],
    });
    assert.equal(planOp.status, 'completed');
    assert.ok(planOp.measurements.planId);

    // 2. benchmark.compare@1
    const compOp = await dispatchOperation('benchmark.compare@1', {
      primaryMetric: 'score',
      results: [
        { variantName: 'v1', condition: 'baseline', score: 95 },
        { variantName: 'v2', condition: 'ablation', score: 85 },
      ],
    });
    assert.equal(compOp.status, 'completed');
    assert.equal(compOp.measurements.bestVariant, 'v1');
  });
});
