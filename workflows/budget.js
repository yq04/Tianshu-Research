/**
 * Multi-dimensional Research Budget Manager for tianshu-research.
 * Enforces quotas on iterations, runs, parallelism, wall time, and external requests.
 * Supports budget reservation, failure accounting, and graceful partial delivery.
 */

export const DEFAULT_BUDGET = Object.freeze({
  maxIterations: 5,
  maxRuns: 10,
  maxParallelRuns: 2,
  maxWallSeconds: 300,
  maxExternalRequests: 50,
  maxModelCost: 0,
  maxGpuSeconds: 0,
});

export class ResearchBudgetManager {
  constructor(config = {}) {
    this.budget = Object.freeze({
      maxIterations: typeof config.maxIterations === 'number' && config.maxIterations > 0
        ? config.maxIterations
        : DEFAULT_BUDGET.maxIterations,
      maxRuns: typeof config.maxRuns === 'number' && config.maxRuns > 0
        ? config.maxRuns
        : DEFAULT_BUDGET.maxRuns,
      maxParallelRuns: typeof config.maxParallelRuns === 'number' && config.maxParallelRuns > 0
        ? config.maxParallelRuns
        : DEFAULT_BUDGET.maxParallelRuns,
      maxWallSeconds: typeof config.maxWallSeconds === 'number' && config.maxWallSeconds > 0
        ? config.maxWallSeconds
        : DEFAULT_BUDGET.maxWallSeconds,
      maxExternalRequests: typeof config.maxExternalRequests === 'number' && config.maxExternalRequests > 0
        ? config.maxExternalRequests
        : DEFAULT_BUDGET.maxExternalRequests,
      maxModelCost: typeof config.maxModelCost === 'number' ? config.maxModelCost : 0,
      maxGpuSeconds: typeof config.maxGpuSeconds === 'number' ? config.maxGpuSeconds : 0,
    });

    this.consumed = {
      iterations: 0,
      runs: 0,
      wallSeconds: 0,
      externalRequests: 0,
      modelCost: 0,
      gpuSeconds: 0,
      failedRuns: 0,
      retries: 0,
    };

    this.reserved = {
      runs: 0,
      wallSeconds: 0,
      externalRequests: 0,
    };

    this.activeReservations = new Map();
    this.startTime = Date.now();
  }

  /**
   * Elapsed wall time in seconds since budget manager initialized.
   */
  get elapsedWallSeconds() {
    return Math.max(0, (Date.now() - this.startTime) / 1000);
  }

  /**
   * Checks whether the requested quota can be reserved.
   */
  canReserve({ runs = 1, wallSeconds = 0, externalRequests = 0 } = {}) {
    const projectedRuns = this.consumed.runs + this.reserved.runs + runs;
    if (projectedRuns > this.budget.maxRuns) {
      return {
        allowed: false,
        reason: `Exceeds maxRuns quota: projected ${projectedRuns} > limit ${this.budget.maxRuns}`,
        metric: 'runs',
      };
    }

    if (this.activeReservations.size + 1 > this.budget.maxParallelRuns) {
      return {
        allowed: false,
        reason: `Exceeds maxParallelRuns quota: active ${this.activeReservations.size + 1} > limit ${this.budget.maxParallelRuns}`,
        metric: 'maxParallelRuns',
      };
    }

    if (this.consumed.iterations >= this.budget.maxIterations) {
      return {
        allowed: false,
        reason: `Exceeds maxIterations quota: consumed ${this.consumed.iterations} >= limit ${this.budget.maxIterations}`,
        metric: 'iterations',
      };
    }

    const projectedWall = this.elapsedWallSeconds + wallSeconds;
    if (this.budget.maxWallSeconds > 0 && projectedWall > this.budget.maxWallSeconds) {
      return {
        allowed: false,
        reason: `Exceeds maxWallSeconds quota: projected ${projectedWall.toFixed(1)}s > limit ${this.budget.maxWallSeconds}s`,
        metric: 'wallSeconds',
      };
    }

    const projectedExt = this.consumed.externalRequests + this.reserved.externalRequests + externalRequests;
    if (this.budget.maxExternalRequests > 0 && projectedExt > this.budget.maxExternalRequests) {
      return {
        allowed: false,
        reason: `Exceeds maxExternalRequests quota: projected ${projectedExt} > limit ${this.budget.maxExternalRequests}`,
        metric: 'externalRequests',
      };
    }

    return { allowed: true };
  }

  /**
   * Reserves budget for an impending execution.
   */
  reserve(reservationId, requirements = { runs: 1, wallSeconds: 0, externalRequests: 0 }) {
    if (!reservationId || typeof reservationId !== 'string') {
      throw new Error('reservationId must be a non-empty string');
    }
    if (this.activeReservations.has(reservationId)) {
      throw new Error(`Reservation "${reservationId}" already exists`);
    }

    const check = this.canReserve(requirements);
    if (!check.allowed) {
      const err = new Error(check.reason);
      err.code = 'BUDGET_EXHAUSTED';
      err.metric = check.metric;
      throw err;
    }

    const res = {
      reservationId,
      runs: requirements.runs ?? 1,
      wallSeconds: requirements.wallSeconds ?? 0,
      externalRequests: requirements.externalRequests ?? 0,
      reservedAt: Date.now(),
    };

    this.activeReservations.set(reservationId, res);
    this.reserved.runs += res.runs;
    this.reserved.wallSeconds += res.wallSeconds;
    this.reserved.externalRequests += res.externalRequests;

    return res;
  }

  /**
   * Commits actual consumption from a prior reservation.
   * Failures and retries are explicitly recorded and charged.
   */
  commit(reservationId, actual = {}) {
    const prior = this.activeReservations.get(reservationId);
    if (prior) {
      this.reserved.runs = Math.max(0, this.reserved.runs - prior.runs);
      this.reserved.wallSeconds = Math.max(0, this.reserved.wallSeconds - prior.wallSeconds);
      this.reserved.externalRequests = Math.max(0, this.reserved.externalRequests - prior.externalRequests);
      this.activeReservations.delete(reservationId);
    }

    const runsConsumed = typeof actual.runs === 'number' ? actual.runs : (prior?.runs ?? 1);
    const wallConsumed = typeof actual.wallSeconds === 'number'
      ? actual.wallSeconds
      : (prior ? (Date.now() - prior.reservedAt) / 1000 : 0);
    const extConsumed = typeof actual.externalRequests === 'number' ? actual.externalRequests : (prior?.externalRequests ?? 0);

    this.consumed.runs += runsConsumed;
    this.consumed.wallSeconds += wallConsumed;
    this.consumed.externalRequests += extConsumed;

    if (actual.isFailure) {
      this.consumed.failedRuns += 1;
    }
    if (actual.isRetry) {
      this.consumed.retries += 1;
    }

    return this.getSummary();
  }

  /**
   * Releases a reservation without charging.
   */
  release(reservationId) {
    const prior = this.activeReservations.get(reservationId);
    if (!prior) return;

    this.reserved.runs = Math.max(0, this.reserved.runs - prior.runs);
    this.reserved.wallSeconds = Math.max(0, this.reserved.wallSeconds - prior.wallSeconds);
    this.reserved.externalRequests = Math.max(0, this.reserved.externalRequests - prior.externalRequests);
    this.activeReservations.delete(reservationId);
  }

  /**
   * Records an iteration (e.g. GraphPatch cycle).
   */
  recordIteration() {
    this.consumed.iterations += 1;
    return this.consumed.iterations;
  }

  /**
   * Checks if any budget dimension is exhausted.
   */
  checkExhausted() {
    if (this.consumed.runs >= this.budget.maxRuns) {
      return {
        exhausted: true,
        reason: `maxRuns exhausted: consumed ${this.consumed.runs} >= limit ${this.budget.maxRuns}`,
        metric: 'runs',
      };
    }
    if (this.consumed.iterations >= this.budget.maxIterations) {
      return {
        exhausted: true,
        reason: `maxIterations exhausted: consumed ${this.consumed.iterations} >= limit ${this.budget.maxIterations}`,
        metric: 'iterations',
      };
    }
    if (this.budget.maxWallSeconds > 0 && this.elapsedWallSeconds >= this.budget.maxWallSeconds) {
      return {
        exhausted: true,
        reason: `maxWallSeconds exhausted: elapsed ${this.elapsedWallSeconds.toFixed(1)}s >= limit ${this.budget.maxWallSeconds}s`,
        metric: 'wallSeconds',
      };
    }
    if (this.budget.maxExternalRequests > 0 && this.consumed.externalRequests >= this.budget.maxExternalRequests) {
      return {
        exhausted: true,
        reason: `maxExternalRequests exhausted: consumed ${this.consumed.externalRequests} >= limit ${this.budget.maxExternalRequests}`,
        metric: 'externalRequests',
      };
    }
    return { exhausted: false };
  }

  getSummary() {
    return {
      budget: { ...this.budget },
      consumed: {
        ...this.consumed,
        elapsedWallSeconds: Number(this.elapsedWallSeconds.toFixed(2)),
      },
      reserved: { ...this.reserved },
      activeParallelRuns: this.activeReservations.size,
      exhaustion: this.checkExhausted(),
    };
  }
}

