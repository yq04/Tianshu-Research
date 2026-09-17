/**
 * Research Compute Gateway for tianshu-research.
 * Implements dimensional analysis, numerical spot-checks, environment probing,
 * and graceful Python/SymPy/SciPy execution and degradation.
 */

import { spawnSync } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SYMPY_RUNNER = join(__dirname, 'sympy_runner.py')

let cachedProbe = null

export function probeEnvironment(forceRefresh = false) {
  if (cachedProbe && !forceRefresh) {
    return cachedProbe
  }

  const result = {
    python: false,
    pythonVersion: null,
    numpy: false,
    scipy: false,
    sympy: false,
    capabilities: {
      dimensionalAnalysis: true, // Native Node zero-dependency
      numericalEvaluation: true, // Native Node zero-dependency
      symbolicComputation: false,
      scientificComputing: false,
    },
  }

  try {
    const probeScript = `import sys, json
info = {'python': sys.version.split()[0]}
for pkg in ['numpy', 'scipy', 'sympy']:
    try:
        mod = __import__(pkg)
        info[pkg] = getattr(mod, '__version__', True)
    except Exception:
        info[pkg] = False
print(json.dumps(info))`

    const proc = spawnSync('python', ['-c', probeScript], {
      encoding: 'utf8',
      timeout: 5000,
    })

    if (!proc.error && proc.status === 0 && proc.stdout) {
      const parsed = JSON.parse(proc.stdout.trim())
      result.python = true
      result.pythonVersion = parsed.python || null
      result.numpy = parsed.numpy || false
      result.scipy = parsed.scipy || false
      result.sympy = parsed.sympy || false
      result.capabilities.symbolicComputation = Boolean(result.sympy)
      result.capabilities.scientificComputing = Boolean(result.numpy && result.scipy)
    }
  } catch {
    // python not found or probe failed
  }

  cachedProbe = result
  return result
}

const KNOWN_DIMENSIONS = {
  m: { M: 1 },
  l: { L: 1 },
  t: { T: 1 },
  i: { I: 1 },
  theta: { Theta: 1 },
  force: { M: 1, L: 1, T: -2 },
  n: { M: 1, L: 1, T: -2 },
  pressure: { M: 1, L: -1, T: -2 },
  stress: { M: 1, L: -1, T: -2 },
  pa: { M: 1, L: -1, T: -2 },
  sigma: { M: 1, L: -1, T: -2 },
  p: { M: 1, L: -1, T: -2 },
  energy: { M: 1, L: 2, T: -2 },
  work: { M: 1, L: 2, T: -2 },
  j: { M: 1, L: 2, T: -2 },
  power: { M: 1, L: 2, T: -3 },
  w: { M: 1, L: 2, T: -3 },
  velocity: { L: 1, T: -1 },
  speed: { L: 1, T: -1 },
  v: { L: 1, T: -1 },
  acceleration: { L: 1, T: -2 },
  g: { L: 1, T: -2 },
  density: { M: 1, L: -3 },
  rho: { M: 1, L: -3 },
  area: { L: 2 },
  volume: { L: 3 },
  length: { L: 1 },
  a: { L: 1 },
  r: { L: 1 },
  d: { L: 1 },
  x: { L: 1 },
  y: { L: 1 },
  z: { L: 1 },
  mass: { M: 1 },
  time: { T: 1 },
  k_i: { M: 1, L: -0.5, T: -2 },
  k_ii: { M: 1, L: -0.5, T: -2 },
  k_ic: { M: 1, L: -0.5, T: -2 },
  stress_intensity: { M: 1, L: -0.5, T: -2 },
  pi: {},
  dimensionless: {},
  1: {},
}

function addDim(a, b) {
  const res = { ...a }
  for (const [k, v] of Object.entries(b)) {
    res[k] = (res[k] || 0) + v
    if (Math.abs(res[k]) < 1e-6) delete res[k]
  }
  return res
}

function subDim(a, b) {
  const res = { ...a }
  for (const [k, v] of Object.entries(b)) {
    res[k] = (res[k] || 0) - v
    if (Math.abs(res[k]) < 1e-6) delete res[k]
  }
  return res
}

function scaleDim(a, n) {
  const res = {}
  for (const [k, v] of Object.entries(a)) {
    const val = v * n
    if (Math.abs(val) >= 1e-6) res[k] = val
  }
  return res
}

function tokenize(str) {
  const tokens = []
  const raw = String(str).replace(/[\[\]]/g, ' ').trim()
  let i = 0
  while (i < raw.length) {
    const c = raw[i]
    if (/\s/.test(c)) { i++; continue }
    if (c === '(' || c === ')') { tokens.push({ type: 'paren', value: c }); i++; continue }
    if (c === '*' && raw[i + 1] === '*') { tokens.push({ type: 'op', value: '^' }); i += 2; continue }
    if (c === '^') { tokens.push({ type: 'op', value: '^' }); i++; continue }
    if (c === '*' || c === '/') { tokens.push({ type: 'op', value: c }); i++; continue }
    if (/[0-9]/.test(c) || (c === '-' && /[0-9]/.test(raw[i + 1] || ''))) {
      let numStr = c
      i++
      while (i < raw.length && /[0-9.]/.test(raw[i])) { numStr += raw[i]; i++ }
      tokens.push({ type: 'num', value: parseFloat(numStr) })
      continue
    }
    if (/[a-zA-Z_]/.test(c)) {
      let idStr = c
      i++
      while (i < raw.length && /[a-zA-Z0-9_]/.test(raw[i])) { idStr += raw[i]; i++ }
      tokens.push({ type: 'id', value: idStr })
      continue
    }
    i++
  }
  return tokens
}

export function parseDimension(expr, customUnits = {}) {
  const result = parseDimensionWithUnknown(expr, customUnits)
  return result.powers
}

export function parseDimensionWithUnknown(expr, customUnits = {}) {
  const tokens = tokenize(expr)
  const lookup = { ...KNOWN_DIMENSIONS, ...customUnits }
  const unknown = []
  let pos = 0

  function parseFactor() {
    const t = tokens[pos]
    if (!t) return {}
    if (t.type === 'id' && t.value.toLowerCase() === 'sqrt') {
      pos++
      if (tokens[pos] && tokens[pos].value === '(') {
        pos++
        const inner = parseTerm()
        if (tokens[pos] && tokens[pos].value === ')') pos++
        return scaleDim(inner, 0.5)
      }
    }
    if (t.type === 'paren' && t.value === '(') {
      pos++
      const inner = parseTerm()
      if (tokens[pos] && tokens[pos].value === ')') pos++
      return inner
    }
    if (t.type === 'id') {
      pos++
      const key = t.value.toLowerCase()
      if (lookup[key] !== undefined) {
        return { ...lookup[key] }
      }
      unknown.push(t.value)
      return {}
    }
    if (t.type === 'num') {
      pos++
      return {}
    }
    pos++
    return {}
  }

  function parsePower() {
    let left = parseFactor()
    if (tokens[pos] && tokens[pos].value === '^') {
      pos++
      const numToken = tokens[pos]
      if (numToken && numToken.type === 'num') {
        pos++
        left = scaleDim(left, numToken.value)
      }
    }
    return left
  }

  function parseTerm() {
    let left = parsePower()
    while (pos < tokens.length) {
      const op = tokens[pos]
      if (!op || op.type !== 'op' || (op.value !== '*' && op.value !== '/')) break
      pos++
      const right = parsePower()
      if (op.value === '*') {
        left = addDim(left, right)
      } else if (op.value === '/') {
        left = subDim(left, right)
      }
    }
    return left
  }

  const powers = parseTerm()
  return { powers, unknown: [...new Set(unknown)] }
}

export function checkDimensions(lhsExpr, rhsExpr, customUnits = {}) {
  const lhsRes = parseDimensionWithUnknown(lhsExpr, customUnits)
  const rhsRes = parseDimensionWithUnknown(rhsExpr, customUnits)
  const unknown = [...new Set([...lhsRes.unknown, ...rhsRes.unknown])]

  if (unknown.length > 0) {
    return {
      consistent: false,
      unknown,
      lhsPowers: lhsRes.powers,
      rhsPowers: rhsRes.powers,
      difference: null,
      message: '❌ 量纲检验无法判定: 表达式中包含未知量纲符号 [' + unknown.join(', ') + ']，请在 customUnits 中声明定义。',
    }
  }

  const lhsPowers = lhsRes.powers
  const rhsPowers = rhsRes.powers

  const allKeys = new Set([...Object.keys(lhsPowers), ...Object.keys(rhsPowers)])
  const diff = {}
  let consistent = true

  for (const k of allKeys) {
    const lVal = lhsPowers[k] || 0
    const rVal = rhsPowers[k] || 0
    const d = lVal - rVal
    if (Math.abs(d) > 1e-4) {
      consistent = false
      diff[k] = { lhs: lVal, rhs: rVal, difference: d }
    }
  }

  const formatPowers = (p) => {
    const parts = Object.entries(p).map(([k, v]) => (v === 1 ? k : k + '^' + v))
    return parts.length > 0 ? '[' + parts.join(' · ') + ']' : '[无量纲 / 1]'
  }

  const msg = consistent
    ? '✅ 量纲检验一致 (Consistent): ' + lhsExpr + ' ' + formatPowers(lhsPowers) + ' = ' + rhsExpr + ' ' + formatPowers(rhsPowers)
    : '❌ 量纲检验不匹配 (Inconsistent): ' + lhsExpr + ' ' + formatPowers(lhsPowers) + ' ≠ ' + rhsExpr + ' ' + formatPowers(rhsPowers)

  return {
    consistent,
    lhsPowers,
    rhsPowers,
    difference: consistent ? null : diff,
    message: msg,
  }
}

export function numericEval(analytic, numerical, tolerance = 1e-4) {
  const a = typeof analytic === 'number' ? analytic : parseFloat(analytic)
  const n = typeof numerical === 'number' ? numerical : parseFloat(numerical)
  const tol = typeof tolerance === 'number' ? tolerance : parseFloat(tolerance) || 1e-4

  if (isNaN(a) || isNaN(n)) {
    throw new Error('analytic and numerical must be valid numbers')
  }

  const absDiff = Math.abs(a - n)
  const denom = Math.max(Math.abs(a), 1e-12)
  const relError = absDiff / denom
  const consistent = relError <= tol || absDiff <= tol

  const msg = consistent
    ? `✅ 数值检验一致: 解析值 ${a}, 数值解 ${n}, 相对误差 ${(relError * 100).toFixed(4)}% <= 容差 ${(tol * 100).toFixed(4)}%`
    : `❌ 数值检验超出容差: 解析值 ${a}, 数值解 ${n}, 相对误差 ${(relError * 100).toFixed(4)}% > 容差 ${(tol * 100).toFixed(4)}%`

  return {
    consistent,
    analytic: a,
    numerical: n,
    relativeError: relError,
    absoluteError: absDiff,
    tolerance: tol,
    message: msg,
  }
}

export function symbolicEval(params = {}) {
  const env = probeEnvironment()
  if (!env.sympy) {
    return {
      available: false,
      degraded: true,
      reason: 'sympy_not_installed',
      message: 'Python SymPy 未安装。符号计算能力处于渐进降级状态。在系统中执行 `pip install sympy` 可解锁全功能代数与极限化简。',
    }
  }

  try {
    const proc = spawnSync('python', [SYMPY_RUNNER], {
      input: JSON.stringify(params),
      encoding: 'utf8',
      timeout: 10000,
    })

    if (proc.error || proc.status !== 0) {
      return {
        available: false,
        error: proc.error ? proc.error.message : proc.stderr || 'Symbolic runner error',
      }
    }

    const output = JSON.parse(proc.stdout.trim())
    return {
      available: true,
      ...output,
    }
  } catch (err) {
    return {
      available: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export async function runResearchCompute(params = {}) {
  const action = typeof params.action === 'string' ? params.action.trim() : ''

  if (action === 'probe_environment') {
    const env = probeEnvironment(true)
    const lines = [
      '### 科学计算环境诊断 (Research Compute Environment)',
      '',
      `- Python 解释器: ${env.python ? `就绪 (${env.pythonVersion})` : '未检测到可用 Python'}`,
      `- NumPy 科学矩阵: ${env.numpy ? `就绪 (v${env.numpy})` : '未安装'}`,
      `- SciPy 数值算法: ${env.scipy ? `就绪 (v${env.scipy})` : '未安装'}`,
      `- SymPy 符号代数: ${env.sympy ? `就绪 (v${env.sympy})` : '未安装 (符号计算降级)'}`,
      '',
      '#### 🚀 核心算力就绪度',
      '- **量纲分析 (Dimensional Analysis)**: 原生 Node 支持 (零依赖秒级执行)',
      '- **数值容差校验 (Numeric Spot-Check)**: 原生 Node 支持 (相对/绝对误差分析)',
      `- **符号极限与代数 (Symbolic Calculus)**: ${env.sympy ? '完整就绪 (SymPy Backend)' : '优雅降级 (Graceful Degradation)'}`,
    ]
    return {
      content: lines.join('\n'),
      data: env,
    }
  }

  if (action === 'dimension_check') {
    const lhs = params.lhs
    const rhs = params.rhs
    if (!lhs || !rhs) {
      return { content: 'Error: lhs and rhs are required for dimension_check', isError: true }
    }
    const res = checkDimensions(lhs, rhs, params.customUnits)
    return {
      content: res.message,
      data: res,
    }
  }

  if (action === 'numeric_eval') {
    const analytic = params.analytic !== undefined ? params.analytic : params.a
    const numerical = params.numerical !== undefined ? params.numerical : params.n
    if (analytic === undefined || numerical === undefined) {
      return { content: 'Error: analytic and numerical are required for numeric_eval', isError: true }
    }
    const res = numericEval(analytic, numerical, params.tolerance)
    return {
      content: res.message,
      data: res,
    }
  }

  if (action === 'symbolic_eval') {
    const res = symbolicEval(params)
    if (res.degraded) {
      return {
        content: `⚠️ **符号计算降级提示**\n\n${res.message}`,
        data: res,
      }
    }
    if (res.ok) {
      return {
        content: `✅ 符号计算完成:\n表达式: ${params.expr}\n化简/结果: ${res.result}${res.latex ? `\nLaTeX: $$${res.latex}$$` : ''}`,
        data: res,
      }
    }
    return {
      content: `符号计算失败: ${res.error || 'Unknown error'}`,
      data: res,
      isError: true,
    }
  }

  return {
    content: `Error: Unsupported research_compute action "${action}". Supported: probe_environment, dimension_check, numeric_eval, symbolic_eval`,
    isError: true,
  }
}

