import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunSpec } from '../jobs/run-spec.js';
import { createRunReceipt, verifyRunReceipt } from '../jobs/run-receipt.js';
import { executeRunSpec, getRunStatus } from '../jobs/executor.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';

describe('Phase 3: RunSpec & Verifiable RunReceipt', () => {
  let tmpDir;
  let scope;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-run-test-'));
    scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('generates immutable RunSpec with digest and resource limits', () => {
    const spec = createRunSpec({
      operationId: 'theory.dimension@1',
      parameters: { lhs: 'force', rhs: 'stress * area' },
      limits: { wallSeconds: 15 },
    });

    assert.ok(spec.runId.startsWith('run_'));
    assert.equal(spec.operationId, 'theory.dimension@1');
    assert.equal(spec.limits.wallSeconds, 15);
    assert.equal(spec.limits.maxOutputBytes, 1024 * 1024);
    assert.ok(spec.idempotencyKey.includes('theory.dimension@1'));
    assert.ok(spec.specDigest.length === 64);
  });

  it('executes inline operation and produces verifiable RunReceipt', async () => {
    const spec = createRunSpec({
      operationId: 'theory.dimension@1',
      parameters: { lhs: 'force', rhs: 'stress * area' },
    });

    const { receipt } = await executeRunSpec(tmpDir, spec, { scope });

    assert.ok(receipt);
    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.exitCode, 0);
    assert.ok(receipt.durationMs >= 0);
    assert.ok(receipt.receiptSignature.length === 64);

    const verification = verifyRunReceipt(receipt);
    assert.equal(verification.valid, true);

    const status = getRunStatus(tmpDir, spec.runId);
    assert.equal(status.status, 'completed');
  });

  it('executes child process with truthful stream accounting', async () => {
    const spec = createRunSpec({
      operationId: 'benchmark.run@1',
      executable: {
        path: process.execPath,
        argv: ['-e', 'process.stdout.write("BENCHMARK_OK"); process.stderr.write("LOG_INFO"); process.exit(0);'],
      },
    });

    const { receipt, stdout, stderr } = await executeRunSpec(tmpDir, spec, { scope });

    assert.equal(receipt.status, 'completed');
    assert.equal(receipt.exitCode, 0);
    assert.equal(stdout, 'BENCHMARK_OK');
    assert.equal(stderr, 'LOG_INFO');
    assert.equal(receipt.metrics.stdoutBytes, 12);
    assert.equal(receipt.metrics.stderrBytes, 8);
    assert.ok(receipt.outputs.length >= 1); // stdout artifact recorded

    const verification = verifyRunReceipt(receipt);
    assert.equal(verification.valid, true);
  });

  it('truthfully records failed process and rejects fraudulent completed receipts', async () => {
    const failedSpec = createRunSpec({
      operationId: 'benchmark.run@1',
      executable: {
        path: process.execPath,
        argv: ['-e', 'process.stderr.write("RUNTIME_CRASH"); process.exit(2);'],
      },
    });

    const { receipt } = await executeRunSpec(tmpDir, failedSpec, { scope });
    assert.equal(receipt.status, 'failed');
    assert.equal(receipt.exitCode, 2);

    // Verify anti-tamper check: tampering with exit code or claiming completed for non-zero exit
    const forgedReceipt = {
      ...receipt,
      status: 'completed',
    };
    const checkForged = verifyRunReceipt(forgedReceipt);
    assert.equal(checkForged.valid, false);
    assert.ok(checkForged.reason.includes('Fraudulent receipt'));

    // Tampering with signature
    const tamperedSig = {
      ...receipt,
      receiptSignature: '0000000000000000000000000000000000000000000000000000000000000000',
    };
    const checkTampered = verifyRunReceipt(tamperedSig);
    assert.equal(checkTampered.valid, false);
    assert.ok(checkTampered.reason.includes('Signature mismatch'));
  });
});
