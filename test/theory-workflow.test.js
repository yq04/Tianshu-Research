/**
 * Phase 4B: Theoretical Derivation & Physics Consistency Test Suite.
 * Verifies dimensional homogeneity gates (including detecting incompatible additions),
 * symbolic and physical boundary gates (graceful degradation when SymPy absent, never false pass),
 * and numeric tolerance cross-checks.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { checkDimensions, numericEval, probeEnvironment } from '../compute/compute-gateway.js';
import { auditDimensionalConsistency } from '../gates/dimensional-consistency.js';
import { auditSymbolicPhysical } from '../gates/symbolic-physical.js';
import { dispatchOperation } from '../operations/dispatcher.js';

describe('Phase 4B: Theoretical Derivation & Physics Consistency', () => {
  it('passes dimensional consistency gate for valid physical equations', () => {
    // 1. Classical Newton: force = mass * acceleration
    const newton = auditDimensionalConsistency({
      lhs: 'force',
      rhs: 'mass * acceleration',
    });
    assert.equal(newton.status, 'pass');
    assert.equal(newton.metrics.consistent, true);

    // 2. Pressure definition: pressure = force / area
    const pressure = auditDimensionalConsistency({
      equation: 'pressure = force / area',
    });
    assert.equal(pressure.status, 'pass');
    assert.equal(pressure.metrics.consistent, true);

    // 3. Kinetic energy equivalence: energy = mass * velocity^2
    const ke = auditDimensionalConsistency({
      equation: 'energy = mass * velocity^2',
    });
    assert.equal(ke.status, 'pass');
  });

  it('fails dimensional consistency gate on cross-dimensional mismatches and incompatible addition', () => {
    // Mismatched equality: force = length
    const mismatch = auditDimensionalConsistency({
      lhs: 'force',
      rhs: 'length',
    });
    assert.equal(mismatch.status, 'fail');
    assert.equal(mismatch.metrics.consistent, false);

    // Incompatible physical addition: force + length
    const incompatibleAdd = auditDimensionalConsistency({
      lhs: 'energy',
      rhs: 'force + length',
    });
    assert.equal(incompatibleAdd.status, 'fail');
    assert.ok(incompatibleAdd.summary.includes('Incompatible dimensional addition'));
  });

  it('returns inconclusive for unrecognized symbols lacking customUnits declaration', () => {
    const unknown = auditDimensionalConsistency({
      lhs: 'force',
      rhs: 'unknown_var_x * unknown_var_y',
    });
    assert.equal(unknown.status, 'inconclusive');
    assert.ok(unknown.summary.includes('Unknown symbols'));

    // Resolves when customUnits are supplied
    const resolved = auditDimensionalConsistency({
      lhs: 'force',
      rhs: 'unknown_var_x * unknown_var_y',
      customUnits: {
        unknown_var_x: { M: 1 },
        unknown_var_y: { L: 1, T: -2 },
      },
    });
    assert.equal(resolved.status, 'pass');
  });

  it('audits symbolic physical gate with strict inconclusive degradation when SymPy absent', () => {
    const env = probeEnvironment();

    if (!env.sympy) {
      // CRITICAL: When SymPy is missing, gate MUST return inconclusive and NEVER false pass!
      const gateRes = auditSymbolicPhysical({
        expr: '1 / (1 + exp(-x))',
        operation: 'limit',
        var: 'x',
        to: 'oo',
      });
      assert.equal(gateRes.status, 'inconclusive');
      const backendCheck = gateRes.checks.find((c) => c.code === 'SYMPY_BACKEND_UNAVAILABLE');
      assert.ok(backendCheck);
      assert.equal(backendCheck.status, 'inconclusive');
    } else {
      // When SymPy is installed, executes and validates
      const gateRes = auditSymbolicPhysical({
        expr: '1 / (1 + exp(-x))',
        operation: 'limit',
        var: 'x',
        to: 'oo',
        expectFinite: true,
      });
      assert.equal(gateRes.status, 'pass');
    }
  });

  it('verifies numeric tolerance consistency across analytical and numerical values', () => {
    // Within tolerance (1e-4)
    const validNum = numericEval(Math.PI, 3.14159, 1e-4);
    assert.equal(validNum.consistent, true);

    // Exceeding tolerance
    const invalidNum = numericEval(100.0, 105.0, 1e-3);
    assert.equal(invalidNum.consistent, false);
    assert.ok(invalidNum.relativeError > 0.01);
  });

  it('executes theoretical operations via dispatcher end-to-end', async () => {
    // 1. theory.dimension@1
    const dimRes = await dispatchOperation('theory.dimension@1', {
      lhs: 'stress',
      rhs: 'force / area',
    });
    assert.equal(dimRes.status, 'completed');
    assert.equal(dimRes.measurements.consistent, true);

    // 2. theory.numeric-check@1
    const numRes = await dispatchOperation('theory.numeric-check@1', {
      analytic: 2.71828,
      numerical: 2.71825,
      tolerance: 1e-3,
    });
    assert.equal(numRes.status, 'completed');
    assert.equal(numRes.measurements.consistent, true);

    // 3. theory.limit@1 (handles degradation gracefully without throwing unhandled exceptions)
    const limRes = await dispatchOperation('theory.limit@1', {
      expr: 'x / (x + 1)',
      var: 'x',
      to: 'oo',
    });
    assert.ok(limRes.status === 'completed' || limRes.status === 'failed');
  });
});
