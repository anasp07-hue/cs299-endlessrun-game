// Obstacle rows: patterns + random rows, fair "no dead end" spacing, staggered
// obstacles, pooled slots (SPEC §3.4, ADR-0006, ADR-0007).
// Pure: no DOM, no THREE. Randomness comes only from the spawner's seeded RNG.
//
// Track coordinates: every obstacle stores `s`, its distance along the track.
// Its z on screen is `scroll - s` (the player is at z = 0), so obstacles move
// with the same single scroll value as the road and never drift.

import { createRng } from './rng.js';
import { lerp } from './math.js';
import { OB, overlaps, setObstacleBox } from './collision.js';
import { speedAt, difficultyAt } from './difficulty.js';
import { jumpClearTime } from './player.js';

// The pattern table and lane bitmasks are written for exactly 3 lanes;
// createSpawner refuses any other CONFIG.LANE_COUNT rather than misbehave.
const LANES = 3;
// Numeric tolerances (not gameplay tuning):
const SPEED_EPS = 0.01; // arrival-speed estimate counts as settled within this (units/s)
const MAX_REROLLS = 32; // random-row attempts before the always-valid fallback

// --- Pattern table -------------------------------------------------------------
// Lanes left→right: L = LOW (jump), H = HIGH (slide), B = BLOCK (dodge), . = empty.
// [cells, minDifficulty, weight]. Every row must leave at least one non-B lane.
const RAW_PATTERNS = [
  // Singles (always available)
  ['L..', 0, 1], ['.L.', 0, 1], ['..L', 0, 1],
  ['H..', 0, 1], ['.H.', 0, 1], ['..H', 0, 1],
  ['B..', 0, 1], ['.B.', 0, 1], ['..B', 0, 1],
  // Busier rows from the start, each with one obvious answer
  ['B.B', 0, 2], ['LLL', 0, 2], ['HHH', 0, 2], ['L.L', 0, 1], ['H.H', 0, 1],
  // Two-lane walls and mixed pairs
  ['BB.', 0.15, 2], ['.BB', 0.15, 2], ['LB.', 0.15, 2], ['.BH', 0.15, 2], ['B.L', 0.15, 2], ['H.B', 0.15, 2],
  // Only a jump or slide gets through the middle / sides
  ['BHB', 0.35, 2], ['BLB', 0.35, 2], ['LBH', 0.35, 2], ['HBL', 0.35, 2], ['BLL', 0.35, 2], ['HHB', 0.35, 2],
  // Hard: one lane, one action
  ['BBL', 0.55, 3], ['HBB', 0.55, 3], ['BBH', 0.55, 3], ['LBB', 0.55, 3], ['LHL', 0.55, 2], ['HLH', 0.55, 2],
];

const CELL = Object.freeze({ '.': OB.NONE, L: OB.LOW, H: OB.HIGH, B: OB.BLOCK });

/** 'B.L' → [BLOCK, NONE, LOW]. Throws on bad input (caught by tests, never at runtime). */
export function parsePattern(cells) {
  if (typeof cells !== 'string' || cells.length !== LANES) throw new Error(`bad pattern: ${cells}`);
  const out = [];
  for (const ch of cells) {
    if (!(ch in CELL)) throw new Error(`bad pattern cell '${ch}' in ${cells}`);
    out.push(CELL[ch]);
  }
  return Object.freeze(out);
}

export const PATTERNS = Object.freeze(
  RAW_PATTERNS.map(([cells, minDifficulty, weight]) =>
    Object.freeze({ cells, lanes: parsePattern(cells), minDifficulty, weight }),
  ),
);

// --- Row rules (pure, tested) -----------------------------------------------------

/** True if at least one lane is not a BLOCK (never three BLOCKs in a row). */
export function isPassable(lanes) {
  for (let i = 0; i < lanes.length; i++) if (lanes[i] !== OB.BLOCK) return true;
  return false;
}

/** True if the row has at least one obstacle. */
export function hasObstacle(lanes) {
  for (let i = 0; i < lanes.length; i++) if (lanes[i] !== OB.NONE) return true;
  return false;
}

/** True if the pattern puts an obstacle in every lane set in the `mustFill` bitmask. */
export function fillsLanes(lanes, mustFill) {
  for (let i = 0; i < lanes.length; i++) {
    if ((mustFill & (1 << i)) !== 0 && lanes[i] === OB.NONE) return false;
  }
  return true;
}

/**
 * Bitmask of lanes that were empty in `row`. The next row must put an obstacle
 * in each of them, so no lane stays empty for two rows in a row (ADR-0007).
 */
export function emptyLaneMask(row) {
  let mask = 0;
  for (let i = 0; i < LANES; i++) if (row.types[i] === OB.NONE) mask |= 1 << i;
  return mask;
}

/**
 * Pick a table pattern allowed at this difficulty that fills every lane in
 * `mustFill`, weighted. Returns null if none fits. Allocation-free.
 */
export function pickPattern(rng, difficulty, mustFill = 0) {
  let total = 0;
  for (let i = 0; i < PATTERNS.length; i++) {
    const p = PATTERNS[i];
    if (p.minDifficulty <= difficulty && fillsLanes(p.lanes, mustFill)) total += p.weight;
  }
  if (total === 0) return null;
  let r = rng.next() * total;
  let lastFit = null;
  for (let i = 0; i < PATTERNS.length; i++) {
    const p = PATTERNS[i];
    if (p.minDifficulty > difficulty || !fillsLanes(p.lanes, mustFill)) continue;
    lastFit = p;
    r -= p.weight;
    if (r < 0) return p;
  }
  return lastFit; // floating-point edge: r landed exactly on total
}

/**
 * Fill `out` with a random row, lane by lane (weights from CONFIG). Lanes in
 * the `mustFill` bitmask always get an obstacle. Re-rolls all-BLOCK and empty
 * rows, so the result is always passable and non-empty.
 */
export function randomRow(rng, out, cfg, mustFill = 0) {
  const wN = cfg.RANDOM_W_NONE;
  const wL = cfg.RANDOM_W_LOW;
  const wH = cfg.RANDOM_W_HIGH;
  const wB = cfg.RANDOM_W_BLOCK;
  for (let attempt = 0; attempt < MAX_REROLLS; attempt++) {
    for (let i = 0; i < LANES; i++) {
      const none = (mustFill & (1 << i)) !== 0 ? 0 : wN;
      const r = rng.next() * (none + wL + wH + wB);
      out[i] = r < none ? OB.NONE : r < none + wL ? OB.LOW : r < none + wL + wH ? OB.HIGH : OB.BLOCK;
    }
    if (isPassable(out) && hasObstacle(out)) return out;
  }
  // Practically unreachable fallback: LOWs in the required lanes (or the centre).
  for (let i = 0; i < LANES; i++) out[i] = (mustFill & (1 << i)) !== 0 ? OB.LOW : OB.NONE;
  if (mustFill === 0) out[1] = OB.LOW;
  return out;
}

/**
 * Seconds needed to EXECUTE the action an obstacle needs, after reacting:
 * a jump must lift the feet above a LOW before reaching it (physics-derived,
 * ~0.08 s); a slide takes effect at once.
 */
export function actionLead(nextType, cfg) {
  return nextType === OB.LOW ? jumpClearTime(cfg.LOW_HEIGHT, cfg) : 0;
}

/**
 * Seconds a player needs between passing an obstacle of `prevType` and
 * reaching one of `nextType`, `shift` lanes away (ADR-0007):
 * - any jump, slide, or lane change needs REACTION_TIME, plus the time to
 *   execute the action (actionLead: a jump must get high enough);
 * - after a jump (LOW) you must land before another jump or slide: JUMP_TIME;
 * - each lane change adds LANE_CHANGE_TIME (it can overlap airtime, but we
 *   add it on top to stay conservative).
 * Going from an empty lane to an empty lane in the same lane needs nothing.
 */
export function transitionTime(prevType, nextType, shift, cfg) {
  const needsInput = shift > 0 || nextType === OB.LOW || nextType === OB.HIGH;
  const jumpLock = prevType === OB.LOW && (nextType === OB.LOW || nextType === OB.HIGH) ? cfg.JUMP_TIME : 0;
  const react = needsInput ? cfg.REACTION_TIME + actionLead(nextType, cfg) : 0;
  const base = react > jumpLock ? react : jumpLock;
  return base + shift * cfg.LANE_CHANGE_TIME;
}

export function maxObstacleDepth(cfg) {
  return Math.max(cfg.LOW_DEPTH, cfg.HIGH_DEPTH, cfg.BLOCK_DEPTH);
}

/**
 * Extra distance on every row-to-row requirement: the previous obstacle must be
 * fully behind the player and the next one not yet touching them.
 */
export function rowMargin(cfg) {
  return maxObstacleDepth(cfg) + cfg.PLAYER_WIDTH * cfg.HITBOX_SCALE;
}

/** Track position the player must have passed in lane `i` before heading for lane `j`. */
export function departS(row, i, j) {
  if (i !== j) return row.latest; // crossing lanes: the whole previous row must be behind
  return row.types[i] !== OB.NONE ? row.s[i] : row.earliest;
}

/**
 * The first obstacle of `row` the player meets on the way from lane `i` to lane
 * `j`: the earliest one in ANY lane from i to j inclusive. With staggered rows,
 * an obstacle in the lane you are leaving, or one you cross, can come before
 * the one in your target lane, and you must be past it in time too.
 * Infinity if those lanes are all empty (nothing to beat).
 */
export function arrivePathS(row, i, j) {
  const lo = i < j ? i : j;
  const hi = i < j ? j : i;
  let m = Infinity;
  for (let k = lo; k <= hi; k++) if (row.types[k] !== OB.NONE && row.s[k] < m) m = row.s[k];
  return m;
}

/** Distance needed between departure and the first obstacle on the path (shared by spawner and checks). */
export function reachNeed(prevType, nextType, shift, v, cfg) {
  return transitionTime(prevType, nextType, shift, cfg) * v + rowMargin(cfg);
}

/**
 * Can a player in open lane `i` of `prev` make it to open lane `j` of `next`,
 * at speed `v` (use the highest speed they could have by then)?
 */
export function canReach(prev, i, next, j, v, cfg) {
  const arrive = arrivePathS(next, i, j);
  if (arrive === Infinity) return true;
  const shift = i > j ? i - j : j - i;
  return arrive - departS(prev, i, j) >= reachNeed(prev.types[i], next.types[j], shift, v, cfg) - 1e-9;
}

// --- Spawner state ---------------------------------------------------------------

function makeRow() {
  return { types: [0, 0, 0], s: [0, 0, 0], earliest: 0, latest: 0, anchor: 0, randomRow: false };
}

export function createSpawner(cfg, seed = 0) {
  if (cfg.LANE_COUNT !== LANES) {
    throw new Error(`spawner patterns are written for ${LANES} lanes, CONFIG.LANE_COUNT is ${cfg.LANE_COUNT}`);
  }
  const slots = [];
  for (let i = 0; i < cfg.MAX_OBSTACLES; i++) {
    // ignored: side-clipped this pass, so it can't hit twice (ADR-0011)
    // nearGap / nearDone: closest the player came during this pass, for near misses (Phase 7)
    slots.push({ active: false, type: OB.NONE, lane: 0, s: 0, row: 0, ignored: false, nearGap: NEAR_NONE, nearDone: false });
  }
  const sp = {
    rng: createRng(seed),
    slots,
    last: makeRow(), // the most recently spawned row
    next: makeRow(), // the planned row, waiting to come within SPAWN_AHEAD
    u: [0, 0, 0], // scratch: per-lane stagger fractions for planning
    rows: 0, // rows spawned this run
    randomRows: 0, // how many of them were generated lane-by-lane
    dropped: 0, // rows skipped because the pool was full (should stay 0)
    active: 0, // obstacles currently live
  };
  resetSpawner(sp, cfg, seed);
  return sp;
}

function clearRow(row) {
  for (let i = 0; i < LANES; i++) {
    row.types[i] = OB.NONE;
    row.s[i] = 0;
  }
  row.earliest = 0;
  row.latest = 0;
  row.anchor = 0;
  row.randomRow = false;
}

/**
 * Clear every obstacle and restart the row sequence from `seed`. The first row
 * is placed FIRST_ROW_DISTANCE past track position `startS` (0 for a new run).
 */
export function resetSpawner(sp, cfg, seed = sp.rng.seed, startS = 0) {
  sp.rng.reset(seed);
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    o.active = false;
    o.type = OB.NONE;
    o.lane = 0;
    o.s = 0;
    o.row = 0;
    o.ignored = false;
    o.nearGap = NEAR_NONE;
    o.nearDone = false;
  }
  clearRow(sp.last);
  clearRow(sp.next);
  sp.u[0] = sp.u[1] = sp.u[2] = 0;
  sp.rows = 0;
  sp.randomRows = 0;
  sp.dropped = 0;
  sp.active = 0;
  // First row: a calm start, table pattern, no stagger.
  const first = pickPattern(sp.rng, 0);
  const s0 = startS + cfg.FIRST_ROW_DISTANCE;
  for (let i = 0; i < LANES; i++) {
    sp.next.types[i] = first.lanes[i];
    sp.next.s[i] = s0;
  }
  sp.next.anchor = s0;
  sp.next.earliest = s0;
  sp.next.latest = s0;
}

function spawnRow(sp, row) {
  let needed = 0;
  for (let i = 0; i < LANES; i++) if (row.types[i] !== OB.NONE) needed++;
  if (sp.slots.length - sp.active < needed) {
    sp.dropped++; // a missing row only removes obstacles: the run stays fair
    return;
  }
  sp.rows++;
  if (row.randomRow) sp.randomRows++;
  let slot = 0;
  for (let lane = 0; lane < LANES; lane++) {
    if (row.types[lane] === OB.NONE) continue;
    while (sp.slots[slot].active) slot++;
    const o = sp.slots[slot];
    o.active = true;
    o.type = row.types[lane];
    o.lane = lane;
    o.s = row.s[lane];
    o.row = sp.rows;
    o.ignored = false;
    o.nearGap = NEAR_NONE;
    o.nearDone = false;
    sp.active++;
  }
}

function copyRow(to, from) {
  for (let i = 0; i < LANES; i++) {
    to.types[i] = from.types[i];
    to.s[i] = from.s[i];
  }
  to.earliest = from.earliest;
  to.latest = from.latest;
  to.anchor = from.anchor;
  to.randomRow = from.randomRow;
}

/** Place `next` (types + stagger fractions `u` already chosen) with its anchor at S. */
function placeRow(next, u, S, stagger) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < LANES; i++) {
    if (next.types[i] === OB.NONE) {
      next.s[i] = S;
      continue;
    }
    const s = S + u[i] * stagger;
    next.s[i] = s;
    if (s < lo) lo = s;
    if (s > hi) hi = s;
  }
  next.anchor = S;
  next.earliest = lo;
  next.latest = hi;
}

/**
 * Smallest stagger fraction among obstacles in lanes i..j of `next` (mirrors
 * arrivePathS before the row is placed). Infinity if those lanes are empty.
 */
function pathMinU(next, u, i, j) {
  const lo = i < j ? i : j;
  const hi = i < j ? j : i;
  let m = Infinity;
  for (let k = lo; k <= hi; k++) if (next.types[k] !== OB.NONE && u[k] < m) m = u[k];
  return m;
}

/**
 * Smallest anchor S for `next` so that, at speed v:
 * - every open lane of `last` can reach at least one open lane of `next`, being
 *   past every obstacle on the way in time (no dead ends; same rule as canReach);
 * - a LOW followed by a LOW/HIGH in the same lane is at least a full jump apart;
 * - the rows don't overlap.
 * Each constraint is linear in S, so each is solved directly.
 */
function minAnchor(last, next, u, stagger, v, cfg) {
  const margin = rowMargin(cfg);
  let minU = Infinity;
  for (let j = 0; j < LANES; j++) if (next.types[j] !== OB.NONE && u[j] < minU) minU = u[j];

  let S = last.latest + margin - minU * stagger; // rows never interleave
  for (let i = 0; i < LANES; i++) {
    if (last.types[i] === OB.BLOCK) continue;
    let best = Infinity; // the anchor that makes the easiest lane j reachable from i
    for (let j = 0; j < LANES; j++) {
      if (next.types[j] === OB.BLOCK) continue;
      const pu = pathMinU(next, u, i, j);
      if (pu === Infinity) {
        best = -Infinity; // nothing on the way: always reachable
        break;
      }
      const shift = i > j ? i - j : j - i;
      const bound = departS(last, i, j) + reachNeed(last.types[i], next.types[j], shift, v, cfg) - pu * stagger;
      if (bound < best) best = bound;
    }
    if (best > S) S = best;
    // Skill rule: never a LOW then LOW/HIGH in the same lane closer than a full jump.
    const t = next.types[i];
    if (last.types[i] === OB.LOW && (t === OB.LOW || t === OB.HIGH)) {
      const bound = last.s[i] + cfg.JUMP_TIME * v + margin - u[i] * stagger;
      if (bound > S) S = bound;
    }
  }
  return S;
}

/** Choose and place the row after `sp.last` (all randomness drawn up front). */
function planNext(sp, scroll, speed, elapsed, cfg) {
  const rng = sp.rng;
  const last = sp.last;
  const next = sp.next;
  const difficulty = difficultyAt(last.anchor, cfg);

  // 1. What's in the row: a table pattern, or a random lane-by-lane row.
  //    Lanes that were empty last row must get an obstacle now (no lane stays
  //    empty for two rows, so you always have something to do).
  const mustFill = emptyLaneMask(last);
  const forcedLanes = (mustFill & 1) + ((mustFill >> 1) & 1) + ((mustFill >> 2) & 1);
  let randomChance = lerp(cfg.RANDOM_ROW_EASY, cfg.RANDOM_ROW_HARD, difficulty);
  // With 2+ lanes to fill, few table patterns fit (early on only LLL/HHH), so
  // lean on random rows for variety.
  if (forcedLanes >= 2 && cfg.RANDOM_ROW_FORCED > randomChance) randomChance = cfg.RANDOM_ROW_FORCED;
  const p = rng.next() < randomChance ? null : pickPattern(rng, difficulty, mustFill);
  if (p === null) {
    randomRow(rng, next.types, cfg, mustFill);
    next.randomRow = true;
  } else {
    for (let i = 0; i < LANES; i++) next.types[i] = p.lanes[i];
    next.randomRow = false;
  }
  // 2. Stagger fractions and gap jitter.
  for (let i = 0; i < LANES; i++) sp.u[i] = rng.next();
  const jitter = 1 + cfg.GAP_JITTER * (2 * rng.next() - 1);
  const baseTime = lerp(cfg.ROW_TIME_EASY, cfg.ROW_TIME_HARD, difficulty) * jitter;
  const staggerTime = lerp(cfg.STAGGER_EASY, cfg.STAGGER_HARD, difficulty);

  // 3. Place it. Spacing uses the speed the player could have when they reach
  //    the row; we estimate arrival at the current (lower) speed, which
  //    overestimates the time and so the speed, then refine a few times
  //    (S only grows, so this converges upward and stays conservative).
  // The estimate creeps up by ever-smaller amounts, so stop once it moves by
  // less than SPEED_EPS and add that as a cushion (keeps it conservative).
  const v0 = speed > 0 ? speed : cfg.SPEED_START;
  let v = v0;
  let converged = false;
  for (let k = 0; k < 8; k++) {
    const S = anchorFor(last, next, sp.u, baseTime, staggerTime, v, cfg);
    const arrival = elapsed + (S + staggerTime * v - scroll) / v0;
    const vArr = speedAt(arrival, cfg);
    if (vArr - v < SPEED_EPS) {
      v = Math.min(cfg.SPEED_MAX, Math.max(v, vArr) + SPEED_EPS);
      converged = true;
      break;
    }
    v = vArr;
  }
  if (!converged) v = cfg.SPEED_MAX; // can't be faster than the cap: always safe
  placeRow(next, sp.u, anchorFor(last, next, sp.u, baseTime, staggerTime, v, cfg), staggerTime * v);
}

/** Anchor for the row: the jittered target gap, pushed out to the fairness floor if needed. */
function anchorFor(last, next, u, baseTime, staggerTime, v, cfg) {
  const desired = last.anchor + baseTime * v;
  const floor = minAnchor(last, next, u, staggerTime * v, v, cfg);
  return desired > floor ? desired : floor;
}

/**
 * Advance the spawner to the current scroll distance: recycle obstacles behind
 * the camera, spawn every planned row that has come within SPAWN_AHEAD, and
 * plan the row after it.
 */
export function updateSpawner(sp, scroll, speed, elapsed, cfg) {
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (o.active && scroll - o.s > cfg.DESPAWN_Z) {
      o.active = false;
      sp.active--;
    }
  }
  while (sp.next.earliest - scroll <= cfg.SPAWN_AHEAD) {
    spawnRow(sp, sp.next);
    copyRow(sp.last, sp.next);
    planNext(sp, scroll, speed, elapsed, cfg);
  }
}

/** nearGap value meaning "never came close" (a plain number, so state stays JSON-clean). */
export const NEAR_NONE = 1e9;

/**
 * Near misses: while an obstacle is passing the player (overlapping in z),
 * remember the smallest gap between them across the lane and in height.
 * Once it has fully passed, report it (once) if that gap stayed under
 * `margin` and it never hit (or was side-clipped). Returns the slot index of
 * a near miss completed this step, or -1. Allocation-free.
 */
export function trackNearMisses(sp, playerBox, scroll, margin, cfg, scratchBox) {
  const reach = rowMargin(cfg);
  let found = -1;
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (!o.active || o.nearDone) continue;
    const z = scroll - o.s;
    if (z < -reach) continue; // still ahead
    setObstacleBox(scratchBox, o.type, o.lane, z, cfg);
    const b = scratchBox;
    const sepZ = Math.max(b.minZ - playerBox.maxZ, playerBox.minZ - b.maxZ);
    if (sepZ < 0) {
      const sepX = Math.max(b.minX - playerBox.maxX, playerBox.minX - b.maxX);
      const sepY = Math.max(b.minY - playerBox.maxY, playerBox.minY - b.maxY);
      const gap = Math.max(sepX, sepY);
      if (gap < o.nearGap) o.nearGap = gap;
    } else if (z > 0) {
      o.nearDone = true; // passed: decide once
      if (!o.ignored && o.nearGap > 0 && o.nearGap < margin && found < 0) found = i;
    }
  }
  return found;
}

/** Index of the first live, non-ignored obstacle overlapping `playerBox`, or -1. */
export function findHit(sp, playerBox, scroll, cfg, scratchBox) {
  // Overlap needs |z| < obstacle half-depth + player half-depth <= rowMargin.
  const reach = rowMargin(cfg);
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (!o.active || o.ignored) continue;
    const z = scroll - o.s;
    if (z < -reach || z > reach) continue; // can't be touching: skip the full test
    setObstacleBox(scratchBox, o.type, o.lane, z, cfg);
    if (overlaps(playerBox, scratchBox)) return i;
  }
  return -1;
}
