/**
 * Shared tool contracts and schema definitions for tianshu-research.
 * Used by both plugin entry (index.js) and stdio MCP server (mcp-server.js).
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
]

export const RESEARCH_EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_EVIDENCE_ACTIONS,
      description: 'Action: add_source, add_evidence, add_claim, query_evidence, get_summary, verify_ledger, ingest_document, read_section, export_csl_json, export_ris',
    },
    workspace: {
      type: 'string',
      description: 'Optional workspace path (defaults to current working directory)',
    },
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
        verification: { type: 'string' },
      },
    },
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
          },
        },
        relation: { type: 'string' },
        excerpt: { type: 'string' },
        verification: { type: 'string' },
      },
    },
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
    filter: {
      type: 'object',
      description: 'Query filter (for query_evidence)',
      properties: {
        sourceId: { type: 'string' },
        relation: { type: 'string' },
        text: { type: 'string' },
      },
    },
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
    'Structured scientific evidence ledger gateway. Used only when user asks to persist evidence or verify claims. Manage sources, exact locators, and claim verification in .rivet/research/ workspace.',
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

function checkUnknownProperties(raw, allowedKeys) {
  const unknown = Object.keys(raw).filter((k) => !allowedKeys.includes(k))
  if (unknown.length > 0) {
    return 'Unknown property: ' + unknown.join(', ')
  }
  return null
}

export function validatePaperSearchParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, ['query', 'source', 'limit'])
  if (unk) return { ok: false, error: unk }
  const query = raw.query
  if (typeof query !== 'string' || !query.trim()) {
    return { ok: false, error: 'query is required and must be a non-empty string' }
  }
  if (query.length > 2000) {
    return { ok: false, error: 'query must not exceed 2000 characters' }
  }
  let source = 'both'
  if (raw.source !== undefined) {
    if (typeof raw.source !== 'string' || !SOURCES.includes(raw.source.toLowerCase())) {
      return { ok: false, error: 'source must be one of: ' + SOURCES.join(', ') }
    }
    source = raw.source.toLowerCase()
  }
  let limit = 5
  if (raw.limit !== undefined) {
    if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 8) {
      return { ok: false, error: 'limit must be an integer between 1 and 8' }
    }
    limit = raw.limit
  }
  return { ok: true, value: { query: query.trim(), source, limit } }
}

export function validatePaperLookupParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, ['id'])
  if (unk) return { ok: false, error: unk }
  const id = raw.id
  if (typeof id !== 'string' || !id.trim()) {
    return { ok: false, error: 'id is required and must be a non-empty string' }
  }
  if (id.length > 512) {
    return { ok: false, error: 'id must not exceed 512 characters' }
  }
  return { ok: true, value: { id: id.trim() } }
}

export function validateJournalPaletteParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, ['id', 'role', 'name', 'mode', 'n'])
  if (unk) return { ok: false, error: unk }
  let id
  if (raw.id !== undefined) {
    if (typeof raw.id !== 'number' || !Number.isInteger(raw.id) || raw.id < 1 || raw.id > 100) {
      return { ok: false, error: 'id must be an integer between 1 and 100' }
    }
    id = raw.id
  }
  let role
  if (raw.role !== undefined) {
    if (typeof raw.role !== 'string' || !ROLES.includes(raw.role.trim())) {
      return { ok: false, error: 'role must be one of: ' + ROLES.join(', ') }
    }
    role = raw.role.trim()
  }
  let name
  if (raw.name !== undefined) {
    if (typeof raw.name !== 'string' || !raw.name.trim()) {
      return { ok: false, error: 'name must be a non-empty string' }
    }
    name = raw.name.trim()
  }
  const selectors = [id !== undefined, role !== undefined, name !== undefined].filter(Boolean).length
  if (selectors > 1) {
    return { ok: false, error: 'Provide at most one selector among id, role, and name' }
  }

  let mode = 'discrete'
  if (raw.mode !== undefined) {
    if (raw.mode !== 'discrete' && raw.mode !== 'map') {
      return { ok: false, error: "mode must be 'discrete' or 'map'" }
    }
    mode = raw.mode
  }

  let n
  if (raw.n !== undefined) {
    if (typeof raw.n !== 'number' || !Number.isInteger(raw.n)) {
      return { ok: false, error: 'n must be an integer' }
    }
    if (mode === 'map') {
      if (raw.n < 2 || raw.n > 256) {
        return { ok: false, error: 'map mode n must be an integer between 2 and 256' }
      }
    } else {
      if (raw.n < 1 || raw.n > 256) {
        return { ok: false, error: 'discrete mode n must be an integer between 1 and 256' }
      }
    }
    n = raw.n
  }

  return { ok: true, value: { id, role, name, mode, n } }
}

export function validateResearchStatusParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, ['workspace'])
  if (unk) return { ok: false, error: unk }
  let workspace
  if (raw.workspace !== undefined) {
    if (typeof raw.workspace !== 'string' || !raw.workspace.trim()) {
      return { ok: false, error: 'workspace must be a non-empty string' }
    }
    workspace = raw.workspace.trim()
  }
  return { ok: true, value: { workspace } }
}

export function validateResearchQueryParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, ['action', 'query', 'source', 'limit', 'id'])
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_QUERY_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_QUERY_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()

  if (trimmedAction === 'search_papers') {
    const query = raw.query
    if (typeof query !== 'string' || !query.trim()) {
      return { ok: false, error: 'query is required for search_papers' }
    }
    if (query.length > 2000) {
      return { ok: false, error: 'query must not exceed 2000 characters' }
    }
    let source = 'both'
    if (raw.source !== undefined) {
      if (typeof raw.source !== 'string' || !SOURCES.includes(raw.source.toLowerCase())) {
        return { ok: false, error: 'source must be one of: ' + SOURCES.join(', ') }
      }
      source = raw.source.toLowerCase()
    }
    let limit = 5
    if (raw.limit !== undefined) {
      if (typeof raw.limit !== 'number' || !Number.isInteger(raw.limit) || raw.limit < 1 || raw.limit > 8) {
        return { ok: false, error: 'limit must be an integer between 1 and 8' }
      }
      limit = raw.limit
    }
    return { ok: true, value: { action: trimmedAction, query: query.trim(), source, limit } }
  }

  if (trimmedAction === 'resolve_paper') {
    const id = raw.id !== undefined ? raw.id : raw.query
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'id (or query) is required for resolve_paper' }
    }
    if (id.length > 512) {
      return { ok: false, error: 'id must not exceed 512 characters' }
    }
    return { ok: true, value: { action: trimmedAction, id: id.trim() } }
  }

  if (trimmedAction === 'read_section') {
    const docId = (raw.docId || raw.id)
    if (!docId || typeof docId !== 'string' || !docId.trim()) {
      return { ok: false, error: 'docId (or id) is required for read_section' }
    }
    const section = raw.section ?? raw.sectionName ?? raw.heading
    if (section === undefined || section === null || String(section).trim() === '') {
      return { ok: false, error: 'section is required for read_section' }
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        workspace,
        docId: docId.trim(),
        section: typeof section === 'number' ? section : String(section).trim(),
        maxChars: raw.maxChars !== undefined ? Math.min(4000, Math.max(200, Number(raw.maxChars) || 2000)) : 2000,
        offset: raw.offset !== undefined ? Math.max(0, Number(raw.offset) || 0) : 0,
      },
    }
  }

  if (trimmedAction === 'export_csl_json' || trimmedAction === 'export_ris') {
    return {
      ok: true,
      value: {
        action: trimmedAction,
        workspace,
        outputPath: typeof raw.outputPath === 'string' && raw.outputPath.trim() ? raw.outputPath.trim() : undefined,
      },
    }
  }

  return { ok: false, error: 'Unsupported action: ' + trimmedAction }
}

const EVIDENCE_ALLOWED_KEYS = [
  'action',
  'workspace',
  'source',
  'evidence',
  'claim',
  'filter',
  'id',
  'sourceId',
  'title',
  'type',
  'authors',
  'year',
  'doi',
  'arxivId',
  'landingUrl',
  'pdfUrl',
  'documentId',
  'verification',
  'locator',
  'relation',
  'excerpt',
  'statement',
  'evidenceIds',
  'status',
  'docId',
  'text',
  'sourcePath',
  'locatorThreshold',
  'section',
  'sectionName',
  'heading',
  'maxChars',
  'offset',
  'outputPath',
]

export function validateResearchEvidenceParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, EVIDENCE_ALLOWED_KEYS)
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_EVIDENCE_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_EVIDENCE_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()
  const workspace = typeof raw.workspace === 'string' && raw.workspace.trim() ? raw.workspace.trim() : undefined

  if (trimmedAction === 'add_source') {
    const srcObj = raw.source && typeof raw.source === 'object' ? raw.source : {}
    const id = (raw.id || srcObj.id)
    const title = (raw.title || srcObj.title)
    if (!id || typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'id is required for add_source' }
    }
    if (!title || typeof title !== 'string' || !title.trim()) {
      return { ok: false, error: 'title is required for add_source' }
    }
    const source = {
      id: id.trim(),
      title: title.trim(),
      type: raw.type || srcObj.type || 'paper',
      authors: raw.authors || srcObj.authors,
      year: raw.year !== undefined ? raw.year : srcObj.year,
      doi: raw.doi || srcObj.doi,
      arxivId: raw.arxivId || srcObj.arxivId,
      landingUrl: raw.landingUrl || srcObj.landingUrl,
      pdfUrl: raw.pdfUrl || srcObj.pdfUrl,
      documentId: raw.documentId || srcObj.documentId,
      verification: raw.verification || srcObj.verification || 'unverified',
    }
    return { ok: true, value: { action: trimmedAction, workspace, source } }
  }

  if (trimmedAction === 'add_evidence') {
    const eviObj = raw.evidence && typeof raw.evidence === 'object' ? raw.evidence : {}
    const id = (raw.id || eviObj.id)
    const sourceId = (raw.sourceId || eviObj.sourceId)
    const excerpt = (raw.excerpt || eviObj.excerpt)
    if (!id || typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'id is required for add_evidence' }
    }
    if (!sourceId || typeof sourceId !== 'string' || !sourceId.trim()) {
      return { ok: false, error: 'sourceId is required for add_evidence' }
    }
    if (!excerpt || typeof excerpt !== 'string' || !excerpt.trim()) {
      return { ok: false, error: 'excerpt is required for add_evidence' }
    }
    const evidence = {
      id: id.trim(),
      sourceId: sourceId.trim(),
      excerpt: excerpt.trim(),
      locator: raw.locator || eviObj.locator || {},
      relation: raw.relation || eviObj.relation || 'supports',
      verification: raw.verification || eviObj.verification || 'unverified',
    }
    return { ok: true, value: { action: trimmedAction, workspace, evidence } }
  }

  if (trimmedAction === 'add_claim') {
    const clmObj = raw.claim && typeof raw.claim === 'object' ? raw.claim : {}
    const id = (raw.id || clmObj.id)
    const statement = (raw.statement || clmObj.statement)
    const evidenceIds = (raw.evidenceIds || clmObj.evidenceIds)
    if (!id || typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'id is required for add_claim' }
    }
    if (!statement || typeof statement !== 'string' || !statement.trim()) {
      return { ok: false, error: 'statement is required for add_claim' }
    }
    if (!Array.isArray(evidenceIds) || evidenceIds.length === 0) {
      return { ok: false, error: 'evidenceIds must be a non-empty array for add_claim' }
    }
    const claim = {
      id: id.trim(),
      statement: statement.trim(),
      evidenceIds: evidenceIds.map(e => String(e).trim()),
      type: raw.type || clmObj.type || 'finding',
      status: raw.status || clmObj.status || 'tentative',
    }
    return { ok: true, value: { action: trimmedAction, workspace, claim } }
  }

  if (trimmedAction === 'query_evidence') {
    const filterObj = raw.filter && typeof raw.filter === 'object' ? raw.filter : {}
    const filter = {
      sourceId: raw.sourceId || filterObj.sourceId,
      relation: raw.relation || filterObj.relation,
      text: raw.excerpt || raw.text || filterObj.text,
    }
    return { ok: true, value: { action: trimmedAction, workspace, filter } }
  }

  if (trimmedAction === 'get_summary') {
    return { ok: true, value: { action: trimmedAction, workspace } }
  }

  if (trimmedAction === 'verify_ledger') {
    return { ok: true, value: { action: trimmedAction, workspace, locatorThreshold: raw.locatorThreshold } }
  }

  if (trimmedAction === 'ingest_document') {
    const docId = (raw.docId || raw.id)
    if (!docId || typeof docId !== 'string' || !docId.trim()) {
      return { ok: false, error: 'docId (or id) is required for ingest_document' }
    }
    const text = raw.text
    const sourcePath = raw.sourcePath
    if (!text && !sourcePath) {
      return { ok: false, error: 'text or sourcePath is required for ingest_document' }
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        workspace,
        docId: docId.trim(),
        text: typeof text === 'string' ? text : undefined,
        sourcePath: typeof sourcePath === 'string' ? sourcePath.trim() : undefined,
        title: typeof raw.title === 'string' ? raw.title.trim() : undefined,
        doi: typeof raw.doi === 'string' ? raw.doi.trim() : undefined,
        arxivId: typeof raw.arxivId === 'string' ? raw.arxivId.trim() : undefined,
        authors: Array.isArray(raw.authors) ? raw.authors : undefined,
      },
    }
  }

  return { ok: false, error: 'Unsupported action: ' + trimmedAction }
}

const COMPUTE_ALLOWED_KEYS = [
  'action',
  'lhs',
  'rhs',
  'analytic',
  'numerical',
  'a',
  'n',
  'tolerance',
  'expr',
  'symbolicAction',
  'var',
  'to',
  'customUnits',
]

export function validateResearchComputeParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, COMPUTE_ALLOWED_KEYS)
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_COMPUTE_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_COMPUTE_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()

  if (trimmedAction === 'probe_environment') {
    return { ok: true, value: { action: trimmedAction } }
  }

  if (trimmedAction === 'dimension_check') {
    const lhs = raw.lhs
    const rhs = raw.rhs
    if (typeof lhs !== 'string' || !lhs.trim()) {
      return { ok: false, error: 'lhs is required and must be a non-empty string for dimension_check' }
    }
    if (typeof rhs !== 'string' || !rhs.trim()) {
      return { ok: false, error: 'rhs is required and must be a non-empty string for dimension_check' }
    }
    return { ok: true, value: { action: trimmedAction, lhs: lhs.trim(), rhs: rhs.trim(), customUnits: raw.customUnits } }
  }

  if (trimmedAction === 'numeric_eval') {
    const analytic = raw.analytic !== undefined ? raw.analytic : raw.a
    const numerical = raw.numerical !== undefined ? raw.numerical : raw.n
    if (analytic === undefined || isNaN(Number(analytic))) {
      return { ok: false, error: 'analytic must be a valid number or numeric string for numeric_eval' }
    }
    if (numerical === undefined || isNaN(Number(numerical))) {
      return { ok: false, error: 'numerical must be a valid number or numeric string for numeric_eval' }
    }
    let tolerance = 1e-4
    if (raw.tolerance !== undefined) {
      const t = Number(raw.tolerance)
      if (isNaN(t) || t < 0) {
        return { ok: false, error: 'tolerance must be a non-negative number' }
      }
      tolerance = t
    }
    return { ok: true, value: { action: trimmedAction, analytic: Number(analytic), numerical: Number(numerical), tolerance } }
  }

  if (trimmedAction === 'symbolic_eval') {
    const expr = raw.expr
    if (typeof expr !== 'string' || !expr.trim()) {
      return { ok: false, error: 'expr is required and must be a non-empty string for symbolic_eval' }
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        expr: expr.trim(),
        symbolicAction: raw.symbolicAction || 'simplify',
        var: raw.var || 'x',
        to: raw.to !== undefined ? raw.to : 'oo',
      },
    }
  }

  return { ok: false, error: 'Unsupported action: ' + trimmedAction }
}

const DOCUMENT_ALLOWED_KEYS = [
  'action',
  'documentPath',
  'docId',
  'id',
  'text',
  'section',
  'query',
  'contextChars',
  'workspace',
  'title',
  'sourcePath',
  'authors',
  'doi',
  'arxivId',
]

export function validateResearchDocumentParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, DOCUMENT_ALLOWED_KEYS)
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_DOCUMENT_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_DOCUMENT_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()
  const workspace = typeof raw.workspace === 'string' && raw.workspace.trim() ? raw.workspace.trim() : undefined

  return {
    ok: true,
    value: {
      action: trimmedAction,
      documentPath: raw.documentPath,
      docId: raw.docId || raw.id,
      id: raw.id || raw.docId,
      text: raw.text,
      section: raw.section,
      query: raw.query,
      contextChars: raw.contextChars !== undefined ? Number(raw.contextChars) : undefined,
      title: raw.title,
      sourcePath: raw.sourcePath,
      authors: raw.authors,
      doi: raw.doi,
      arxivId: raw.arxivId,
      workspace,
    },
  }
}

const JOB_ALLOWED_KEYS = [
  'action',
  'jobId',
  'id',
  'type',
  'title',
  'status',
  'progress',
  'message',
  'event',
  'reason',
  'payload',
  'result',
  'workspace',
  'stateTransition',
  'state_transition',
  'causalReason',
  'causal_reason',
  'confidence',
  'metrics',
  'traceAction',
]

export function validateResearchJobParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
  const unk = checkUnknownProperties(raw, JOB_ALLOWED_KEYS)
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_JOB_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_JOB_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()
  const workspace = typeof raw.workspace === 'string' && raw.workspace.trim() ? raw.workspace.trim() : undefined

  return {
    ok: true,
    value: {
      action: trimmedAction,
      jobId: raw.jobId || raw.id,
      id: raw.id || raw.jobId,
      type: raw.type,
      title: raw.title,
      status: raw.status,
      progress: raw.progress !== undefined ? Number(raw.progress) : undefined,
      message: raw.message,
      event: raw.event,
      reason: raw.reason,
      payload: raw.payload,
      result: raw.result,
      stateTransition: raw.stateTransition,
      state_transition: raw.state_transition,
      causalReason: raw.causalReason,
      causal_reason: raw.causal_reason,
      confidence: raw.confidence !== undefined ? Number(raw.confidence) : undefined,
      metrics: raw.metrics,
      traceAction: raw.traceAction,
      workspace,
    },
  }
}
