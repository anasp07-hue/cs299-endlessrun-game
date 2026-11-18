// Spark particles (SPEC §9 Phase 7, ADR-0015). Pure: a fixed pool of plain
// typed arrays; emitting overwrites the oldest spark, so it never allocates
// and never grows. Randomness comes from a seeded RNG passed in.

export function createSparks(max) {
  return {
    max,
    next: 0, // ring index for the next emission
    x: new Float32Array(max),
    y: new Float32Array(max),
    z: new Float32Array(max),
    vx: new Float32Array(max),
    vy: new Float32Array(max),
    vz: new Float32Array(max),
    life: new Float32Array(max), // seconds left (≤ 0 = dead)
    maxLife: new Float32Array(max),
  };
}

export function clearSparks(sp) {
  sp.next = 0;
  sp.life.fill(0);
}

/**
 * Emit n sparks at (x, y, z), flying out at up to `speed` with an upward
 * bias `up` (0..1) and a sideways bias `dirX` (−1..1, 0 = all round).
 */
export function emitSparks(sp, x, y, z, n, speed, up, dirX, rng, cfg) {
  for (let k = 0; k < n; k++) {
    const i = sp.next;
    sp.next = sp.next + 1 === sp.max ? 0 : sp.next + 1;
    const s = speed * rng.range(0.35, 1);
    const a = rng.range(0, Math.PI * 2);
    sp.x[i] = x;
    sp.y[i] = y;
    sp.z[i] = z;
    sp.vx[i] = Math.cos(a) * s * 0.7 + dirX * s * 0.6;
    sp.vy[i] = (Math.abs(Math.sin(a)) * (1 - up) + up) * s;
    sp.vz[i] = Math.sin(a * 1.7) * s * 0.5;
    const life = rng.range(cfg.SPARK_LIFE_MIN, cfg.SPARK_LIFE_MAX);
    sp.life[i] = life;
    sp.maxLife[i] = life;
  }
}

/**
 * Advance every spark by dt: gravity, drag, and the world's scroll (sparks
 * belong to the world, which moves toward +Z by `scrollDelta`). Sparks that
 * hit the road bounce once, weakly. Returns how many are alive.
 */
export function stepSparks(sp, dt, scrollDelta, cfg) {
  let alive = 0;
  const drag = Math.exp(-cfg.SPARK_DRAG * dt);
  for (let i = 0; i < sp.max; i++) {
    if (sp.life[i] <= 0) continue;
    sp.life[i] -= dt;
    if (sp.life[i] <= 0) continue;
    alive++;
    sp.vy[i] -= cfg.SPARK_GRAVITY * dt;
    sp.vx[i] *= drag;
    sp.vy[i] *= drag;
    sp.vz[i] *= drag;
    sp.x[i] += sp.vx[i] * dt;
    sp.y[i] += sp.vy[i] * dt;
    sp.z[i] += sp.vz[i] * dt + scrollDelta;
    if (sp.y[i] < 0.02) {
      sp.y[i] = 0.02;
      sp.vy[i] = Math.abs(sp.vy[i]) * 0.3;
    }
  }
  return alive;
}

/** Brightness 0..1 of spark i (fades out over its life). */
export function sparkFade(sp, i) {
  return sp.life[i] > 0 ? sp.life[i] / sp.maxLife[i] : 0;
}
