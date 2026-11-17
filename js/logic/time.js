// Frame-time helpers (SPEC §7.1). Pure: no DOM, no THREE.

/**
 * Convert a raw frame delta (seconds) into a safe simulation step.
 * - Clamps to `max` so a tab switch or debugger pause can't cause a huge jump.
 * - Negative, NaN, or infinite deltas (clock glitches) become 0.
 * - Throws if `max` itself is invalid (e.g. a mistyped CONFIG key that reads
 *   as undefined), so the tab-switch guard can't be silently disabled.
 */
export function clampDt(dt, max) {
  if (!Number.isFinite(max) || max <= 0) {
    throw new TypeError(`clampDt: max must be a positive finite number, got ${max}`);
  }
  if (!Number.isFinite(dt) || dt <= 0) return 0;
  return dt > max ? max : dt;
}
