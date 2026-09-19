import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { getOperationDescriptor, listOperationDescriptors, isValidOperationId } from '../contracts/operations.js';
import { dispatchOperation } from '../operations/dispatcher.js';
import { runResearchEvidence } from '../gateway-evidence.js';
import { resolveWorkspaceScope } from '../scope/workspace-scope.js';

describe('Phase 3: Operation Catalogue & Dispatcher', () => {
  let tmpDir;
  let scope;

  before(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'tianshu-ops-test-'));
    scope = resolveWorkspaceScope({ workspace: tmpDir, explicitTrust: true });
  });

  after(() => {
    if (tmpDir && existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('provides authoritative operation descriptors in registry', () => {
    assert.equal(isValidOperationId('theory.dimension@1'), true);
    assert.equal(isValidOperationId('nonexistent.op@1'), false);

    const desc = getOperationDescriptor('theory.dimension@1');
    assert.ok(desc);
    assert.equal(desc.capability, 'theory');
    assert.equal(desc.execution, 'inline');
    assert.deepEqual(desc.effects, ['read']);
    assert.ok(desc.inputSchema.properties.lhs);
    assert.ok(desc.inputSchema.properties.rhs);

    const theoryOps = listOperationDescriptors({ capability: 'theory' });
    assert.ok(theoryOps.length >= 4);
  });

  it('describes operation via research_evidence gateway', async () => {
    const res = await runResearchEvidence({
      action: 'describe_operation',
      workspace: tmpDir,
      operationId: 'theory.dimension@1',
    }, { scope });

    assert.equal(res.isError, undefined);
    assert.ok(res.content.includes('theory.dimension@1'));
    assert.equal(res.data.id, 'theory.dimension@1');
    assert.equal(res.data.capability, 'theory');
  });

  it('executes theory.dimension@1 consistently via dispatcher and gateway', async () => {
    // 1. Direct consistent check: force = stress * area
    const validRes = await dispatchOperation('theory.dimension@1', {
      lhs: 'force',
      rhs: 'stress * area',
    });
    assert.equal(validRes.status, 'completed');
    assert.equal(validRes.measurements.consistent, true);
    assert.ok(validRes.summary.includes('一致'));

    // 2. Direct inconsistent check: force = area
    const invalidRes = await dispatchOperation('theory.dimension@1', {
      lhs: 'force',
      rhs: 'area',
    });
    assert.equal(invalidRes.status, 'failed');
    assert.equal(invalidRes.measurements.consistent, false);

    // 3. Via gateway execute_operation
    const gwRes = await runResearchEvidence({
      action: 'execute_operation',
      workspace: tmpDir,
      operationId: 'theory.dimension@1',
      arguments: {
        lhs: 'force',
        rhs: 'stress * area',
      },
    }, { scope });

    assert.equal(gwRes.isError, false);
    assert.ok(gwRes.content.includes('theory.dimension@1'));
    assert.equal(gwRes.data.status, 'completed');
  });

  it('executes theory.numeric-check@1 within tolerance', async () => {
    const resPass = await dispatchOperation('theory.numeric-check@1', {
      analytic: 10.0,
      numerical: 10.00005,
      tolerance: 1e-4,
    });
    assert.equal(resPass.status, 'completed');
    assert.equal(resPass.measurements.consistent, true);

    const resFail = await dispatchOperation('theory.numeric-check@1', {
      analytic: 10.0,
      numerical: 10.05,
      tolerance: 1e-4,
    });
    assert.equal(resFail.status, 'failed');
    assert.equal(resFail.measurements.consistent, false);
  });

  it('rejects unregistered operations and missing arguments', async () => {
    const unreg = await dispatchOperation('malicious.code_exec@1', {});
    assert.equal(unreg.status, 'blocked');
    assert.equal(unreg.issues[0].code, 'UNREGISTERED_OPERATION');

    const missingArg = await dispatchOperation('theory.dimension@1', { lhs: 'force' });
    assert.equal(missingArg.status, 'failed');
    assert.equal(missingArg.issues[0].code, 'MISSING_ARGUMENT');
  });

  it('enforces scope capability restrictions', async () => {
    // Custom restricted scope with only literature enabled
    const restrictedScope = {
      ...scope,
      configuredCapabilities: ['literature'],
    };

    const res = await dispatchOperation('theory.dimension@1', {
      lhs: 'force',
      rhs: 'stress * area',
    }, {
      scope: restrictedScope,
    });

    assert.equal(res.status, 'blocked');
    assert.equal(res.issues[0].code, 'CAPABILITY_DISABLED');
  });
});
