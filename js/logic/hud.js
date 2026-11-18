// Allocation-free number display helpers for the HUD (SPEC §4, §7.3).
// Pure: no DOM, no THREE. game.js keeps one text node per digit and only
// swaps in a preallocated '0'–'9' string when a digit changes, so the HUD can
// update every frame without building a new string.

/** Preallocated digit strings, indexed by digit value. */
export const DIGIT_STRINGS = Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);

/**
 * Write the decimal digits of floor(n) into `out` (most significant first)
 * and return how many were written. Negative or non-finite values show as 0.
 * Values too big for `out` are pinned to all nines, so the HUD never
 * overflows its slots.
 */
export function writeDigits(n, out) {
  const cap = out.length;
  if (cap === 0) return 0;
  let v = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
  let len = 1;
  let t = v;
  while (t >= 10) {
    t = Math.floor(t / 10);
    len++;
  }
  if (len > cap) {
    for (let i = 0; i < cap; i++) out[i] = 9;
    return cap;
  }
  for (let i = len - 1; i >= 0; i--) {
    out[i] = v % 10;
    v = Math.floor(v / 10);
  }
  return len;
}
