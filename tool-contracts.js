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
]

export const RESEARCH_EVIDENCE_SCHEMA = {
  type: 'object',
  properties: {
    action: {
      type: 'string',
      enum: RESEARCH_EVIDENCE_ACTIONS,
      description: 'Action: add_source, add_evidence, add_claim, query_evidence, get_summary, or verify_ledger',
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

export const TOOL_DESCRIPTIONS = {
  paper_search:
    'Search open-access papers on arXiv and/or OpenAlex. If query is an arXiv URL/id or DOI, looks up that one paper instead. Not a systematic review; paywalled venues and Google Scholar are not covered. After results, wait for the user to pick a paper.',
  paper_lookup:
    'Look up one paper by arXiv id, arXiv abs/pdf URL, or DOI. Returns metadata and OA PDF URL when available. Does not fetch paywalled full text.',
  journal_palette:
    'Return hex colors for journal figures (100 curated publication palettes for Python). id 1–100, role, or ColorBrewer name. mode=discrete or map. Not a plotting pipeline; not TUI themes. Omit args to list recommended roles only.',
  research_status:
    'Inspect research workspace status, evidence ledger statistics, search engine readiness, and journal figure palettes.',
  research_query:
    'Unified scholarly query gateway for paper search and metadata resolution across arXiv and OpenAlex. Action: search_papers or resolve_paper.',
  research_evidence:
    'Structured scientific evidence ledger gateway. Manage sources, exact-locator evidence, and claims in the research workspace.',
  research_compute:
    'Scientific calculation gateway. Perform dimensional consistency checks (SI/mechanics), numerical tolerance spot-checks, and optional SymPy symbolic calculus with graceful degradation.',
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
  'verification',
  'locator',
  'relation',
  'excerpt',
  'statement',
  'evidenceIds',
  'status',
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

  if (trimmedAction === 'get_summary' || trimmedAction === 'verify_ledger') {
    return { ok: true, value: { action: trimmedAction, workspace } }
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
