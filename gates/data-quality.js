/**
 * Data Quality Scientific Gate for tianshu-research.
 * Audits dataset structural integrity, sample sizes, and missingness thresholds.
 */

import { inspectDataset } from '../data/inspect.js';

export function auditDataQuality(datasetOrInspection, options = {}) {
  let profile = datasetOrInspection;
  if (!profile || !profile.summary || !Array.isArray(profile.columns)) {
    try {
      const inspectOpts = typeof datasetOrInspection === 'string'
        ? { datasetPath: datasetOrInspection, workspace: options.workspace }
        : (Array.isArray(datasetOrInspection) ? { data: datasetOrInspection } : (datasetOrInspection || {}));
      profile = inspectDataset(inspectOpts);
    } catch (err) {
      return {
        gateId: 'data-quality',
        status: 'fail',
        summary: 'Data quality inspection failed: ' + (err instanceof Error ? err.message : String(err)),
        checks: [
          {
            code: 'INSPECTION_ERROR',
            status: 'fail',
            message: 'Unable to inspect dataset: ' + (err instanceof Error ? err.message : String(err)),
          },
        ],
      };
    }
  }

  const checks = [];
  const minRows = options.minRows || 2;
  const maxMissingRate = options.maxMissingRate ?? 0.25;

  // 1. Structure check
  const hasRows = (profile.rowCount || 0) >= minRows;
  checks.push({
    code: 'SAMPLE_SIZE_ADEQUATE',
    status: hasRows ? 'pass' : 'fail',
    message: hasRows
      ? 'Sample size (' + profile.rowCount + ') meets minimum threshold (' + minRows + ').'
      : 'Sample size (' + profile.rowCount + ') is below minimum required (' + minRows + ').',
  });

  // 2. Column count check
  const hasCols = (profile.columnCount || 0) > 0;
  checks.push({
    code: 'COLUMN_STRUCTURE_VALID',
    status: hasCols ? 'pass' : 'fail',
    message: hasCols
      ? 'Dataset contains ' + profile.columnCount + ' valid feature columns.'
      : 'Dataset has 0 detected columns.',
  });

  // 3. Missingness check
  const missingRate = profile.summary?.overallMissingRate ?? 0;
  const missingPass = missingRate <= maxMissingRate;
  checks.push({
    code: 'MISSING_RATE_WITHIN_BOUNDS',
    status: missingPass ? 'pass' : 'fail',
    message: missingPass
      ? 'Overall missingness rate (' + (missingRate * 100).toFixed(2) + '%) is within allowable threshold (' + (maxMissingRate * 100) + '%).'
      : 'Overall missingness rate (' + (missingRate * 100).toFixed(2) + '%) exceeds allowable threshold (' + (maxMissingRate * 100) + '%).',
  });

  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const status = failedCount === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'Data quality gate PASSED: ' + profile.rowCount + ' rows, ' + profile.columnCount + ' columns, ' + (missingRate * 100).toFixed(1) + '% missing.'
    : 'Data quality gate FAILED: ' + failedCount + ' structural or missingness defect(s) detected.';

  return {
    gateId: 'data-quality',
    status,
    summary,
    checks,
    metrics: {
      rowCount: profile.rowCount,
      columnCount: profile.columnCount,
      missingRate,
      failedChecks: failedCount,
    },
  };
}
