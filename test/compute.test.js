import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  checkDimensions,
  numericEval,
  probeEnvironment,
  runResearchCompute,
} from '../compute/compute-gateway.js'
import { validateResearchComputeParams } from '../tool-contracts.js'
import { handleMcpMessage } from '../mcp-server.js'

describe('Research Compute Gateway & Tools', () => {
  describe('validateResearchComputeParams', () => {
    it('validates probe_environment action', () => {
      const v = validateResearchComputeParams({ action: 'probe_environment' })
      assert.equal(v.ok, true)
      assert.equal(v.value.action, 'probe_environment')
    })

    it('validates dimension_check parameters strictly', () => {
      const vValid = validateResearchComputeParams({
        action: 'dimension_check',
        lhs: 'K_I',
        rhs: 'sigma * sqrt(a)',
      })
      assert.equal(vValid.ok, true)

      const vMissingLhs = validateResearchComputeParams({
        action: 'dimension_check',
        rhs: 'sigma * sqrt(a)',
      })
      assert.equal(vMissingLhs.ok, false)
      assert.ok(vMissingLhs.error.includes('lhs is required'))

      const vUnknown = validateResearchComputeParams({
        action: 'dimension_check',
        lhs: 'a',
        rhs: 'b',
        unsupportedField: 123,
      })
      assert.equal(vUnknown.ok, false)
    })

    it('validates numeric_eval parameters', () => {
      const vValid = validateResearchComputeParams({
        action: 'numeric_eval',
        analytic: 10.0,
        numerical: 10.001,
        tolerance: 0.01,
      })
      assert.equal(vValid.ok, true)
      assert.equal(vValid.value.analytic, 10.0)

      const vNaN = validateResearchComputeParams({
        action: 'numeric_eval',
        analytic: 'not-a-number',
        numerical: 10.0,
      })
      assert.equal(vNaN.ok, false)
    })

    it('validates symbolic_eval parameters', () => {
      const vValid = validateResearchComputeParams({
        action: 'symbolic_eval',
        expr: 'x**2 + 2*x + 1',
        symbolicAction: 'simplify',
      })
      assert.equal(vValid.ok, true)

      const vEmpty = validateResearchComputeParams({
        action: 'symbolic_eval',
        expr: '',
      })
      assert.equal(vEmpty.ok, false)
    })
  })

  describe('checkDimensions (Dimensional Analysis)', () => {
    it('verifies fracture mechanics stress intensity factor consistency', () => {
      // K_I = sigma * sqrt(a)
      const res = checkDimensions('K_I', 'sigma * sqrt(a)')
      assert.equal(res.consistent, true)
      assert.equal(res.difference, null)
      assert.ok(res.message.includes('量纲检验一致'))
    })

    it('verifies pressure = force / area consistency', () => {
      const res = checkDimensions('pressure', 'force / area')
      assert.equal(res.consistent, true)
      assert.equal(res.lhsPowers.M, 1)
      assert.equal(res.lhsPowers.L, -1)
      assert.equal(res.lhsPowers.T, -2)
    })

    it('detects dimensional inconsistency and reports differing powers', () => {
      // K_I != sigma * a
      const res = checkDimensions('K_I', 'sigma * a')
      assert.equal(res.consistent, false)
      assert.ok(res.difference.L)
      assert.ok(res.message.includes('量纲检验不匹配'))
    })

    it('detects kinematic dimension mismatch', () => {
      // velocity != acceleration
      const res = checkDimensions('velocity', 'acceleration')
      assert.equal(res.consistent, false)
      assert.ok(res.difference.T)
    })

    it('returns consistent:false and lists unknown symbols when identifier is not recognized', () => {
      const res = checkDimensions('foo', 'bar')
      assert.equal(res.consistent, false)
      assert.ok(Array.isArray(res.unknown))
      assert.ok(res.unknown.includes('foo'))
      assert.ok(res.unknown.includes('bar'))
      assert.ok(res.message.includes('未知量纲符号'))
    })
  })

  describe('numericEval (Numerical Spot-Checks)', () => {
    it('passes when relative difference is within tolerance', () => {
      const res = numericEval(3.1415926, 3.1416, 0.001)
      assert.equal(res.consistent, true)
      assert.ok(res.relativeError < 0.001)
      assert.ok(res.message.includes('数值检验一致'))
    })

    it('fails when difference exceeds tolerance', () => {
      const res = numericEval(100.0, 110.0, 0.05)
      assert.equal(res.consistent, false)
      assert.ok(res.relativeError > 0.05)
      assert.ok(res.message.includes('数值检验超出容差'))
    })
  })

  describe('probeEnvironment & compute gateway integration', () => {
    it('probes system environment and returns structured capabilities', () => {
      const env = probeEnvironment()
      assert.equal(typeof env.python, 'boolean')
      assert.equal(env.capabilities.dimensionalAnalysis, true)
      assert.equal(env.capabilities.numericalEvaluation, true)
      assert.equal(typeof env.capabilities.symbolicComputation, 'boolean')
    })

    it('executes runResearchCompute gateway actions', async () => {
      const probeRes = await runResearchCompute({ action: 'probe_environment' })
      assert.ok(probeRes.content.includes('科学计算环境诊断'))
      assert.equal(probeRes.isError, undefined)

      const dimRes = await runResearchCompute({
        action: 'dimension_check',
        lhs: 'stress',
        rhs: 'force / area',
      })
      assert.ok(dimRes.content.includes('量纲检验一致'))

      const numRes = await runResearchCompute({
        action: 'numeric_eval',
        analytic: 42.0,
        numerical: 42.0001,
      })
      assert.ok(numRes.content.includes('数值检验一致'))

      const symRes = await runResearchCompute({
        action: 'symbolic_eval',
        expr: 'x**2 - 1',
      })
      // If sympy is missing, it reports degradation; if present, it reports result
      assert.ok(symRes.content.length > 0)
    })

        it('invokes research_compute via MCP stdio message handler returning unknown tool', async () => {
      const res = await handleMcpMessage({
        jsonrpc: '2.0',
        id: 100,
        method: 'tools/call',
        params: {
          name: 'research_compute',
          arguments: {
            action: 'dimension_check',
            lhs: 'K_I',
            rhs: 'sigma * sqrt(a)',
          },
        },
      })
      assert.equal(res.jsonrpc, '2.0')
      assert.equal(res.id, 100)
      assert.equal(res.error.code, -32601)
      assert.match(res.error.message, /Unknown tool: research_compute/)
    })
  })
})

