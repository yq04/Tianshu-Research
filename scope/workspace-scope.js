/**
 * Workspace Scope Manager for tianshu-research.
 * Resolves, validates, and bounds workspace roots and capability permissions.
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  ScopeViolationError,
  resolvePhysicalPath,
  canonicalizePath,
  createCanonicalScopeId,
  isPathWithinScope,
  assertPathWithinScope,
} from './path-policy.js'

export {
  ScopeViolationError,
  resolvePhysicalPath,
  canonicalizePath,
  createCanonicalScopeId,
  isPathWithinScope,
  assertPathWithinScope,
}

export const ALL_RESEARCH_CAPABILITIES = [
  'literature',
  'data',
  'theory',
  'benchmark',
  'figure',
  'run',
]

/**
 * Resolves and validates a WorkspaceScope for a given directory or context.
 *
 * Hard Rules:
 * 1. Explicit enabled: false or disabled: true has absolute highest priority.
 *    Any dev-repo or legacy heuristic CANNOT override this.
 * 2. Unconfigured cwd or legacy .rivet/research directory existence alone does NOT grant research trust.
 *    Explicit scientific configuration (.rivet/research.json), launcher binding, or client roots is required.
 * 3. Scope ID is generated via full physical path SHA-256 (createCanonicalScopeId), avoiding collisions.
 */
export function resolveWorkspaceScope(options = {}) {
  const root = options.workspace || options.cwd || process.cwd()
  const canonicalRoot = resolvePhysicalPath(root)
  const scopeId = createCanonicalScopeId(canonicalRoot)
  const source = options.source || 'default'

  // Rule 1: Highest priority explicit disablement in options
  if (options.enabled === false || options.disabled === true) {
    return {
      scopeId,
      canonicalRoot,
      source: options.source || 'explicit-disabled',
      configuredCapabilities: [],
      policyRevision: 'disabled',
      trust: 'disabled',
      isResearchEligible: false,
    }
  }

  let isResearchEligible = false
  let trust = options.trust || (source === 'launcher' ? 'launcher-bound' : 'untrusted')
  let configuredCapabilities = [...ALL_RESEARCH_CAPABILITIES]
  let policyRevision = 'unconfigured'

  const manifestPath = resolve(canonicalRoot, '.rivet', 'research.json')

  // Rule 1: Check manifest .rivet/research.json
  if (existsSync(manifestPath)) {
    try {
      const raw = readFileSync(manifestPath, 'utf8')
      const parsed = JSON.parse(raw)

      // Manifest explicit disabled has absolute highest priority
      if (parsed.enabled === false || parsed.disabled === true) {
        return {
          scopeId,
          canonicalRoot,
          source: options.source || 'manifest',
          configuredCapabilities: [],
          policyRevision: 'disabled-by-manifest',
          trust: 'disabled',
          isResearchEligible: false,
        }
      }

      isResearchEligible = true
      trust = options.trust || (source === 'launcher' ? 'launcher-bound' : 'host-approved')
      if (Array.isArray(parsed.allowedCapabilities)) {
        configuredCapabilities = parsed.allowedCapabilities.filter((c) =>
          ALL_RESEARCH_CAPABILITIES.includes(c)
        )
      }
      policyRevision = `manifest-${parsed.schemaVersion || 1}`
    } catch {
      isResearchEligible = false
      policyRevision = 'invalid-manifest'
    }
  } else if (options.explicitTrust === true) {
    isResearchEligible = true
    trust = options.trust || 'launcher-bound'
    policyRevision = 'explicit-trust'
  } else if (source === 'launcher' && options.workspace) {
    isResearchEligible = true
    trust = 'launcher-bound'
    policyRevision = 'launcher-bound'
  } else if (source === 'client-roots' && options.workspace) {
    isResearchEligible = true
    trust = 'client-exposed'
    policyRevision = 'client-roots'
  } else {
    // Check if it is a developer repository workspace (tianshu-research plugin repository)
    const devRepoPlugin = resolve(canonicalRoot, 'plugins', 'tianshu-research', 'package.json')
    const localPlugin = resolve(canonicalRoot, 'package.json')
    let isDevWorkspace = existsSync(devRepoPlugin)
    if (!isDevWorkspace && existsSync(localPlugin)) {
      try {
        const parsed = JSON.parse(readFileSync(localPlugin, 'utf8'))
        if (parsed.name === 'tianshu-research') {
          isDevWorkspace = true
        }
      } catch {}
    }
    if (isDevWorkspace) {
      isResearchEligible = true
      trust = 'host-approved'
      policyRevision = 'dev-workspace'
    }
  }

  return {
    scopeId,
    canonicalRoot,
    source,
    configuredCapabilities,
    policyRevision,
    trust,
    isResearchEligible,
  }
}
