/**
 * Invocation Guard for tianshu-research.
 * Intercepts tool calls, enforces workspace scope boundaries, capability checks,
 * physical junction/symlink containment, and recursive nested parameter validations.
 */

import { getOperationDescriptor } from '../contracts/operations.js'
import {
  ScopeViolationError,
  resolveWorkspaceScope,
  assertPathWithinScope,
  isPathWithinScope,
} from './workspace-scope.js'
import { validateDeepParameters, validateSafeIdentifier } from './path-policy.js'

const WRITE_ACTIONS = new Set([
  'add_source',
  'add_evidence',
  'add_claim',
  'ingest_document',
  'export_csl_json',
  'export_ris',
  'execute_operation',
])

const CAPABILITY_ACTION_MAP = {
  // Literature
  search_papers: 'literature',
  search_sources: 'literature',
  resolve_paper: 'literature',
  read_section: 'literature',
  ingest_document: 'literature',
  export_csl_json: 'literature',
  export_ris: 'literature',
  // Evidence / Gate
  add_source: 'literature',
  add_evidence: 'literature',
  add_claim: 'literature',
  verify_ledger: 'literature',
  query_evidence: 'literature',
  get_summary: 'literature',
  // Document
  inspect: 'literature',
  locate_text: 'literature',
  ingest: 'literature',
  // Job
  start: 'literature',
  query: 'literature',
  update: 'literature',
  cancel: 'literature',
  list: 'literature',
  report: 'literature',
  // Compute / Theory
  probe_environment: 'theory',
  dimension_check: 'theory',
  numeric_eval: 'theory',
  symbolic_eval: 'theory',
  // Color palette is always figure and self-contained
  journal_palette: 'figure',
}

/**
 * Validates that an invocation is permitted within the given scope context.
 */
export function assertInvocationAuthorized(toolName, action, params = {}, context = {}) {
  // 0. Check revoked status
  if (context?.state === 'revoked' || context?.scope?.status === 'revoked') {
    throw new ScopeViolationError('Operation rejected: Research workspace scope has been revoked')
  }

  // 1. Resolve effective scope
  let scope = context?.scope
  if (!scope) {
    scope = resolveWorkspaceScope({
      workspace: params.workspace,
      cwd: params.cwd,
      source: context?.source || 'default',
      trust: context?.trust,
      explicitTrust: context?.explicitTrust,
    })
  }

  if (scope?.status === 'revoked' || scope?.trust === 'revoked') {
    throw new ScopeViolationError('Operation rejected: Research workspace scope has been revoked')
  }

  // 2. Purely informational or self-contained actions
  if (
    toolName === 'journal_palette' ||
    action === 'describe_operation' ||
    toolName === 'research_status' ||
    action === 'search_papers' ||
    action === 'search_sources' ||
    action === 'resolve_paper'
  ) {
    if (
      scope?.configuredCapabilities &&
      !scope.configuredCapabilities.includes('literature') &&
      (action === 'search_papers' || action === 'search_sources' || action === 'resolve_paper')
    ) {
      throw new ScopeViolationError(
        `Capability 'literature' is disabled by workspace policy. Configured capabilities: ${scope.configuredCapabilities.join(', ')}`,
        { requiredCapability: 'literature', configured: scope.configuredCapabilities }
      )
    }
    // Deep parameter validation even on informational operations
    validateDeepParameters(params, scope)
    return { authorized: true, scope }
  }

  // 3. Check workspace research eligibility
  if (!scope.isResearchEligible) {
    throw new ScopeViolationError(
      `Workspace is not eligible for research operations. Missing .rivet/research.json or explicit authorization. Root: ${scope.canonicalRoot}`,
      { canonicalRoot: scope.canonicalRoot, toolName, action }
    )
  }

  // 4. Check capability entitlement
  let requiredCapability = CAPABILITY_ACTION_MAP[action] || 'literature'
  if (action === 'execute_operation' && params.operationId) {
    const desc = getOperationDescriptor(params.operationId)
    if (desc?.capability) {
      requiredCapability = desc.capability
    }
  } else if (action === 'plan_workflow' || action === 'verify_project') {
    requiredCapability = scope.configuredCapabilities[0] || 'literature'
  }

  if (!scope.configuredCapabilities.includes(requiredCapability)) {
    throw new ScopeViolationError(
      `Capability '${requiredCapability}' is disabled by workspace policy. Configured capabilities: ${scope.configuredCapabilities.join(', ')}`,
      { requiredCapability, configured: scope.configuredCapabilities }
    )
  }

  // 5. Deep inspection of all input parameters (top-level and nested)
  // Recursively validates datasetPath, outputPath, config files, and safe IDs (runId, evidenceId, etc.)
  validateDeepParameters(params, scope)

  return { authorized: true, scope }
}
