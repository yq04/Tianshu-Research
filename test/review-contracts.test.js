/**
 * Test Suite: Council Review Contracts (Phase 8, plugin side)
 * Validates the fail-closed review protocol: quorum absence never approves,
 * majority cannot override counterevidence, chair veto, role capabilities,
 * gate-status mapping, and honest integration with workflow review nodes.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  REVIEW_VERDICTS,
  REVIEWER_ROLES,
  createReviewRequest,
  submitReviewVerdict,
  aggregateReview,
  evaluateReviewGate,
  roleCan,
} from '../integration/review-contracts.js';
import { HostAdapter } from '../workflows/host-adapter.js';

describe('Phase 8: Council Review Contracts', () => {
  let tempDir;
  let materialsDigest;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'tianshu-review-test-'));
    materialsDigest = createHash('sha256').update('reviewed materials v1').digest('hex');
  });

  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const makeRequest = (overrides = {}) =>
    createReviewRequest({
      subjectType: 'claim',
      subjectId: 'clm_1',
      materialsDigest,
      requiredQuorum: 3,
      ...overrides,
    });

  const approve = (reviewerId, role = 'reviewer', addressed = []) =>
    submitReviewVerdict({
      reviewId: makeRequest().reviewId,
      reviewerId,
      role,
      verdict: 'approve',
      justification: 'Methodology is sound.',
      addressedEvidenceIds: addressed,
    });

  it('refuses to approve when the council is absent (no fake pass)', () => {
    const request = makeRequest();
    const outcome = aggregateReview(request, []);
    assert.equal(outcome.status, 'inconclusive');
    assert.equal(outcome.reason, 'NO_VERDICTS');
    assert.equal(evaluateReviewGate(request, []).gateStatus, 'inconclusive');
  });

  it('returns inconclusive when quorum is not met', () => {
    const request = makeRequest({ requiredQuorum: 3 });
    const verdicts = [approve('r1'), approve('r2')]; // only 2 deciding seats
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'inconclusive');
    assert.equal(outcome.reason, 'QUORUM_NOT_MET');
    assert.equal(outcome.quorumMet, false);
  });

  it('blocks majority approval when refuting evidence is unaddressed', () => {
    const request = makeRequest({ claimRefutingEvidenceIds: ['ev_refute_9'] });
    const verdicts = [
      approve('r1'),
      approve('r2'),
      approve('r3'), // no approver addresses the refuting evidence
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason, 'COUNTEREVIDENCE_UNADDRESSED');
    assert.deepEqual(outcome.counterevidence.unaddressedIds, ['ev_refute_9']);
    assert.equal(evaluateReviewGate(request, verdicts).gateStatus, 'fail');
  });

  it('approves when counterevidence is addressed and majority approves', () => {
    const request = makeRequest({ claimRefutingEvidenceIds: ['ev_refute_9', 'ev_refute_10'] });
    const verdicts = [
      approve('r1', 'reviewer', ['ev_refute_9', 'ev_refute_10']),
      approve('r2'),
      approve('r3', 'chair', ['ev_refute_9']),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'approved');
    assert.equal(outcome.reason, 'MAJORITY_APPROVAL');
    assert.deepEqual(outcome.counterevidence.unaddressedIds, []);
    assert.equal(evaluateReviewGate(request, verdicts).gateStatus, 'pass');
  });

  it('lets an advisory counterevidence policy record unaddressed ids without blocking', () => {
    const request = makeRequest({
      counterevidencePolicy: 'advisory',
      claimRefutingEvidenceIds: ['ev_refute_9'],
    });
    const verdicts = [approve('r1'), approve('r2'), approve('r3')];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'approved');
    assert.deepEqual(outcome.counterevidence.unaddressedIds, ['ev_refute_9']);
  });

  it('applies chair veto regardless of majority', () => {
    const request = makeRequest();
    const verdicts = [
      approve('r1'),
      approve('r2'),
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'chair_1',
        role: 'chair',
        verdict: 'reject',
        justification: 'Sampling design violates the pre-registered protocol.',
      }),
      approve('r4'),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.reason, 'CHAIR_VETO');
  });

  it('resolves ties fail-closed (approve/reject tie -> rejected)', () => {
    const request = makeRequest({ requiredQuorum: 2 });
    const verdicts = [
      approve('r1'),
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'r2',
        role: 'reviewer',
        verdict: 'reject',
        justification: 'Statistics overfit.',
      }),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'rejected');
  });

  it('maps request_changes majority to inconclusive gate status', () => {
    const request = makeRequest({ requiredQuorum: 2 });
    const verdicts = [
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'r1',
        role: 'reviewer',
        verdict: 'request_changes',
        justification: 'Add confidence intervals.',
      }),
      approve('r2'),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'changes_requested');
    const gate = evaluateReviewGate(request, verdicts);
    assert.equal(gate.gateStatus, 'inconclusive');
    assert.equal(gate.status, 'changes_requested');
  });

  it('keeps the last verdict per reviewer and sorts deterministically', () => {
    const request = makeRequest({ requiredQuorum: 1 });
    const verdicts = [
      approve('r1'),
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'r1',
        role: 'reviewer',
        verdict: 'reject',
        justification: 'Changed my mind after re-reading.',
      }),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.tally.reject, 1);
    assert.equal(outcome.tally.approve, 0);
    assert.equal(outcome.status, 'rejected');
    assert.equal(outcome.verdicts.length, 1);
  });

  it('abstains do not count toward quorum', () => {
    const request = makeRequest({ requiredQuorum: 2 });
    const verdicts = [
      approve('r1'),
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'r2',
        role: 'reviewer',
        verdict: 'abstain',
      }),
    ];
    const outcome = aggregateReview(request, verdicts);
    assert.equal(outcome.status, 'inconclusive');
    assert.equal(outcome.tally.abstain, 1);
  });

  it('enforces role capabilities: no write/execute for anyone, readers cannot vote', () => {
    for (const role of REVIEWER_ROLES) {
      assert.equal(roleCan(role, 'write'), false, `${role} must never write`);
      assert.equal(roleCan(role, 'execute'), false, `${role} must never execute`);
      assert.equal(roleCan(role, 'read'), true);
    }
    assert.equal(roleCan('reader', 'verdict'), false);
    assert.equal(roleCan('reviewer', 'verdict'), true);
    assert.equal(roleCan('reviewer', 'aggregate'), false);
    assert.equal(roleCan('chair', 'aggregate'), true);
    assert.equal(roleCan('root', 'write'), false); // unknown roles grant nothing

    assert.throws(
      () =>
        submitReviewVerdict({
          reviewId: 'rvw_x',
          reviewerId: 'r1',
          role: 'reader',
          verdict: 'approve',
        }),
      /no verdict capability/,
    );
  });

  it('validates verdict enums, justification requirements, and unknown values', () => {
    assert.deepEqual(REVIEW_VERDICTS, ['approve', 'reject', 'request_changes', 'abstain']);
    assert.throws(
      () => submitReviewVerdict({ reviewId: 'rvw_x', reviewerId: 'r1', role: 'reviewer', verdict: 'ok' }),
      /Invalid verdict/,
    );
    assert.throws(
      () => submitReviewVerdict({ reviewId: 'rvw_x', reviewerId: 'r1', role: 'reviewer', verdict: 'reject' }),
      /justification is required/,
    );
    assert.throws(() => makeRequest({ subjectType: 'tweet' }), /Invalid subjectType/);
    assert.throws(() => makeRequest({ materialsDigest: '' }), /materialsDigest is required/);
    assert.throws(() => makeRequest({ requiredQuorum: 0 }), /requiredQuorum/);
  });

  it('derives identical reviewId for identical subject + materials', () => {
    const a = makeRequest();
    const b = makeRequest();
    assert.equal(a.reviewId, b.reviewId);
    const c = makeRequest({ subjectId: 'clm_2' });
    assert.notEqual(a.reviewId, c.reviewId);
  });

  it('workflow review nodes park in awaiting_input without council verdicts', async () => {
    const adapter = new HostAdapter({ workspace: tempDir });
    const node = { id: 'review_node', kind: 'review', operationId: 'review', inputs: {} };
    const result = await adapter.executeNode(node, {});

    assert.equal(result.status, 'awaiting_input');
    assert.match(result.prompt, /Council review required/);
    assert.ok(result.schema.properties.reviewRequest);
    assert.ok(result.schema.properties.verdicts);
  });

  it('workflow review nodes aggregate real verdicts instead of faking approval', async () => {
    const adapter = new HostAdapter({ workspace: tempDir });
    const request = makeRequest({ requiredQuorum: 2 });
    const verdicts = [
      approve('r1'),
      submitReviewVerdict({
        reviewId: request.reviewId,
        reviewerId: 'r2',
        role: 'reviewer',
        verdict: 'reject',
        justification: 'Effect disappears under fixed-effects meta-analysis.',
      }),
    ];

    const node = {
      id: 'review_node',
      kind: 'review',
      operationId: 'review',
      inputs: { reviewRequest: { ...request }, verdicts },
    };
    const result = await adapter.executeNode(node, {});
    assert.equal(result.status, 'failed');
    assert.equal(result.data.reviewStatus, 'rejected');
    assert.equal(result.data.gateStatus, 'fail');
    assert.equal(result.issues.length, 1);

    const approvingNode = {
      id: 'review_node_ok',
      kind: 'review',
      operationId: 'review',
      inputs: {
        reviewRequest: { ...makeRequest({ requiredQuorum: 2 }) },
        verdicts: [approve('a1'), approve('a2')],
      },
    };
    const ok = await adapter.executeNode(approvingNode, {});
    assert.equal(ok.status, 'completed');
    assert.equal(ok.data.reviewStatus, 'approved');
    assert.equal(ok.data.gateStatus, 'pass');
  });

  it('workflow review nodes fail honestly on malformed review payloads', async () => {
    const adapter = new HostAdapter({ workspace: tempDir });
    const node = {
      id: 'review_bad',
      kind: 'review',
      operationId: 'review',
      inputs: { reviewRequest: { broken: true }, verdicts: [{ reviewerId: 'r1' }] },
    };
    const result = await adapter.executeNode(node, {});
    assert.equal(result.status, 'failed');
    assert.ok(result.error);
  });
});
