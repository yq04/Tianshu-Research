/**
 * Test Suite: Release Parity & Host Surface (Phase 12, plugin side)
 * Verifies the release tooling offline: content parity detection between two
 * trees, explicit allowlist discipline, fixed 4-gateway surface checks, and
 * an honest host-surface snapshot (declared surface, never fake host results).
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, mkdirSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkReleaseParity, compareSurface } from '../scripts/check-release-parity.js';
import { captureHostSurface } from '../scripts/capture-host-surface.js';

const PLUGIN_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

describe('Phase 12: Release Parity & Host Surface', () => {
  let tempDir;
  let selfCopy;
  let peerCopy;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-parity-test-'));
    selfCopy = join(tempDir, 'self');
    peerCopy = join(tempDir, 'peer');
    // Fresh copies of the same tree => parity by construction.
    cpSync(PLUGIN_ROOT, selfCopy, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes('__pycache__') && !s.includes('.rivet') });
    cpSync(PLUGIN_ROOT, peerCopy, { recursive: true, filter: (s) => !s.includes('node_modules') && !s.includes('__pycache__') && !s.includes('.rivet') });
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  });

  it('reports full parity for identical trees', () => {
    const report = checkReleaseParity(selfCopy, peerCopy);
    assert.equal(report.ok, true);
    assert.equal(report.summary.differing, 0);
    assert.equal(report.summary.onlyInSelf, 0);
    assert.equal(report.summary.onlyInPeer, 0);
    assert.equal(report.surface.ok, true);
    assert.deepEqual(report.surface.tools, ['journal_palette', 'research_evidence', 'research_query', 'research_status']);
  });

  it('detects a differing file in the peer tree', () => {
    const readme = join(peerCopy, 'README.md');
    writeFileSync(readme, readFileSync(readme, 'utf8') + '\n<!-- tampered -->\n');
    const report = checkReleaseParity(selfCopy, peerCopy);
    assert.equal(report.ok, false);
    assert.deepEqual(report.differing, ['README.md']);
  });

  it('fails closed on files that exist in only one tree without allowlist entry', () => {
    writeFileSync(join(peerCopy, 'unlisted-infra.txt'), 'unexpected');
    const report = checkReleaseParity(selfCopy, peerCopy);
    assert.equal(report.ok, false);
    assert.deepEqual(report.onlyInPeer, ['unlisted-infra.txt']);
  });

  it('accepts allowlisted peer-only infrastructure and reports it separately', () => {
    const allowlist = JSON.parse(readFileSync(join(selfCopy, 'scripts', 'parity-allowlist.json'), 'utf8'));
    allowlist.peerOnly.push('unlisted-infra.txt');
    writeFileSync(join(selfCopy, 'scripts', 'parity-allowlist.json'), JSON.stringify(allowlist, null, 2));
    // Apply the same allowlist to the peer copy so compare reads match.
    writeFileSync(join(peerCopy, 'scripts', 'parity-allowlist.json'), JSON.stringify(allowlist, null, 2));
    writeFileSync(join(peerCopy, 'unlisted-infra.txt'), 'expected infra');

    const report = checkReleaseParity(selfCopy, peerCopy);
    // allowlist files themselves now differ? No — same content written to both.
    assert.equal(report.differing.length, 0);
    assert.equal(report.onlyInPeer.length, 0);
    assert.deepEqual(report.allowedPeerOnly, ['unlisted-infra.txt']);
    assert.equal(report.ok, true);
  });

  it('rejects a gateway surface drift (adding a 5th tool breaks the fixed surface)', () => {
    const selfManifest = JSON.parse(readFileSync(join(selfCopy, 'package.json'), 'utf8'));
    const peerManifest = JSON.parse(readFileSync(join(peerCopy, 'package.json'), 'utf8'));
    peerManifest.tianshu.tools.push({ name: 'extra_tool', description: 'drift' });
    const result = compareSurface(selfManifest, peerManifest);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => /gateway surface mismatch/.test(i)));
  });

  it('rejects version mismatch between the two manifests', () => {
    const selfManifest = JSON.parse(readFileSync(join(selfCopy, 'package.json'), 'utf8'));
    const peerManifest = JSON.parse(readFileSync(join(peerCopy, 'package.json'), 'utf8'));
    peerManifest.version = '9.9.9';
    const result = compareSurface(selfManifest, peerManifest);
    assert.equal(result.ok, false);
    assert.ok(result.issues.some((i) => /version mismatch/.test(i)));
  });

  it('host surface snapshot declares the fixed 4 tools and honest untested status', () => {
    const snapshot = captureHostSurface();
    assert.equal(snapshot.gatewaySurface.fixedToolCount, 4);
    assert.deepEqual(
      snapshot.gatewaySurface.fixedPublicTools.map((t) => t.name).sort(),
      ['journal_palette', 'research_evidence', 'research_query', 'research_status'],
    );
    assert.equal(snapshot.verification.verifiedAgainstRealHost, false);
    assert.match(snapshot.verification.note, /未测/);
    assert.ok(snapshot.operationCatalogue.count >= 23); // 21 original + 2 notebook ops
    assert.ok(snapshot.operationCatalogue.capabilities.includes('notebook'));
    assert.equal(snapshot.optionalEcosystem.jupyter.required, false);
  });
});
