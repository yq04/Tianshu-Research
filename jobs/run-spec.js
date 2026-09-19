/**
 * Deterministic Run Specification (RunSpec) for tianshu-research.
 * Encapsulates immutable execution parameters, input artifacts,
 * resource bounds, and idempotency digest for reproducible execution.
 */

import { createHash } from 'node:crypto';

export function createRunSpec(options = {}) {
  const operationId = String(options.operationId || '').trim();
  if (!operationId) {
    throw new Error('operationId is required for RunSpec.');
  }

  const parameters = options.parameters && typeof options.parameters === 'object' ? options.parameters : {};
  const inputArtifacts = Array.isArray(options.inputArtifacts) ? options.inputArtifacts : [];

  const limits = {
    wallSeconds: typeof options.limits?.wallSeconds === 'number' ? Math.max(1, Math.min(3600, options.limits.wallSeconds)) : 60,
    maxOutputBytes: typeof options.limits?.maxOutputBytes === 'number' ? Math.max(1024, Math.min(50 * 1024 * 1024, options.limits.maxOutputBytes)) : 1024 * 1024,
    memoryBytes: typeof options.limits?.memoryBytes === 'number' ? options.limits.memoryBytes : undefined,
  };

  const paramHash = createHash('sha256').update(JSON.stringify(parameters)).digest('hex').slice(0, 12);
  const idempotencyKey = options.idempotencyKey || (operationId + ':' + paramHash);

  const nonce = Math.random().toString(36).slice(2, 7);
  const runId = options.runId || ('run_' + Date.now().toString(36) + '_' + nonce);

  let executable = undefined;
  if (options.executable && typeof options.executable === 'object') {
    executable = {
      path: String(options.executable.path),
      argv: Array.isArray(options.executable.argv) ? options.executable.argv.map(String) : [],
      entryArtifactId: options.executable.entryArtifactId ? String(options.executable.entryArtifactId) : undefined,
    };
  }

  const baseSpec = {
    schemaVersion: 2,
    runId,
    operationId,
    parameters,
    inputArtifacts,
    executable,
    limits,
    idempotencyKey,
    createdAt: new Date().toISOString(),
  };

  const specDigest = createHash('sha256').update(JSON.stringify(baseSpec)).digest('hex');
  return Object.freeze({
    ...baseSpec,
    specDigest,
  });
}
