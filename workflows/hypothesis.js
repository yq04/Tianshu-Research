/**
 * Agile Hypothesis Lifecycle and Revision Loop for tianshu-research.
 * Implements non-linear trial loops: proposed -> testing -> (supported | refuted | inconclusive) -> revision.
 * Preserves negative findings (refuted) as first-class scientific deliverables without overwriting,
 * tracks accumulated counter-examples, and strictly respects iteration budgets.
 */

export const HYPOTHESIS_STATUSES = Object.freeze([
  'proposed',
  'testing',
  'supported',
  'refuted',
  'inconclusive',
]);

export const SESSION_STATUSES = Object.freeze([
  'active',
  'supported',
  'refuted_terminal',
  'budget_exhausted',
  'halted',
]);

/**
 * Initializes a new HypothesisSession with revision 1.
 */
export function createHypothesisSession(options = {}) {
  const id = options.id
    ? String(options.id).trim()
    : 'hyp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);

  const statement = String(options.statement || options.initialHypothesis || options.hypothesis || '').trim();
  if (!statement) {
    throw new Error('Initial hypothesis statement is required.');
  }

  const title = String(options.title || options.objective || statement).trim();
  const maxIterations = typeof options.budget?.maxIterations === 'number' && options.budget.maxIterations > 0
    ? options.budget.maxIterations
    : 3;

  const assumptions = Array.isArray(options.assumptions)
    ? options.assumptions.map(String)
    : [];

  const initialRevision = {
    revision: 1,
    statement,
    status: 'proposed',
    assumptions,
    createdAt: new Date().toISOString(),
    completedAt: null,
    testRuns: [],
    counterExamples: [],
    evidenceIds: [],
    conclusion: null,
    conclusionReason: null,
  };

  return {
    id,
    title,
    objective: options.objective || title,
    status: 'active',
    currentRevision: 1,
    budget: {
      maxIterations,
      currentIteration: 0,
    },
    revisions: [initialRevision],
    priorRefutations: [],
    allEvidence: [],
    workspace: options.workspace || null,
    metadata: options.metadata || {},
  };
}

/**
 * Returns the active/latest revision object.
 */
export function getCurrentRevision(session) {
  if (!session || !Array.isArray(session.revisions) || session.revisions.length === 0) {
    throw new Error('Invalid hypothesis session: no revisions found.');
  }
  return session.revisions[session.revisions.length - 1];
}

/**
 * Records an empirical, theoretical, or benchmark test observation for the current revision.
 */
export function recordTestRun(session, testData = {}) {
  const currentRev = getCurrentRevision(session);
  if (['supported', 'refuted', 'inconclusive'].includes(currentRev.status)) {
    throw new Error('Cannot record test run: current revision ' + currentRev.revision + ' is already evaluated (' + currentRev.status + '). Advance revision first.');
  }

  const runId = testData.runId ? String(testData.runId).trim() : 'run_' + Date.now().toString(36);
  const method = String(testData.method || 'direct_test').trim();
  const observation = String(testData.observation || testData.result || '').trim();
  const counterExample = testData.counterExample ? String(testData.counterExample).trim() : null;
  const evidenceId = testData.evidenceId ? String(testData.evidenceId).trim() : null;

  const testRun = {
    runId,
    method,
    observation,
    metrics: testData.metrics && typeof testData.metrics === 'object' ? { ...testData.metrics } : {},
    counterExample,
    evidenceId,
    timestamp: new Date().toISOString(),
  };

  currentRev.testRuns.push(testRun);
  currentRev.status = 'testing';

  if (counterExample) {
    currentRev.counterExamples.push(counterExample);
  }
  if (evidenceId && !session.allEvidence.includes(evidenceId)) {
    session.allEvidence.push(evidenceId);
    currentRev.evidenceIds.push(evidenceId);
  }

  return testRun;
}

/**
 * Evaluates the current revision with supported, refuted, or inconclusive.
 */
export function evaluateHypothesis(session, evaluation = {}) {
  const currentRev = getCurrentRevision(session);
  const conclusion = String(evaluation.conclusion || '').toLowerCase().trim();

  if (!['supported', 'refuted', 'inconclusive'].includes(conclusion)) {
    throw new Error('Invalid conclusion: must be one of "supported", "refuted", "inconclusive".');
  }

  const reason = String(evaluation.reason || evaluation.summary || '').trim();
  const counterExample = evaluation.counterExample ? String(evaluation.counterExample).trim() : null;

  if (counterExample && !currentRev.counterExamples.includes(counterExample)) {
    currentRev.counterExamples.push(counterExample);
  }

  currentRev.status = conclusion;
  currentRev.conclusion = conclusion;
  currentRev.conclusionReason = reason;
  currentRev.completedAt = new Date().toISOString();

  // Increment iteration count
  session.budget.currentIteration += 1;

  if (conclusion === 'refuted') {
    // Preserve negative findings into session priorRefutations without overwriting
    session.priorRefutations.push({
      revision: currentRev.revision,
      statement: currentRev.statement,
      reason,
      counterExamples: [...currentRev.counterExamples],
      metrics: evaluation.metrics || {},
      timestamp: new Date().toISOString(),
    });

    if (session.budget.currentIteration >= session.budget.maxIterations) {
      session.status = 'budget_exhausted';
    } else {
      session.status = 'active';
    }
  } else if (conclusion === 'supported') {
    session.status = 'supported';
  } else if (conclusion === 'inconclusive') {
    if (session.budget.currentIteration >= session.budget.maxIterations) {
      session.status = 'budget_exhausted';
    } else {
      session.status = 'active';
    }
  }

  return {
    revision: currentRev.revision,
    conclusion,
    reason,
    sessionStatus: session.status,
    currentIteration: session.budget.currentIteration,
    maxIterations: session.budget.maxIterations,
  };
}

/**
 * Advances to a new hypothesis revision, preserving old revisions and inheriting prior refutations.
 */
export function advanceRevision(session, nextData = {}) {
  if (session.status === 'budget_exhausted') {
    return {
      ok: false,
      error: 'Cannot advance revision: maximum iteration budget (' + session.budget.maxIterations + ') exhausted.',
      session,
    };
  }

  const currentRev = getCurrentRevision(session);
  if (currentRev.status === 'proposed' || currentRev.status === 'testing') {
    return {
      ok: false,
      error: 'Current revision ' + currentRev.revision + ' is still in state "' + currentRev.status + '". Evaluate it first.',
      session,
    };
  }

  const revisedStatement = String(nextData.revisedStatement || nextData.statement || '').trim();
  if (!revisedStatement) {
    return {
      ok: false,
      error: 'revisedStatement is required to advance hypothesis revision.',
      session,
    };
  }

  const nextRevNumber = session.currentRevision + 1;
  const newRevision = {
    revision: nextRevNumber,
    parentRevision: currentRev.revision,
    statement: revisedStatement,
    reasonForRevision: String(nextData.reasonForRevision || nextData.reason || '').trim(),
    adjustments: nextData.adjustments || {},
    assumptions: Array.isArray(nextData.assumptions) ? nextData.assumptions.map(String) : [...currentRev.assumptions],
    status: 'proposed',
    createdAt: new Date().toISOString(),
    completedAt: null,
    testRuns: [],
    counterExamples: [],
    evidenceIds: [],
    conclusion: null,
    conclusionReason: null,
  };

  session.currentRevision = nextRevNumber;
  session.revisions.push(newRevision);
  session.status = 'active';

  return {
    ok: true,
    session,
    newRevision,
  };
}

/**
 * Generates an audit summary of the hypothesis session.
 */
export function getHypothesisSessionSummary(session) {
  if (!session) return 'No hypothesis session provided.';

  const lines = [
    '### 敏捷假设回环状态报告 (Hypothesis Loop Summary)',
    '',
    '- **会话标识**: `' + session.id + '`',
    '- **研究主题**: ' + session.title,
    '- **当前状态**: ' + session.status.toUpperCase(),
    '- **迭代进展**: ' + session.budget.currentIteration + ' / ' + session.budget.maxIterations + ' 轮 (当前版本: v' + session.currentRevision + ')',
    '- **保留负结果反例**: ' + session.priorRefutations.length + ' 项',
    '',
    '#### 各版本演进记录 (Revisions):',
  ];

  for (const rev of session.revisions) {
    lines.push('##### Revision ' + rev.revision + ' [' + rev.status.toUpperCase() + ']');
    lines.push('- **命题**: ' + rev.statement);
    if (rev.reasonForRevision) {
      lines.push('- **修订动因**: ' + rev.reasonForRevision);
    }
    if (rev.conclusionReason) {
      lines.push('- **审查结论**: ' + rev.conclusionReason);
    }
    if (rev.counterExamples.length > 0) {
      lines.push('- **证伪反例**:');
      for (const ce of rev.counterExamples) {
        lines.push('  - ' + ce);
      }
    }
    if (rev.testRuns.length > 0) {
      lines.push('- **实验观察**: ' + rev.testRuns.map(r => '[' + r.method + '] ' + r.observation).join('; '));
    }
    lines.push('');
  }

  if (session.status === 'budget_exhausted') {
    lines.push('⚠️ **注意**: 已达到预设最大迭代预算 (' + session.budget.maxIterations + ' 轮)，回环自动停止，未决结论已如实保留。');
  }

  return {
    content: lines.join(String.fromCharCode(10)),
    data: {
      id: session.id,
      status: session.status,
      currentRevision: session.currentRevision,
      budget: session.budget,
      priorRefutationsCount: session.priorRefutations.length,
      revisions: session.revisions,
    },
  };
}
