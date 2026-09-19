/**
 * Scientific Gate Registry for tianshu-research.
 * Defines composable scientific verification gates across all four research paradigms.
 */

import { auditDataQuality } from './data-quality.js';
import { auditStatisticalValidity } from './statistical-validity.js';
import { auditFigureTraceability } from './figure-traceability.js';
import { auditDimensionalConsistency } from './dimensional-consistency.js';
import { auditSymbolicPhysical } from './symbolic-physical.js';
import { auditReproducibility } from './reproducibility.js';
import { auditBenchmarkValidity } from './benchmark-validity.js';

export {
  auditDataQuality,
  auditStatisticalValidity,
  auditFigureTraceability,
  auditDimensionalConsistency,
  auditSymbolicPhysical,
  auditReproducibility,
  auditBenchmarkValidity,
};

export const GATE_REGISTRY = Object.freeze({
  'provenance-integrity': Object.freeze({
    id: 'provenance-integrity',
    name: 'Provenance & Artifact Integrity',
    description: 'Verifies existence of referenced artifacts, sha256 digests, revisions, and RunReceipt linkages.',
    applicableParadigms: Object.freeze(['literature', 'empirical', 'theoretical', 'benchmark']),
    defaultRequired: true,
  }),

  'literature-grounding': Object.freeze({
    id: 'literature-grounding',
    name: 'Literature Grounding',
    description: 'Audits source DOI/arXiv resolution, locator exactness, and excerpt inclusion.',
    applicableParadigms: Object.freeze(['literature']),
    defaultRequired: true,
  }),

  'data-quality': Object.freeze({
    id: 'data-quality',
    name: 'Data Quality & Provenance',
    description: 'Checks schema adherence, missing values, duplicates, and verifiable data transformations.',
    applicableParadigms: Object.freeze(['empirical']),
    defaultRequired: true,
  }),

  'dimensional-consistency': Object.freeze({
    id: 'dimensional-consistency',
    name: 'Dimensional Consistency',
    description: 'Ensures physical dimensional homogeneity across equations and operations.',
    applicableParadigms: Object.freeze(['theoretical', 'empirical']),
    defaultRequired: true,
  }),

  'symbolic-physical': Object.freeze({
    id: 'symbolic-physical',
    name: 'Symbolic & Boundary Verification',
    description: 'Checks symbolic transformations, boundary/asymptotic limits, and conservation laws.',
    applicableParadigms: Object.freeze(['theoretical']),
    defaultRequired: true,
  }),

  'statistical-validity': Object.freeze({
    id: 'statistical-validity',
    name: 'Statistical Validity & Effect Sizes',
    description: 'Verifies sample independence, appropriate statistical test usage, effect sizes, and confidence intervals.',
    applicableParadigms: Object.freeze(['empirical', 'benchmark']),
    defaultRequired: true,
  }),

  'reproducibility': Object.freeze({
    id: 'reproducibility',
    name: 'Run Reproducibility & Receipts',
    description: 'Audits code/data environment hashes, execution receipts, and deterministic rerun results.',
    applicableParadigms: Object.freeze(['benchmark', 'empirical']),
    defaultRequired: true,
  }),

  'benchmark-validity': Object.freeze({
    id: 'benchmark-validity',
    name: 'Benchmark Fairness & Ablations',
    description: 'Ensures equal compute budgets, identical dataset partitions, and isolated ablation factors.',
    applicableParadigms: Object.freeze(['benchmark']),
    defaultRequired: true,
  }),

  'figure-traceability': Object.freeze({
    id: 'figure-traceability',
    name: 'Figure Traceability & Units',
    description: 'Verifies figure script/data linkages, axis physical units, and error bar semantics.',
    applicableParadigms: Object.freeze(['empirical', 'benchmark', 'theoretical']),
    defaultRequired: false,
  }),
});

export function getGateDescriptor(id) {
  if (typeof id !== 'string') return null;
  return GATE_REGISTRY[id.trim()] || null;
}

export function listGateDescriptors(filter = {}) {
  const list = Object.values(GATE_REGISTRY);
  if (filter.paradigm) {
    return list.filter((g) => g.applicableParadigms.includes(filter.paradigm));
  }
  return list;
}

export function auditScientificGate(gateId, target, options = {}) {
  const id = String(gateId || '').trim();
  switch (id) {
    case 'data-quality':
      return auditDataQuality(target, options);
    case 'statistical-validity':
      return auditStatisticalValidity(target, options);
    case 'figure-traceability':
      return auditFigureTraceability(target, options);
    case 'dimensional-consistency':
      return auditDimensionalConsistency(target, options);
    case 'symbolic-physical':
      return auditSymbolicPhysical(target, options);
    case 'reproducibility':
      return auditReproducibility(target, options);
    case 'benchmark-validity':
      return auditBenchmarkValidity(target, options.results, options);
    default:
      return {
        gateId: id,
        status: 'not_applicable',
        summary: 'No specific auditor implemented for gate: ' + id,
        checks: [],
      };
  }
}
