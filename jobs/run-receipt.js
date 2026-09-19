/**
 * Verifiable Run Receipt (RunReceipt) for tianshu-research.
 * Records unkeyed content integrity checksum (integrityChecksum) of run execution status,
 * exit code, duration, outputs, and standard stream accounting.
 * Note: integrityChecksum guards against data corruption and tampering,
 * but is an unkeyed digest rather than an asymmetric cryptographic signature.
 */

import { createHash } from 'node:crypto';

export function createRunReceipt(options = {}) {
  const runId = String(options.runId || '').trim();
  const operationId = String(options.operationId || '').trim();
  if (!runId || !operationId) {
    throw new Error('runId and operationId are required for RunReceipt.');
  }

  const exitCode = typeof options.exitCode === 'number' ? options.exitCode : (options.status === 'completed' ? 0 : 1);
  let status = options.status || (exitCode === 0 ? 'completed' : 'failed');

  // Strict physical consistency: non-zero exit code cannot be 'completed'
  if (exitCode !== 0 && status === 'completed') {
    status = 'failed';
  }

  const startTime = options.startTime || new Date(Date.now() - 100).toISOString();
  const endTime = options.endTime || new Date().toISOString();
  const durationMs = Math.max(0, new Date(endTime).getTime() - new Date(startTime).getTime());
  const wallSeconds = Number((durationMs / 1000).toFixed(4));

  const outputs = Array.isArray(options.outputs) ? options.outputs : [];
  const stdoutBytes = typeof options.metrics?.stdoutBytes === 'number' ? options.metrics.stdoutBytes : 0;
  const stderrBytes = typeof options.metrics?.stderrBytes === 'number' ? options.metrics.stderrBytes : 0;

  const metrics = {
    wallSeconds,
    stdoutBytes,
    stderrBytes,
    exitCode,
    resourceUsage: options.metrics?.resourceUsage || {},
  };

  const payloadToSign = JSON.stringify({
    runId,
    operationId,
    specDigest: options.specDigest || '',
    status,
    exitCode,
    startTime,
    endTime,
    durationMs,
    outputHashes: outputs.map(o => o.sha256 || o.id),
  });

  const integrityChecksum = createHash('sha256').update(payloadToSign).digest('hex');

  return Object.freeze({
    schemaVersion: 2,
    runId,
    operationId,
    specDigest: options.specDigest || '',
    status,
    exitCode,
    startTime,
    endTime,
    durationMs,
    outputs,
    metrics,
    error: options.error || undefined,
    integrityChecksum,
    receiptSignature: integrityChecksum,
  });
}

/**
 * Validates the authenticity and consistency of a RunReceipt.
 */
export function verifyRunReceipt(receipt) {
  if (!receipt || typeof receipt !== 'object') {
    return { valid: false, reason: 'Invalid receipt object' };
  }

  if (receipt.exitCode !== 0 && receipt.status === 'completed') {
    return { valid: false, reason: 'Fraudulent receipt: non-zero exitCode cannot claim status completed' };
  }

  const payloadToSign = JSON.stringify({
    runId: receipt.runId,
    operationId: receipt.operationId,
    specDigest: receipt.specDigest || '',
    status: receipt.status,
    exitCode: receipt.exitCode,
    startTime: receipt.startTime,
    endTime: receipt.endTime,
    durationMs: receipt.durationMs,
    outputHashes: (receipt.outputs || []).map(o => o.sha256 || o.id),
  });

  const expectedSignature = createHash('sha256').update(payloadToSign).digest('hex');
  const actualSig = receipt.receiptSignature;
  const actualChecksum = receipt.integrityChecksum;

  if (actualSig && actualSig !== expectedSignature) {
    return { valid: false, reason: 'Signature mismatch: receipt has been tampered with' };
  }
  if (actualChecksum && actualChecksum !== expectedSignature) {
    return { valid: false, reason: 'Signature mismatch: checksum has been tampered with' };
  }
  if (!actualSig && !actualChecksum) {
    return { valid: false, reason: 'Signature mismatch: missing checksum or signature' };
  }

  return { valid: true };
}
