#!/usr/bin/env node
/**
 * Release Parity Checker for tianshu-research (Phase 12).
 *
 * Verifies that the host-side plugin tree and the independent open-source
 * repository are content-identical before a candidate release:
 *   - walks both trees (ignoring runtime artifacts), sha256 per file;
 *   - reports identical / differs / only-in-self / only-in-peer;
 *   - cross-checks the public gateway surface (4 tools) and version fields
 *     in both package.json manifests;
 *   - strictly READ-ONLY: it records hashes, never overwrites concurrent
 *     modifications in either tree.
 *
 * Usage:
 *   node scripts/check-release-parity.js --peer D:/1_Research/Tianshu-Research
 * Exit 0 = full parity, exit 1 = differences (listed), exit 2 = usage error.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, resolve, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SELF_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

const IGNORE_DIRS = new Set(['.git', 'node_modules', '.rivet', '__pycache__']);
const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db']);

function listFiles(root) {
  const out = new Map(); // relPath -> sha256
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORE_DIRS.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (IGNORE_FILES.has(entry.name)) continue;
        const abs = join(dir, entry.name);
        const rel = relative(root, abs).split(sep).join('/');
        const hash = createHash('sha256').update(readFileSync(abs)).digest('hex');
        out.set(rel, hash);
      }
    }
  };
  walk(root);
  return out;
}

function readManifest(root) {
  const path = join(root, 'package.json');
  if (!existsSync(path)) throw new Error(`package.json not found in ${root}`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Compares the public surface declared by both manifests.
 */
export function compareSurface(selfManifest, peerManifest) {
  const issues = [];
  const selfTools = (selfManifest.tianshu?.tools || []).map((t) => t.name).sort();
  const peerTools = (peerManifest.tianshu?.tools || []).map((t) => t.name).sort();
  if (JSON.stringify(selfTools) !== JSON.stringify(peerTools)) {
    issues.push(`gateway surface mismatch: self [${selfTools.join(', ')}] vs peer [${peerTools.join(', ')}]`);
  }
  if (selfTools.length !== 4) {
    issues.push(`gateway surface must remain the fixed 4 public tools, found ${selfTools.length}`);
  }
  if (selfManifest.version !== peerManifest.version) {
    issues.push(`version mismatch: self ${selfManifest.version} vs peer ${peerManifest.version}`);
  }
  if (selfManifest.tianshu?.version !== peerManifest.tianshu?.version) {
    issues.push(`tianshu.version mismatch: self ${selfManifest.tianshu?.version} vs peer ${peerManifest.tianshu?.version}`);
  }
  return { ok: issues.length === 0, issues, tools: selfTools };
}

/**
 * Full parity check between two trees.
 * @returns {{ ok, summary, differing: string[], onlyInSelf: string[], onlyInPeer: string[], surface }}
 */
export function checkReleaseParity(selfRoot = SELF_ROOT, peerRoot) {
  peerRoot = resolve(peerRoot);
  if (!existsSync(selfRoot)) throw new Error(`self tree not found: ${selfRoot}`);
  if (!existsSync(peerRoot)) throw new Error(`peer tree not found: ${peerRoot}`);

  const self = listFiles(selfRoot);
  const peer = listFiles(peerRoot);

  // Versioned, explicit allowlist: repo infrastructure may legitimately exist
  // in only one tree; anything not listed fails the check. Never silent.
  const allowlistPath = join(selfRoot, 'scripts', 'parity-allowlist.json');
  const allowlist = existsSync(allowlistPath)
    ? JSON.parse(readFileSync(allowlistPath, 'utf8'))
    : { peerOnly: [], selfOnly: [] };
  const peerOnlyAllowed = new Set(allowlist.peerOnly || []);
  const selfOnlyAllowed = new Set(allowlist.selfOnly || []);

  const differing = [];
  const onlyInSelf = [];
  const onlyInPeer = [];
  const allowedPeerOnly = [];
  const allowedSelfOnly = [];

  for (const [rel, hash] of [...self.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (!peer.has(rel)) {
      if (selfOnlyAllowed.has(rel)) allowedSelfOnly.push(rel);
      else onlyInSelf.push(rel);
    } else if (peer.get(rel) !== hash) differing.push(rel);
  }
  for (const rel of [...peer.keys()].sort()) {
    if (!self.has(rel)) {
      if (peerOnlyAllowed.has(rel)) allowedPeerOnly.push(rel);
      else onlyInPeer.push(rel);
    }
  }

  const surface = compareSurface(readManifest(selfRoot), readManifest(peerRoot));
  const ok = differing.length === 0 && onlyInSelf.length === 0 && onlyInPeer.length === 0 && surface.ok;

  return {
    ok,
    summary: {
      filesCompared: self.size + onlyInPeer.size,
      identical: self.size - differing.length - onlyInSelf.length,
      differing: differing.length,
      onlyInSelf: onlyInSelf.length,
      onlyInPeer: onlyInPeer.length,
      allowedPeerOnly: allowedPeerOnly.length,
      allowedSelfOnly: allowedSelfOnly.length,
    },
    differing,
    onlyInSelf,
    onlyInPeer,
    allowedPeerOnly,
    allowedSelfOnly,
    surface,
    manifests: {
      self: { version: readManifest(selfRoot).version, root: selfRoot },
      peer: { version: readManifest(peerRoot).version, root: peerRoot },
    },
  };
}

// --- CLI -----------------------------------------------------------------
function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--peer') {
      args.peer = argv[i + 1];
      i += 1;
    } else if (argv[i] === '--self') {
      args.self = argv[i + 1];
      i += 1;
    }
  }
  if (!args.peer) {
    console.error('Usage: check-release-parity.js --peer <independent-repo-path> [--self <plugin-root>]');
    process.exit(2);
  }

  const report = checkReleaseParity(args.self || SELF_ROOT, args.peer);
  const { summary } = report;

  console.log(`Release parity check`);
  console.log(`  self: ${report.manifests.self.root} (v${report.manifests.self.version})`);
  console.log(`  peer: ${report.manifests.peer.root} (v${report.manifests.peer.version})`);
  console.log(`  files: ${summary.identical} identical, ${summary.differing} differing, ${summary.onlyInSelf} only-in-self, ${summary.onlyInPeer} only-in-peer`);
  console.log(`  gateway surface: ${report.surface.ok ? '4 fixed tools, in sync' : 'MISMATCH'}`);
  for (const issue of report.surface.issues) console.log(`    ! ${issue}`);
  for (const f of report.differing) console.log(`  differs: ${f}`);
  for (const f of report.onlyInSelf) console.log(`  only in self: ${f}`);
  for (const f of report.onlyInPeer) console.log(`  only in peer: ${f}`);
  for (const f of report.allowedPeerOnly) console.log(`  allowed peer-only (infra): ${f}`);
  for (const f of report.allowedSelfOnly) console.log(`  allowed self-only (infra): ${f}`);

  if (report.ok) {
    console.log('PARITY OK — the two trees are content-identical and the gateway surface is stable.');
    process.exit(0);
  }
  console.log('PARITY FAILED — sync the trees before tagging a release.');
  process.exit(1);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
