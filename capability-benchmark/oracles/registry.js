/**
 * Oracle registry (Phase 11, scoring side).
 * Oracles are engineering-independent from the runner: the runner knows only
 * the registry contract — score(submitted, task, context) -> { score, code,
 * reason, truth? } — and never embeds task-specific answers itself.
 */

import { scoreStatistical } from './statistical.js';
import { scoreDimension } from './dimension.js';
import { scoreExact } from './exact.js';

export const ORACLES = Object.freeze({
  statistical: scoreStatistical,
  dimension: scoreDimension,
  exact: scoreExact,
});

export function getOracle(type) {
  return ORACLES[type] || null;
}
