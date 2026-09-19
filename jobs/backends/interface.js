/**
 * Backend Contract for tianshu-research job execution (Phase 10).
 *
 * A backend executes RunSpecs somewhere (local process, torchrun cluster,
 * SLURM partition, remote runner) behind one uniform, honest contract:
 *
 *   name: string
 *   supported: boolean          — true ONLY if configured AND verified here
 *   reason?: string             — why not supported (required when false)
 *   capabilities: string[]      — e.g. ['cpu'], ['gpu','multi-process']
 *   submit({ tenant, spec, idempotencyKey }) -> { backendRunId, status }
 *   query(tenant, backendRunId)             -> { status, receipt?, error? }
 *   cancel(tenant, backendRunId, reason)    -> { ok, status? }
 *   reconcile?(tenant, backendRunIds)       -> per-run authoritative status
 *
 * Hard invariants:
 *  - Submit idempotency: the same (tenant, idempotencyKey) MUST return the
 *    same backendRunId and MUST NOT re-execute (enforced by each backend's
 *    durable state; the guard does not duplicate it).
 *  - Tenant isolation: a tenant may only see/cancel its own runs. Any access
 *    across tenants raises CrossTenantRefusalError — fail-closed.
 *  - Honesty: unknown runIds report { status: 'not_found' }; disconnected
 *    backends report { status: 'unreachable' }. Nothing is ever fabricated
 *    into 'completed'.
 *  - support flags: `supported: true` is a claim of verification. Backends
 *    that are not configured/validated in this environment MUST declare
 *    supported: false with a reason.
 */

export const BACKEND_STATUSES = Object.freeze([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'timed_out',
  'not_found',
  'unreachable',
]);

export class BackendError extends Error {
  constructor(message, { code = 'BACKEND_ERROR', backendRunId } = {}) {
    super(message);
    this.name = 'BackendError';
    this.code = code;
    this.backendRunId = backendRunId;
  }
}

export class BackendUnavailableError extends BackendError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: 'BACKEND_UNAVAILABLE' });
    this.name = 'BackendUnavailableError';
  }
}

export class CrossTenantRefusalError extends BackendError {
  constructor(message, opts = {}) {
    super(message, { ...opts, code: 'CROSS_TENANT_REFUSAL' });
    this.name = 'CrossTenantRefusalError';
  }
}

/**
 * Validates that an object structurally conforms to the backend contract.
 * Throws BackendError with a precise reason on the first violation.
 */
export function assertBackendContract(backend) {
  const fail = (why) => {
    throw new BackendError(`backend "${backend?.name ?? '(unnamed)'}" violates the contract: ${why}`, { code: 'CONTRACT_VIOLATION' });
  };
  if (!backend || typeof backend !== 'object') fail('must be an object');
  if (typeof backend.name !== 'string' || !backend.name.trim()) fail('name must be a non-empty string');
  if (typeof backend.supported !== 'boolean') fail('supported must be a boolean');
  if (!backend.supported && typeof backend.reason !== 'string') fail('unsupported backends must declare a reason');
  if (!Array.isArray(backend.capabilities)) fail('capabilities must be an array');
  for (const method of ['submit', 'query', 'cancel']) {
    if (typeof backend[method] !== 'function') fail(`${method}() must be a function`);
  }
  return true;
}

/**
 * Wraps a backend with tenant-safety and honesty guards that hold for EVERY
 * backend without re-implementation: guarded.submit/query/cancel reject
 * cross-tenant access and normalize unknown outcomes.
 */
export function guardBackend(backend) {
  assertBackendContract(backend);
  const owned = new Map(); // backendRunId -> tenant

  function assertTenant(tenant, backendRunId) {
    const owner = owned.get(backendRunId);
    if (owner !== undefined && owner !== tenant) {
      throw new CrossTenantRefusalError(
        `tenant "${tenant}" may not access run "${backendRunId}" owned by another tenant`,
        { backendRunId },
      );
    }
  }

  return {
    name: backend.name,
    get supported() {
      return backend.supported;
    },
    get reason() {
      return backend.reason;
    },
    capabilities: [...backend.capabilities],

    async submit({ tenant, spec, idempotencyKey }) {
      if (!tenant) throw new BackendError('submit requires a tenant', { code: 'CONTRACT_VIOLATION' });
      // Idempotency semantics belong to the backend (it owns the durable
      // state); the guard only records ownership for tenant isolation.
      const result = await backend.submit({ tenant, spec, idempotencyKey });
      if (!result?.backendRunId) {
        throw new BackendError(`backend "${backend.name}" submit returned no backendRunId`, { code: 'CONTRACT_VIOLATION' });
      }
      owned.set(result.backendRunId, tenant);
      return result;
    },

    async query(tenant, backendRunId) {
      assertTenant(tenant, backendRunId);
      const result = await backend.query(tenant, backendRunId);
      if (result === null || result === undefined) {
        return { status: 'not_found' }; // honest: never invent a terminal state
      }
      return result;
    },

    async cancel(tenant, backendRunId, reason) {
      assertTenant(tenant, backendRunId);
      return backend.cancel(tenant, backendRunId, reason);
    },

    async reconcile(tenant, backendRunIds) {
      if (typeof backend.reconcile !== 'function') {
        throw new BackendUnavailableError(`backend "${backend.name}" does not support reconciliation`, { code: 'RECONCILE_UNSUPPORTED' });
      }
      for (const id of backendRunIds || []) assertTenant(tenant, id);
      return backend.reconcile(tenant, backendRunIds);
    },
  };
}
