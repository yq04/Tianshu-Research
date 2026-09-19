/**
 * Unified Tool Contracts Registry for tianshu-research.
 * Exposes authoritative schemas, enum constants, and tool descriptions.
 */

export const ROLES = [
  'categorical',
  'categorical_colorbrewer',
  'colorblind',
  'sequential',
  'diverging',
  'heatmap',
  'nature_like',
]

export const SOURCES = ['both', 'arxiv', 'openalex']

export const PAPER_SEARCH_SCHEMA = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'Keywords, arXiv abs/pdf URL, arXiv id, or DOI',
      maxLength: 2000,
    },
    source: {
      type: 'string',
      enum: SOURCES,
      description: 'Default both. Prefer arxiv for CS preprints. Ignored when query is a URL/id/DOI.',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 8,
      description: 'Results per source, 1–8 (default 5)',
    },
  },
  required: ['query'],
  additionalProperties: false,
}

export const PAPER_LOOKUP_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'string',
      description: 'arXiv id, https://arxiv.org/abs/…, or DOI',
      maxLength: 512,
    },
  },
  required: ['id'],
  additionalProperties: false,
}

export const JOURNAL_PALETTE_SCHEMA = {
  type: 'object',
  properties: {
    id: {
      type: 'integer',
      minimum: 1,
      maximum: 100,
      description: 'Palette id 1–100 (palette id 1–100)',
    },
    role: {
      type: 'string',
      enum: ROLES,
      description: 'Recommended role. colorblind = Okabe–Ito (not from the MATLAB pack).',
    },
    name: {
      type: 'string',
      description: 'Alias such as accent, dark2, spectral, viridis, okabe_ito',
    },
    mode: {
      type: 'string',
      enum: ['discrete', 'map'],
      description: 'discrete (default) or interpolated map',
    },
    n: {
      type: 'integer',
      minimum: 1,
      maximum: 256,
      description: 'discrete: take first n swatches (must not exceed palette length). map: interpolate to n (2–256, default 256)',
    },
  },
  additionalProperties: false,
}

export const RESEARCH_STATUS_SCHEMA = {
  type: 'object',
  properties: {
    workspace: {
      type: 'string',
      description: 'Optional path to research workspace. Defaults to current working directory.',
    },
  },
  additionalProperties: false,
}

export const RESEARCH_QUERY_ACTIONS = ['search_papers', 'resolve_paper']

export const RESEARCH_QUERY_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_QUERY_ACTIONS,
      description: 'Query action: search_papers or resolve_paper',
    },
    query: {
      type: 'string',
      description: 'Search keywords, arXiv URL/id, or DOI (for search_papers)',
      maxLength: 2000,
    },
    source: {
      type: 'string',
      enum: SOURCES,
      description: 'Search source: both (default), arxiv, or openalex',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 8,
      description: 'Results per source, 1–8 (default 5)',
    },
    id: {
      type: 'string',
      description: 'arXiv id, URL, or DOI (for resolve_paper)',
      maxLength: 512,
    },
  },
  required: ['action'],
  additionalProperties: false,
}

export const RESEARCH_EVIDENCE_ACTIONS = [
  'add_source',
  'add_evidence',
  'add_claim',
  'query_evidence',
  'get_summary',
  'verify_ledger',
  'ingest_document',
  'read_section',
  'export_csl_json',
  'export_ris',
  'describe_operation',
  'execute_operation',
  'plan_workflow',
  'verify_project',
  'patch_workflow',
  'step_workflow',
  'resume_workflow',
  'provide_human_input',
  'get_workflow_state',
]

export const RESEARCH_EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_EVIDENCE_ACTIONS,
      description: 'Action: add_source, add_evidence, add_claim, query_evidence, get_summary, verify_ledger, ingest_document, read_section, export_csl_json, export_ris, describe_operation, execute_operation, plan_workflow, verify_project, patch_workflow, step_workflow, resume_workflow, provide_human_input, get_workflow_state',
    },
    workspace: {
      type: 'string',
      description: 'Optional workspace path (defaults to current working directory)',
    },
    // Operation and workflow execution
    operationId: {
      type: 'string',
      description: 'Operation identifier (e.g. "theory.dimension@1")',
    },
    arguments: {
      type: 'object',
      description: 'Payload arguments for execute_operation',
    },
    args: {
      type: 'object',
      description: 'Alias for arguments',
    },
    persist: {
      type: 'boolean',
      description: 'Whether to persist operation artifacts to storage',
    },
    objective: {
      type: 'string',
      description: 'Target research goal for plan_workflow',
    },
    paradigm: {
      type: 'string',
      enum: ['literature', 'empirical', 'theoretical', 'benchmark', 'hypothesis'],
      description: 'Research paradigm for plan_workflow',
    },
    inputs: {
      type: 'array',
      description: 'Input artifact references or paths for workflow planning',
    },
    deliverables: {
      type: 'array',
      items: { type: 'string' },
      description: 'Expected deliverable artifacts for workflow planning',
    },
    budgets: {
      type: 'object',
      description: 'Execution budgets (wallSeconds, maxRuns, maxIterations)',
    },
    persistence: {
      type: 'string',
      enum: ['none', 'artifacts', 'ledger'],
      description: 'Persistence policy for workflow artifacts',
    },
    taskId: {
      type: 'string',
      description: 'Optional custom task identifier for workflow planning',
    },
    explicitParadigm: {
      type: 'string',
      enum: ['literature', 'empirical', 'theoretical', 'benchmark', 'hypothesis'],
      description: 'Explicit paradigm override for plan_workflow',
    },
    targetIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Target IDs for verify_project',
    },
    claimIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific claim IDs for verify_project',
    },
    runIds: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific run IDs for verify_project',
    },
    gates: {
      type: 'array',
      items: { type: 'string' },
      description: 'Specific gate IDs for verify_project',
    },
    // Document Ingest & Section Reading fields
    docId: {
      type: 'string',
      description: 'Document identifier for ingest_document or read_section',
    },
    sourcePath: {
      type: 'string',
      description: 'Local file path to document for ingest_document',
    },
    text: {
      type: 'string',
      description: 'Raw text content for ingest_document',
    },
    section: {
      type: ['string', 'number'],
      description: 'Section heading or numeric index for read_section',
    },
    maxChars: {
      type: 'integer',
      minimum: 200,
      maximum: 4000,
      description: 'Max characters to return in read_section (default 2000, max 4000)',
    },
    offset: {
      type: 'integer',
      minimum: 0,
      description: 'Character offset for paginating read_section (default 0)',
    },
    outputPath: {
      type: 'string',
      description: 'Custom output file path for export_csl_json or export_ris',
    },
    locatorThreshold: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Minimum required locator coverage ratio for verify_ledger (default 0.9)',
    },
    patch: {
      type: 'object',
      description: 'GraphPatch payload for patch_workflow',
    },
    nodeId: {
      type: 'string',
      description: 'Target node identifier for provide_human_input',
    },
    inputData: {
      type: 'object',
      description: 'Human input data payload for provide_human_input',
    },
    steps: {
      type: 'integer',
      description: 'Number of steps to advance workflow in step_workflow',
    },
    // Source metadata
    source: {
      type: 'object',
      description: 'Source metadata (for add_source)',
      properties: {
        id: { type: 'string' },
        type: { type: 'string' },
        title: { type: 'string' },
        authors: { type: 'array', items: { type: 'string' } },
        year: { type: 'integer' },
        doi: { type: 'string' },
        arxivId: { type: 'string' },
        landingUrl: { type: 'string' },
        pdfUrl: { type: 'string' },
        documentId: { type: 'string' },
        verification: { type: 'string' },
      },
    },
    // Evidence record
    evidence: {
      type: 'object',
      description: 'Evidence record (for add_evidence)',
      properties: {
        id: { type: 'string' },
        sourceId: { type: 'string' },
        locator: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            section: { type: 'string' },
            equation: { type: 'string' },
            figure: { type: 'string' },
            table: { type: 'string' },
            charStart: { type: 'integer' },
            charEnd: { type: 'integer' },
          },
        },
        relation: { type: 'string' },
        excerpt: { type: 'string' },
        verification: { type: 'string' },
      },
    },
    // Claim record
    claim: {
      type: 'object',
      description: 'Scientific claim (for add_claim)',
      properties: {
        id: { type: 'string' },
        statement: { type: 'string' },
        type: { type: 'string' },
        evidenceIds: { type: 'array', items: { type: 'string' } },
        status: { type: 'string' },
      },
    },
    // Query filter
    filter: {
      type: 'object',
      description: 'Query filter (for query_evidence)',
      properties: {
        sourceId: { type: 'string' },
        relation: { type: 'string' },
        text: { type: 'string' },
      },
    },
    // Top-level property aliases for convenience
    id: { type: 'string' },
    sourceId: { type: 'string' },
    title: { type: 'string' },
    type: { type: 'string' },
    authors: { type: 'array', items: { type: 'string' } },
    year: { type: 'integer' },
    doi: { type: 'string' },
    arxivId: { type: 'string' },
    landingUrl: { type: 'string' },
    pdfUrl: { type: 'string' },
    verification: { type: 'string' },
    locator: { type: 'object' },
    relation: { type: 'string' },
    excerpt: { type: 'string' },
    statement: { type: 'string' },
    evidenceIds: { type: 'array', items: { type: 'string' } },
    status: { type: 'string' },
  },
  required: ['action'],
  additionalProperties: false,
}

export const RESEARCH_COMPUTE_ACTIONS = [
  'probe_environment',
  'dimension_check',
  'numeric_eval',
  'symbolic_eval',
]

export const RESEARCH_COMPUTE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_COMPUTE_ACTIONS,
      description: 'Compute action: probe_environment, dimension_check, numeric_eval, or symbolic_eval',
    },
    lhs: {
      type: 'string',
      description: 'Left-hand side expression for dimensional analysis (e.g. "K_I" or "force / area")',
    },
    rhs: {
      type: 'string',
      description: 'Right-hand side expression for dimensional analysis (e.g. "sigma * sqrt(a)" or "pressure")',
    },
    analytic: {
      type: ['number', 'string'],
      description: 'Analytic/reference value for numerical evaluation',
    },
    numerical: {
      type: ['number', 'string'],
      description: 'Numerical/simulated value for numerical evaluation',
    },
    tolerance: {
      type: 'number',
      description: 'Relative/absolute tolerance threshold (default: 1e-4)',
    },
    expr: {
      type: 'string',
      description: 'Mathematical expression for symbolic evaluation',
    },
    symbolicAction: {
      type: 'string',
      enum: ['simplify', 'limit', 'diff'],
      description: 'Symbolic operation (default: simplify)',
    },
    var: {
      type: 'string',
      description: 'Variable name for limit or differentiation (default: "x")',
    },
    to: {
      type: ['string', 'number'],
      description: 'Target value for limit (default: "oo")',
    },
    customUnits: {
      type: 'object',
      description: 'Optional dictionary of user-defined unit/symbol dimensions',
    },
  },
  required: ['action'],
  additionalProperties: false,
}

export const RESEARCH_DOCUMENT_ACTIONS = ['inspect', 'read_section', 'locate_text', 'ingest']

export const RESEARCH_DOCUMENT_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_DOCUMENT_ACTIONS,
      description: 'Document action: inspect, read_section, locate_text, or ingest',
    },
    documentPath: {
      type: 'string',
      description: 'Local file path to document (text or markdown)',
    },
    docId: {
      type: 'string',
      description: 'Ingested document ID',
    },
    text: {
      type: 'string',
      description: 'Direct document text content',
    },
    section: {
      type: ['string', 'number'],
      description: 'Section index (number) or section heading keyword (string) for read_section',
    },
    query: {
      type: 'string',
      description: 'Search keyword or sentence for locate_text',
    },
    contextChars: {
      type: 'integer',
      description: 'Surrounding context character count for locate_text (default: 100)',
    },
    workspace: {
      type: 'string',
      description: 'Optional workspace path (defaults to current working directory)',
    },
    id: { type: 'string', description: 'Document ID (for ingest)' },
    title: { type: 'string', description: 'Document title' },
    sourcePath: { type: 'string', description: 'Source file path for ingest' },
    authors: { type: 'array', items: { type: 'string' }, description: 'Authors list' },
    doi: { type: 'string', description: 'Document DOI' },
    arxivId: { type: 'string', description: 'Document arXiv ID' },
  },
  required: ['action'],
  additionalProperties: false,
}

export const RESEARCH_JOB_ACTIONS = ['start', 'query', 'update', 'cancel', 'list', 'report']

export const RESEARCH_JOB_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_JOB_ACTIONS,
      description: 'Job action: start, query, update, cancel, list, or report',
    },
    jobId: {
      type: 'string',
      description: 'Unique job identifier',
    },
    id: {
      type: 'string',
      description: 'Alias for jobId',
    },
    type: {
      type: 'string',
      description: 'Job task type (e.g. batch_search, screening, evidence_audit)',
    },
    title: {
      type: 'string',
      description: 'Job title / human readable description',
    },
    status: {
      type: 'string',
      description: 'Job status (for update/filter: queued, running, completed, failed, cancelled)',
    },
    progress: {
      type: 'number',
      description: 'Job progress percentage (0-100)',
    },
    message: {
      type: 'string',
      description: 'Progress update or event log message',
    },
    event: {
      type: 'string',
      description: 'Event name for event stream append',
    },
    reason: {
      type: 'string',
      description: 'Reason for cancellation',
    },
    payload: {
      type: 'object',
      description: 'Initial parameters / task payload for start',
    },
    result: {
      type: 'object',
      description: 'Final result artifact for completed job',
    },
    stateTransition: {
      type: 'string',
      description: 'CVM state machine transition (e.g. PLAN -> EXECUTE, EXECUTE -> REFLECT)',
    },
    state_transition: {
      type: 'string',
      description: 'Alias for stateTransition',
    },
    causalReason: {
      type: 'string',
      description: 'Semantic justification/cause for state transition or action outcome',
    },
    causal_reason: {
      type: 'string',
      description: 'Alias for causalReason',
    },
    confidence: {
      type: 'number',
      minimum: 0,
      maximum: 1,
      description: 'Confidence score (0.0 to 1.0) for the step decision or extraction',
    },
    metrics: {
      type: 'object',
      description: 'Context metrics, token usage, or domain performance indicators',
    },
    traceAction: {
      type: 'string',
      description: 'Action label associated with this causal trace event',
    },
    workspace: {
      type: 'string',
      description: 'Optional workspace path (defaults to current working directory)',
    },
  },
  required: ['action'],
  additionalProperties: false,
}

export const TOOL_DESCRIPTIONS = {
  research_query:
    'Read-only scholarly query gateway. Search OA literature across arXiv and OpenAlex, or resolve paper metadata by DOI/arXiv ID. Returns candidate list and abstracts in chat; does not write files or modify workspace.',
  research_evidence:
    'Structured scientific evidence ledger gateway. Used only when user asks to persist evidence, ingest documents, read sections, export Zotero/CSL/RIS, or verify claims in workspace.',
  journal_palette:
    'Return hex colors for journal figures (100 curated publication palettes for Python). id 1–100, role, or ColorBrewer name. mode=discrete or map. Not a plotting pipeline; not TUI themes. Omit args to list recommended roles only.',
  research_status:
    'Optional diagnostic tool to inspect research workspace status, evidence ledger statistics, search engine configuration, and journal figure palettes.',
  paper_search:
    'Search open-access papers on arXiv and/or OpenAlex. Internal implementation function.',
  paper_lookup:
    'Look up one paper by arXiv id, arXiv abs/pdf URL, or DOI. Internal implementation function.',
  research_compute:
    'Scientific calculation gateway (internal implementation).',
  research_document:
    'Scientific document parsing gateway (internal implementation).',
  research_job:
    'Asynchronous research task engine gateway (internal implementation).',
}

export * from './operations.js';
