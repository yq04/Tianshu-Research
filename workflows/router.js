/**
 * Adaptive Scientific Workflow Router for tianshu-research.
 * Generates minimal route decisions based on input artifacts, objectives, and explicit hints,
 * preventing unneeded literature queries on code/data tasks and ensuring reproducible gate requirements.
 */

import { RESEARCH_PARADIGMS } from './task-spec.js';

export const REASON_CODES = Object.freeze({
  EXPLICIT_PARADIGM: 'EXPLICIT_PARADIGM',
  DATASET_INPUT_PRESENT: 'DATASET_INPUT_PRESENT',
  EMPIRICAL_OBJECTIVE_MATCH: 'EMPIRICAL_OBJECTIVE_MATCH',
  FORMULA_INPUT_PRESENT: 'FORMULA_INPUT_PRESENT',
  THEORY_OBJECTIVE_MATCH: 'THEORY_OBJECTIVE_MATCH',
  CODE_INPUT_PRESENT: 'CODE_INPUT_PRESENT',
  BENCHMARK_OBJECTIVE_MATCH: 'BENCHMARK_OBJECTIVE_MATCH',
  HYPOTHESIS_OBJECTIVE_MATCH: 'HYPOTHESIS_OBJECTIVE_MATCH',
  LITERATURE_INPUT_PRESENT: 'LITERATURE_INPUT_PRESENT',
  LITERATURE_OBJECTIVE_MATCH: 'LITERATURE_OBJECTIVE_MATCH',
  DEFAULT_LITERATURE_FALLBACK: 'DEFAULT_LITERATURE_FALLBACK',
});

const EMPIRICAL_KEYWORDS = [
  '数据', '清洗', '统计', '回归', '方差', '效应量', '置信', '区间', '散点', '箱线',
  'empirical', 'dataset', 'csv', 'tsv', 'dataframe', 'p-value', 't-test',
  'anova', 'regression', 'confidence interval', 'effect size', 'clean data'
];

const THEORY_KEYWORDS = [
  '推导', '理论', '量纲', '齐次', '极限', '渐近', '边界极限', '符号计算', '偏微分',
  'formula', 'dimension', 'symbolic', 'derivation', 'asymptotic', 'boundary limit',
  'conservation law', 'equation'
];

const BENCHMARK_KEYWORDS = [
  '消融', '评测', '基准', '跑分', '吞吐', '延迟', '速度',
  'benchmark', 'ablation', 'baseline', 'latency', 'throughput', 'profiling',
  'runtime comparison', 'gpu memory'
];

const HYPOTHESIS_KEYWORDS = [
  '假说', '猜想', '验伪', '证伪', '反驳', '假设检验', '非线性试错',
  'hypothesis', 'falsify', 'conjecture', 'refute', 'refutation', 'trial loop',
  'hypothesis loop', 'revision loop'
];

const LITERATURE_KEYWORDS = [
  '文献', '论文', '综述', '检索文献', '查论文', '读论文', '精读',
  'arxiv', 'openalex', 'doi', 'survey', 'literature', 'cite', 'citation',
  'reading card', 'zotero'
];

function containsAny(text = '', keywords = []) {
  const lower = String(text || '').toLowerCase();
  return keywords.some(k => lower.includes(k.toLowerCase()));
}

/**
 * Routes a ResearchTaskSpec to an optimal RouteDecision.
 */
export function routeResearchTask(taskSpec, context = {}) {
  const reasonCodes = [];
  const missingInputs = [];
  let primary = null;
  const supporting = [];

  const inputs = Array.isArray(taskSpec.inputs) ? taskSpec.inputs : [];
  const objective = String(taskSpec.objective || '').trim();

  // Rule 1: Explicit paradigm prioritized
  if (taskSpec.explicitParadigm && RESEARCH_PARADIGMS.includes(taskSpec.explicitParadigm)) {
    primary = taskSpec.explicitParadigm;
    reasonCodes.push(REASON_CODES.EXPLICIT_PARADIGM);
  } else {
    // Rule 2: Check for hypothesis orientation first
    if (containsAny(objective, HYPOTHESIS_KEYWORDS)) {
      primary = 'hypothesis';
      reasonCodes.push(REASON_CODES.HYPOTHESIS_OBJECTIVE_MATCH);
    }
    // Rule 3: Input contains dataset or empirical objective
    else if (inputs.some(i => i.kind === 'dataset')) {
      primary = 'empirical';
      reasonCodes.push(REASON_CODES.DATASET_INPUT_PRESENT);
    } else if (containsAny(objective, EMPIRICAL_KEYWORDS)) {
      primary = 'empirical';
      reasonCodes.push(REASON_CODES.EMPIRICAL_OBJECTIVE_MATCH);
    }
    // Rule 4: Input contains formula or theoretical objective
    else if (inputs.some(i => i.kind === 'formula')) {
      primary = 'theoretical';
      reasonCodes.push(REASON_CODES.FORMULA_INPUT_PRESENT);
    } else if (containsAny(objective, THEORY_KEYWORDS)) {
      primary = 'theoretical';
      reasonCodes.push(REASON_CODES.THEORY_OBJECTIVE_MATCH);
    }
    // Rule 5: Input contains code or benchmark objective
    else if (inputs.some(i => i.kind === 'code') && containsAny(objective, BENCHMARK_KEYWORDS)) {
      primary = 'benchmark';
      reasonCodes.push(REASON_CODES.CODE_INPUT_PRESENT);
      reasonCodes.push(REASON_CODES.BENCHMARK_OBJECTIVE_MATCH);
    } else if (containsAny(objective, BENCHMARK_KEYWORDS)) {
      primary = 'benchmark';
      reasonCodes.push(REASON_CODES.BENCHMARK_OBJECTIVE_MATCH);
    }
    // Rule 6: Literature papers, DOI, arXiv, literature review
    else if (inputs.some(i => i.relativePath && (i.relativePath.includes('10.') || i.relativePath.includes('arxiv')))) {
      primary = 'literature';
      reasonCodes.push(REASON_CODES.LITERATURE_INPUT_PRESENT);
    } else if (containsAny(objective, LITERATURE_KEYWORDS)) {
      primary = 'literature';
      reasonCodes.push(REASON_CODES.LITERATURE_OBJECTIVE_MATCH);
    }
    // Fallback: literature
    else {
      primary = 'literature';
      reasonCodes.push(REASON_CODES.DEFAULT_LITERATURE_FALLBACK);
    }
  }

  // Supporting paradigms determination
  if (primary === 'empirical') {
    if (containsAny(objective, ['图', '出图', '配色', 'figure', 'palette', 'render', 'plot'])) {
      supporting.push('figure');
    }
    if (containsAny(objective, THEORY_KEYWORDS)) {
      supporting.push('theoretical');
    }
  } else if (primary === 'theoretical') {
    if (containsAny(objective, ['数值', '数值检验', '仿真', '数据', 'numeric', 'simulation', 'data'])) {
      supporting.push('empirical');
    }
  } else if (primary === 'benchmark') {
    if (containsAny(objective, ['统计', '显著性', '均值', '方差', '置信', 'statistics', 'significance'])) {
      supporting.push('empirical');
    }
    if (containsAny(objective, ['图', '出图', '可视化', 'figure', 'plot'])) {
      supporting.push('figure');
    }
  } else if (primary === 'hypothesis') {
    if (inputs.some(i => i.kind === 'dataset') || containsAny(objective, EMPIRICAL_KEYWORDS)) {
      supporting.push('empirical');
    }
    if (inputs.some(i => i.kind === 'formula') || containsAny(objective, THEORY_KEYWORDS)) {
      supporting.push('theoretical');
    }
    if (inputs.some(i => i.kind === 'code') || containsAny(objective, BENCHMARK_KEYWORDS)) {
      supporting.push('benchmark');
    }
  } else if (primary === 'literature') {
    if (containsAny(objective, EMPIRICAL_KEYWORDS)) {
      supporting.push('empirical');
    }
  }

  // Check missing inputs
  if (primary === 'empirical') {
    const hasDataset = inputs.some(i => i.kind === 'dataset');
    if (!hasDataset && !objective.includes('inline') && !objective.includes('生成数据')) {
      missingInputs.push('dataset_file_or_records');
    }
  } else if (primary === 'benchmark') {
    const hasCode = inputs.some(i => i.kind === 'code');
    if (!hasCode && !objective.includes('mock') && !objective.includes('test')) {
      missingInputs.push('benchmark_target_code');
    }
  } else if (primary === 'theoretical') {
    const hasFormula = inputs.some(i => i.kind === 'formula');
    if (!hasFormula && !containsAny(objective, ['=', 'equation', '方程', '式'])) {
      missingInputs.push('formula_or_derivation_assumptions');
    }
  }

  // Determine operations and gates
  let operations = [];
  let requiredGates = [];

  switch (primary) {
    case 'empirical': {
      operations = ['data.inspect@1'];
      if (containsAny(objective, ['清洗', '处理', '转换', 'clean', 'prepare', 'filter'])) {
        operations.push('data.prepare@1');
      }
      operations.push('statistics.compare@1', 'statistics.fit@1');
      if (containsAny(objective, ['不确定度', '误差传播', 'uncertainty'])) {
        operations.push('uncertainty.propagate@1');
      }
      if (supporting.includes('figure')) {
        operations.push('figure.render@1');
      }
      requiredGates = ['data-quality', 'statistical-validity', 'provenance-integrity'];
      if (supporting.includes('figure')) {
        requiredGates.push('figure-traceability');
      }
      break;
    }
    case 'theoretical': {
      operations = [
        'theory.dimension@1',
        'theory.symbolic@1',
        'theory.limit@1',
        'theory.numeric-check@1',
      ];
      requiredGates = ['dimensional-consistency', 'symbolic-physical', 'provenance-integrity'];
      break;
    }
    case 'benchmark': {
      operations = [
        'benchmark.plan@1',
        'benchmark.run@1',
        'benchmark.compare@1',
      ];
      requiredGates = ['benchmark-validity', 'reproducibility', 'provenance-integrity'];
      if (supporting.includes('figure')) {
        operations.push('figure.render@1');
        requiredGates.push('figure-traceability');
      }
      break;
    }
    case 'hypothesis': {
      operations = [
        'hypothesis.formulate',
        'hypothesis.test',
        'hypothesis.evaluate',
        'hypothesis.revise',
      ];
      requiredGates = ['provenance-integrity'];
      if (supporting.includes('empirical')) {
        requiredGates.push('data-quality', 'statistical-validity');
      }
      if (supporting.includes('theoretical')) {
        requiredGates.push('dimensional-consistency');
      }
      if (supporting.includes('benchmark')) {
        requiredGates.push('benchmark-validity', 'reproducibility');
      }
      break;
    }
    case 'literature':
    default: {
      operations = [
        'research_query.search_papers',
        'research_query.resolve_paper',
        'research_evidence.ingest_document',
        'research_evidence.read_section',
        'research_evidence.add_source',
        'research_evidence.add_evidence',
        'research_evidence.add_claim',
      ];
      requiredGates = ['literature-grounding', 'provenance-integrity'];
      break;
    }
  }

  return Object.freeze({
    primary,
    supporting: Object.freeze(supporting),
    reasonCodes: Object.freeze(reasonCodes),
    missingInputs: Object.freeze(missingInputs),
    operations: Object.freeze(operations),
    requiredGates: Object.freeze(requiredGates),
    taskSpec,
  });
}
