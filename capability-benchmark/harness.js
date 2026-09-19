#!/usr/bin/env node
/**
 * Capability Benchmark Harness for tianshu-research (Phase 11).
 *
 * Runs a suite's trials through the scoring-side oracles and emits a
 * deterministic report. Engineered independently from the oracles: this
 * runner only loads tasks, verifies dataset hashes, reads trials, dispatches
 * to the oracle registry, and aggregates.
 *
 * Modes:
 *   --mode replay   Score offline trial files (fixtures or recorded runs).
 *   --mode live     REFUSED in this stage: requires a configured model
 *                   adapter with explicit budget; the harness never fakes it.
 *   --offline       Asserts no network use anywhere in the run.
 *
 * Honest-scoring invariants (enforced here + in the oracles):
 *   - dataset files are hash-pinned via datasets/manifest.json; a mismatch
 *     aborts the run instead of silently scoring against changed data;
 *   - a trial's raw statistics are re-verified against the pinned dataset;
 *     fabricated receipts and p-hacked verdicts score zero;
 *   - failed/errored trials stay in the denominator;
 *   - trials of different (modelId, budgetId) never merge into one row.
 *
 * Usage:
 *   node capability-benchmark/harness.js --suite smoke --mode replay --offline
 */

import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalJson, computePayloadDigest } from '../workflows/events.js';
import { getOracle } from './oracles/registry.js';
import { buildBenchmarkReport } from './report.js';

const BENCH_DIR = dirname(fileURLToPath(import.meta.url));
export const DEFAULT_TRIALS_SUBDIR = 'trials';

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

/**
 * Loads and hash-verifies the dataset manifest. Throws on any mismatch.
 */
export function loadDatasetManifest(suite, benchDir = BENCH_DIR) {
  const manifestPath = join(benchDir, 'datasets', 'manifest.json');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const [key, entry] of Object.entries(manifest.datasets || {})) {
    const filePath = join(benchDir, 'datasets', entry.file);
    if (!existsSync(filePath)) {
      throw new Error(`Dataset "${key}" file missing: ${entry.file}`);
    }
    const actual = sha256File(filePath);
    if (actual !== entry.sha256) {
      throw new Error(
        `Dataset "${key}" hash mismatch: manifest ${entry.sha256}, actual ${actual}. ` +
          'Refusing to benchmark against silently-changed data.',
      );
    }
  }
  const manifestDigest = computePayloadDigest(manifest);
  return { manifest, manifestDigest };
}

/**
 * Creates a cached dataset loader bound to a verified manifest.
 */
function createDatasetLoader(manifest, benchDir = BENCH_DIR) {
  const cache = new Map();
  return function loadDataset(ref) {
    if (cache.has(ref)) return cache.get(ref);
    const entry = manifest.datasets[ref];
    if (!entry) throw new Error(`Unknown datasetRef "${ref}" (not in datasets/manifest.json)`);
    const data = JSON.parse(readFileSync(join(benchDir, 'datasets', entry.file), 'utf8'));
    cache.set(ref, data);
    return data;
  };
}

/**
 * Loads the tasks of a suite (tasks/<suite>/*.json).
 */
export function loadSuiteTasks(suite, benchDir = BENCH_DIR) {
  const dir = join(benchDir, 'tasks', suite);
  if (!existsSync(dir)) {
    throw new Error(`Suite "${suite}" not found under capability-benchmark/tasks/`);
  }
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));
}

function parseTrialFile(path) {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw);
}

/**
 * Scores one parsed trial against its task's oracle.
 * A trial that names an unknown task or an unknown oracle is an attributed
 * failure (score 0, stays in the denominator) — never silently dropped.
 */
export function scoreTrial(trial, tasks, context) {
  const task = tasks.find((t) => t.taskId === trial.taskId);
  if (!task) {
    return { score: 0, code: 'UNKNOWN_TASK', reason: `taskId "${trial.taskId}" not in suite`, status: 'failed' };
  }
  const oracle = getOracle(task.oracle?.type);
  if (!oracle) {
    return { score: 0, code: 'UNKNOWN_ORACLE', reason: `oracle type "${task.oracle?.type}" not registered`, status: 'failed' };
  }
  if (trial.status === 'failed') {
    return { score: 0, code: 'TRIAL_FAILED', reason: trial.failureReason || 'trial reported failure', status: 'failed' };
  }
  const outcome = oracle(trial.submitted, task, context);
  return { ...outcome, status: 'scored' };
}

/**
 * Runs a suite in replay mode. Returns { report, warnings }.
 */
export function runSuiteReplay({ suite, mode = 'replay', trialsDir, benchDir = BENCH_DIR }) {
  if (mode !== 'replay') {
    throw new Error(
      'Live mode requires a configured model adapter and an explicit budget; ' +
        'this stage ships the replay/offline harness only. Refusing to fabricate live results.',
    );
  }

  const { manifest, manifestDigest } = loadDatasetManifest(suite, benchDir);
  const context = { loadDataset: createDatasetLoader(manifest, benchDir) };

  const tasks = loadSuiteTasks(suite, benchDir);
  const taskIds = new Set(tasks.map((t) => t.taskId));

  const dir = trialsDir || join(benchDir, DEFAULT_TRIALS_SUBDIR, suite);
  const warnings = [];
  const trialResults = [];
  const trialErrors = [];

  if (!existsSync(dir)) {
    throw new Error(`Trials directory not found: ${dir}`);
  }
  const files = readdirSync(dir).filter((f) => f.endsWith('.trial.json')).sort();

  for (const file of files) {
    const path = join(dir, file);
    let trial;
    try {
      trial = parseTrialFile(path);
    } catch (err) {
      trialErrors.push({ trialFile: file, error: `unparseable trial: ${err.message}` });
      continue;
    }

    if (!trial.taskId || !taskIds.has(trial.taskId)) {
      trialErrors.push({ trialFile: file, error: `trial references unknown taskId "${trial.taskId ?? ''}"` });
      continue;
    }

    const scored = scoreTrial(trial, tasks, context);
    trialResults.push({
      trialId: trial.trialId || file.replace(/\.trial\.json$/, ''),
      trialFile: file,
      taskId: trial.taskId,
      modelId: String(trial.modelId ?? 'unknown'),
      budgetId: String(trial.budgetId ?? 'unbudgeted'),
      score: scored.score,
      code: scored.code,
      reason: scored.reason,
      status: scored.status,
      truth: scored.truth,
      usage: trial.usage || null,
    });
  }

  const report = buildBenchmarkReport({ trialResults, trialErrors, suite, mode, manifestDigest });
  return { report, warnings };
}

/**
 * Writes the report under <workspace>/.rivet/research/benchmark/.
 */
export function writeReport(workspace, suite, report) {
  const dir = join(resolve(workspace || process.cwd()), '.rivet', 'research', 'benchmark');
  mkdirSync(dir, { recursive: true });
  const path = join(dir, `${suite}-report.json`);
  writeFileSync(path, JSON.stringify(report, null, 2) + '\n', 'utf8');
  return path;
}

// --- CLI -----------------------------------------------------------------
function main(argv = process.argv.slice(2)) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  const suite = args.suite;
  const mode = args.mode || 'replay';
  const offline = Boolean(args.offline);

  if (!suite) {
    console.error('Usage: harness.js --suite <name> --mode replay [--offline] [--trials-dir <dir>]');
    process.exit(1);
  }
  if (offline) {
    // The replay harness performs no network I/O by construction; the flag is
    // an explicit contract assertion for callers and CI.
    process.env.TIANSHU_BENCHMARK_OFFLINE = '1';
  }

  try {
    const { report } = runSuiteReplay({ suite, mode, trialsDir: typeof args['trials-dir'] === 'string' ? resolve(args['trials-dir']) : undefined });
    const outPath = writeReport(process.cwd(), suite, report);
    const line = (g) => `${g.modelId}@${g.budgetId}: ${g.passed}/${g.total} (score ${g.score})`;
    console.log(`Benchmark suite "${suite}" (${mode}): ${report.totals.passed}/${report.totals.trials} trials passed, ${report.totals.erroredTrials} errored trial file(s).`);
    for (const g of report.groups) console.log('  ' + line(g));
    console.log(`Report: ${outPath}`);
    console.log(`Digest: ${report.digest}`);
    process.exit(0);
  } catch (err) {
    console.error(`Benchmark run failed: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
