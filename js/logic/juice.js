// "Juice": camera shake, landing squash, near-miss flash (SPEC §9 Phase 7,
// ADR-0015). Pure: no DOM, no THREE; state objects are mutated in place and
// nothing allocates per frame.

/** Camera shake as "trauma" (0..1) that decays; the shake is trauma², so small knocks stay subtle. */
export function createShake() {
  return { trauma: 0, t: 0 };
}

export function resetShake(sh) {
  sh.trauma = 0;
  sh.t = 0;
}

export function addTrauma(sh, amount) {
  sh.trauma = Math.min(1, sh.trauma + amount);
}

export function stepShake(sh, dt, cfg) {
  sh.trauma = Math.max(0, sh.trauma - cfg.SHAKE_DECAY * dt);
  sh.t += dt;
}

/** Smooth bounded pseudo-noise in [−1, 1] (a sum of incommensurate sines). */
export function noise1(t, seed) {
  return 0.5 * Math.sin(t * 1.0 + seed) + 0.3 * Math.sin(t * 2.31 + seed * 3.7) + 0.2 * Math.sin(t * 4.79 + seed * 1.3);
}

/** Write the current shake into out = { x, y, roll } (units, units, radians). */
export function shakeOffset(sh, cfg, out) {
  if (sh.trauma <= 0) {
    out.x = 0;
    out.y = 0;
    out.roll = 0;
    return out;
  }
  const k = sh.trauma * sh.trauma;
  const a = sh.t * cfg.SHAKE_FREQ;
  out.x = k * cfg.SHAKE_MAX_OFFSET * noise1(a, 1.7);
  out.y = k * cfg.SHAKE_MAX_OFFSET * 0.7 * noise1(a, 5.3);
  out.roll = k * cfg.SHAKE_MAX_ROLL * noise1(a, 9.1);
  return out;
}

/**
 * Landing squash: `age` seconds after landing with `strength` (0..1, from the
 * impact speed). Writes out = { y, xz } scale factors: squashed down and
 * spread out at touchdown, back to 1 by SQUASH_TIME.
 */
export function squashScale(age, strength, cfg, out) {
  if (!(age >= 0) || age >= cfg.SQUASH_TIME || strength <= 0) {
    out.y = 1;
    out.xz = 1;
    return out;
  }
  const u = 1 - age / cfg.SQUASH_TIME;
  const s = Math.min(1, strength) * cfg.SQUASH_AMOUNT * u * u;
  out.y = 1 - s;
  out.xz = 1 + s * 0.5;
  return out;
}

/** Impact strength 0..1 for a landing at downward speed v (a normal jump lands at ~ the launch speed). */
export function landingStrength(v, launchSpeed) {
  return v > 0 ? Math.min(1, v / (launchSpeed * 1.6)) : 0;
}

/** Near-miss screen flicker: opacity `age` seconds after the near miss (a stutter, then fade). */
export function nearMissFlash(age, cfg) {
  const T = cfg.NEAR_MISS_FLASH_TIME;
  if (!(age >= 0) || age >= T) return 0;
  const u = age / T;
  if (u < 0.25) return cfg.NEAR_MISS_FLASH_PEAK;
  if (u < 0.4) return cfg.NEAR_MISS_FLASH_PEAK * 0.15; // the stutter
  return cfg.NEAR_MISS_FLASH_PEAK * (1 - u) * 1.4;
}
