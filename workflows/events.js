/**
 * Research Event Journal Models & Serialization for tianshu-research.
 * Implements monotonic event sequence, canonical payload digest,
 * and event sourcing primitives.
 */

import { createHash, randomBytes } from 'node:crypto';

export const EVENT_KINDS = Object.freeze([
  'TASK_CREATED',
  'NODE_SCHEDULED',
  'NODE_STARTED',
  'NODE_COMPLETED',
  'NODE_FAILED',
  'NODE_CANCELLED',
  'PATCH_APPLIED',
  'HUMAN_INPUT_REQUESTED',
  'HUMAN_INPUT_PROVIDED',
  'BUDGET_RESERVED',
  'BUDGET_COMMITTED',
  'BUDGET_RELEASED',
  'BUDGET_EXHAUSTED',
  'GATE_EVALUATED',
  'GATE_INVALIDATED',
  'WORKFLOW_COMPLETED',
  'WORKFLOW_HALTED',
]);

/**
 * Deterministic JSON stringification with sorted keys.
 */
export function canonicalJson(value) {
  if (value === undefined) {
    return 'null';
  }
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return '[' + value.map((item) => canonicalJson(item ?? null)).join(',') + ']';
  }
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}';
}

/**
 * Computes sha256 hex digest of canonical JSON payload.
 */
export function computePayloadDigest(payload) {
  const json = canonicalJson(payload ?? {});
  return createHash('sha256').update(json).digest('hex');
}

/**
 * Creates and validates a ResearchEvent.
 */
export function createResearchEvent({
  eventId,
  taskId,
  seq,
  revision = 1,
  kind,
  payload = {},
  causedBy,
  idempotencyKey,
  recordedAt,
}) {
  if (!taskId || typeof taskId !== 'string') {
    throw new Error('ResearchEvent requires non-empty string taskId');
  }
  if (typeof seq !== 'number' || seq < 1 || !Number.isInteger(seq)) {
    throw new Error('ResearchEvent requires positive integer seq');
  }
  if (typeof revision !== 'number' || revision < 1 || !Number.isInteger(revision)) {
    throw new Error('ResearchEvent requires positive integer revision');
  }
  if (!kind || !EVENT_KINDS.includes(kind)) {
    throw new Error(`Invalid event kind "${kind}". Must be one of: ${EVENT_KINDS.join(', ')}`);
  }

  const cleanPayload = payload && typeof payload === 'object' ? payload : {};
  const payloadDigest = computePayloadDigest(cleanPayload);
  const now = recordedAt || new Date().toISOString();
  const id = eventId || `evt_${taskId}_${seq}_${randomBytes(4).toString('hex')}`;
  const key = idempotencyKey || `${taskId}_${kind}_${seq}_${payloadDigest.slice(0, 8)}`;

  const event = {
    eventId: id,
    taskId,
    seq,
    revision,
    kind,
    payload: cleanPayload,
    payloadDigest,
    causedBy: causedBy || undefined,
    idempotencyKey: key,
    recordedAt: now,
  };

  validateResearchEvent(event);
  return Object.freeze(event);
}

/**
 * Validates integrity and schema of a ResearchEvent.
 */
export function validateResearchEvent(event) {
  if (!event || typeof event !== 'object') throw new Error('Event must be an object');
  if (!event.eventId || typeof event.eventId !== 'string') throw new Error('Missing eventId');
  if (!event.taskId || typeof event.taskId !== 'string') throw new Error('Missing taskId');
  if (typeof event.seq !== 'number' || event.seq < 1 || !Number.isInteger(event.seq)) {
    throw new Error('Invalid or non-positive seq');
  }
  if (typeof event.revision !== 'number' || event.revision < 1 || !Number.isInteger(event.revision)) {
    throw new Error('Invalid or non-positive revision');
  }
  if (!EVENT_KINDS.includes(event.kind)) {
    throw new Error(`Invalid event kind: ${event.kind}`);
  }
  if (!event.payloadDigest || typeof event.payloadDigest !== 'string') {
    throw new Error('Missing payloadDigest');
  }
  const expectedDigest = computePayloadDigest(event.payload);
  if (event.payloadDigest !== expectedDigest) {
    throw new Error(`payloadDigest mismatch: expected ${expectedDigest}, got ${event.payloadDigest}`);
  }
  return true;
}

/**
 * Serializes an event to a single JSON line.
 */
export function serializeEvent(event) {
  validateResearchEvent(event);
  return JSON.stringify(event);
}

/**
 * Deserializes an event from a JSON line.
 */
export function deserializeEvent(line) {
  if (!line || !line.trim()) return null;
  const parsed = JSON.parse(line.trim());
  validateResearchEvent(parsed);
  return Object.freeze(parsed);
}

