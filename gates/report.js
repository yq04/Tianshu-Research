/**
 * Composable Scientific Gate Report Aggregator for tianshu-research.
 * Evaluates five-state gate results (pass, fail, inconclusive, not_applicable, error)
 * and enforces strict verification aggregation rules.
 */

export const GATE_STATUSES = ['pass', 'fail', 'inconclusive', 'not_applicable', 'error'];

/**
 * Aggregates individual gate audit results into an authoritative project GateReport.
 */
export function aggregateGateReport(options = {}) {
  const results = Array.isArray(options.results) ? options.results : [];
  const claims = Array.isArray(options.claims) ? options.claims : [];
  const targetIds = Array.isArray(options.targetIds) ? options.targetIds : [];

  const counts = {
    total: results.length,
    pass: 0,
    fail: 0,
    inconclusive: 0,
    not_applicable: 0,
    error: 0,
  };

  const unresolved = [];

  for (const r of results) {
    const status = GATE_STATUSES.includes(r.status) ? r.status : 'inconclusive';
    counts[status] = (counts[status] || 0) + 1;

    if (status === 'fail' || status === 'error') {
      unresolved.push('Gate [' + r.gateId + ']: ' + (r.summary || 'Failed check'));
    } else if (status === 'inconclusive') {
      unresolved.push('Gate [' + r.gateId + ']: Inconclusive evidence');
    }
  }

  let executionStatus = counts.error > 0 ? 'error' : 'completed';
  let verificationStatus = 'not_applicable';

  // Rule 1: Empty ledger or no targets -> not_applicable (Never report false green pass)
  if (results.length === 0 && claims.length === 0 && targetIds.length === 0) {
    verificationStatus = 'not_applicable';
  } else if (counts.fail > 0 || counts.error > 0) {
    // Rule 2: Any failure or error fails verification
    verificationStatus = 'fail';
  } else if (counts.inconclusive > 0) {
    // Rule 3: Required gate inconclusive cannot become pass
    verificationStatus = 'inconclusive';
  } else if (counts.pass > 0 && counts.fail === 0 && counts.inconclusive === 0) {
    // Rule 4: All active gates passed
    verificationStatus = 'pass';
  } else if (counts.not_applicable === results.length) {
    verificationStatus = 'not_applicable';
  }

  let summary = '';
  if (verificationStatus === 'pass') {
    summary = 'All ' + counts.pass + ' applicable scientific gates passed with verified evidence.';
  } else if (verificationStatus === 'fail') {
    summary = 'Verification failed: ' + counts.fail + ' gate(s) failed, ' + counts.error + ' error(s).';
  } else if (verificationStatus === 'inconclusive') {
    summary = 'Verification inconclusive: ' + counts.inconclusive + ' gate(s) lack definitive evidence.';
  } else {
    summary = 'No applicable claims or evidence targets to verify (not_applicable).';
  }

  return {
    executionStatus,
    verificationStatus,
    results,
    unresolved,
    summary,
    metrics: {
      totalGates: results.length,
      passed: counts.pass,
      failed: counts.fail,
      inconclusive: counts.inconclusive,
      notApplicable: counts.not_applicable,
      errors: counts.error,
    },
  };
}

/**
 * Formats a GateReport into human-readable Markdown.
 */
export function renderGateReport(report) {
  if (!report) return 'No gate report available.';

  const iconMap = {
    pass: 'PASS',
    fail: 'FAIL',
    inconclusive: 'INCONCLUSIVE',
    not_applicable: 'N/A',
    error: 'ERROR',
  };

  const lines = [
    '## Scientific Gate Verification Report',
    '',
    '- Verification Status: [' + (iconMap[report.verificationStatus] || report.verificationStatus) + ']',
    '- Execution Status: ' + report.executionStatus,
    '- Summary: ' + report.summary,
    '',
    '### Gate Breakdown (' + report.metrics.totalGates + ' total):',
    '- Passed: ' + report.metrics.passed,
    '- Failed: ' + report.metrics.failed,
    '- Inconclusive: ' + report.metrics.inconclusive,
    '- Not Applicable: ' + report.metrics.notApplicable,
    '- Errors: ' + report.metrics.errors,
    '',
  ];

  if (report.results && report.results.length > 0) {
    lines.push('### Detailed Results:');
    for (const r of report.results) {
      lines.push('- **[' + r.gateId + ']**: ' + r.status.toUpperCase() + ' — ' + (r.summary || ''));
      if (Array.isArray(r.checks) && r.checks.length > 0) {
        for (const c of r.checks) {
          lines.push('  - ' + c.code + ' (' + c.status + '): ' + c.message);
        }
      }
    }
    lines.push('');
  }

  if (report.unresolved && report.unresolved.length > 0) {
    lines.push('### Unresolved Items:');
    for (const u of report.unresolved) {
      lines.push('- ' + u);
    }
    lines.push('');
  }

  return lines.join('\n');
}
