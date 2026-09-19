/**
 * Dimensional Consistency Scientific Gate for tianshu-research.
 * Verifies physical dimensional homogeneity across equations and operations
 * based on the 7 SI base dimensions [M, L, T, I, Theta, N, J].
 */

import { checkDimensions } from '../compute/compute-gateway.js';

export function auditDimensionalConsistency(input, options = {}) {
  let lhs = input?.lhs;
  let rhs = input?.rhs;
  const customUnits = input?.customUnits || input?.symbols || {};

  // Support formula/equation string like "force = mass * acceleration"
  if ((!lhs || !rhs) && (input?.equation || input?.formula || typeof input === 'string')) {
    const eq = (input.equation || input.formula || input).trim();
    if (eq.includes('=')) {
      const parts = eq.split('=');
      lhs = parts[0].trim();
      rhs = parts.slice(1).join('=').trim();
    }
  }

  if (!lhs || !rhs) {
    return {
      gateId: 'dimensional-consistency',
      status: 'fail',
      summary: 'Dimensional audit failed: both lhs and rhs expressions are required.',
      checks: [
        {
          code: 'MISSING_EXPRESSION',
          status: 'fail',
          message: 'Both lhs and rhs (or an equation with "=") must be specified.',
        },
      ],
    };
  }

  const res = checkDimensions(lhs, rhs, customUnits);
  const checks = [];

  if (res.unknown && res.unknown.length > 0) {
    checks.push({
      code: 'UNKNOWN_DIMENSIONAL_SYMBOLS',
      status: 'inconclusive',
      message: 'Expression contains unmapped physical symbols: [' + res.unknown.join(', ') + ']. Define them in customUnits.',
    });
    return {
      gateId: 'dimensional-consistency',
      status: 'inconclusive',
      summary: 'Dimensional audit INCONCLUSIVE: Unknown symbols [' + res.unknown.join(', ') + '].',
      checks,
      metrics: {
        consistent: false,
        unknownSymbols: res.unknown,
      },
    };
  }

  if (res.error) {
    checks.push({
      code: 'INCOMPATIBLE_DIMENSION_OPERATION',
      status: 'fail',
      message: res.error,
    });
    return {
      gateId: 'dimensional-consistency',
      status: 'fail',
      summary: 'Dimensional audit FAILED: ' + res.error,
      checks,
      metrics: {
        consistent: false,
        error: res.error,
      },
    };
  }

  checks.push({
    code: 'DIMENSIONAL_HOMOGENEITY',
    status: res.consistent ? 'pass' : 'fail',
    message: res.message,
  });

  const status = res.consistent ? 'pass' : 'fail';
  const summary = res.consistent
    ? 'Dimensional consistency gate PASSED: Physical dimensions are homogeneous across expressions.'
    : 'Dimensional consistency gate FAILED: ' + res.message;

  return {
    gateId: 'dimensional-consistency',
    status,
    summary,
    checks,
    metrics: {
      consistent: res.consistent,
      lhsPowers: res.lhsPowers,
      rhsPowers: res.rhsPowers,
      difference: res.difference,
    },
  };
}
