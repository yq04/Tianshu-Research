/**
 * Council Review Contracts for tianshu-research (Phase 8, plugin side).
 *
 * Defines the review protocol that a host Council (multi-seat independent peer
 * review) must satisfy before any research artifact, claim, or workflow review
 * node may be approved. The policy lives in code, not in prompts: a model
 * fabricating "system messages" cannot relax quorum, override counterevidence,
 * or grant write/execute permissions to reviewers.
 *
 * Fail-closed invariants:
 * - Council absence is never an approval: fewer than `requiredQuorum` distinct
 *   verdict-bearing reviewers aggregate to `inconclusive`, never `approved`.
 * - Majority approval cannot override counterevidence: when the subject claim
 *   carries refuting evidence that no approving reviewer explicitly addressed,
 *   the gate is blocked regardless of the vote split.
 * - A chair `reject` vetoes regardless of the majority.
 * - Ties and malformed input resolve to the least permissive outcome.
 * - Reviewer roles are capability-limited: every role may read; only
 *   `reviewer`/`chair` may emit verdicts; only `chair` may aggregate; NO role
 *   may write to the ledger or execute operations.
 */

import { GATE_STATUSES } from '../gates/report.js';
import { computePayloadDigest } from '../workflows/events.js';

export const REVIEW_POLICY_VERSION = 1;

export const REVIEW_VERDICTS = Object.freeze(['approve', 'reject', 'request_changes', 'abstain']);
export const REVIEWER_ROLES = Object.freeze(['reader', 'reviewer', 'chair']);
export const REVIEW_SUBJECT_TYPES = Object.freeze(['claim', 'evidence', 'workflow_node', 'gate_report', 'artifact']);

/**
 * Capability matrix. `write` and `execute` are false for every role by
 * construction; the function below refuses to grant them for any role,
 * including future ones, unless explicitly added here with justification.
 */
const ROLE_CAPABILITIES = Object.freeze({
  reader: Object.freeze({ read: true, verdict: false, aggregate: false }),
  reviewer: Object.freeze({ read: true, verdict: true, aggregate: false }),
  chair: Object.freeze({ read: true, verdict: true, aggregate: true }),
});

export function roleCan(role, action) {
  if (!REVIEWER_ROLES.includes(role)) return false;
  if (action === 'write' || action === 'execute') return false;
  return Boolean(ROLE_CAPABILITIES[role]?.[action]);
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be a plain object`);
  }
}

/**
 * Creates an immutable review request for a subject (claim / node / report).
 * `materialsDigest` must be the content digest of exactly what reviewers see,
 * so verdicts can never silently drift from the material under review.
 */
export function createReviewRequest({
  subjectType,
  subjectId,
  materialsDigest,
  requiredQuorum = 3,
  counterevidencePolicy = 'blocking',
  claimRefutingEvidenceIds = [],
  meta = {},
} = {}) {
  assertPlainObject(meta, 'meta');
  if (!REVIEW_SUBJECT_TYPES.includes(subjectType)) {
    throw new Error(`Invalid subjectType "${subjectType}". Must be one of: ${REVIEW_SUBJECT_TYPES.join(', ')}`);
  }
  if (!subjectId || typeof subjectId !== 'string') {
    throw new Error('subjectId is required');
  }
  if (!materialsDigest || typeof materialsDigest !== 'string') {
    throw new Error('materialsDigest is required (sha256 of reviewed materials)');
  }
  const quorum = Number(requiredQuorum);
  if (!Number.isFinite(quorum) || quorum < 1 || !Number.isInteger(quorum)) {
    throw new Error('requiredQuorum must be a positive integer');
  }
  if (!['blocking', 'advisory'].includes(counterevidencePolicy)) {
    throw new Error('counterevidencePolicy must be "blocking" or "advisory"');
  }

  const refutingIds = [...new Set((claimRefutingEvidenceIds || []).map(String))].sort();

  const request = {
    policyVersion: REVIEW_POLICY_VERSION,
    reviewId: `rvw_${computePayloadDigest({ subjectType, subjectId, materialsDigest }).slice(0, 16)}`,
    subjectType,
    subjectId,
    materialsDigest,
    requiredQuorum: quorum,
    counterevidencePolicy,
    claimRefutingEvidenceIds: refutingIds,
    meta: { ...meta },
  };
  return Object.freeze(request);
}

/**
 * Validates and freezes one reviewer verdict.
 * `addressedEvidenceIds` lists refuting-evidence ids this verdict explicitly
 * rebuts or accounts for (required for approvals under blocking policy).
 */
export function submitReviewVerdict({
  reviewId,
  reviewerId,
  role,
  verdict,
  justification,
  addressedEvidenceIds = [],
  meta = {},
} = {}) {
  assertPlainObject(meta, 'meta');
  if (!reviewId || typeof reviewId !== 'string') throw new Error('reviewId is required');
  if (!reviewerId || typeof reviewerId !== 'string') throw new Error('reviewerId is required');
  if (!REVIEWER_ROLES.includes(role)) {
    throw new Error(`Invalid reviewer role "${role}". Must be one of: ${REVIEWER_ROLES.join(', ')}`);
  }
  if (!roleCan(role, 'verdict')) {
    throw new Error(`Role "${role}" has no verdict capability (read-only seat)`);
  }
  if (!REVIEW_VERDICTS.includes(verdict)) {
    throw new Error(`Invalid verdict "${verdict}". Must be one of: ${REVIEW_VERDICTS.join(', ')}`);
  }
  const text = String(justification || '').trim();
  if ((verdict === 'reject' || verdict === 'request_changes') && !text) {
    throw new Error(`justification is required for verdict "${verdict}"`);
  }

  return Object.freeze({
    reviewId,
    reviewerId,
    role,
    verdict,
    justification: text,
    addressedEvidenceIds: [...new Set((addressedEvidenceIds || []).map(String))].sort(),
    meta: { ...meta },
  });
}

/**
 * Aggregates verdicts for a request into a deterministic review outcome.
 *
 * @param {object} request - from createReviewRequest
 * @param {Array} verdicts - from submitReviewVerdict (deduped by reviewerId, last wins)
 * @returns {object} { status, outcome, reason, tally, quorum, counterevidence, verdicts }
 *   status: 'approved' | 'rejected' | 'changes_requested' | 'inconclusive'
 */
export function aggregateReview(request, verdicts = []) {
  if (!request || typeof request !== 'object' || !request.reviewId) {
    throw new Error('aggregateReview requires a review request');
  }
  if (!Array.isArray(verdicts)) throw new Error('verdicts must be an array');

  // Last verdict per reviewer wins; sort for deterministic output.
  const byReviewer = new Map();
  for (const v of verdicts) {
    if (!v || typeof v !== 'object') continue;
    byReviewer.set(String(v.reviewerId), v);
  }
  const effective = [...byReviewer.values()].sort((a, b) => (a.reviewerId < b.reviewerId ? -1 : 1));

  const deciding = effective.filter((v) => v.verdict !== 'abstain');
  const tally = {
    approve: deciding.filter((v) => v.verdict === 'approve').length,
    reject: deciding.filter((v) => v.verdict === 'reject').length,
    request_changes: deciding.filter((v) => v.verdict === 'request_changes').length,
    abstain: effective.length - deciding.length,
  };

  const refutingIds = request.claimRefutingEvidenceIds || [];
  const base = {
    reviewId: request.reviewId,
    subjectType: request.subjectType,
    subjectId: request.subjectId,
    materialsDigest: request.materialsDigest,
    tally,
    quorumRequired: request.requiredQuorum,
    quorumMet: deciding.length >= request.requiredQuorum,
    counterevidence: { policy: request.counterevidencePolicy, refutingEvidenceIds: refutingIds, unaddressedIds: [] },
  };

  const failClosed = (status, reason) =>
    Object.freeze({ ...base, status, outcome: status, reason, verdicts: effective });

  // Invariant 1: council absence / thin participation is never approval.
  if (deciding.length === 0) {
    return failClosed('inconclusive', 'NO_VERDICTS');
  }
  if (deciding.length < request.requiredQuorum) {
    return failClosed('inconclusive', 'QUORUM_NOT_MET');
  }

  // Invariant 2: majority cannot override counterevidence (blocking policy).
  const approvals = deciding.filter((v) => v.verdict === 'approve');
  const addressedByApprovers = new Set(approvals.flatMap((v) => v.addressedEvidenceIds || []));
  const unaddressed = refutingIds.filter((id) => !addressedByApprovers.has(id));
  base.counterevidence.unaddressedIds = unaddressed;
  if (request.counterevidencePolicy === 'blocking' && unaddressed.length > 0) {
    return failClosed('rejected', 'COUNTEREVIDENCE_UNADDRESSED');
  }

  // Invariant 3: chair veto beats majority.
  if (deciding.some((v) => v.role === 'chair' && v.verdict === 'reject')) {
    return failClosed('rejected', 'CHAIR_VETO');
  }

  const rejects = tally.reject;
  const changes = tally.request_changes;
  if (approvals.length > rejects && approvals.length > changes) {
    return failClosed('approved', 'MAJORITY_APPROVAL');
  }
  if (rejects >= approvals.length && rejects >= changes) {
    return failClosed('rejected', 'MAJORITY_REJECTION');
  }
  return failClosed('changes_requested', 'MAJORITY_CHANGES_REQUESTED');
}

/**
 * Maps a review outcome onto the five-state scientific gate statuses
 * (pass / fail / inconclusive / not_applicable / error), aligned with
 * gates/report.js GATE_STATUSES.
 */
export function evaluateReviewGate(request, verdicts = []) {
  if (!request || typeof request !== 'object' || !request.reviewId) {
    return { status: 'error', reason: 'MALFORMED_REQUEST', gateStatus: 'error' };
  }
  let aggregate;
  try {
    aggregate = aggregateReview(request, verdicts);
  } catch (err) {
    return { status: 'error', reason: err?.message || 'AGGREGATION_ERROR', gateStatus: 'error' };
  }

  const map = {
    approved: 'pass',
    rejected: 'fail',
    changes_requested: 'inconclusive',
    inconclusive: 'inconclusive',
  };
  return {
    status: aggregate.status,
    reason: aggregate.reason,
    gateStatus: map[aggregate.status],
    tally: aggregate.tally,
    quorumMet: aggregate.quorumMet,
    counterevidence: aggregate.counterevidence,
  };
}
