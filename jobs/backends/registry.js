/**
 * Backend Registry for tianshu-research (Phase 10).
 *
 * SUPPORT DISCIPLINE (hard rule): a backend may only carry
 * `supported: true` if it is actually configured AND verified in this
 * environment. Distributed/GPU backends ship as explicit declarations with
 * `supported: false` and a reason — they are integration points, not
 * claimed capabilities. Remote/GPU validation happens against real
 * hardware in a dedicated acceptance pass, never by assertion.
 */

import { createLocalProcessBackend } from './local-process.js';
import { assertBackendContract } from './interface.js';

const BACKENDS = new Map();

function declare(backend) {
  assertBackendContract(backend);
  BACKENDS.set(backend.name, backend);
  return backend;
}

// Verified in this environment: covered by the backend contract suite.
declare(createLocalProcessBackend());

// Declared integration points — NOT supported until configured and verified
// against real infrastructure (torchrun elastic worker restart, SLURM
// accounting, checkpoint resume, worker-group cancellation). See task_plan
// Phase 10 acceptance: distributed integration stays explicitly pending.
declare({
  name: 'torchrun-elastic',
  supported: false,
  reason: 'declared integration point: requires multi-GPU hardware and an acceptance pass (worker-group restart, checkpoint resume) before it may be marked supported',
  capabilities: ['gpu', 'multi-process', 'elastic'],
  async submit() {
    throw new Error('torchrun-elastic is not supported in this environment');
  },
  async query() {
    throw new Error('torchrun-elastic is not supported in this environment');
  },
  async cancel() {
    throw new Error('torchrun-elastic is not supported in this environment');
  },
});

declare({
  name: 'jax-multiproc',
  supported: false,
  reason: 'declared integration point: requires JAX distributed initialization across processes and an acceptance pass before it may be marked supported',
  capabilities: ['gpu', 'multi-process', 'collective'],
  async submit() {
    throw new Error('jax-multiproc is not supported in this environment');
  },
  async query() {
    throw new Error('jax-multiproc is not supported in this environment');
  },
  async cancel() {
    throw new Error('jax-multiproc is not supported in this environment');
  },
});

declare({
  name: 'slurm-remote',
  supported: false,
  reason: 'declared integration point: requires a reachable SLURM partition and an acceptance pass (sbatch/sacct mapping, log retrieval, artifact pull) before it may be marked supported',
  capabilities: ['remote', 'multi-node'],
  async submit() {
    throw new Error('slurm-remote is not supported in this environment');
  },
  async query() {
    throw new Error('slurm-remote is not supported in this environment');
  },
  async cancel() {
    throw new Error('slurm-remote is not supported in this environment');
  },
});

export function getBackend(name) {
  return BACKENDS.get(String(name || '').trim()) || null;
}

export function listBackends() {
  return [...BACKENDS.values()].map((b) => ({
    name: b.name,
    supported: b.supported,
    reason: b.reason,
    capabilities: [...b.capabilities],
  }));
}

export function registerBackend(backend) {
  return declare(backend);
}
