/**
 * Authoritative Scientific Gate Evaluator for tianshu-research.
 * Dispatches and evaluates typed scientific claims and evidence against genuine
 * domain-specific auditors (theoretical, empirical, benchmark, literature, reproducibility).
 * Strictly eliminates placeholder passes and synthetic green-lights.
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { getAllEvidenceCombined, getAllClaimsCombined } from '../ledger/legacy-adapter.js';
import { verifyEvidenceLedger } from './scientific-verifier.js';
import { auditDimensionalConsistency } from './dimensional-consistency.js';
import { auditSymbolicPhysical } from './symbolic-physical.js';
import { auditDataQuality } from './data-quality.js';
import { auditStatisticalValidity } from './statistical-validity.js';
import { auditFigureTraceability } from './figure-traceability.js';
import { auditBenchmarkValidity } from './benchmark-validity.js';
import { auditReproducibility } from './reproducibility.js';
import { aggregateGateReport } from './report.js';
import { listRuns } from '../jobs/run-store.js';

/**
 * Evaluates all applicable scientific gates for a workspace.
 * @param {string} workspace - Workspace root path
 * @param {object} [options] - Evaluation options and overrides
 * @returns {object} { results: Array<GateResult>, claims: Array<Claim>, report: GateReport }
 */
export function evaluateProjectGates(workspace = process.cwd(), options = {}) {
  const ws = resolve(workspace);
  const allEv = getAllEvidenceCombined(ws);
  const allCl = getAllClaimsCombined(ws);

  // If project has no claims and no evidence -> empty report (not_applicable)
  if (allEv.length === 0 && allCl.length === 0) {
    const report = aggregateGateReport({ results: [], claims: [], targetIds: [] });
    return { results: [], claims: [], report };
  }

  const results = [];

  // =========================================================================
  // 1. PROVENANCE & INTEGRITY GATE (Mandatory for all active projects)
  // =========================================================================
  const provChecks = [];
  const evIdSet = new Set(allEv.map(e => e.id).filter(Boolean));

  for (const ev of allEv) {
    if (!ev.id) {
      provChecks.push({
        code: 'MISSING_EVIDENCE_ID',
        status: 'fail',
        message: 'Evidence record is missing an identifier.',
      });
    }

    // Check artifact reference existence if artifactId is specified
    const artId = ev.artifactId || ev.dataArtifactId;
    if (artId) {
      const artDir = join(ws, '.rivet', 'research', 'v2', 'artifacts');
      let foundArt = false;
      if (existsSync(artDir)) {
        try {
          const subdirs = existsSync(artDir) ? require('node:fs').readdirSync(artDir) : [];
          foundArt = subdirs.some(d => d.startsWith(artId) || (ev.sha256 && d === ev.sha256));
        } catch {}
      }
      if (!foundArt && ev.relativePath) {
        foundArt = existsSync(join(ws, ev.relativePath));
      }
      if (!foundArt && !options.skipArtifactFsCheck) {
        provChecks.push({
          code: 'ARTIFACT_NOT_FOUND',
          status: 'fail',
          message: `Referenced artifact ${artId} does not exist on disk.`,
        });
      }
    }
  }

  // Check claims linkage to evidence
  for (const cl of allCl) {
    if (!cl.id) {
      provChecks.push({
        code: 'MISSING_CLAIM_ID',
        status: 'fail',
        message: 'Claim record is missing an identifier.',
      });
    }

    const linkedEvIds = Array.isArray(cl.evidenceIds) ? cl.evidenceIds : [];
    for (const refId of linkedEvIds) {
      if (!evIdSet.has(refId)) {
        provChecks.push({
          code: 'DANGLING_EVIDENCE_REFERENCE',
          status: 'fail',
          message: `Claim [${cl.id}] references non-existent evidence [${refId}].`,
        });
      }
    }
  }

  const provFailed = provChecks.filter(c => c.status === 'fail').length;
  results.push({
    gateId: 'provenance-integrity',
    status: provFailed === 0 ? 'pass' : 'fail',
    summary: provFailed === 0
      ? `All ${allEv.length} evidence and ${allCl.length} claim records verified for provenance integrity.`
      : `Provenance integrity gate FAILED: ${provFailed} structural or reference defect(s) detected.`,
    checks: provChecks,
  });

  // =========================================================================
  // 2. LITERATURE GROUNDING GATE
  // =========================================================================
  const hasLiterature = allEv.some(e => e.kind === 'literature') || allCl.some(c => c.kind === 'literature');
  if (hasLiterature) {
    const litRes = verifyEvidenceLedger(ws, { locatorThreshold: options.locatorThreshold });
    results.push({
      gateId: 'literature-grounding',
      status: litRes.valid ? 'pass' : 'fail',
      summary: litRes.valid
        ? 'Literature evidence correctly referenced and grounded in source citations.'
        : 'Literature grounding violations detected: ungrounded claims or missing locators.',
      checks: (litRes.violations || []).map(v => ({
        code: v.type || 'LITERATURE_VIOLATION',
        status: 'fail',
        message: v.message,
      })),
    });
  }

  // =========================================================================
  // 3. THEORETICAL PARADIGM GATES (Dimensional & Symbolic Consistency)
  // =========================================================================
  const hasTheoretical = allEv.some(e => e.kind === 'theoretical') || allCl.some(c => c.kind === 'theoretical');
  if (hasTheoretical) {
    const theoreticalItems = [
      ...allEv.filter(e => e.kind === 'theoretical'),
      ...allCl.filter(c => c.kind === 'theoretical'),
    ];

    // Collect formulas/equations
    const equationsToAudit = [];
    for (const item of theoreticalItems) {
      let eq = item.equation || item.formula || item.metadata?.equation || item.metadata?.formula;
      if (!eq && typeof item.statement === 'string') {
        const stmt = item.statement.trim();
        if (stmt.includes('=')) {
          eq = stmt;
        } else if (/\b(equals|equal to)\b/i.test(stmt)) {
          eq = stmt.replace(/\b(equals|equal to)\b/gi, ' = ').replace(/\btimes\b/gi, ' * ').replace(/\bdivided by\b/gi, ' / ');
        }
      }
      if (eq) {
        equationsToAudit.push({ equation: eq, item });
      } else if (item.lhs && item.rhs) {
        equationsToAudit.push({ lhs: item.lhs, rhs: item.rhs, customUnits: item.customUnits, item });
      }
    }

    if (Array.isArray(options.equations)) {
      for (const eq of options.equations) {
        equationsToAudit.push(typeof eq === 'string' ? { equation: eq } : eq);
      }
    }

    if (equationsToAudit.length === 0) {
      // Strictly INCONCLUSIVE: Cannot fabricate pass without equations!
      results.push({
        gateId: 'dimensional-consistency',
        status: 'inconclusive',
        summary: 'Dimensional audit INCONCLUSIVE: Theoretical records present but no mathematical equations or expressions were provided for dimensional audit.',
        checks: [
          {
            code: 'NO_EQUATION_FOR_AUDIT',
            status: 'inconclusive',
            message: 'Theoretical statements lack explicit mathematical formulas (lhs = rhs) for physical dimensional verification.',
          },
        ],
      });
    } else {
      const dimChecks = [];
      let anyFail = false;

      for (const eqInput of equationsToAudit) {
        const auditRes = auditDimensionalConsistency(eqInput, options);
        dimChecks.push(...auditRes.checks);
        if (auditRes.status === 'fail') {
          anyFail = true;
        }
      }

      results.push({
        gateId: 'dimensional-consistency',
        status: anyFail ? 'fail' : 'pass',
        summary: anyFail
          ? 'Dimensional consistency gate FAILED: Physical dimension mismatch in mathematical expressions.'
          : `Dimensional consistency gate PASSED: ${equationsToAudit.length} equation(s) verified for physical homogeneity.`,
        checks: dimChecks,
      });
    }

    // Symbolic / Physical sanity check if symbolic inputs provided
    const symbolicItem = theoreticalItems.find(t => t.expr || t.metadata?.expr) || options.symbolic;
    if (symbolicItem) {
      const symRes = auditSymbolicPhysical(symbolicItem.expr ? symbolicItem : symbolicItem.metadata, options);
      results.push(symRes);
    }
  }

  // =========================================================================
  // 4. EMPIRICAL PARADIGM GATES (Data Quality & Statistical Validity)
  // =========================================================================
  const hasEmpirical = allEv.some(e => e.kind === 'empirical') || allCl.some(c => c.kind === 'empirical');
  if (hasEmpirical) {
    const empiricalItems = [
      ...allEv.filter(e => e.kind === 'empirical'),
      ...allCl.filter(c => c.kind === 'empirical'),
    ];

    // --- A. Data Quality Gate ---
    let datasetFound = null;
    for (const item of empiricalItems) {
      if (item.datasetPath || item.meta?.datasetPath || item.metadata?.datasetPath) {
        datasetFound = item.datasetPath || item.meta?.datasetPath || item.metadata?.datasetPath;
        break;
      }
      if (item.data || item.profile || item.meta?.profile || item.metadata?.profile) {
        datasetFound = item.data || item.profile || item.meta?.profile || item.metadata?.profile;
        break;
      }
    }
    if (!datasetFound && options.dataset) {
      datasetFound = options.dataset;
    }

    if (!datasetFound) {
      // Strictly INCONCLUSIVE: Cannot fabricate pass without dataset!
      results.push({
        gateId: 'data-quality',
        status: 'inconclusive',
        summary: 'Data quality gate INCONCLUSIVE: Empirical claims declared, but no underlying dataset or structural profile found.',
        checks: [
          {
            code: 'DATASET_NOT_LINKED',
            status: 'inconclusive',
            message: 'No dataset path or profile linked to empirical evidence records.',
          },
        ],
      });
    } else {
      const dqRes = auditDataQuality(datasetFound, { workspace: ws, ...options });
      results.push(dqRes);
    }

    // --- B. Statistical Validity Gate ---
    let statResultFound = null;
    for (const item of empiricalItems) {
      if (item.statResult || item.meta?.statResult || item.metadata?.statResult || item.meta?.statistics || item.metadata?.statistics) {
        statResultFound = item.statResult || item.meta?.statResult || item.metadata?.statResult || item.meta?.statistics || item.metadata?.statistics;
        break;
      }
    }
    if (!statResultFound && options.statResult) {
      statResultFound = options.statResult;
    }

    if (!statResultFound) {
      // Strictly INCONCLUSIVE: Cannot fabricate pass without statistical test results!
      results.push({
        gateId: 'statistical-validity',
        status: 'inconclusive',
        summary: 'Statistical validity gate INCONCLUSIVE: Empirical claims declared, but no statistical test result or effect size reported.',
        checks: [
          {
            code: 'STAT_RESULT_NOT_FOUND',
            status: 'inconclusive',
            message: 'No two-group comparison or statistical inference result associated with empirical evidence.',
          },
        ],
      });
    } else {
      const statRes = auditStatisticalValidity(statResultFound, options);
      results.push(statRes);
    }
  }

  // =========================================================================
  // 5. FIGURE TRACEABILITY GATE
  // =========================================================================
  const figureItem = allEv.find(e => e.kind === 'figure' || e.figure || e.locator?.figure || e.metadata?.figure) || options.figure;
  if (figureItem) {
    const figInput = figureItem.metadata?.figure || figureItem.metadata || figureItem;
    const figRes = auditFigureTraceability(figInput, options);
    results.push(figRes);
  }

  // =========================================================================
  // 6. BENCHMARK PARADIGM GATES (Benchmark Validity & Reproducibility)
  // =========================================================================
  const hasBenchmark = allEv.some(e => e.kind === 'benchmark') || allCl.some(c => c.kind === 'benchmark');
  if (hasBenchmark) {
    const benchItems = [
      ...allEv.filter(e => e.kind === 'benchmark'),
      ...allCl.filter(c => c.kind === 'benchmark'),
    ];

    // --- A. Benchmark Validity (Fairness & Ablation) ---
    let planFound = null;
    let comparisonFound = null;
    for (const item of benchItems) {
      if (item.plan || item.metadata?.plan) {
        planFound = item.plan || item.metadata?.plan;
      }
      if (item.comparison || item.results || item.metadata?.comparison) {
        comparisonFound = item.comparison || item.results || item.metadata?.comparison;
      }
    }
    if (!planFound && options.benchmarkPlan) planFound = options.benchmarkPlan;
    if (!comparisonFound && options.benchmarkResults) comparisonFound = options.benchmarkResults;

    if (!planFound) {
      // Strictly INCONCLUSIVE: Cannot fabricate pass without benchmark plan!
      results.push({
        gateId: 'benchmark-validity',
        status: 'inconclusive',
        summary: 'Benchmark validity gate INCONCLUSIVE: Benchmark claims declared, but no benchmark plan or baseline matrix found.',
        checks: [
          {
            code: 'BENCHMARK_PLAN_NOT_FOUND',
            status: 'inconclusive',
            message: 'No benchmark plan found to verify baseline controls or single-factor ablation isolation.',
          },
        ],
      });
    } else {
      const bvRes = auditBenchmarkValidity(planFound, comparisonFound || [], options);
      results.push(bvRes);
    }

    // --- B. Reproducibility Gate (Execution Receipts & Checksum Verification) ---
    let receipts = [];
    for (const item of benchItems) {
      if (item.receipt) receipts.push(item.receipt);
      if (Array.isArray(item.receipts)) receipts.push(...item.receipts);
      if (item.metadata?.receipt) receipts.push(item.metadata.receipt);
      if (Array.isArray(item.metadata?.receipts)) receipts.push(...item.metadata.receipts);
    }

    // Also pull recorded receipts from run-store if none directly attached
    if (receipts.length === 0) {
      try {
        const storedRuns = listRuns(ws);
        receipts = storedRuns.map(r => r.receipt).filter(Boolean);
      } catch {}
    }

    if (receipts.length === 0 && options.receipts) {
      receipts = Array.isArray(options.receipts) ? options.receipts : [options.receipts];
    }

    // auditReproducibility strictly returns 'fail' if receipts are missing
    const reproRes = auditReproducibility(receipts, options);
    results.push(reproRes);
  }

  // =========================================================================
  // 7. AGGREGATION & FINAL REPORT
  // =========================================================================
  const report = aggregateGateReport({
    results,
    claims: allCl,
    targetIds: allCl.map(c => c.id),
  });

  return {
    results,
    claims: allCl,
    report,
  };
}
