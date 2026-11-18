// The player's recent path, one sample per fixed step (ADR-0011).
// Pure: no DOM, no THREE. Fixed-size ring buffer of plain arrays, written in
// place, so recording and sampling never allocate.
//
// The Agent runs along this path, delayed by gap / speed seconds. Whatever the
// player jumped, slid under, or dodged a moment ago, he does too, so he never
// runs through an obstacle that has just passed the player.

export function createTrail(capacity, x0 = 0) {
  const t = {
    capacity,
    head: 0, // index of the newest sample
    x: new Array(capacity).fill(0),
    y: new Array(capacity).fill(0),
    slide: new Array(capacity).fill(0), // 1 while sliding, else 0
  };
  resetTrail(t, x0);
  return t;
}

/** Fill the whole history with the player standing at x0 (start of a run). */
export function resetTrail(t, x0) {
  t.head = 0;
  for (let i = 0; i < t.capacity; i++) {
    t.x[i] = x0;
    t.y[i] = 0;
    t.slide[i] = 0;
  }
}

export function pushTrail(t, x, y, sliding) {
  t.head = t.head + 1 === t.capacity ? 0 : t.head + 1;
  t.x[t.head] = x;
  t.y[t.head] = y;
  t.slide[t.head] = sliding ? 1 : 0;
}

/**
 * Write the path `stepsBack` steps before the newest sample into `out`
 * ({x, y, slide}), linearly interpolated for fractional steps. Clamped to
 * [0, capacity - 1] so it never reads past the oldest sample.
 */
export function sampleTrail(t, stepsBack, out) {
  const max = t.capacity - 1;
  const back = stepsBack < 0 ? 0 : stepsBack > max ? max : stepsBack;
  const b0 = Math.floor(back);
  const f = back - b0;
  let i0 = t.head - b0;
  if (i0 < 0) i0 += t.capacity;
  let i1 = b0 === max ? i0 : i0 - 1;
  if (i1 < 0) i1 += t.capacity;
  out.x = t.x[i0] + (t.x[i1] - t.x[i0]) * f;
  out.y = t.y[i0] + (t.y[i1] - t.y[i0]) * f;
  out.slide = t.slide[i0] + (t.slide[i1] - t.slide[i0]) * f;
  return out;
}
