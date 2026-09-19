/**
 * Statistical Hypothesis Testing & Effect Size Analysis for tianshu-research.
 * Implements two-group comparisons (Welch's t-test, Student's t-test, paired t-test,
 * Mann-Whitney U test), Cohen's d effect sizes, and exact confidence intervals.
 *
 * CRITICAL SCIENTIFIC PRINCIPLE (task_plan.md 7.4):
 * Non-significant findings (p >= alpha) are truthful, valid scientific results.
 * When methodology is sound, gate verification passes, and the outcome is recorded
 * objectively as 'inconclusive' / 'unsupported' without degradation or false rejection.
 */

/**
 * Standard 9-term Lanczos approximation for log-gamma function.
 */
export function logGamma(x) {
  const g = 7;
  const p = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = p[0];
  const t = x + g + 0.5;
  for (let i = 1; i < p.length; i++) {
    a += p[i] / (x + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Continued fraction evaluation for regularized incomplete beta function.
 */
function betacf(a, b, x) {
  const maxIter = 100;
  const eps = 1e-12;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < 1e-30) d = 1e-30;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    h *= d * c;
    aa = -((a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < 1e-30) d = 1e-30;
    c = 1 + aa / c;
    if (Math.abs(c) < 1e-30) c = 1e-30;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < eps) break;
  }
  return h;
}

/**
 * Regularized incomplete beta function I_x(a, b).
 */
export function regularizedIncompleteBeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a;
  } else {
    return 1 - (bt * betacf(b, a, 1 - x)) / b;
  }
}

/**
 * Two-tailed p-value for Student's t distribution with df degrees of freedom.
 */
export function studentTPValue(t, df) {
  if (df <= 0) return 1.0;
  if (t === 0) return 1.0;
  const absT = Math.abs(t);
  const x = df / (df + absT * absT);
  const p = regularizedIncompleteBeta(x, df / 2, 0.5);
  return Math.max(1e-15, Math.min(1.0, p));
}

/**
 * Two-tailed p-value for standard normal distribution Z.
 */
export function normalPValue(z) {
  const absZ = Math.abs(z);
  const t = 1.0 / (1.0 + 0.2316419 * absZ);
  const d = 0.3989422804014327;
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + 1.330274429 * t))));
  const prob = 2 * d * Math.exp(-0.5 * absZ * absZ) * poly;
  return Math.max(1e-15, Math.min(1.0, prob));
}

/**
 * Inverts Student's t two-tailed CDF to find critical t-value for given alpha.
 */
export function studentTCritical(alpha, df) {
  if (df <= 0) return 1.96;
  let low = 0.0;
  let high = 100.0;
  for (let i = 0; i < 30; i++) {
    const mid = (low + high) / 2;
    const p = studentTPValue(mid, df);
    if (p > alpha) {
      low = mid;
    } else {
      high = mid;
    }
  }
  return Number(((low + high) / 2).toFixed(4));
}

export function mean(arr) {
  return arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

export function variance(arr, m) {
  if (arr.length <= 1) return 0;
  const avg = m !== undefined ? m : mean(arr);
  return arr.reduce((acc, v) => acc + Math.pow(v - avg, 2), 0) / (arr.length - 1);
}

export function std(arr, m) {
  return Math.sqrt(variance(arr, m));
}

/**
 * Performs two-group comparison and effect size calculation.
 */
export function compareTwoGroups(options = {}) {
  const rawA = options.groupA || [];
  const rawB = options.groupB || [];

  const groupA = (Array.isArray(rawA) ? rawA : []).map(Number).filter((n) => !isNaN(n) && isFinite(n));
  const groupB = (Array.isArray(rawB) ? rawB : []).map(Number).filter((n) => !isNaN(n) && isFinite(n));

  const nA = groupA.length;
  const nB = groupB.length;

  if (nA < 2 || nB < 2) {
    throw new Error('Both groupA and groupB must contain at least 2 valid numeric samples (got nA=' + nA + ', nB=' + nB + ')');
  }

  const paired = Boolean(options.paired);
  const alpha = typeof options.alpha === 'number' && options.alpha > 0 && options.alpha <= 0.5
    ? options.alpha
    : 0.05;

  let method = options.method || (paired ? 'paired_t' : 'welch');
  if (paired && method !== 'paired_t') {
    method = 'paired_t';
  }

  const mA = mean(groupA);
  const mB = mean(groupB);
  const vA = variance(groupA, mA);
  const vB = variance(groupB, mB);
  const sA = Math.sqrt(vA);
  const sB = Math.sqrt(vB);

  let statistic = 0;
  let df = 1;
  let pValue = 1.0;
  let effectSize = 0;
  let effectMetric = "Cohen's d";
  let meanDiff = mA - mB;
  let se = 0;
  let ciLower = 0;
  let ciUpper = 0;

  if (paired) {
    if (nA !== nB) {
      throw new Error('Paired comparison requires groupA and groupB to have identical length (got nA=' + nA + ', nB=' + nB + ')');
    }
    const diffs = groupA.map((val, idx) => val - groupB[idx]);
    const mD = mean(diffs);
    const vD = variance(diffs, mD);
    const sD = Math.sqrt(vD);
    df = nA - 1;
    se = sD / Math.sqrt(nA);
    statistic = se > 0 ? mD / se : 0;
    pValue = studentTPValue(statistic, df);
    effectSize = sD > 0 ? mD / sD : 0;
    effectMetric = "Cohen's d (paired)";
    meanDiff = mD;
    const tCrit = studentTCritical(alpha, df);
    ciLower = meanDiff - tCrit * se;
    ciUpper = meanDiff + tCrit * se;
  } else if (method === 'mann_whitney') {
    // Non-parametric Mann-Whitney U test
    const combined = [
      ...groupA.map((v) => ({ v, g: 'A' })),
      ...groupB.map((v) => ({ v, g: 'B' })),
    ].sort((a, b) => a.v - b.v);

    const nTotal = combined.length;
    const ranks = new Array(nTotal);
    let i = 0;
    while (i < nTotal) {
      let j = i;
      while (j < nTotal - 1 && Math.abs(combined[j + 1].v - combined[j].v) < 1e-9) {
        j++;
      }
      const avgRank = (i + 1 + j + 1) / 2;
      for (let k = i; k <= j; k++) {
        ranks[k] = avgRank;
      }
      i = j + 1;
    }

    let rankSumA = 0;
    for (let idx = 0; idx < nTotal; idx++) {
      if (combined[idx].g === 'A') rankSumA += ranks[idx];
    }

    const uA = rankSumA - (nA * (nA + 1)) / 2;
    const uB = nA * nB - uA;
    const uMin = Math.min(uA, uB);
    const meanU = (nA * nB) / 2;
    const stdU = Math.sqrt((nA * nB * (nA + nB + 1)) / 12);
    const z = stdU > 0 ? (uMin - meanU) / stdU : 0;

    statistic = Number(uMin.toFixed(2));
    pValue = normalPValue(z);
    df = nA + nB - 2;
    effectSize = Number((1 - (2 * uMin) / (nA * nB)).toFixed(4));
    effectMetric = 'Rank-biserial r';

    const pooledSd = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (df || 1));
    se = pooledSd * Math.sqrt(1 / nA + 1 / nB);
    const zCrit = 1.96;
    ciLower = meanDiff - zCrit * se;
    ciUpper = meanDiff + zCrit * se;
  } else if (method === 't_test') {
    // Student's two-sample t-test (equal variance assumed)
    df = nA + nB - 2;
    const pooledSd = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (df || 1));
    se = pooledSd * Math.sqrt(1 / nA + 1 / nB);
    statistic = se > 0 ? meanDiff / se : 0;
    pValue = studentTPValue(statistic, df);
    effectSize = pooledSd > 0 ? meanDiff / pooledSd : 0;
    effectMetric = "Cohen's d";
    const tCrit = studentTCritical(alpha, df);
    ciLower = meanDiff - tCrit * se;
    ciUpper = meanDiff + tCrit * se;
  } else {
    // Default: Welch's t-test (unequal variances)
    method = 'welch';
    const seA = vA / nA;
    const seB = vB / nB;
    se = Math.sqrt(seA + seB);
    statistic = se > 0 ? meanDiff / se : 0;

    const num = Math.pow(seA + seB, 2);
    const denom = (Math.pow(seA, 2) / (nA - 1)) + (Math.pow(seB, 2) / (nB - 1));
    df = denom > 0 ? num / denom : 1;

    pValue = studentTPValue(statistic, df);
    const pooledSd = Math.sqrt(((nA - 1) * vA + (nB - 1) * vB) / (nA + nB - 2 || 1));
    effectSize = pooledSd > 0 ? meanDiff / pooledSd : 0;
    effectMetric = "Cohen's d";
    const tCrit = studentTCritical(alpha, df);
    ciLower = meanDiff - tCrit * se;
    ciUpper = meanDiff + tCrit * se;
  }

  const significant = pValue < alpha;
  const conclusion = significant ? 'supported' : 'inconclusive';

  let conclusionText = '';
  if (significant) {
    conclusionText = '两组存在统计学显著差异 (p = ' + pValue.toFixed(4) + ' < alpha ' + alpha + ')，效应量 ' + effectMetric + ' = ' + effectSize.toFixed(4) + '。';
  } else {
    conclusionText = '两组未检测到显著差异 (p = ' + pValue.toFixed(4) + ' >= alpha ' + alpha + ')。结果客观如实记录为未获显著支持 (inconclusive)，不构成方法学缺陷。';
  }

  return {
    method,
    paired,
    alpha,
    statistic: Number(statistic.toFixed(4)),
    pValue: Number(pValue.toFixed(6)),
    df: Number(df.toFixed(2)),
    effectSize: Number(effectSize.toFixed(4)),
    effectMetric,
    confidenceInterval: [Number(ciLower.toFixed(4)), Number(ciUpper.toFixed(4))],
    confidenceLevel: 1 - alpha,
    meanA: Number(mA.toFixed(4)),
    meanB: Number(mB.toFixed(4)),
    stdA: Number(sA.toFixed(4)),
    stdB: Number(sB.toFixed(4)),
    nA,
    nB,
    meanDiff: Number(meanDiff.toFixed(4)),
    standardError: Number(se.toFixed(4)),
    significant,
    conclusion,
    conclusionText,
    summary: 'Group comparison (' + method + '): stat=' + statistic.toFixed(4) + ', p=' + pValue.toFixed(4) + ', ' + effectMetric + '=' + effectSize.toFixed(4) + ', 95% CI=[' + ciLower.toFixed(4) + ', ' + ciUpper.toFixed(4) + ']',
  };
}
