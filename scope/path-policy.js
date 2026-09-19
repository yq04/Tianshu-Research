/**
 * Path Policy and Physical Scope Isolation for tianshu-research.
 * Implements real physical path resolution (symlink / Windows junction traversal defense),
 * collision-resistant canonical scope identifier generation (full-path SHA-256),
 * and deep recursive parameter path / identifier validation.
 */

import { existsSync, realpathSync } from 'node:fs'
import { resolve, relative, isAbsolute, normalize, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'

export class ScopeViolationError extends Error {
  constructor(message, details = {}) {
    super(message)
    this.name = 'ScopeViolationError'
    this.code = 'ERR_SCOPE_VIOLATION'
    this.details = details
  }
}

/**
 * Resolves the physical path of a file or directory.
 * If the target does not exist, traverses up ancestor directories until finding
 * the nearest existing ancestor, resolves its real physical path (following junctions/symlinks),
 * and appends the non-existent relative segments.
 *
 * This prevents symlink/junction escapes even for not-yet-created output paths.
 *
 * @param {string} targetPath
 * @returns {string} Fully resolved canonical physical path
 */
export function resolvePhysicalPath(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') {
    throw new ScopeViolationError('Target path must be a non-empty string')
  }

  const normalized = resolve(normalize(targetPath))

  // If already exists, directly obtain realpath
  if (existsSync(normalized)) {
    try {
      return realpathSync.native ? realpathSync.native(normalized) : realpathSync(normalized)
    } catch {
      return normalized
    }
  }

  // Target does not exist yet: find nearest existing ancestor
  let curr = normalized
  const unexistingSegments = []

  while (!existsSync(curr)) {
    const parent = dirname(curr)
    if (parent === curr) {
      // Reached filesystem root and nothing exists
      break
    }
    unexistingSegments.unshift(basename(curr))
    curr = parent
  }

  let physicalBase = curr
  if (existsSync(curr)) {
    try {
      physicalBase = realpathSync.native ? realpathSync.native(curr) : realpathSync(curr)
    } catch {
      physicalBase = curr
    }
  }

  return unexistingSegments.length > 0
    ? resolve(physicalBase, ...unexistingSegments)
    : physicalBase
}

/**
 * Normalizes and canonicalizes a path string. Alias to resolvePhysicalPath.
 */
export function canonicalizePath(targetPath) {
  return resolvePhysicalPath(targetPath)
}

/**
 * Generates a stable, collision-resistant canonical scope ID based on full-path SHA-256.
 * Completely eliminates truncation collisions between sibling directories sharing prefixes
 * (e.g. D:/1_Research/research-a vs D:/1_Research/research-b).
 *
 * @param {string} canonicalPath
 * @returns {string} Format: 'scope:<32-hex-sha256>'
 */
export function createCanonicalScopeId(canonicalPath) {
  if (!canonicalPath || typeof canonicalPath !== 'string') {
    throw new ScopeViolationError('Canonical path required to generate scope ID')
  }

  const physical = resolvePhysicalPath(canonicalPath)
  // On Windows, filesystem paths are case-insensitive: normalize case for hashing
  const key = process.platform === 'win32' ? physical.toLowerCase() : physical
  const hash = createHash('sha256').update(key).digest('hex')
  return `scope:${hash.slice(0, 32)}`
}

/**
 * Checks whether a target path is strictly contained within the scope canonical root.
 * Evaluates real physical paths (following junctions/symlinks) and handles platform differences.
 *
 * @param {string} targetPath
 * @param {object} scope
 * @returns {boolean}
 */
export function isPathWithinScope(targetPath, scope) {
  if (!targetPath || typeof targetPath !== 'string' || !scope || !scope.canonicalRoot) {
    return false
  }

  try {
    const scopeRootPhysical = resolvePhysicalPath(scope.canonicalRoot)
    const targetPhysical = resolvePhysicalPath(resolve(scope.canonicalRoot, targetPath))

    if (process.platform === 'win32') {
      const lowerRoot = scopeRootPhysical.toLowerCase()
      const lowerTarget = targetPhysical.toLowerCase()

      if (lowerTarget === lowerRoot) {
        return true
      }

      const rel = relative(lowerRoot, lowerTarget)
      if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
        return true
      }
      return false
    }

    if (targetPhysical === scopeRootPhysical) {
      return true
    }

    const rel = relative(scopeRootPhysical, targetPhysical)
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      return true
      }
    return false
  } catch {
    return false
  }
}

/**
 * Asserts that a target path is strictly within the scope, throwing ScopeViolationError if not.
 *
 * @param {string} targetPath
 * @param {object} scope
 * @param {string} [label='Target path']
 */
export function assertPathWithinScope(targetPath, scope, label = 'Target path') {
  if (!isPathWithinScope(targetPath, scope)) {
    throw new ScopeViolationError(`${label} is outside authorized workspace root: ${targetPath}`, {
      targetPath,
      canonicalRoot: scope?.canonicalRoot,
    })
  }
}

/**
 * Validates that an identifier (runId, evidenceId, docId, etc.) does not contain
 * directory traversal characters or separators (/ \ .. null-byte).
 *
 * @param {string} id
 * @param {string} [label='Identifier']
 */
export function validateSafeIdentifier(id, label = 'Identifier') {
  if (typeof id !== 'string' || !id.trim()) {
    throw new ScopeViolationError(`${label} must be a non-empty string`)
  }

  if (id.includes('..') || id.includes('/') || id.includes('\\') || id.includes('\0')) {
    throw new ScopeViolationError(`${label} contains illegal path traversal or separators: ${id}`, {
      id,
      label,
    })
  }

  // Safe identifier pattern: alphanumeric, hyphen, underscore, period, colon, at-sign
  const SAFE_ID_RE = /^[a-zA-Z0-9_\-.:@]+$/
  if (!SAFE_ID_RE.test(id)) {
    throw new ScopeViolationError(`${label} contains invalid characters: ${id}`, {
      id,
      label,
    })
  }
}

const PATH_KEY_PATTERNS = [
  /^(workspace|workspaceRoot|rootPath|sourcePath|exportPath|targetPath|filePath|outputPath|datasetPath|scriptPath|workingDirectory)$/i,
  /(Path|Dir|Directory|File)$/i,
]

const ID_KEY_PATTERNS = [
  /^(runId|evidenceId|docId|claimId|sourceId|jobId)$/i,
]

function isPathKey(key) {
  return PATH_KEY_PATTERNS.some((re) => re.test(key))
}

function isIdKey(key) {
  return ID_KEY_PATTERNS.some((re) => re.test(key))
}

/**
 * Recursively inspects all parameters, extracting and checking nested path fields
 * and identifier fields for containment and traversal prevention.
 *
 * @param {any} params
 * @param {object} scope
 * @param {string} [pathPrefix='']
 * @param {Set} [visited=new Set()]
 */
export function validateDeepParameters(params, scope, pathPrefix = '', visited = new Set()) {
  if (!params || typeof params !== 'object') {
    return
  }

  if (visited.has(params)) {
    return
  }
  visited.add(params)

  if (Array.isArray(params)) {
    for (let i = 0; i < params.length; i++) {
      const item = params[i]
      const itemKey = pathPrefix ? `${pathPrefix}[${i}]` : `[${i}]`
      if (typeof item === 'object' && item !== null) {
        validateDeepParameters(item, scope, itemKey, visited)
      }
    }
    return
  }

  for (const [key, value] of Object.entries(params)) {
    const fullKey = pathPrefix ? `${pathPrefix}.${key}` : key

    if (typeof value === 'string' && value.trim()) {
      if (isPathKey(key)) {
        assertPathWithinScope(value, scope, `Parameter '${fullKey}'`)
      } else if (isIdKey(key)) {
        validateSafeIdentifier(value, `Identifier '${fullKey}'`)
      }
    } else if (typeof value === 'object' && value !== null) {
      validateDeepParameters(value, scope, fullKey, visited)
    }
  }
}
