import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  resolveWorkspaceScope,
  isPathWithinScope,
  assertPathWithinScope,
  canonicalizePath,
  ScopeViolationError,
  ALL_RESEARCH_CAPABILITIES,
} from '../scope/workspace-scope.js'
import { assertInvocationAuthorized } from '../scope/invocation-guard.js'

describe('Workspace Scope and Invocation Guard', () => {
  let testRoot

  before(() => {
    testRoot = mkdtempSync(join(tmpdir(), 'tianshu-scope-test-'))
  })

  after(() => {
    if (testRoot && existsSync(testRoot)) {
      rmSync(testRoot, { recursive: true, force: true })
    }
  })

  describe('resolveWorkspaceScope', () => {
    it('resolves unconfigured workspace as ineligible for research', () => {
      const scope = resolveWorkspaceScope({ workspace: testRoot })
      assert.ok(scope.scopeId.startsWith('scope:'))
      assert.equal(scope.canonicalRoot, canonicalizePath(testRoot))
      assert.equal(scope.isResearchEligible, false)
      assert.equal(scope.trust, 'untrusted')
    })

    it('identifies research manifest .rivet/research.json and capability limits', () => {
      const projDir = join(testRoot, 'proj-with-manifest')
      mkdirSync(join(projDir, '.rivet'), { recursive: true })
      writeFileSync(
        join(projDir, '.rivet', 'research.json'),
        JSON.stringify({
          schemaVersion: 1,
          enabled: true,
          allowedCapabilities: ['literature', 'theory'],
        }),
        'utf8'
      )

      const scope = resolveWorkspaceScope({ workspace: projDir })
      assert.equal(scope.isResearchEligible, true)
      assert.equal(scope.trust, 'host-approved')
      assert.deepEqual(scope.configuredCapabilities, ['literature', 'theory'])
      assert.equal(scope.policyRevision, 'manifest-1')
    })

    it('does not auto-enable research merely due to legacy data directory without manifest or explicit authorization', () => {
      const legacyProj = join(testRoot, 'proj-legacy')
      mkdirSync(join(legacyProj, '.rivet', 'research'), { recursive: true })

      const scope = resolveWorkspaceScope({ workspace: legacyProj })
      assert.equal(scope.isResearchEligible, false)
      assert.equal(scope.trust, 'untrusted')
    })

    it('honors launcher source and explicit trust', () => {
      const rawDir = join(testRoot, 'raw-dir')
      mkdirSync(rawDir, { recursive: true })

      const scopeLauncher = resolveWorkspaceScope({ workspace: rawDir, source: 'launcher' })
      assert.equal(scopeLauncher.isResearchEligible, true)
      assert.equal(scopeLauncher.trust, 'launcher-bound')

      const scopeExplicit = resolveWorkspaceScope({ workspace: rawDir, explicitTrust: true })
      assert.equal(scopeExplicit.isResearchEligible, true)
      assert.equal(scopeExplicit.trust, 'launcher-bound')
    })
  })

  describe('isPathWithinScope & assertPathWithinScope', () => {
    let scope

    before(() => {
      scope = resolveWorkspaceScope({ workspace: testRoot, explicitTrust: true })
    })

    it('allows files and directories inside canonicalRoot', () => {
      assert.equal(isPathWithinScope(testRoot, scope), true)
      assert.equal(isPathWithinScope(join(testRoot, 'sub', 'file.txt'), scope), true)
      assert.equal(isPathWithinScope('relative/path.md', scope), true)
      assert.doesNotThrow(() => assertPathWithinScope(join(testRoot, 'valid.txt'), scope))
    })

    it('rejects path traversal attempting to escape canonicalRoot', () => {
      const escaped = join(testRoot, '..', 'escaped.txt')
      assert.equal(isPathWithinScope(escaped, scope), false)
      assert.throws(
        () => assertPathWithinScope(escaped, scope, 'Escaped path'),
        (err) => err instanceof ScopeViolationError && err.code === 'ERR_SCOPE_VIOLATION'
      )
    })

    it('rejects sibling directories with similar prefix', () => {
      const siblingEvil = testRoot + '-evil'
      assert.equal(isPathWithinScope(siblingEvil, scope), false)
      assert.throws(
        () => assertPathWithinScope(siblingEvil, scope),
        ScopeViolationError
      )
    })
  })

  describe('assertInvocationAuthorized', () => {
    it('bypasses eligibility checks for safe/informational actions', () => {
      const ineligibleScope = resolveWorkspaceScope({ workspace: testRoot })
      assert.equal(ineligibleScope.isResearchEligible, false)

      const r1 = assertInvocationAuthorized('journal_palette', 'journal_palette', {}, { scope: ineligibleScope })
      assert.equal(r1.authorized, true)

      const r2 = assertInvocationAuthorized('research_status', 'research_status', {}, { scope: ineligibleScope })
      assert.equal(r2.authorized, true)
    })

    it('blocks restricted research operations on ineligible workspace', () => {
      const ineligibleScope = resolveWorkspaceScope({ workspace: testRoot })
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'add_source', { id: 's1', title: 'T' }, { scope: ineligibleScope }),
        /Workspace is not eligible for research operations/
      )
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'ingest_document', { docId: 'd1' }, { scope: ineligibleScope }),
        /Workspace is not eligible for research operations/
      )
    })

    it('enforces capability policy restrictions', () => {
      // Scope only permits theory
      const theoryOnlyScope = {
        scopeId: 'scope:theory-only',
        canonicalRoot: canonicalizePath(testRoot),
        isResearchEligible: true,
        configuredCapabilities: ['theory'],
        trust: 'host-approved',
        policyRevision: 'v1',
      }

      // Theory actions are permitted
      const authTheory = assertInvocationAuthorized('research_compute', 'dimension_check', {}, { scope: theoryOnlyScope })
      assert.equal(authTheory.authorized, true)

      // Literature actions are blocked
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'add_source', { id: 's1', title: 'T' }, { scope: theoryOnlyScope }),
        /Capability 'literature' is disabled by workspace policy/
      )
      assert.throws(
        () => assertInvocationAuthorized('research_query', 'search_papers', { query: 'test' }, { scope: theoryOnlyScope }),
        /Capability 'literature' is disabled by workspace policy/
      )
    })

    it('intercepts and rejects arguments escaping workspace scope', () => {
      const validScope = resolveWorkspaceScope({ workspace: testRoot, explicitTrust: true })

      // Parameter 'workspace' escapes
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'add_source', { workspace: join(testRoot, '..', 'other') }, { scope: validScope }),
        /Parameter 'workspace' is outside authorized workspace root/
      )

      // Parameter 'sourcePath' escapes
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'ingest_document', { sourcePath: '../../secret.pdf' }, { scope: validScope }),
        /Parameter 'sourcePath' is outside authorized workspace root/
      )

      // Parameter 'outputPath' escapes
      assert.throws(
        () => assertInvocationAuthorized('research_evidence', 'export_csl_json', { outputPath: 'C:/Windows/hack.json' }, { scope: validScope }),
        /Parameter 'outputPath' is outside authorized workspace root/
      )
    })

    it('authorizes valid invocations within scope', () => {
      const validScope = resolveWorkspaceScope({ workspace: testRoot, explicitTrust: true })
      const auth = assertInvocationAuthorized(
        'research_evidence',
        'add_source',
        {
          workspace: testRoot,
          id: 'valid_src',
          title: 'Valid Title',
        },
        { scope: validScope }
      )
      assert.equal(auth.authorized, true)
    })
  })
})
