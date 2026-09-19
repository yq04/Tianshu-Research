import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, symlinkSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import {
  resolvePhysicalPath,
  createCanonicalScopeId,
  isPathWithinScope,
  assertPathWithinScope,
  validateDeepParameters,
  validateSafeIdentifier,
  ScopeViolationError,
} from '../scope/path-policy.js'
import { resolveWorkspaceScope } from '../scope/workspace-scope.js'
import { assertInvocationAuthorized } from '../scope/invocation-guard.js'

describe('Phase 6A: Physical Scope Isolation and Realpath Guard Suite', () => {
  let tempBase
  let workspaceDir
  let outsideDir

  before(() => {
    tempBase = mkdtempSync(join(tmpdir(), 'tianshu-realpath-test-'))
    workspaceDir = join(tempBase, 'workspace')
    outsideDir = join(tempBase, 'outside-secrets')
    mkdirSync(workspaceDir, { recursive: true })
    mkdirSync(outsideDir, { recursive: true })

    // Create research manifest in workspace
    mkdirSync(join(workspaceDir, '.rivet'), { recursive: true })
    writeFileSync(
      join(workspaceDir, '.rivet', 'research.json'),
      JSON.stringify({ schemaVersion: 1, enabled: true }),
      'utf8'
    )

    // Put a secret outside
    writeFileSync(join(outsideDir, 'secret.env'), 'API_KEY=supersecret', 'utf8')
  })

  after(() => {
    try {
      rmSync(tempBase, { recursive: true, force: true })
    } catch {
      // ignore Windows file lock delays
    }
  })

  it('detects Windows junction / symlink escapes for existing files', () => {
    const scope = resolveWorkspaceScope({ workspace: workspaceDir })
    const linkPath = join(workspaceDir, 'external-link')

    try {
      symlinkSync(outsideDir, linkPath, 'junction')
    } catch (err) {
      // If junction creation is not permitted on host, skip junction test
      return
    }

    const linkedSecret = join(linkPath, 'secret.env')

    // Physical resolution must identify the true location outside the workspace
    const physical = resolvePhysicalPath(linkedSecret)
    assert.equal(physical.toLowerCase(), resolvePhysicalPath(join(outsideDir, 'secret.env')).toLowerCase())

    // Containment check must strictly reject the escaped file
    assert.equal(isPathWithinScope(linkedSecret, scope), false)
    assert.throws(
      () => assertPathWithinScope(linkedSecret, scope),
      (err) => err instanceof ScopeViolationError && err.code === 'ERR_SCOPE_VIOLATION'
    )
  })

  it('detects Windows junction escapes for not-yet-created output files', () => {
    const scope = resolveWorkspaceScope({ workspace: workspaceDir })
    const linkPath = join(workspaceDir, 'external-link-2')

    try {
      symlinkSync(outsideDir, linkPath, 'junction')
    } catch {
      return
    }

    // Path does not exist yet!
    const nonExistentOutput = join(linkPath, 'new-output-sub', 'results.json')

    // resolvePhysicalPath must resolve nearest existing ancestor (the junction)
    const physical = resolvePhysicalPath(nonExistentOutput)
    assert.ok(physical.toLowerCase().includes('outside-secrets'))

    assert.equal(isPathWithinScope(nonExistentOutput, scope), false)
    assert.throws(
      () => assertPathWithinScope(nonExistentOutput, scope),
      (err) => err instanceof ScopeViolationError
    )
  })

  it('prevents Scope ID collisions for sibling directories with identical prefixes', () => {
    const dirA = join(tempBase, 'research-alpha')
    const dirB = join(tempBase, 'research-beta')
    mkdirSync(dirA, { recursive: true })
    mkdirSync(dirB, { recursive: true })

    const idA = createCanonicalScopeId(dirA)
    const idB = createCanonicalScopeId(dirB)

    assert.ok(idA.startsWith('scope:'))
    assert.ok(idB.startsWith('scope:'))
    assert.notEqual(idA, idB, 'Different directories must yield distinct cryptographic scope IDs')
  })

  it('intercepts nested path arguments escaping scope (arguments.datasetPath & arguments.outputPath)', () => {
    const scope = resolveWorkspaceScope({ workspace: workspaceDir })

    const evilParams = {
      action: 'execute_operation',
      operationId: 'theory.dimension@1',
      arguments: {
        datasetPath: join(outsideDir, 'secret.env'),
        config: {
          outputPath: join(outsideDir, 'leaked.json'),
        },
      },
    }

    assert.throws(
      () => assertInvocationAuthorized('research_evidence', 'execute_operation', evilParams, { scope }),
      (err) => err instanceof ScopeViolationError && err.message.includes('outside authorized workspace root')
    )
  })

  it('rejects path traversal in identifier parameters (runId, evidenceId, docId)', () => {
    const scope = resolveWorkspaceScope({ workspace: workspaceDir })

    const traversalParams = {
      action: 'add_evidence',
      evidenceId: '../../etc/passwd',
      claimId: 'claim-valid',
    }

    assert.throws(
      () => assertInvocationAuthorized('research_evidence', 'add_evidence', traversalParams, { scope }),
      (err) => err instanceof ScopeViolationError && err.message.includes('illegal path traversal')
    )

    const traversalDoc = {
      action: 'ingest_document',
      docId: '..\\..\\boot.ini',
      text: 'malicious payload',
    }

    assert.throws(
      () => assertInvocationAuthorized('research_evidence', 'ingest_document', traversalDoc, { scope }),
      (err) => err instanceof ScopeViolationError
    )
  })

  it('gives absolute highest priority to explicit enabled: false over dev-repo or legacy flags', () => {
    const disabledDir = join(tempBase, 'disabled-project')
    mkdirSync(join(disabledDir, '.rivet'), { recursive: true })
    writeFileSync(
      join(disabledDir, '.rivet', 'research.json'),
      JSON.stringify({ schemaVersion: 1, enabled: false }),
      'utf8'
    )

    // Even if passed source: launcher or explicitTrust, enabled: false in manifest must reject
    const scopeManifestDisabled = resolveWorkspaceScope({
      workspace: disabledDir,
      source: 'launcher',
    })
    assert.equal(scopeManifestDisabled.isResearchEligible, false)
    assert.equal(scopeManifestDisabled.trust, 'disabled')
    assert.equal(scopeManifestDisabled.policyRevision, 'disabled-by-manifest')

    // Explicit options enabled: false
    const scopeOptionDisabled = resolveWorkspaceScope({
      workspace: workspaceDir,
      enabled: false,
    })
    assert.equal(scopeOptionDisabled.isResearchEligible, false)
    assert.equal(scopeOptionDisabled.trust, 'disabled')
  })
})
