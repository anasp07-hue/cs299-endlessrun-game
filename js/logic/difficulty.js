// Speed curve, difficulty, and scoring (SPEC §3.5, §3.7). Pure: no DOM, no THREE.

import { clamp } from './math.js';

/** Run speed after `t` seconds: linear ramp from SPEED_START, capped at SPEED_MAX. */
export function speedAt(t, cfg) {
  const s = cfg.SPEED_START + cfg.SPEED_ACCEL * (t > 0 ? t : 0);
  return s < cfg.SPEED_MAX ? s : cfg.SPEED_MAX;
}

/** Difficulty in [0, 1] from distance travelled. Gates harder patterns and denser rows. */
export function difficultyAt(distance, cfg) {
  return clamp(distance / cfg.DIFFICULTY_DISTANCE, 0, 1);
}

/** Score multiplier: 1.0, then +SCORE_MULT_STEP every SCORE_MULT_DISTANCE units. */
export function scoreMultiplier(distance, cfg) {
  const steps = Math.floor((distance > 0 ? distance : 0) / cfg.SCORE_MULT_DISTANCE);
  return 1 + steps * cfg.SCORE_MULT_STEP;
}

/** Score after one step: distance covered this step × the current multiplier. */
export function addScore(score, speed, dt, distance, cfg) {
  return score + speed * dt * scoreMultiplier(distance, cfg);
}

/** Points for collecting `n` data shards at this distance (SHARD_POINTS each × the multiplier; ADR-0016). */
export function shardScore(n, distance, cfg) {
  return n * cfg.SHARD_POINTS * scoreMultiplier(distance, cfg);
}
