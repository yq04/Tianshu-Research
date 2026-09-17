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

export const TOOL_DESCRIPTIONS = {
  paper_search:
    'Search open-access papers on arXiv and/or OpenAlex. If query is an arXiv URL/id or DOI, looks up that one paper instead. Not a systematic review; paywalled venues and Google Scholar are not covered. After results, wait for the user to pick a paper.',
  paper_lookup:
    'Look up one paper by arXiv id, arXiv abs/pdf URL, or DOI. Returns metadata and OA PDF URL when available. Does not fetch paywalled full text.',
  journal_palette:
    'Return hex colors for journal figures (100 curated publication palettes for Python). id 1–100, role, or ColorBrewer name. mode=discrete or map. Not a plotting pipeline; not TUI themes. Omit args to list recommended roles only.',
}

export function validatePaperSearchParams(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'arguments must be an object' }
  }
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

