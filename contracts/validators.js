/**
 * Parameter Validators for tianshu-research tool calls.
 * Ensures strict schema compliance, rejects unknown properties, and canonicalizes inputs.
 */

import {
  ROLES,
  SOURCES,
  RESEARCH_QUERY_ACTIONS,
  RESEARCH_EVIDENCE_ACTIONS,
  RESEARCH_COMPUTE_ACTIONS,
  RESEARCH_DOCUMENT_ACTIONS,
  RESEARCH_JOB_ACTIONS,
} from './registry.js'

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
  const unk = checkUnknownProperties(raw, ['action', 'query', 'source', 'limit', 'id', 'workspace'])
  if (unk) return { ok: false, error: unk }
  const action = raw.action
  if (typeof action !== 'string' || !RESEARCH_QUERY_ACTIONS.includes(action.trim())) {
    return { ok: false, error: 'action must be one of: ' + RESEARCH_QUERY_ACTIONS.join(', ') }
  }
  const trimmedAction = action.trim()
  const workspace = typeof raw.workspace === 'string' && raw.workspace.trim() ? raw.workspace.trim() : undefined

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
    return { ok: true, value: { action: trimmedAction, query: query.trim(), source, limit, workspace } }
  }

  if (trimmedAction === 'resolve_paper') {
    const id = raw.id !== undefined ? raw.id : raw.query
    if (typeof id !== 'string' || !id.trim()) {
      return { ok: false, error: 'id (or query) is required for resolve_paper' }
    }
    if (id.length > 512) {
      return { ok: false, error: 'id must not exceed 512 characters' }
    }
    return { ok: true, value: { action: trimmedAction, id: id.trim(), workspace } }
  }

  return { ok: false, error: 'Unsupported action: ' + trimmedAction }
}

const EVIDENCE_ALLOWED_KEYS = [
  'action',
  'workspace',
  'operationId',
  'arguments',
  'args',
  'persist',
  'objective',
  'paradigm',
  'targetIds',
  'claimIds',
  'runIds',
  'gates',
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
  'inputs',
  'deliverables',
  'budgets',
  'persistence',
  'taskId',
  'explicitParadigm',
  'outputPath',
  'patch',
  'nodeId',
  'inputData',
  'data',
  'steps',
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

  if (trimmedAction === 'describe_operation') {
    const opId = raw.operationId || raw.id;
    if (!opId || typeof opId !== 'string' || !opId.trim()) {
      return { ok: false, error: 'operationId is required for describe_operation' };
    }
    return { ok: true, value: { action: trimmedAction, operationId: opId.trim(), workspace } };
  }

  if (trimmedAction === 'execute_operation') {
    const opId = raw.operationId || raw.id;
    if (!opId || typeof opId !== 'string' || !opId.trim()) {
      return { ok: false, error: 'operationId is required for execute_operation' };
    }
    const args = raw.arguments || raw.args || {};
    if (typeof args !== 'object' || Array.isArray(args)) {
      return { ok: false, error: 'arguments must be a key-value object for execute_operation' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        operationId: opId.trim(),
        arguments: args,
        args,
        persist: Boolean(raw.persist),
        workspace,
      },
    };
  }

  if (trimmedAction === 'plan_workflow') {
    const objective = raw.objective || raw.statement || raw.title;
    if (!objective || typeof objective !== 'string' || !objective.trim()) {
      return { ok: false, error: 'objective is required for plan_workflow' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        objective: objective.trim(),
        paradigm: raw.paradigm ? String(raw.paradigm).trim() : undefined,
        explicitParadigm: raw.explicitParadigm ? String(raw.explicitParadigm).trim() : undefined,
        taskId: raw.taskId ? String(raw.taskId).trim() : undefined,
        inputs: Array.isArray(raw.inputs) ? raw.inputs : (raw.input ? [raw.input] : undefined),
        deliverables: Array.isArray(raw.deliverables) ? raw.deliverables : undefined,
        persistence: raw.persistence ? String(raw.persistence).trim() : undefined,
        budgets: raw.budgets && typeof raw.budgets === 'object' ? raw.budgets : undefined,
        workspace,
      },
    };
  }

  if (trimmedAction === 'verify_project') {
    return {
      ok: true,
      value: {
        action: trimmedAction,
        targetIds: Array.isArray(raw.targetIds) ? raw.targetIds : undefined,
        claimIds: Array.isArray(raw.claimIds) ? raw.claimIds : undefined,
        runIds: Array.isArray(raw.runIds) ? raw.runIds : undefined,
        gates: Array.isArray(raw.gates) ? raw.gates : undefined,
        workspace,
      },
    };
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

  if (trimmedAction === 'patch_workflow') {
    const taskId = raw.taskId || (raw.patch && raw.patch.taskId);
    if (!taskId || typeof taskId !== 'string' || !taskId.trim()) {
      return { ok: false, error: 'taskId is required for patch_workflow' };
    }
    if (!raw.patch || typeof raw.patch !== 'object') {
      return { ok: false, error: 'patch object is required for patch_workflow' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        taskId: taskId.trim(),
        patch: raw.patch,
        workspace,
      },
    };
  }

  if (trimmedAction === 'step_workflow') {
    if (!raw.taskId || typeof raw.taskId !== 'string' || !raw.taskId.trim()) {
      return { ok: false, error: 'taskId is required for step_workflow' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        taskId: raw.taskId.trim(),
        steps: typeof raw.steps === 'number' && raw.steps > 0 ? raw.steps : 1,
        workspace,
      },
    };
  }

  if (trimmedAction === 'resume_workflow') {
    if (!raw.taskId || typeof raw.taskId !== 'string' || !raw.taskId.trim()) {
      return { ok: false, error: 'taskId is required for resume_workflow' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        taskId: raw.taskId.trim(),
        workspace,
      },
    };
  }

  if (trimmedAction === 'provide_human_input') {
    if (!raw.taskId || typeof raw.taskId !== 'string' || !raw.taskId.trim()) {
      return { ok: false, error: 'taskId is required for provide_human_input' };
    }
    const nodeId = raw.nodeId || raw.id;
    if (!nodeId || typeof nodeId !== 'string' || !nodeId.trim()) {
      return { ok: false, error: 'nodeId is required for provide_human_input' };
    }
    const inputData = raw.inputData || raw.data || {};
    return {
      ok: true,
      value: {
        action: trimmedAction,
        taskId: raw.taskId.trim(),
        nodeId: nodeId.trim(),
        inputData,
        workspace,
      },
    };
  }

  if (trimmedAction === 'get_workflow_state') {
    if (!raw.taskId || typeof raw.taskId !== 'string' || !raw.taskId.trim()) {
      return { ok: false, error: 'taskId is required for get_workflow_state' };
    }
    return {
      ok: true,
      value: {
        action: trimmedAction,
        taskId: raw.taskId.trim(),
        workspace,
      },
    };
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
