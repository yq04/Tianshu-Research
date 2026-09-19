/**
 * Research Task Specification (TaskSpec) for tianshu-research.
 * Normalizes user objectives, input artifacts, paradigm hints, deliverables,
 * persistence policies, and execution budgets.
 */

export const RESEARCH_PARADIGMS = Object.freeze([
  'literature',
  'empirical',
  'theoretical',
  'benchmark',
  'hypothesis',
]);

export const PERSISTENCE_LEVELS = Object.freeze(['none', 'artifacts', 'ledger']);

export const DEFAULT_BUDGETS = Object.freeze({
  wallSeconds: 300,
  maxRuns: 10,
  maxIterations: 3,
  maxParallelRuns: 2,
  maxExternalRequests: 50,
});

/**
 * Infers artifact kind from filename extension or pattern.
 */
export function inferArtifactKind(pathOrName = '') {
  const str = String(pathOrName || '').toLowerCase().trim();
  if (!str) return 'document';

  if (
    str.endsWith('.csv') ||
    str.endsWith('.tsv') ||
    str.endsWith('.parquet') ||
    str.endsWith('.h5') ||
    str.endsWith('.hdf5') ||
    str.endsWith('.feather') ||
    str.endsWith('.arrow') ||
    str.endsWith('.dat')
  ) {
    return 'dataset';
  }

  if (
    str.endsWith('.py') ||
    str.endsWith('.js') ||
    str.endsWith('.ts') ||
    str.endsWith('.sh') ||
    str.endsWith('.bash') ||
    str.endsWith('.cpp') ||
    str.endsWith('.cu')
  ) {
    return 'code';
  }

  if (
    str.endsWith('.sym') ||
    str.endsWith('.eq') ||
    str.endsWith('.tex') ||
    str.endsWith('.formula')
  ) {
    return 'formula';
  }

  if (
    str.endsWith('.png') ||
    str.endsWith('.jpg') ||
    str.endsWith('.jpeg') ||
    str.endsWith('.svg') ||
    (str.endsWith('.pdf') && str.includes('figure'))
  ) {
    return 'figure';
  }

  if (
    str.endsWith('.pdf') ||
    str.endsWith('.md') ||
    str.endsWith('.txt') ||
    str.endsWith('.xml') ||
    str.endsWith('.html') ||
    str.endsWith('.doc') ||
    str.endsWith('.docx')
  ) {
    return 'document';
  }

  return 'document';
}

/**
 * Normalizes an individual artifact reference.
 */
export function normalizeArtifactRef(input, index = 0) {
  if (!input) {
    return {
      id: 'artifact_' + (index + 1),
      kind: 'document',
      relativePath: '',
      sha256: '',
      mediaType: 'application/octet-stream',
    };
  }

  if (typeof input === 'string') {
    const trimmed = input.trim();
    const kind = inferArtifactKind(trimmed);
    return {
      id: 'input_' + (index + 1) + '_' + kind,
      kind,
      relativePath: trimmed,
      sha256: '',
      mediaType: kind === 'dataset' ? 'text/csv' : 'text/plain',
    };
  }

  const rawPath = input.relativePath || input.path || '';
  const kind = input.kind && ['document', 'dataset', 'formula', 'code', 'metrics', 'figure', 'report'].includes(input.kind)
    ? input.kind
    : inferArtifactKind(rawPath);

  return {
    id: input.id ? String(input.id).trim() : 'input_' + (index + 1) + '_' + kind,
    kind,
    relativePath: String(rawPath).trim(),
    sha256: input.sha256 ? String(input.sha256).trim() : '',
    mediaType: input.mediaType ? String(input.mediaType).trim() : 'application/octet-stream',
    producedByRunId: input.producedByRunId ? String(input.producedByRunId).trim() : undefined,
  };
}

/**
 * Creates a normalized ResearchTaskSpec.
 */
export function createResearchTaskSpec(options = {}) {
  const taskId = options.taskId
    ? String(options.taskId).trim()
    : 'task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  const objective = String(options.objective || options.statement || options.title || '').trim();

  let explicitParadigm = undefined;
  if (options.explicitParadigm || options.paradigm) {
    const candidate = String(options.explicitParadigm || options.paradigm).toLowerCase().trim();
    if (RESEARCH_PARADIGMS.includes(candidate)) {
      explicitParadigm = candidate;
    }
  }

  const rawInputs = Array.isArray(options.inputs)
    ? options.inputs
    : (options.input ? [options.input] : []);
  const inputs = rawInputs.map((item, idx) => normalizeArtifactRef(item, idx));

  const rawDeliverables = Array.isArray(options.deliverables)
    ? options.deliverables
    : (options.deliverables ? [String(options.deliverables)] : []);
  const deliverables = rawDeliverables.map(String).map((s) => s.trim()).filter(Boolean);

  let persistence = 'artifacts';
  if (options.persistence && PERSISTENCE_LEVELS.includes(String(options.persistence).toLowerCase().trim())) {
    persistence = String(options.persistence).toLowerCase().trim();
  }

  const revision = typeof options.revision === 'number' && options.revision > 0 ? options.revision : 1;

  const userBudgets = options.budgets && typeof options.budgets === 'object' ? options.budgets : {};
  const budgets = {
    wallSeconds: typeof userBudgets.wallSeconds === 'number' && userBudgets.wallSeconds > 0
      ? userBudgets.wallSeconds
      : DEFAULT_BUDGETS.wallSeconds,
    maxRuns: typeof userBudgets.maxRuns === 'number' && userBudgets.maxRuns > 0
      ? userBudgets.maxRuns
      : DEFAULT_BUDGETS.maxRuns,
    maxIterations: typeof userBudgets.maxIterations === 'number' && userBudgets.maxIterations > 0
      ? userBudgets.maxIterations
      : DEFAULT_BUDGETS.maxIterations,
    maxParallelRuns: typeof userBudgets.maxParallelRuns === 'number' && userBudgets.maxParallelRuns > 0
      ? userBudgets.maxParallelRuns
      : DEFAULT_BUDGETS.maxParallelRuns,
    maxExternalRequests: typeof userBudgets.maxExternalRequests === 'number' && userBudgets.maxExternalRequests > 0
      ? userBudgets.maxExternalRequests
      : DEFAULT_BUDGETS.maxExternalRequests,
  };

  return Object.freeze({
    taskId,
    objective,
    explicitParadigm,
    revision,
    inputs: Object.freeze(inputs),
    deliverables: Object.freeze(deliverables),
    persistence,
    budgets: Object.freeze(budgets),
    createdAt: new Date().toISOString(),
  });
}

