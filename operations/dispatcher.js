/**
 * Operations Dispatcher for tianshu-research.
 * Dispatches registered operation descriptors through scope guards, schema validation,
 * and deterministic local execution to structured OperationResults.
 */

import { getOperationDescriptor } from '../contracts/operations.js';
import { checkDimensions, numericEval, symbolicEval } from '../compute/compute-gateway.js';
import { inspectDataset } from '../data/inspect.js';
import { compareTwoGroups } from '../data/statistics.js';
import { renderFigure } from '../figure/render.js';
import { createBenchmarkPlan } from '../benchmark/plan.js';
import { compareBenchmarkRuns } from '../benchmark/compare.js';
import { executeRunSpec, getRunStatus, cancelRun } from '../jobs/executor.js';
import { createRunSpec } from '../jobs/run-spec.js';
import { prepareData } from '../data/prepare.js';
import { getNotebookSession } from '../notebook/kernel-manager.js';
import { guardBackend } from '../jobs/backends/interface.js';
import { getLocalProcessBackend } from '../jobs/backends/local-process.js';
import { createResourcePolicy } from '../jobs/resource-policy.js';
import { reconcileRuns } from '../jobs/reconcile.js';
import { recordExecution, saveNotebookDocument, loadNotebookDocument } from '../notebook/execution-record.js';
import { replayExecutionRecord } from '../notebook/replay.js';
import { ResearchWorkflowStore } from '../workflows/store.js';
import { WorkflowScheduler } from '../workflows/scheduler.js';
import { ScopeViolationError } from '../scope/workspace-scope.js';
import { resolve, isAbsolute } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

export async function dispatchOperation(operationId, args = {}, context = {}) {
  const descriptor = getOperationDescriptor(operationId);

  // 1. Whitelist validation
  if (!descriptor) {
    return {
      status: 'blocked',
      summary: 'Unregistered operation ID: ' + String(operationId),
      issues: [
        {
          severity: 'error',
          code: 'UNREGISTERED_OPERATION',
          message: 'Operation "' + operationId + '" is not registered in the authoritative operation catalogue.',
        },
      ],
      artifacts: [],
    };
  }

  // 2. Scope entitlement check
  const scope = context?.scope;
  if (scope && Array.isArray(scope.configuredCapabilities)) {
    if (!scope.configuredCapabilities.includes(descriptor.capability)) {
      return {
        status: 'blocked',
        summary: 'Capability "' + descriptor.capability + '" is disabled by workspace scope policy.',
        issues: [
          {
            severity: 'error',
            code: 'CAPABILITY_DISABLED',
            message: 'Operation requires capability "' + descriptor.capability + '", which is not enabled in this workspace scope.',
          },
        ],
        artifacts: [],
      };
    }
  }

  // 3. Basic schema argument validation
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return {
      status: 'failed',
      summary: 'Arguments must be a valid key-value object.',
      issues: [{ severity: 'error', code: 'INVALID_ARGUMENTS', message: 'Missing or malformed arguments object.' }],
      artifacts: [],
    };
  }

  const requiredFields = descriptor.inputSchema?.required || [];
  for (const field of requiredFields) {
    if (args[field] === undefined || args[field] === null || (typeof args[field] === 'string' && !args[field].trim())) {
      return {
        status: 'failed',
        summary: 'Missing required argument: ' + field,
        issues: [{ severity: 'error', code: 'MISSING_ARGUMENT', message: 'Field "' + field + '" is required by ' + descriptor.id }],
        artifacts: [],
      };
    }
  }

  const ws = context?.workspace || process.cwd();

  // 4. Execution branch
  try {
    switch (descriptor.id) {
      // --- THEORY ---
      case 'theory.dimension@1': {
        const lhs = String(args.lhs).trim();
        const rhs = String(args.rhs).trim();
        const customUnits = args.symbols || args.customUnits || {};
        const res = checkDimensions(lhs, rhs, customUnits);
        return {
          status: res.consistent ? 'completed' : 'failed',
          summary: res.message || (res.consistent ? 'Dimensional check passed' : 'Dimensional check failed'),
          measurements: {
            consistent: res.consistent,
            lhsPowers: res.lhsPowers,
            rhsPowers: res.rhsPowers,
            difference: res.difference,
          },
          artifacts: [],
          issues: res.consistent ? [] : [{ severity: 'error', code: 'DIMENSION_MISMATCH', message: res.message }],
          data: res,
        };
      }

      case 'theory.numeric-check@1': {
        const analytic = args.analytic;
        const numerical = args.numerical;
        const tol = args.tolerance ?? args.atol ?? 1e-4;
        const res = numericEval(analytic, numerical, tol);
        return {
          status: res.consistent ? 'completed' : 'failed',
          summary: res.message,
          measurements: {
            consistent: res.consistent,
            analytic: res.analytic,
            numerical: res.numerical,
            absoluteError: res.absoluteError,
            relativeError: res.relativeError,
            tolerance: res.tolerance,
          },
          artifacts: [],
          issues: res.consistent ? [] : [{ severity: 'warning', code: 'NUMERIC_TOLERANCE_EXCEEDED', message: res.message }],
          data: res,
        };
      }

      case 'theory.symbolic@1': {
        const expr = String(args.expr).trim();
        const action = args.operation || args.symbolicAction || 'simplify';
        const res = symbolicEval({ expr, symbolicAction: action, var: args.var || 'x' });
        const isOk = (res.ok || res.success) && !res.error;
        return {
          status: isOk ? 'completed' : (res.degraded ? 'completed' : 'failed'),
          summary: isOk ? 'Symbolic evaluation completed: ' + res.result : (res.degraded ? res.message : ('Symbolic evaluation failed: ' + (res.error || 'unknown error'))),
          measurements: isOk ? { result: res.result, latex: res.latex } : { degraded: res.degraded },
          artifacts: [],
          issues: isOk ? [] : (res.degraded ? [{ severity: 'warning', code: 'DEGRADED_SYMBOLIC', message: res.message }] : [{ severity: 'error', code: 'SYMBOLIC_ERROR', message: res.error || 'Symbolic evaluation failed' }]),
          data: res,
        };
      }

      case 'theory.limit@1': {
        const expr = String(args.expr).trim();
        const res = symbolicEval({ expr, symbolicAction: 'limit', var: args.var || 'x', to: args.to !== undefined ? args.to : 'oo', dir: args.dir });
        const isOk = (res.ok || res.success) && !res.error;
        return {
          status: isOk ? 'completed' : (res.degraded ? 'completed' : 'failed'),
          summary: isOk ? 'Limit evaluated: ' + res.result : (res.degraded ? res.message : ('Limit evaluation failed: ' + (res.error || 'unknown error'))),
          measurements: isOk ? { limit: res.result, isFinite: !String(res.result).includes('oo') } : { degraded: res.degraded },
          artifacts: [],
          issues: isOk ? [] : (res.degraded ? [{ severity: 'warning', code: 'DEGRADED_SYMBOLIC', message: res.message }] : [{ severity: 'error', code: 'LIMIT_ERROR', message: res.error }]),
          data: res,
        };
      }

      // --- DATA ---
      case 'data.inspect@1': {
        const inspectRes = inspectDataset({
          workspace: ws,
          datasetPath: args.datasetPath,
          data: args.data,
          columns: args.columns,
          maxRows: args.maxRows || 1000,
        });

        return {
          status: 'completed',
          summary: 'Dataset inspection complete: ' + inspectRes.rowCount + ' rows, ' + inspectRes.columnCount + ' columns.',
          measurements: {
            rowCount: inspectRes.rowCount,
            columnCount: inspectRes.columnCount,
            columns: inspectRes.columns,
            missingValues: inspectRes.missingValues,
            summary: inspectRes.summary,
          },
          artifacts: [],
          issues: [],
          data: inspectRes,
        };
      }

      case 'data.prepare@1': {
        const prepRes = prepareData(args, { workspace: ws });
        return {
          status: 'completed',
          summary: prepRes.summary,
          measurements: {
            rowsBefore: prepRes.rowsBefore,
            rowsAfter: prepRes.rowsAfter,
            columns: prepRes.columns,
          },
          artifacts: prepRes.artifactRef ? [prepRes.artifactRef] : [],
          issues: [],
          data: prepRes,
        };
      }

      case 'statistics.compare@1': {
        const compRes = compareTwoGroups({
          groupA: args.groupA,
          groupB: args.groupB,
          method: args.method,
          paired: args.paired,
          alpha: args.alpha,
        });

        return {
          status: 'completed',
          summary: compRes.summary,
          measurements: compRes,
          artifacts: [],
          issues: [],
          data: compRes,
        };
      }

      case 'statistics.fit@1': {
        const x = (args.x || []).map(Number);
        const y = (args.y || []).map(Number);
        if (x.length < 2 || x.length !== y.length) {
          return {
            status: 'failed',
            summary: 'x and y arrays must have identical length >= 2',
            issues: [{ severity: 'error', code: 'INVALID_DATA', message: 'Mismatched or insufficient points' }],
            artifacts: [],
          };
        }
        const n = x.length;
        const sumX = x.reduce((a, b) => a + b, 0);
        const sumY = y.reduce((a, b) => a + b, 0);
        const sumXY = x.reduce((acc, xi, i) => acc + xi * y[i], 0);
        const sumX2 = x.reduce((acc, xi) => acc + xi * xi, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
        const intercept = (sumY - slope * sumX) / n;
        const yMean = sumY / n;
        const ssTot = y.reduce((acc, yi) => acc + Math.pow(yi - yMean, 2), 0);
        const ssRes = y.reduce((acc, yi, i) => acc + Math.pow(yi - (slope * x[i] + intercept), 2), 0);
        const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 1;
        const resStd = Math.sqrt(ssRes / (n - 2 > 0 ? n - 2 : 1));

        return {
          status: 'completed',
          summary: 'Linear regression completed (y = ' + slope.toFixed(4) + 'x + ' + intercept.toFixed(4) + ', R²=' + r2.toFixed(4) + ')',
          measurements: {
            rSquared: Number(r2.toFixed(4)),
            coefficients: [Number(intercept.toFixed(4)), Number(slope.toFixed(4))],
            residualsStd: Number(resStd.toFixed(4)),
            formula: 'y = ' + slope.toFixed(4) + '*x + ' + intercept.toFixed(4),
          },
          artifacts: [],
          issues: [],
        };
      }

      case 'uncertainty.propagate@1': {
        const vars = args.variables || {};
        let totalRelSq = 0;
        for (const [k, v] of Object.entries(vars)) {
          const val = Number(v.value);
          const unc = Number(v.uncertainty);
          if (val !== 0) {
            totalRelSq += Math.pow(unc / val, 2);
          }
        }
        const relUnc = Math.sqrt(totalRelSq);
        return {
          status: 'completed',
          summary: 'Uncertainty propagation completed: relative uncertainty = ' + (relUnc * 100).toFixed(2) + '%',
          measurements: {
            relativeUncertainty: Number(relUnc.toFixed(6)),
            combinedUncertainty: Number((relUnc * 1.0).toFixed(6)),
          },
          artifacts: [],
          issues: [],
        };
      }

      // --- FIGURE ---
      case 'figure.render@1': {
        const figRes = renderFigure({
          workspace: ws,
          format: args.format || 'svg',
          paletteId: args.paletteId || 1,
          role: args.role || 'colorblind',
          outputPath: args.outputPath,
          dataArtifactId: args.dataArtifactId,
          datasetPath: args.datasetPath,
          series: args.series,
          title: args.title,
          xLabel: args.xLabel,
          yLabel: args.yLabel,
          xUnit: args.xUnit,
          yUnit: args.yUnit,
          errorBarType: args.errorBarType || 'SD',
          script: args.script,
        });

        return {
          status: 'completed',
          summary: figRes.summary,
          measurements: {
            figureArtifactId: figRes.figureArtifactId,
            outputPath: figRes.outputPath,
            format: figRes.format,
            metadata: figRes.metadata,
          },
          artifacts: figRes.outputPath ? [figRes.outputPath] : [],
          issues: [],
          data: figRes,
        };
      }

      // --- BENCHMARK ---
      case 'benchmark.plan@1': {
        const planRes = createBenchmarkPlan(args);
        return {
          status: 'completed',
          summary: planRes.summary,
          measurements: {
            planId: planRes.planId,
            runCount: planRes.runCount,
            matrix: planRes.matrix,
          },
          artifacts: [],
          issues: [],
          data: planRes,
        };
      }

      case 'benchmark.run@1': {
        if (!args.executable || !args.executable.path) {
          return {
            status: 'failed',
            summary: 'Execution rejected: executable.path is required for benchmark.run@1 (synthetic metrics strictly prohibited).',
            measurements: {},
            artifacts: [],
            issues: [
              {
                severity: 'error',
                code: 'EXECUTABLE_REQUIRED',
                message: 'Benchmark execution requires a concrete executable path; synthetic benchmarks are prohibited.',
              },
            ],
            data: { status: 'failed', error: 'EXECUTABLE_REQUIRED' },
          };
        }
        const runId = args.runId || ('bench_run_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6));
        const spec = createRunSpec({
          runId,
          operationId: 'benchmark.run@1',
          parameters: args.parameters || {},
          executable: args.executable,
          limits: args.limits || { wallSeconds: 60, maxOutputBytes: 1024 * 1024 },
          idempotencyKey: args.idempotencyKey || ('key_' + runId),
        });
        const execRes = await executeRunSpec(ws, spec, { scope: context?.scope });
        const receipt = execRes.receipt;
        return {
          status: receipt.status,
          summary: 'Benchmark run ' + runId + ' ' + receipt.status + ' (exit ' + receipt.exitCode + ').',
          measurements: { runId, status: receipt.status, receipt, metrics: receipt.metrics },
          artifacts: receipt.outputs || [],
          issues: receipt.status === 'failed' ? [{ severity: 'error', code: 'RUN_FAILED', message: receipt.error || 'Run failed' }] : [],
          data: { runId, status: receipt.status, receipt },
        };
      }

      case 'benchmark.compare@1': {
        const compRes = compareBenchmarkRuns(args.results || [], {
          primaryMetric: args.primaryMetric || 'accuracy',
          higherIsBetter: args.higherIsBetter ?? true,
        });

        return {
          status: 'completed',
          summary: compRes.summary,
          measurements: {
            ranking: compRes.ranking,
            comparisonMatrix: compRes.comparisonMatrix,
            bestRunId: compRes.bestRunId,
            bestVariant: compRes.bestVariant,
          },
          artifacts: [],
          issues: [],
          data: compRes,
        };
      }

      // --- RUN ---
      case 'run.submit@1': {
        // Policy is DERIVED from the workspace, never taken from caller args
        // (caller-supplied policy would be a policy-injection hole).
        const policy = createResourcePolicy({ workspace: ws });
        const backend = guardBackend(getLocalProcessBackend());
        const spec = createRunSpec({
          runId: args.runId,
          operationId: args.operationId,
          parameters: args.parameters || {},
          executable: args.executable,
          limits: args.limits || { wallSeconds: 600, maxOutputBytes: 1024 * 1024 },
          idempotencyKey: args.idempotencyKey,
        });
        const submitted = await backend.submit({ tenant: ws, spec, idempotencyKey: args.idempotencyKey });
        return {
          status: 'completed',
          summary: 'Run ' + submitted.backendRunId + ' submitted to local-process backend (' + submitted.status + ')' + (submitted.idempotentReplay ? ' [idempotent replay, not re-executed]' : '') + '.',
          measurements: {
            runId: submitted.backendRunId,
            status: submitted.status,
            idempotentReplay: Boolean(submitted.idempotentReplay),
          },
          artifacts: [],
          issues: [],
          data: submitted,
        };
      }

      case 'run.reconcile@1': {
        const backend = guardBackend(getLocalProcessBackend());
        const report = await reconcileRuns({
          workspace: ws,
          backend,
          runIds: Array.isArray(args.runIds) ? args.runIds.map(String) : undefined,
        });
        return {
          status: 'completed',
          summary: 'Reconciled ' + report.checked + ' in-flight run(s): ' + report.ingested.length + ' ingested, ' + report.orphaned.length + ' orphaned, ' + report.stillRunning.length + ' still running, ' + report.unreachable.length + ' unreachable.',
          measurements: report,
          artifacts: [],
          issues: report.orphaned.length > 0
            ? [{ severity: 'warning', code: 'ORPHANED_RUNS', message: 'Backend had no record of: ' + report.orphaned.join(', ') + ' — marked orphaned, never completed' }]
            : [],
          data: report,
        };
      }

      case 'run.status@1': {
        const runId = String(args.runId || '').trim();
        if (!runId) {
          return {
            status: 'failed',
            summary: 'runId is required for run.status',
            measurements: {},
            artifacts: [],
            issues: [{ severity: 'error', code: 'MISSING_RUN_ID', message: 'runId is required' }],
          };
        }
        const runInfo = getRunStatus(ws, runId);
        if (runInfo.status === 'not_found') {
          return {
            status: 'failed',
            summary: 'Run ' + runId + ' not found in workspace.',
            measurements: { runId, status: 'not_found' },
            artifacts: [],
            issues: [{ severity: 'error', code: 'RUN_NOT_FOUND', message: 'No run recorded with ID ' + runId }],
            data: { runId, status: 'not_found' },
          };
        }
        return {
          status: 'completed',
          summary: 'Status query for run ' + runId + ': ' + runInfo.status,
          measurements: { runId, status: runInfo.status, exitCode: runInfo.exitCode, metrics: runInfo.metrics },
          artifacts: runInfo.receipt?.outputs || [],
          issues: [],
          data: { runId, status: runInfo.status, receipt: runInfo.receipt, metrics: runInfo.metrics },
        };
      }

      case 'run.cancel@1': {
        const runId = String(args.runId || '').trim();
        if (!runId) {
          return {
            status: 'failed',
            summary: 'runId is required for run.cancel',
            measurements: {},
            artifacts: [],
            issues: [{ severity: 'error', code: 'MISSING_RUN_ID', message: 'runId is required' }],
          };
        }
        const cancelRes = await cancelRun(ws, runId, args.reason || 'User cancelled');
        if (!cancelRes.success) {
          return {
            status: 'failed',
            summary: 'Failed to cancel run ' + runId + ': ' + (cancelRes.error || cancelRes.status),
            measurements: { runId, status: cancelRes.status },
            artifacts: [],
            issues: [{ severity: 'error', code: 'CANCEL_FAILED', message: cancelRes.error || 'Failed to cancel' }],
            data: cancelRes,
          };
        }
        return {
          status: 'completed',
          summary: 'Run ' + runId + ' cancelled successfully.',
          measurements: { runId, status: 'cancelled', cancelledAt: new Date().toISOString() },
          artifacts: [],
          issues: [],
          data: cancelRes,
        };
      }

      // --- NOTEBOOK (Phase 9B) ---
      case 'notebook.execute@1': {
        const session = getNotebookSession(ws, args.sessionName || 'default');
        const reply = await session.manager.execute(String(args.code), {
          timeoutMs: args.timeoutMs || 60000,
        });

        if (reply.status === 'blocked') {
          return {
            status: 'blocked',
            summary: 'Notebook kernel unavailable: ' + (reply.reason || 'unknown reason') + '. Install requirements-notebook.txt (jupyter_client + ipykernel) to enable notebook operations.',
            measurements: { status: 'blocked', sessionName: session.sessionName },
            artifacts: [],
            issues: [{ severity: 'warning', code: 'KERNEL_UNAVAILABLE', message: reply.reason || 'Notebook kernel unavailable' }],
            data: reply,
          };
        }

        recordExecution(session.record, { code: args.code, reply });
        const recordPath = saveNotebookDocument(ws, session.sessionName + '.record', session.record);

        if (reply.status === 'ok') {
          return {
            status: 'completed',
            summary: 'Cell executed in kernel session "' + session.sessionName + '" (epoch ' + reply.epoch + ').',
            measurements: { cellStatus: reply.status, epoch: reply.epoch, executionCount: reply.executionCount, outputCount: reply.outputs.length },
            artifacts: [recordPath],
            issues: [],
            data: { ...reply, recordPath },
          };
        }
        const issueCode = reply.status === 'timeout' ? 'CELL_TIMEOUT' : 'CELL_ERROR';
        return {
          status: 'failed',
          summary: 'Cell ' + reply.status + ' in session "' + session.sessionName + '": ' + (reply.error?.evalue || reply.error?.ename || 'cell failed'),
          measurements: { cellStatus: reply.status, epoch: reply.epoch, outputs: reply.outputs },
          artifacts: [recordPath],
          issues: [{ severity: 'error', code: issueCode, message: reply.error?.evalue || 'Cell ' + reply.status }],
          data: { ...reply, recordPath },
        };
      }

      case 'notebook.replay@1': {
        const recordName = String(args.recordName || '').trim();
        const record = loadNotebookDocument(ws, recordName);
        if (!record || !Array.isArray(record.cells)) {
          return {
            status: 'failed',
            summary: 'Execution record "' + recordName + '" not found under .rivet/research/notebook/ (records are never synthesized).',
            measurements: { recordName },
            artifacts: [],
            issues: [{ severity: 'error', code: 'RECORD_NOT_FOUND', message: 'No persisted execution record named ' + recordName }],
          };
        }

        const session = getNotebookSession(ws, (args.sessionName || recordName) + ':replay');
        const report = await replayExecutionRecord(record, session.manager);
        const reportPath = saveNotebookDocument(ws, recordName + '.replay', report);

        if (report.verdict === 'blocked') {
          return {
            status: 'blocked',
            summary: 'Replay blocked: ' + (report.reasons[0] || 'kernel unavailable'),
            measurements: { verdict: report.verdict, gateStatus: report.gateStatus },
            artifacts: [],
            issues: [{ severity: 'warning', code: 'KERNEL_UNAVAILABLE', message: report.reasons[0] || 'Kernel unavailable' }],
            data: report,
          };
        }

        return {
          status: 'completed',
          summary:
            report.verdict === 'reproduced'
              ? 'Fresh-kernel replay reproduced ' + report.comparedCells + ' cell(s).'
              : report.verdict === 'diverged'
                ? 'Fresh-kernel replay DIVERGED from the original record (' + report.comparedCells + ' cell(s) compared).'
                : 'Formal replay refused: ' + (report.reasons || []).join('; ') + '.',
          measurements: {
            verdict: report.verdict,
            gateStatus: report.gateStatus,
            reasons: report.reasons,
            comparedCells: report.comparedCells,
            cells: report.cells,
          },
          artifacts: [reportPath],
          issues:
            report.verdict === 'diverged'
              ? [{ severity: 'error', code: 'REPLAY_DIVERGED', message: 'Fresh-kernel outputs differ from the recorded session' }]
              : report.verdict === 'not_comparable'
                ? [{ severity: 'warning', code: 'REPLAY_NOT_COMPARABLE', message: (report.reasons || []).join('; ') }]
                : [],
          data: { ...report, reportPath },
        };
      }

      default: {
        return {
          status: 'completed',
          summary: 'Operation ' + descriptor.id + ' processed.',
          measurements: {},
          artifacts: [],
          issues: [],
        };
      }
    }
  } catch (err) {
    return {
      status: 'failed',
      summary: 'Execution error in operation ' + descriptor.id + ': ' + (err instanceof Error ? err.message : String(err)),
      issues: [
        {
          severity: 'error',
          code: 'EXECUTION_ERROR',
          message: err instanceof Error ? err.message : String(err),
        },
      ],
      artifacts: [],
    };
  }
}
