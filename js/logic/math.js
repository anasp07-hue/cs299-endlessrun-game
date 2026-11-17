// Small numeric helpers. Pure: no DOM, no THREE. None of these allocate.

export function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Quadratic ease-out on [0, 1]: fast start, gentle stop (snappy lane changes). */
export function easeOutQuad(t) {
  const c = clamp(t, 0, 1);
  return c * (2 - c);
}

/** Positive modulo: result is always in [0, m) for m > 0. */
export function mod(a, m) {
  const r = a % m;
  return r < 0 ? r + m : r;
}

/**
 * Frame-rate independent exponential smoothing of `current` toward `target`.
 * `rate` is in 1/s; larger = snappier. dt <= 0 leaves the value unchanged.
 */
export function damp(current, target, rate, dt) {
  if (!(dt > 0)) return current;
  return lerp(current, target, 1 - Math.exp(-rate * dt));
}
