/**
 * Symbolic & Physical Consistency Scientific Gate for tianshu-research.
 * Audits mathematical transformations, boundary asymptotic limits, and physical sanity.
 *
 * CRITICAL RULE:
 * If SymPy backend is missing or degraded, returns status: 'inconclusive'.
 * NEVER falsely reports a 'pass' when the symbolic engine is absent!
 */

import { probeEnvironment, symbolicEval, numericEval } from '../compute/compute-gateway.js';

export function auditSymbolicPhysical(input, options = {}) {
  const env = probeEnvironment();
  const checks = [];

  // 1. Backend availability check (CRITICAL GATE)
  if (!env.sympy) {
    checks.push({
      code: 'SYMPY_BACKEND_UNAVAILABLE',
      status: 'inconclusive',
      message: 'SymPy is not installed in the active Python environment. Cannot definitively verify symbolic equivalence or limits.',
    });
    return {
      gateId: 'symbolic-physical',
      status: 'inconclusive',
      summary: 'Symbolic & physical gate INCONCLUSIVE: SymPy dependency missing (graceful degradation, never false pass).',
      checks,
      metrics: {
        sympyAvailable: false,
      },
    };
  }

  checks.push({
    code: 'SYMPY_BACKEND_AVAILABLE',
    status: 'pass',
    message: 'SymPy symbolic backend is operational (v' + env.sympy + ').',
  });

  // 2. Evaluate symbolic transformation or limit
  if (input?.expr) {
    const action = input.operation || input.symbolicAction || input.action || 'simplify';
    const evalRes = symbolicEval({
      expr: input.expr,
      symbolicAction: action,
      var: input.var || 'x',
      to: input.to,
      dir: input.dir,
    });

    if (!evalRes.ok || evalRes.error) {
      checks.push({
        code: 'SYMBOLIC_EVAL_ERROR',
        status: 'fail',
        message: 'Symbolic evaluation failed: ' + (evalRes.error || 'unknown error'),
      });
      return {
        gateId: 'symbolic-physical',
        status: 'fail',
        summary: 'Symbolic & physical gate FAILED: ' + (evalRes.error || 'Computation error'),
        checks,
      };
    }

    checks.push({
      code: 'SYMBOLIC_EXECUTION_SUCCESS',
      status: 'pass',
      message: 'Symbolic operation (' + action + ') succeeded: ' + evalRes.result,
    });

    // Boundary / Asymptotic check
    if (action === 'limit') {
      const isFinite = !String(evalRes.result).includes('oo') && !String(evalRes.result).includes('zoo') && !String(evalRes.result).includes('nan');
      if (input.expectFinite && !isFinite) {
        checks.push({
          code: 'ASYMPTOTIC_LIMIT_UNBOUNDED',
          status: 'fail',
          message: 'Expected finite physical boundary limit, but obtained unbounded limit: ' + evalRes.result,
        });
        return {
          gateId: 'symbolic-physical',
          status: 'fail',
          summary: 'Symbolic & physical gate FAILED: Physical limit diverges to ' + evalRes.result,
          checks,
        };
      }
      checks.push({
        code: 'LIMIT_CONSISTENCY_VERIFIED',
        status: 'pass',
        message: 'Limit boundary evaluated to ' + evalRes.result + ' (finite=' + isFinite + ').',
      });
    }

    // Expected value equality check if provided
    if (input.expected !== undefined) {
      const isExpectedMatch = String(evalRes.result).trim() === String(input.expected).trim();
      checks.push({
        code: 'EXPECTED_RESULT_MATCH',
        status: isExpectedMatch ? 'pass' : 'fail',
        message: isExpectedMatch
          ? 'Symbolic output matches expected analytical form (' + input.expected + ').'
          : 'Symbolic output (' + evalRes.result + ') does not match expected (' + input.expected + ').',
      });
      if (!isExpectedMatch) {
        return {
          gateId: 'symbolic-physical',
          status: 'fail',
          summary: 'Symbolic & physical gate FAILED: Result mismatch (' + evalRes.result + ' vs expected ' + input.expected + ').',
          checks,
        };
      }
    }
  }

  // 3. Optional numeric cross-check
  if (input?.numericCheck) {
    const nc = input.numericCheck;
    const numRes = numericEval(nc.analytic, nc.numerical, nc.tolerance || 1e-4);
    checks.push({
      code: 'NUMERIC_SANITY_CROSSCHECK',
      status: numRes.consistent ? 'pass' : 'fail',
      message: numRes.message,
    });
    if (!numRes.consistent) {
      return {
        gateId: 'symbolic-physical',
        status: 'fail',
        summary: 'Symbolic & physical gate FAILED: Numerical cross-check exceeded tolerance.',
        checks,
      };
    }
  }

  const failedCount = checks.filter((c) => c.status === 'fail').length;
  const status = failedCount === 0 ? 'pass' : 'fail';
  const summary = status === 'pass'
    ? 'Symbolic & physical consistency gate PASSED: Analytic operations verified with SymPy backend.'
    : 'Symbolic & physical consistency gate FAILED: ' + failedCount + ' check(s) failed.';

  return {
    gateId: 'symbolic-physical',
    status,
    summary,
    checks,
  };
}
