/**
 * CVM Context Projection for tianshu-research (Phase 8, plugin side).
 *
 * Projects research facts (typed claims, typed evidence, workflow task state,
 * budget pressure) into cognitive-machine (CVM) compatible shapes so that the
 * host runtime (Claims / Ledger / Pressure / Stigmergy) can consume research
 * reality without importing plugin internals.
 *
 * Hard disciplines enforced here:
 * - One-way only: this module is strictly read-only. It never writes to
 *   `.rivet/research/` and exposes no API for a host to push data back into
 *   the scientific fact store. The only legal write path remains the
 *   evidence gateway.
 * - Determinism / prefix-cache safety: projections contain no wall-clock
 *   timestamps, no random identifiers, and all collections are sorted before
 *   output. Two calls over identical facts produce byte-identical canonical
 *   JSON (verify with computeProjectionDigest). Dynamic research state can
 *   therefore never fragment the host KV prefix cache unless the underlying
 *   facts themselves changed.
 * - Honest counterevidence: claim projections carry support/refute counts,
 *   a `contested` flag, and a `conclusionConflict` flag when a claim claims
 *   `supported` while refuting evidence exists. Majority opinion elsewhere
 *   never rewrites these fields.
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { getAllEvidenceCombined, getAllClaimsCombined } from '../ledger/legacy-adapter.js';
import { canonicalJson, computePayloadDigest } from '../workflows/events.js';

export const CVM_PROJECTION_SCHEMA_VERSION = 1;
export const PROJECTION_DIRECTION = 'research->host';

const RELATION_SUPPORT = 'supports';
const RELATION_REFUTE = 'refutes';

function toSortedUniqueStrings(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((v) => v !== undefined && v !== null).map(String))].sort();
}

function readClaimRevision(claim) {
  const raw = claim?.meta?.revision ?? claim?.revision;
  const num = Number(raw);
  return Number.isFinite(num) && num >= 1 ? Math.floor(num) : 1;
}

/**
 * Projects one claim plus its linked evidence into the CVM claim shape.
 * Deterministic: every array is sorted, every field derived from stored facts.
 */
export function projectClaim(claim, linkedEvidence = []) {
  if (!claim || typeof claim !== 'object' || !claim.id) {
    throw new Error('projectClaim requires a claim object with an id');
  }

  const relationOf = (ev) => (ev && typeof ev === 'object' ? ev.relation : undefined);
  const counts = { supports: 0, refutes: 0, context: 0, tentative: 0, other: 0 };
  for (const ev of linkedEvidence) {
    const relation = relationOf(ev);
    if (relation && counts[relation] !== undefined) counts[relation] += 1;
    else counts.other += 1;
  }

  const refutingIds = toSortedUniqueStrings(
    linkedEvidence.filter((ev) => relationOf(ev) === RELATION_REFUTE).map((ev) => ev.id),
  );
  const supportingIds = toSortedUniqueStrings(
    linkedEvidence.filter((ev) => relationOf(ev) === RELATION_SUPPORT).map((ev) => ev.id),
  );

  const contested = counts.refutes > 0;
  const conclusion = claim.conclusion || claim.status || 'proposed';
  const conclusionConflict = contested && conclusion === 'supported';

  return Object.freeze({
    type: 'research_claim',
    id: String(claim.id),
    kind: claim.kind || 'empirical',
    statement: String(claim.statement || ''),
    conclusion,
    revision: readClaimRevision(claim),
    evidenceIds: toSortedUniqueStrings(claim.evidenceIds),
    evidenceCount: claim.evidenceIds?.length || 0,
    supportCount: counts.supports,
    refuteCount: counts.refutes,
    contextCount: counts.context,
    contested,
    refutingEvidenceIds: refutingIds,
    supportingEvidenceIds: supportingIds,
    conclusionConflict,
    sourceCreatedAt: claim.createdAt ? String(claim.createdAt) : null,
  });
}

/**
 * Summarizes one persisted workflow task from its event journal.
 * Deliberately lossless about *status-relevant* facts only; full graphs stay
 * in the event store. Returns null when the journal file does not exist.
 */
export function projectWorkflowTask(workspace, taskId) {
  const ws = resolve(workspace || process.cwd());
  const journalPath = join(ws, '.rivet', 'research', 'events', `${taskId}.jsonl`);
  if (!existsSync(journalPath)) return null;

  const lines = readFileSync(journalPath, 'utf8').split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return null;

  const kinds = [];
  let revision = 1;
  let completed = false;
  let halted = false;
  let budgetExhausted = false;
  let lastSeq = 0;
  const nodeStatuses = new Map();

  for (const line of lines) {
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event || typeof event !== 'object') continue;
    kinds.push(event.kind);
    if (Number.isFinite(event.revision) && event.revision > revision) revision = event.revision;
    if (Number.isFinite(event.seq) && event.seq > lastSeq) lastSeq = event.seq;
    if (event.kind === 'WORKFLOW_COMPLETED') completed = true;
    if (event.kind === 'WORKFLOW_HALTED') halted = true;
    if (event.kind === 'BUDGET_EXHAUSTED') budgetExhausted = true;
    const nodeId = event.payload?.nodeId;
    if (nodeId && ['NODE_COMPLETED', 'NODE_FAILED', 'NODE_CANCELLED'].includes(event.kind)) {
      nodeStatuses.set(String(nodeId), event.kind.replace('NODE_', '').toLowerCase());
    }
  }

  const status = completed ? 'completed' : halted ? 'halted' : 'active';
  return Object.freeze({
    type: 'research_task',
    taskId: String(taskId),
    status,
    eventCount: lines.length,
    lastSeq,
    revision,
    budgetExhausted,
    nodeStatuses: Object.fromEntries([...nodeStatuses.entries()].sort(([a], [b]) => (a < b ? -1 : 1))),
    eventKinds: [...kinds].sort(),
  });
}

/**
 * Lists persisted workflow task ids found in the events directory.
 */
export function listPersistedTaskIds(workspace = process.cwd()) {
  const eventsDir = join(resolve(workspace), '.rivet', 'research', 'events');
  if (!existsSync(eventsDir)) return [];
  return readdirSync(eventsDir)
    .filter((f) => f.endsWith('.jsonl'))
    .map((f) => f.slice(0, -'.jsonl'.length))
    .sort();
}

/**
 * Builds the full one-way CVM projection for a workspace.
 *
 * @param {string} workspace - Research workspace root.
 * @param {object} [options]
 * @param {boolean} [options.includeTasks=true] - Include workflow task summaries.
 * @param {boolean} [options.includeLedger=true] - Include flat ledger entries.
 * @returns {object} Frozen, deterministic projection with a content digest.
 */
export function projectResearchContext(workspace = process.cwd(), options = {}) {
  const ws = resolve(workspace);
  const includeTasks = options.includeTasks !== false;
  const includeLedger = options.includeLedger !== false;

  const evidence = getAllEvidenceCombined(ws);
  const claims = getAllClaimsCombined(ws);
  const evidenceById = new Map(evidence.filter((e) => e?.id).map((e) => [String(e.id), e]));

  const projectedClaims = claims
    .filter((c) => c && c.id)
    .map((c) => {
      const linked = (c.evidenceIds || [])
        .map((id) => evidenceById.get(String(id)))
        .filter(Boolean);
      return projectClaim(c, linked);
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const ledgerEntries = includeLedger
    ? projectedClaims.map((c) => ({
        entryType: 'claim',
        key: `research:claim:${c.id}`,
        value: {
          conclusion: c.conclusion,
          contested: c.contested,
          conclusionConflict: c.conclusionConflict,
          refuteCount: c.refuteCount,
          supportCount: c.supportCount,
          revision: c.revision,
        },
      }))
    : [];

  const tasks = includeTasks
    ? listPersistedTaskIds(ws)
        .map((taskId) => projectWorkflowTask(ws, taskId))
        .filter(Boolean)
    : [];

  const signals = [];
  for (const c of projectedClaims) {
    if (c.conclusionConflict) {
      signals.push({
        kind: 'counterevidence_conflict',
        target: c.id,
        detail: `Claim "${c.id}" is marked supported while ${c.refuteCount} refuting evidence item(s) exist.`,
      });
    }
  }
  for (const t of tasks) {
    if (t.budgetExhausted) {
      signals.push({
        kind: 'budget_exhausted',
        target: t.taskId,
        detail: `Workflow task "${t.taskId}" exhausted its experimental budget; further sampling must not be forced.`,
      });
    }
  }
  signals.sort((a, b) =>
    a.kind === b.kind ? (a.target < b.target ? -1 : a.target > b.target ? 1 : 0) : a.kind < b.kind ? -1 : 1,
  );

  const contestedCount = projectedClaims.filter((c) => c.contested).length;
  const conflictCount = projectedClaims.filter((c) => c.conclusionConflict).length;

  const projection = {
    schemaVersion: CVM_PROJECTION_SCHEMA_VERSION,
    direction: PROJECTION_DIRECTION,
    claims: projectedClaims,
    ledgerEntries,
    tasks,
    signals,
    summary: {
      claimCount: projectedClaims.length,
      evidenceCount: evidence.length,
      contestedCount,
      conclusionConflictCount: conflictCount,
      taskCount: tasks.length,
    },
  };

  return Object.freeze({
    ...projection,
    digest: computePayloadDigest(projection),
  });
}

/**
 * Canonical byte-stable serialization of a projection (for host diffing and
 * prefix-cache stability checks).
 */
export function serializeProjection(projection) {
  return canonicalJson(projection);
}

/**
 * Recomputes and verifies the digest of a projection.
 * Returns true when the projection content matches its own digest.
 */
export function verifyProjectionIntegrity(projection) {
  if (!projection || typeof projection !== 'object') return false;
  const { digest, ...rest } = projection;
  if (typeof digest !== 'string') return false;
  return computePayloadDigest(rest) === digest;
}
