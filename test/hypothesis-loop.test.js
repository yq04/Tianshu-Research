import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createHypothesisSession,
  getCurrentRevision,
  recordTestRun,
  evaluateHypothesis,
  advanceRevision,
  getHypothesisSessionSummary,
} from '../workflows/hypothesis.js';

describe('Phase 5: Agile Hypothesis Lifecycle & Revision Loop', () => {
  it('initializes hypothesis session with revision 1 in proposed state', () => {
    const session = createHypothesisSession({
      title: 'PINN Residual Loss Hypothesis',
      statement: 'Uniform loss weight lambda=1 ensures convergence across all Reynolds numbers.',
      budget: { maxIterations: 3 },
      assumptions: ['Incompressible 2D Navier-Stokes', 'Laminar regime'],
    });

    assert.ok(session.id.startsWith('hyp_'));
    assert.equal(session.currentRevision, 1);
    assert.equal(session.status, 'active');
    assert.equal(session.budget.maxIterations, 3);
    assert.equal(session.budget.currentIteration, 0);

    const rev1 = getCurrentRevision(session);
    assert.equal(rev1.revision, 1);
    assert.equal(rev1.status, 'proposed');
    assert.equal(rev1.statement, 'Uniform loss weight lambda=1 ensures convergence across all Reynolds numbers.');
    assert.equal(rev1.assumptions.length, 2);
  });

  it('records test runs and transitions to testing state', () => {
    const session = createHypothesisSession({
      statement: 'Algorithm A is strictly faster than B on all graphs.',
    });

    const run = recordTestRun(session, {
      runId: 'run_graph_01',
      method: 'benchmark_latency',
      observation: 'On small graphs (N < 100), Algorithm A latency is 1.2ms vs B 3.4ms.',
      metrics: { speedup: 2.83 },
    });

    assert.equal(run.runId, 'run_graph_01');
    const rev = getCurrentRevision(session);
    assert.equal(rev.status, 'testing');
    assert.equal(rev.testRuns.length, 1);
    assert.equal(rev.testRuns[0].metrics.speedup, 2.83);
  });

  it('preserves refuted negative findings without overwriting and advances revision', () => {
    const session = createHypothesisSession({
      statement: 'Loss weight lambda=1 converges for all Re in [100, 5000].',
      budget: { maxIterations: 3 },
    });

    // 1. Run test that produces counter-example
    recordTestRun(session, {
      runId: 'run_re_5000',
      method: 'simulation_run',
      observation: 'Divergence observed at Re=5000; gradient explosion.',
      counterExample: 'Diverges at Re=5000 under uniform weighting lambda=1.',
    });

    // 2. Evaluate as refuted
    const evalResult = evaluateHypothesis(session, {
      conclusion: 'refuted',
      reason: 'Numerical instability and gradient explosion at high Reynolds number Re=5000.',
    });

    assert.equal(evalResult.conclusion, 'refuted');
    assert.equal(session.status, 'active');
    assert.equal(session.budget.currentIteration, 1);

    // Negative findings are preserved as first-class scientific deliverables
    assert.equal(session.priorRefutations.length, 1);
    assert.equal(session.priorRefutations[0].revision, 1);
    assert.ok(session.priorRefutations[0].counterExamples.includes('Diverges at Re=5000 under uniform weighting lambda=1.'));

    // Check revision 1 status is permanently refuted
    assert.equal(session.revisions[0].status, 'refuted');
    assert.equal(session.revisions[0].conclusion, 'refuted');

    // 3. Advance to revision 2 with adjusted hypothesis
    const advanceResult = advanceRevision(session, {
      revisedStatement: 'Loss weight lambda=1 converges for moderate Re <= 2000, while adaptive weighting is required for Re > 2000.',
      reasonForRevision: 'Narrow domain of uniform weighting based on Re=5000 divergence counter-example.',
      adjustments: { parameterRange: 'Re <= 2000' },
    });

    assert.equal(advanceResult.ok, true);
    assert.equal(session.currentRevision, 2);
    assert.equal(session.revisions.length, 2);

    const rev2 = getCurrentRevision(session);
    assert.equal(rev2.revision, 2);
    assert.equal(rev2.parentRevision, 1);
    assert.equal(rev2.status, 'proposed');
    assert.ok(rev2.statement.includes('moderate Re <= 2000'));

    // 4. Test and verify revision 2
    recordTestRun(session, {
      runId: 'run_re_2000',
      method: 'simulation_run',
      observation: 'Convergence within 500 epochs at Re=1500 and Re=2000.',
    });

    const evalRev2 = evaluateHypothesis(session, {
      conclusion: 'supported',
      reason: 'Empirical simulations confirm stable convergence up to Re=2000.',
    });

    assert.equal(evalRev2.conclusion, 'supported');
    assert.equal(session.status, 'supported');
    assert.equal(session.budget.currentIteration, 2);

    // Summary reflects full non-linear evolution
    const summary = getHypothesisSessionSummary(session);
    assert.ok(summary.content.includes('Revision 1 [REFUTED]'));
    assert.ok(summary.content.includes('Revision 2 [SUPPORTED]'));
    assert.ok(summary.content.includes('保留负结果反例')); assert.equal(summary.data.priorRefutationsCount, 1);
  });

  it('strictly respects iteration budget and halts gracefully when exhausted', () => {
    const session = createHypothesisSession({
      statement: 'Initial speculative conjecture.',
      budget: { maxIterations: 2 },
    });

    // Iteration 1: refuted
    recordTestRun(session, { observation: 'Counter-example found in iteration 1' });
    evaluateHypothesis(session, {
      conclusion: 'refuted',
      reason: 'First refutation',
    });
    assert.equal(session.budget.currentIteration, 1);
    assert.equal(session.status, 'active');

    // Advance to Rev 2
    advanceRevision(session, {
      revisedStatement: 'Second speculative conjecture.',
      reasonForRevision: 'Adjusting after first refutation',
    });
    assert.equal(session.currentRevision, 2);

    // Iteration 2: refuted again -> reaches maxIterations (2)
    recordTestRun(session, { observation: 'Counter-example found in iteration 2' });
    evaluateHypothesis(session, {
      conclusion: 'refuted',
      reason: 'Second refutation: boundary violated',
    });

    assert.equal(session.budget.currentIteration, 2);
    assert.equal(session.status, 'budget_exhausted');

    // Attempting to advance revision when budget is exhausted is rejected
    const blockedAdvance = advanceRevision(session, {
      revisedStatement: 'Third speculative conjecture.',
    });
    assert.equal(blockedAdvance.ok, false);
    assert.ok(blockedAdvance.error.includes('budget (2) exhausted'));

    // Audit summary notes exhausted budget without false green
    const summary = getHypothesisSessionSummary(session);
    assert.equal(summary.data.status, 'budget_exhausted');
    assert.ok(summary.content.includes('已达到预设最大迭代预算 (2 轮)'));
    assert.equal(session.priorRefutations.length, 2);
  });
});
