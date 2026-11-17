// Seeded pseudo-random number generator (mulberry32).
// Pure: no DOM, no THREE, no Math.random. The same seed always produces the
// same sequence, so spawner behavior can be reproduced in tests.

/**
 * Turn any number into a 32-bit unsigned integer seed.
 * Non-finite values (NaN, Infinity) become 0.
 */
export function normalizeSeed(seed) {
  const n = Number(seed);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n) >>> 0;
}

/**
 * Create a seeded RNG.
 * Methods never allocate, so they are safe to call in per-frame code.
 * `rng.seed` always reports the seed of the current sequence (it follows
 * reset(newSeed)), so debug overlays and replays show the right value.
 */
export function createRng(seed = 0) {
  let state = normalizeSeed(seed);

  /** Float in [0, 1). */
  function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Float in [min, max). */
  function range(min, max) {
    return min + (max - min) * next();
  }

  /** Integer in [0, n). Returns 0 when n <= 1 or n is not finite. */
  function int(n) {
    if (!Number.isFinite(n) || n <= 1) return 0;
    return Math.floor(next() * Math.floor(n));
  }

  /** Random element of a non-empty array (undefined if empty). */
  function pick(arr) {
    return arr[int(arr.length)];
  }

  /** Restart the sequence. With no argument, replays the current seed. */
  function reset(newSeed = rng.seed) {
    rng.seed = normalizeSeed(newSeed);
    state = rng.seed;
  }

  /** Current internal state (for debugging / save-and-replay). */
  function getState() {
    return state;
  }

  const rng = { seed: state, next, range, int, pick, reset, getState };
  return rng;
}
