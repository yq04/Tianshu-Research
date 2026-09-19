/**
 * Legacy Ledger Adapter for tianshu-research.
 * Provides read-only lossless mapping from v1 literature ledger files
 * (sources.jsonl, evidence.jsonl, claims.jsonl) into v2 typed structures.
 */

import { getSources, getEvidenceList, getClaims } from './evidence-ledger.js';
import { listEvidenceV2, listClaimsV2 } from './evidence-v2.js';

/**
 * Maps a v1 evidence record into a v2 ScientificEvidence object.
 */
export function adaptLegacyEvidence(v1Item) {
  if (!v1Item) return null;
  const locator = {
    kind: 'document',
    documentId: v1Item.sourceId,
    contentHash: '',
    page: v1Item.locator?.page,
    section: v1Item.locator?.section,
    lineStart: v1Item.locator?.lineStart,
    lineEnd: v1Item.locator?.lineEnd,
    charOffset: v1Item.locator?.charOffset,
    equation: v1Item.locator?.equation,
    figure: v1Item.locator?.figure,
    table: v1Item.locator?.table,
  };

  return {
    schemaVersion: 2,
    id: v1Item.id,
    kind: 'literature',
    locator,
    artifactRefs: [],
    relation: v1Item.relation || 'supports',
    provenance: {
      method: 'legacy_import',
      methodVersion: '1.0',
      imported: true,
    },
    statement: v1Item.excerpt || '',
    excerpt: v1Item.excerpt || '',
    createdAt: v1Item.timestamp || new Date().toISOString(),
    sourceId: v1Item.sourceId, // preserve original field
  };
}

/**
 * Maps a v1 claim record into a v2 ScientificClaim object.
 */
export function adaptLegacyClaim(v1Claim) {
  if (!v1Claim) return null;
  // Map v1 status (tentative, verified, refuted, etc.) to v2 conclusions
  let conclusion = 'proposed';
  const st = String(v1Claim.status || '').toLowerCase();
  if (st === 'verified' || st === 'supported' || st === 'proven') {
    conclusion = 'supported';
  } else if (st === 'refuted' || st === 'falsified') {
    conclusion = 'refuted';
  } else if (st === 'tentative' || st === 'proposed') {
    conclusion = 'proposed';
  } else if (st === 'inconclusive') {
    conclusion = 'inconclusive';
  }

  return {
    schemaVersion: 2,
    id: v1Claim.id,
    statement: v1Claim.statement,
    kind: 'literature',
    evidenceIds: Array.isArray(v1Claim.evidenceIds) ? v1Claim.evidenceIds : [],
    scope: 'literature',
    assumptions: [],
    conclusion,
    status: v1Claim.status,
    createdAt: v1Claim.timestamp || new Date().toISOString(),
  };
}

export function getLegacyEvidenceAsV2(workspace) {
  const legacy = getEvidenceList(workspace);
  return legacy.map(adaptLegacyEvidence).filter(Boolean);
}

export function getLegacyClaimsAsV2(workspace) {
  const legacy = getClaims(workspace);
  return legacy.map(adaptLegacyClaim).filter(Boolean);
}

/**
 * Returns all evidence records (both legacy converted and native v2).
 */
export function getAllEvidenceCombined(workspace) {
  const legacy = getLegacyEvidenceAsV2(workspace);
  const v2 = listEvidenceV2(workspace);
  const map = new Map();
  // V2 overrides or supplements legacy by ID
  for (const l of legacy) map.set(l.id, l);
  for (const v of v2) map.set(v.id, v);
  return Array.from(map.values());
}

/**
 * Returns all claim records (both legacy converted and native v2).
 */
export function getAllClaimsCombined(workspace) {
  const legacy = getLegacyClaimsAsV2(workspace);
  const v2 = listClaimsV2(workspace);
  const map = new Map();
  for (const l of legacy) map.set(l.id, l);
  for (const v of v2) map.set(v.id, v);
  return Array.from(map.values());
}
