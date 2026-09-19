#!/usr/bin/env node
/**
 * Host Surface Snapshot for tianshu-research (Phase 12).
 *
 * Records the plugin-declared observable surface (4 public gateways, action
 * inventories, operation catalogue, connectors, optional-dependency posture)
 * as a JSON snapshot for host-compatibility documentation.
 *
 * Honesty discipline: this snapshot describes what the PLUGIN DECLARES — it
 * is NOT a verified observation of a real host (Cursor / Claude Desktop /
 * VS Code / Tianshu sidecar). Every snapshot carries
 * `verifiedAgainstRealHost: false` and untested hosts stay marked "未测";
 * a snapshot never substitutes for a real host run.
 *
 * Usage:
 *   node scripts/capture-host-surface.js --out <path>
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { listOperationDescriptors } from '../contracts/operations.js';

const SELF_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

function buildSnapshot() {
  const manifest = JSON.parse(readFileSyncSafe(join(SELF_ROOT, 'package.json')));
  const tools = (manifest.tianshu?.tools || []).map((t) => ({ name: t.name, description: t.description }));

  const operations = listOperationDescriptors().map((op) => ({
    id: op.id,
    capability: op.capability,
    effects: op.effects,
    dependencies: op.dependencies,
    execution: op.execution,
  }));

  const operationCapabilities = [...new Set(operations.map((o) => o.capability))].sort();

  return {
    snapshotVersion: 1,
    capturedAt: new Date().toISOString(),
    pluginVersion: manifest.version,
    gatewaySurface: {
      fixedPublicTools: tools,
      fixedToolCount: tools.length,
      listChanged: false,
      dormantMode: 'tools/list returns [] outside research workspaces (Phase 2 connection-level dormancy)',
    },
    operationCatalogue: {
      count: operations.length,
      capabilities: operationCapabilities,
      operations,
    },
    optionalEcosystem: {
      jupyter: {
        required: false,
        declarationFile: 'requirements-notebook.txt',
        degradedBehavior: 'blocked (honest), never fabricated receipts',
      },
      zotero: {
        required: false,
        transport: 'Web API v3 connector (connectors/zotero.js)',
        writeDiscipline: '412 conditional writes + honest dedup + attachment scope fail-closed',
      },
      sympy: {
        required: false,
        degradedBehavior: 'theory.symbolic returns inconclusive, never fake pass',
      },
    },
    verification: {
      verifiedAgainstRealHost: false,
      note:
        '本快照仅描述插件声明的可观察表面。真实宿主（Cursor / Claude Desktop / VS Code / 天枢 sidecar）的逐格验收结果必须来自真实宿主运行记录；未测的格子一律写"未测"。详见 docs/host-compatibility.md。',
    },
  };
}

function readFileSyncSafe(path) {
  if (!existsSync(path)) throw new Error(`required file missing: ${path}`);
  return readFileSync(path, 'utf8');
}

export function captureHostSurface() {
  return buildSnapshot();
}

function main(argv = process.argv.slice(2)) {
  let out = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') {
      out = argv[i + 1];
      i += 1;
    }
  }
  const snapshot = captureHostSurface();
  if (out) {
    const target = resolve(out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    console.log(`Host surface snapshot written: ${target}`);
  } else {
    console.log(JSON.stringify(snapshot, null, 2));
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
