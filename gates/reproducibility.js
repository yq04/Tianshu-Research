/**
 * Reproducibility Scientific Gate for tianshu-research.
 * Audits execution receipts, cryptographic signatures, zero exit codes,
 * and truthful resource accounting.
 */

import { verifyRunReceipt } from '../jobs/run-receipt.js';

export function auditReproducibility(receiptsOrRuns, options = {}) {
  const receipts = Array.isArray(receiptsOrRuns)
    ? receiptsOrRuns
    : (Array.isArray(receiptsOrRuns?.receipts) ? receiptsOrRuns.receipts : [receiptsOrRuns]);

  const cleanReceipts = receipts.filter(Boolean);

  if (cleanReceipts.length === 0) {
    return {
      gateId: 'reproducibility',
      status: 'fail',
      summary: 'Reproducibility gate FAILED: No execution receipts provided for audit.',
      checks: [
        {
          code: 'RECEIPT_NOT_FOUND',
          status: 'fail',
          message: 'Zero RunReceipts found in benchmark execution output.',
        },
      ],
    };
  }

  const checks = [];
  let invalidSignatureCount = 0;
  let nonZeroExitCount = 0;
  let missingMetricsCount = 0;

  for (let idx = 0; idx < cleanReceipts.length; idx++) {
    const r = cleanReceipts[idx];
    const runId = r.runId || ('run_' + idx);

    // 1. Signature validity check
    const sigVerification = verifyRunReceipt(r);
    if (!sigVerification.valid) {
      invalidSignatureCount++;
      checks.push({
        code: 'SIGNATURE_INVALID',
        status: 'fail',
        message: 'Receipt for ' + runId + ' has invalid signature: ' + sigVerification.reason,
      });
    }

    // 2. Exit code check
    if (r.exitCode !== 0 || r.status !== 'completed') {
      nonZeroExitCount++;
      checks.push({
        code: 'NON_ZERO_EXIT_CODE',
        status: 'fail',
        message: 'Run ' + runId + ' exited with non-zero code ' + r.exitCode + ' (status: ' + r.status + '). Error: ' + (r.error || 'none'),
      });
    }

    // 3. Metrics accounting
    if (!r.metrics) {
      missingMetricsCount++;
      checks.push({
        code: 'METRICS_ACCOUNTING_MISSING',
        status: 'fail',
        message: 'Run ' + runId + ' lacks metrics resource accounting.',
      });
    }
  }

  const totalErrors = invalidSignatureCount + nonZeroExitCount + missingMetricsCount;
  const status = totalErrors === 0 ? 'pass' : 'fail';

  if (status === 'pass') {
    checks.push({
      code: 'ALL_RECEIPTS_VERIFIED',
      status: 'pass',
      message: 'All ' + cleanReceipts.length + ' run receipt(s) passed signature verification, completed with code 0, and recorded metrics.',
    });
  }

  const summary = status === 'pass'
    ? 'Reproducibility gate PASSED: All ' + cleanReceipts.length + ' runs verified with authentic receipts and zero exit codes.'
    : 'Reproducibility gate FAILED: Detected ' + totalErrors + ' defect(s) across receipts (' + invalidSignatureCount + ' signature, ' + nonZeroExitCount + ' exit code, ' + missingMetricsCount + ' metrics).';

  return {
    gateId: 'reproducibility',
    status,
    summary,
    checks,
    metrics: {
      totalReceipts: cleanReceipts.length,
      invalidSignatures: invalidSignatureCount,
      nonZeroExits: nonZeroExitCount,
      missingMetrics: missingMetricsCount,
    },
  };
}
