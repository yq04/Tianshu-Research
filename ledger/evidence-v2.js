/**
 * Typed Scientific Evidence & Claim Store (v2) for tianshu-research.
 * Implements first-class scientific evidence for literature, empirical,
 * theoretical, and benchmark paradigms without forcing artificial DOIs.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const EVIDENCE_KINDS = ['literature', 'empirical', 'theoretical', 'benchmark'];
export const CLAIM_KINDS = ['literature', 'empirical', 'theoretical', 'benchmark', 'mixed'];
export const RELATIONS = ['supports', 'refutes', 'context', 'tentative'];
export const CONCLUSIONS = ['proposed', 'supported', 'refuted', 'inconclusive'];

export function getV2BaseDir(workspace = process.cwd()) {
  return join(resolve(workspace), '.rivet', 'research', 'v2');
}

export function getRecordsDir(workspace = process.cwd()) {
  return join(getV2BaseDir(workspace), 'records');
}

/**
 * Validates and records a v2 ScientificEvidence item.
 */
export function addEvidenceV2(workspace, data = {}) {
  const ws = resolve(workspace || process.cwd());
  const v2Dir = getV2BaseDir(ws);
  const recordsDir = join(getRecordsDir(ws), 'evidence');
  mkdirSync(recordsDir, { recursive: true });

  const id = data.id ? String(data.id).trim() : 'ev_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const kind = data.kind && EVIDENCE_KINDS.includes(data.kind) ? data.kind : 'empirical';
  const relation = data.relation && RELATIONS.includes(data.relation) ? data.relation : 'supports';
  const locator = data.locator && typeof data.locator === 'object' ? data.locator : { kind };
  const artifactRefs = Array.isArray(data.artifactRefs) ? data.artifactRefs.map(String) : [];
  const provenance = {
    method: data.provenance?.method || 'direct_observation',
    methodVersion: data.provenance?.methodVersion || '1.0',
    runId: data.provenance?.runId || undefined,
    imported: Boolean(data.provenance?.imported),
  };

  const extraProps = {};
  for (const [k, v] of Object.entries(data)) {
    if (!['schemaVersion', 'id', 'kind', 'locator', 'artifactRefs', 'relation', 'provenance', 'statement', 'excerpt', 'createdAt', 'meta'].includes(k)) {
      extraProps[k] = v;
    }
  }

  const record = {
    schemaVersion: 2,
    id,
    kind,
    locator,
    artifactRefs,
    relation,
    provenance,
    statement: data.statement || data.excerpt || '',
    excerpt: data.excerpt || data.statement || '',
    createdAt: data.createdAt || new Date().toISOString(),
    meta: { ...extraProps, ...(data.meta && typeof data.meta === 'object' ? data.meta : {}) },
    ...extraProps,
  };

  // 1. Write individual immutable record
  const recordFile = join(recordsDir, id + '.json');
  writeFileSync(recordFile, JSON.stringify(record, null, 2), 'utf8');

  // 2. Append to evidence_v2.jsonl
  const jsonlPath = join(v2Dir, 'evidence_v2.jsonl');
  appendFileSync(jsonlPath, JSON.stringify(record) + '\n', 'utf8');

  return record;
}

/**
 * Validates and records a v2 ScientificClaim item.
 */
export function addClaimV2(workspace, data = {}) {
  const ws = resolve(workspace || process.cwd());
  const v2Dir = getV2BaseDir(ws);
  const recordsDir = join(getRecordsDir(ws), 'claim');
  mkdirSync(recordsDir, { recursive: true });

  const id = data.id ? String(data.id).trim() : 'clm_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  const statement = String(data.statement || '').trim();
  if (!statement) {
    throw new Error('Claim statement is required and must not be empty.');
  }

  const kind = data.kind && CLAIM_KINDS.includes(data.kind) ? data.kind : 'empirical';
  const evidenceIds = Array.isArray(data.evidenceIds) ? data.evidenceIds.map(String) : [];
  const conclusion = data.conclusion && CONCLUSIONS.includes(data.conclusion) ? data.conclusion : 'proposed';
  const assumptions = Array.isArray(data.assumptions) ? data.assumptions.map(String) : [];

  const extraClaimProps = {};
  for (const [k, v] of Object.entries(data)) {
    if (!['schemaVersion', 'id', 'statement', 'kind', 'evidenceIds', 'scope', 'assumptions', 'conclusion', 'status', 'createdAt', 'meta'].includes(k)) {
      extraClaimProps[k] = v;
    }
  }

  const record = {
    schemaVersion: 2,
    id,
    statement,
    kind,
    evidenceIds,
    scope: data.scope || 'general',
    assumptions,
    conclusion,
    status: conclusion, // backward compatible field alias
    createdAt: data.createdAt || new Date().toISOString(),
    meta: { ...extraClaimProps, ...(data.meta && typeof data.meta === 'object' ? data.meta : {}) },
    ...extraClaimProps,
  };

  // 1. Write individual immutable record
  const recordFile = join(recordsDir, id + '.json');
  writeFileSync(recordFile, JSON.stringify(record, null, 2), 'utf8');

  // 2. Append to claims_v2.jsonl
  const jsonlPath = join(v2Dir, 'claims_v2.jsonl');
  appendFileSync(jsonlPath, JSON.stringify(record) + '\n', 'utf8');

  return record;
}

export function getEvidenceV2(workspace, id) {
  const ws = resolve(workspace || process.cwd());
  const recordFile = join(getRecordsDir(ws), 'evidence', id + '.json');
  if (existsSync(recordFile)) {
    try {
      return JSON.parse(readFileSync(recordFile, 'utf8'));
    } catch {}
  }
  // Fallback to JSONL
  const list = listEvidenceV2(ws);
  return list.find(e => e.id === id) || null;
}

export function getClaimV2(workspace, id) {
  const ws = resolve(workspace || process.cwd());
  const recordFile = join(getRecordsDir(ws), 'claim', id + '.json');
  if (existsSync(recordFile)) {
    try {
      return JSON.parse(readFileSync(recordFile, 'utf8'));
    } catch {}
  }
  const list = listClaimsV2(ws);
  return list.find(c => c.id === id) || null;
}

export function listEvidenceV2(workspace, filter = {}) {
  const ws = resolve(workspace || process.cwd());
  const jsonlPath = join(getV2BaseDir(ws), 'evidence_v2.jsonl');
  const items = [];
  if (existsSync(jsonlPath)) {
    const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    for (const l of lines) {
      try {
        const parsed = JSON.parse(l);
        if (filter.kind && parsed.kind !== filter.kind) continue;
        if (filter.relation && parsed.relation !== filter.relation) continue;
        items.push(parsed);
      } catch {}
    }
    return items;
  }

  // Fallback directory scan
  const dir = join(getRecordsDir(ws), 'evidence');
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const item = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (filter.kind && item.kind !== filter.kind) continue;
        if (filter.relation && item.relation !== filter.relation) continue;
        items.push(item);
      } catch {}
    }
  }
  return items;
}

export function listClaimsV2(workspace, filter = {}) {
  const ws = resolve(workspace || process.cwd());
  const jsonlPath = join(getV2BaseDir(ws), 'claims_v2.jsonl');
  const items = [];
  if (existsSync(jsonlPath)) {
    const lines = readFileSync(jsonlPath, 'utf8').split('\n').filter(l => l.trim().length > 0);
    for (const l of lines) {
      try {
        const parsed = JSON.parse(l);
        if (filter.kind && parsed.kind !== filter.kind) continue;
        if (filter.conclusion && parsed.conclusion !== filter.conclusion) continue;
        items.push(parsed);
      } catch {}
    }
    return items;
  }

  const dir = join(getRecordsDir(ws), 'claim');
  if (existsSync(dir)) {
    const files = readdirSync(dir).filter(f => f.endsWith('.json'));
    for (const f of files) {
      try {
        const item = JSON.parse(readFileSync(join(dir, f), 'utf8'));
        if (filter.kind && item.kind !== filter.kind) continue;
        if (filter.conclusion && item.conclusion !== filter.conclusion) continue;
        items.push(item);
      } catch {}
    }
  }
  return items;
}

export function getLedgerV2Summary(workspace) {
  const ws = resolve(workspace || process.cwd());
  const ev = listEvidenceV2(ws);
  const cl = listClaimsV2(ws);

  const byKind = { literature: 0, empirical: 0, theoretical: 0, benchmark: 0 };
  ev.forEach(e => {
    if (byKind[e.kind] !== undefined) byKind[e.kind]++;
  });

  return {
    totalEvidence: ev.length,
    totalClaims: cl.length,
    evidenceByKind: byKind,
    claims: cl.map(c => ({ id: c.id, statement: c.statement, conclusion: c.conclusion })),
  };
}
