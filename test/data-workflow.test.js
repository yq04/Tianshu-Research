/**
 * Phase 4A: Empirical Data Analysis & Figure Closed Loop Test Suite.
 * Verifies end-to-end data inspection, parametric & non-parametric group comparisons
 * (including non-significant cases without gate failure), publication figure rendering,
 * and scientific gate audits with ZERO external paper requests.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { inspectDataset, generateInspectionReport } from '../data/inspect.js';
import { compareTwoGroups, studentTPValue, studentTCritical } from '../data/statistics.js';
import { renderFigure, generateSvgChart, generateMatplotlibScript } from '../figure/render.js';
import { auditDataQuality } from '../gates/data-quality.js';
import { auditStatisticalValidity } from '../gates/statistical-validity.js';
import { auditFigureTraceability } from '../gates/figure-traceability.js';
import { dispatchOperation } from '../operations/dispatcher.js';

describe('Phase 4A: Data Analysis & Figure Closed Loop', () => {
  let testDir;

  beforeEach(() => {
    testDir = mkdtempSync(join(tmpdir(), 'rivet-phase4a-'));
  });

  afterEach(() => {
    if (testDir && existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('inspects tabular CSV data, infers column types, and computes statistics', () => {
    const csvContent = `sample_id,reaction_time,error_count,condition,passed
S01,245.5,2,treatment,true
S02,230.1,1,treatment,true
S03,268.4,4,treatment,false
S04,310.2,5,control,false
S05,295.8,3,control,true
S06,325.0,6,control,false
`;
    const csvPath = join(testDir, 'measurements.csv');
    writeFileSync(csvPath, csvContent, 'utf8');

    const profile = inspectDataset({
      datasetPath: csvPath,
      workspace: testDir,
    });

    assert.equal(profile.rowCount, 6);
    assert.equal(profile.columnCount, 5);
    assert.deepEqual(profile.columnNames, ['sample_id', 'reaction_time', 'error_count', 'condition', 'passed']);

    const rtCol = profile.columns.find((c) => c.name === 'reaction_time');
    assert.ok(rtCol);
    assert.equal(rtCol.type, 'numeric');
    assert.equal(rtCol.missingCount, 0);
    assert.ok(rtCol.stats);
    assert.equal(rtCol.stats.min, 230.1);
    assert.equal(rtCol.stats.max, 325);
    assert.ok(rtCol.stats.mean > 270 && rtCol.stats.mean < 290);
    assert.ok(rtCol.stats.std > 30);

    const report = generateInspectionReport(profile);
    assert.ok(report.includes('数据集画像报告'));
    assert.ok(report.includes('reaction_time'));

    // Gate: Data Quality
    const dq = auditDataQuality(profile);
    assert.equal(dq.status, 'pass');
    assert.equal(dq.gateId, 'data-quality');
  });

  it('performs two-group comparison for statistically significant difference', () => {
    // Group A vs Group B: strong effect
    const groupA = [10.2, 10.8, 11.1, 9.9, 10.5, 10.3];
    const groupB = [18.2, 19.1, 18.7, 17.9, 18.5, 19.3];

    const result = compareTwoGroups({
      groupA,
      groupB,
      method: 'welch',
      alpha: 0.05,
    });

    assert.equal(result.significant, true);
    assert.equal(result.conclusion, 'supported');
    assert.ok(result.pValue < 0.001);
    assert.ok(result.effectSize < -10); // Cohen's d is large negative
    assert.ok(result.confidenceInterval[0] < result.confidenceInterval[1]);

    // Gate: Statistical Validity
    const sv = auditStatisticalValidity(result);
    assert.equal(sv.status, 'pass');
    assert.equal(sv.gateId, 'statistical-validity');
  });

  it('strictly honors non-significant results as valid findings without gate failure (Section 7.4)', () => {
    // Two groups with virtually identical distributions (non-significant)
    const control = [100.2, 101.5, 99.8, 100.6, 101.1, 99.9];
    const placebo = [100.4, 100.9, 100.1, 101.0, 100.5, 100.2];

    const result = compareTwoGroups({
      groupA: control,
      groupB: placebo,
      method: 'welch',
      alpha: 0.05,
    });

    assert.equal(result.significant, false);
    assert.equal(result.conclusion, 'inconclusive');
    assert.ok(result.pValue > 0.05);

    // CRITICAL REQUIREMENT: p >= alpha MUST pass statistical validity gate!
    const sv = auditStatisticalValidity(result);
    assert.equal(sv.status, 'pass');
    const nonSigCheck = sv.checks.find((c) => c.code === 'OBJECTIVE_NON_SIGNIFICANCE_HONORED');
    assert.ok(nonSigCheck);
    assert.equal(nonSigCheck.status, 'pass');
  });

  it('performs non-parametric Mann-Whitney U test and paired t-test', () => {
    // Mann-Whitney U
    const gA = [12, 15, 14, 18, 19, 21];
    const gB = [25, 28, 29, 33, 35, 38];
    const mw = compareTwoGroups({ groupA: gA, groupB: gB, method: 'mann_whitney' });
    assert.equal(mw.method, 'mann_whitney');
    assert.equal(mw.significant, true);
    assert.equal(mw.effectMetric, 'Rank-biserial r');

    // Paired t-test
    const pre = [120, 125, 130, 128, 135];
    const post = [110, 115, 118, 116, 122];
    const paired = compareTwoGroups({ groupA: pre, groupB: post, paired: true });
    assert.equal(paired.method, 'paired_t');
    assert.equal(paired.paired, true);
    assert.equal(paired.significant, true);
    assert.ok(paired.meanDiff > 0);
  });

  it('renders publication-quality vector SVG figure with Okabe-Ito palette and error bars', () => {
    const outputPath = join(testDir, 'fig_comparison.svg');
    const series = [
      { name: 'Baseline', mean: 25.4, error: 2.1 },
      { name: 'Optimized', mean: 38.6, error: 1.8 },
    ];

    const fig = renderFigure({
      workspace: testDir,
      outputPath,
      title: 'Algorithm Performance Comparison',
      xLabel: 'Model Architecture',
      yLabel: 'Throughput',
      xUnit: 'variant',
      yUnit: 'req/s',
      errorBarType: 'SD',
      role: 'colorblind',
      series,
      dataArtifactId: 'art_benchmark_data_001',
    });

    assert.equal(fig.format, 'svg');
    assert.ok(existsSync(outputPath));
    assert.ok(existsSync(join(testDir, 'fig_comparison.py')));

    const svgText = readFileSync(outputPath, 'utf8');
    assert.ok(svgText.includes('<svg'));
    assert.ok(svgText.includes('Throughput (req/s)'));
    assert.ok(svgText.includes('Baseline'));
    assert.ok(svgText.includes('Optimized'));
    assert.ok(svgText.includes('误差棒: ±1 SD'));

    // Gate: Figure Traceability
    const ft = auditFigureTraceability(fig);
    assert.equal(ft.status, 'pass');
    assert.equal(ft.gateId, 'figure-traceability');
  });

  it('executes full Phase 4A pipeline via dispatcher with zero literature/DOI dependencies', async () => {
    // 1. Data Inspect Operation
    const inspOp = await dispatchOperation('data.inspect@1', {
      data: [
        { temp: 20.1, pressure: 101.3 },
        { temp: 21.4, pressure: 101.5 },
        { temp: 19.8, pressure: 101.2 },
      ],
    });
    assert.equal(inspOp.status, 'completed');
    assert.equal(inspOp.measurements.rowCount, 3);

    // 2. Statistics Compare Operation
    const statOp = await dispatchOperation('statistics.compare@1', {
      groupA: [10, 12, 11, 13, 12],
      groupB: [20, 22, 21, 23, 22],
      method: 'welch',
      alpha: 0.05,
    });
    assert.equal(statOp.status, 'completed');
    assert.equal(statOp.measurements.significant, true);

    // 3. Figure Render Operation
    const figOp = await dispatchOperation('figure.render@1', {
      outputPath: join(testDir, 'pipeline_fig.svg'),
      series: [
        { name: 'Group 1', mean: 12.0, error: 1.1 },
        { name: 'Group 2', mean: 21.6, error: 1.3 },
      ],
      xLabel: 'Cohort',
      yLabel: 'Score',
      xUnit: 'group',
      yUnit: 'points',
      errorBarType: 'SD',
    });
    assert.equal(figOp.status, 'completed');
    assert.ok(existsSync(join(testDir, 'pipeline_fig.svg')));
  });
});
