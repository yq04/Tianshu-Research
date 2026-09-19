#!/usr/bin/env node
/**
 * Live Smoke Test for tianshu-research connectors (Phase 9A/12).
 *
 * Proves REAL accessibility and response schema of the external scholarly
 * sources through the plugin's actual connectors — nothing more. It is NOT a
 * functional test suite and never writes to any external service:
 *   - OpenAlex : 1 search request (+ optional DOI lookup)
 *   - arXiv    : 1 search request (through the cross-process rate limiter)
 *   - Zotero   : read-only listItems(1), ONLY when credentials are present;
 *                otherwise honestly reported as skipped.
 *
 * Usage: node scripts/live-smoke.js [--out <path>]
 * Exit 0 when every EXECUTED check passes; skipped sources do not fail the run.
 */

import { resolve } from 'node:path';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOpenAlexConnector } from '../connectors/openalex.js';
import { createArxivConnector } from '../connectors/arxiv.js';
import { createZoteroClient } from '../connectors/zotero.js';
import { SnapshotTransport } from '../connectors/source-snapshot.js';

const SELF_ROOT = resolve(join(dirname(fileURLToPath(import.meta.url)), '..'));

function check(name, ok, evidence) {
  return { name, status: ok ? 'PASS' : 'FAIL', evidence };
}

function skip(name, evidence) {
  return { name, status: 'SKIPPED', evidence };
}

async function smokeOpenAlex() {
  const transport = new SnapshotTransport({ mode: 'live' });
  const connector = createOpenAlexConnector({ transport });
  const { records, meta } = await connector.searchWorks({ query: 'quantum computing', maxResults: 1 });
  const r = records[0];
  const checks = [
    check('openalex.search.http', meta.pages >= 1 && meta.rawCount >= 1, { pages: meta.pages, rawCount: meta.rawCount }),
    check('openalex.schema.record', Boolean(r && r.sourceId && r.title && Array.isArray(r.versions)), r ? { sourceId: r.sourceId, versions: r.versions.length } : null),
    check('openalex.schema.abstract', Boolean(r && typeof r.abstract === 'string' && r.abstract.length > 0), r ? { abstractChars: r.abstract.length } : null),
  ];
  const doi = r?.doi;
  if (doi) {
    const lookup = await connector.lookupDoi(doi);
    checks.push(check('openalex.doiLookup', Boolean(lookup && lookup.title), { doi, title: lookup?.title?.slice(0, 80) }));
  }
  return checks;
}

async function smokeArxiv() {
  const transport = new SnapshotTransport({ mode: 'live' });
  const connector = createArxivConnector({ transport }); // default cross-process rate limiter (>=3s gap)
  const { records } = await connector.search({ query: 'attention is all you need', maxResults: 1 });
  const r = records[0];
  return [
    check('arxiv.search.http', Boolean(r), r ? { arxivId: r.arxivId } : null),
    check('arxiv.schema.record', Boolean(r && r.arxivId && r.title && r.landingUrl), r ? { arxivId: r.arxivId, landingUrl: r.landingUrl } : null),
  ];
}

async function smokeZotero() {
  const userId = process.env.ZOTERO_USER_ID?.trim();
  const apiKey = process.env.ZOTERO_API_KEY?.trim();
  if (!userId || !apiKey) {
    return [skip('zotero.readOnly', 'ZOTERO_USER_ID / ZOTERO_API_KEY not set; read-only smoke skipped honestly (no creds, no writes ever)')];
  }
  const transport = new SnapshotTransport({ mode: 'live' });
  const client = createZoteroClient({ transport, userId, apiKey });
  const items = await client.listItems({ maxItems: 1 });
  return [check('zotero.readOnly.list', Array.isArray(items), { itemCount: items.length, writeAttempts: 0 })];
}

async function main() {
  const argv = process.argv.slice(2);
  const outPath = argv.includes('--out') ? resolve(argv[argv.indexOf('--out') + 1]) : null;

  const results = [];
  for (const [name, fn] of [['openalex', smokeOpenAlex], ['arxiv', smokeArxiv], ['zotero', smokeZotero]]) {
    try {
      results.push(...await fn());
    } catch (err) {
      results.push(check(name + '.transport', 'FAIL', err instanceof Error ? err.message : String(err)));
    }
  }

  const executed = results.filter((r) => r.status !== 'SKIPPED');
  const failed = executed.filter((r) => r.status === 'FAIL');
  const report = {
    smoke: 'live-connectivity',
    date: new Date().toISOString(),
    results,
    summary: { executed: executed.length, passed: executed.length - failed.length, failed: failed.length, skipped: results.length - executed.length },
  };

  for (const r of results) {
    console.log(`[${r.status}] ${r.name}${r.evidence ? ' — ' + JSON.stringify(r.evidence).slice(0, 160) : ''}`);
  }
  console.log(`Live smoke: ${report.summary.passed}/${report.summary.executed} executed checks passed, ${report.summary.skipped} skipped.`);

  if (outPath) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(`Report written: ${outPath}`);
  }
  process.exit(failed.length > 0 ? 1 : 0);
}

main();
