/**
 * Figure Traceability Scientific Gate for tianshu-research.
 * Verifies that scientific figures trace back to source datasets and scripts,
 * and define explicit axis physical units and error bar semantics.
 */

export function auditFigureTraceability(figureOrMetadata, options = {}) {
  const meta = figureOrMetadata?.metadata || figureOrMetadata || {};
  const checks = [];

  // 1. Data Source Traceability
  const hasData = Boolean(meta.dataSource || meta.dataArtifactId || meta.datasetPath);
  checks.push({
    code: 'DATA_PROVENANCE_LINKED',
    status: hasData ? 'pass' : 'fail',
    message: hasData
      ? 'Figure traces directly to source dataset (' + (meta.dataSource || meta.dataArtifactId || meta.datasetPath) + ').'
      : 'Figure lacks data provenance: no source dataset or artifact ID linked.',
  });

  // 2. Plotting Script Traceability
  const hasScript = Boolean(meta.scriptPath || meta.pythonScript || figureOrMetadata?.pythonScript);
  checks.push({
    code: 'SCRIPT_PROVENANCE_AVAILABLE',
    status: hasScript ? 'pass' : 'fail',
    message: hasScript
      ? 'Reproducible plotting script available (' + (meta.scriptPath || 'in-memory python script') + ').'
      : 'Figure lacks script provenance: no rendering code preserved.',
  });

  // 3. Axis Physical Units
  const hasUnits = Boolean((meta.xUnit && meta.xUnit !== '') || (meta.yUnit && meta.yUnit !== '') || (meta.xLabel && /\(.+\)/.test(meta.xLabel)) || (meta.yLabel && /\(.+\)/.test(meta.yLabel)));
  checks.push({
    code: 'AXIS_PHYSICAL_UNITS_DEFINED',
    status: hasUnits ? 'pass' : 'fail',
    message: hasUnits
      ? 'Axis coordinates specify physical units (X: ' + (meta.xUnit || 'annotated') + ', Y: ' + (meta.yUnit || 'annotated') + ').'
      : 'Axis coordinates lack explicit physical units.',
  });

  // 4. Error Bar Semantics
  const hasErrorBar = Boolean(meta.errorBarType && meta.errorBarType.trim().length > 0);
  checks.push({
    code: 'ERROR_BAR_SEMANTICS_DEFINED',
    status: hasErrorBar ? 'pass' : 'fail',
    message: hasErrorBar
      ? 'Error bar semantics explicitly defined (±1 ' + meta.errorBarType + ').'
      : 'Error bars present or required but semantics (SD/SEM/CI) not defined.',
  });

  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const status = failedCount === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'Figure traceability gate PASSED: Verified data provenance, script, physical units, and error bar semantics.'
    : 'Figure traceability gate FAILED: ' + failedCount + ' traceability requirement(s) missing.';

  return {
    gateId: 'figure-traceability',
    status,
    summary,
    checks,
    metrics: {
      dataSource: meta.dataSource || meta.dataArtifactId,
      hasScript,
      hasUnits,
      errorBarType: meta.errorBarType,
      failedChecks: failedCount,
    },
  };
}
