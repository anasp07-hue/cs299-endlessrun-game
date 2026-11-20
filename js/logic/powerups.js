// Power-ups (Round 4, R11–R16; SPEC §3.8, docs/decisions/0004).
// Pure: no DOM, no THREE, no storage. Power-ups are run state only.
//
// Three power-ups stand on the road now and then:
// - BAZOOKA: one shot; firing it (F) destroys every obstacle of the next row.
// - DOUBLE:  every point gained counts double for POWERUP_DURATION seconds.
// - PHASE:   obstacles can't hit you for POWERUP_DURATION seconds.
//
// Placement works like the shards (ADR-0016): it reads the spawner's gap log
// and puts a pickup in the open stretch between two rows, clear of both and
// never on a shard line. It draws from its OWN seeded RNG, so the obstacle
// and shard sequences of every seed are unchanged. Timing is by ARRIVAL
// (docs/decisions/0006): pickups are scheduled to reach the player at
// POWERUP_FIRST, then every POWERUP_INTERVAL seconds after (30, 60, 90 s…).
// Each goes in the first suitable gap the player will reach at or after its
// slot, so it arrives a moment after (never before); the schedule itself
// never drifts.
//
// Like obstacles and shards, a pickup stores `s` (track position); its z is `scroll - s`.

import { createRng } from './rng.js';
import { overlaps, setObstacleBox } from './collision.js';
import { laneX } from './world.js';
import { rowMargin, GAP_LOG } from './spawner.js';
import { speedAt } from './difficulty.js';

export const POWER = Object.freeze({ NONE: 0, BAZOOKA: 1, DOUBLE: 2, PHASE: 3 });
export const POWER_TYPES = Object.freeze([POWER.BAZOOKA, POWER.DOUBLE, POWER.PHASE]);

const LANES = 3; // like the spawner, written for exactly 3 lanes (createSpawner enforces it)

/** The power-up RNG's seed: derived from the run seed, a different stream from the spawner's and the shards'. */
export function powerSeed(seed) {
  return (seed ^ 0x9a3e17) >>> 0;
}

export function createPowerups(cfg, seed = 0) {
  const slots = [];
  for (let i = 0; i < cfg.MAX_POWERUPS; i++) slots.push({ active: false, type: POWER.NONE, lane: 0, s: 0 });
  const pu = {
    rng: createRng(powerSeed(seed)),
    slots,
    seen: 0, // spawner gap-log entries already handled
    active: 0, // pickups on the road
    nextAt: 0, // the next pickup's slot: the run time (s) it should reach the player (30, 60, 90 s…)
    placed: 0, // pickups placed this run
    picked: 0, // pickups collected this run
    lastType: POWER.NONE, // type of the latest pickup collected
    dropped: 0, // pickups not placed because the pool was full (should stay 0)
    // Effects
    bazooka: false, // holding the one shot
    fireRequested: false, // F pressed; handled at the start of the next step
    shots: 0, // shots fired this run
    blastMask: 0, // lanes of the latest destroyed row (bit per lane)
    blastS: [0, 0, 0], // ...and each destroyed obstacle's track position
    doubleTime: 0, // seconds of double score left
    phaseTime: 0, // seconds of phase left
    phaseEnds: 0, // phases that have run out this run (view: end-of-phase effect)
  };
  resetPowerups(pu, cfg, seed);
  return pu;
}

export function resetPowerups(pu, cfg, seed) {
  pu.rng.reset(powerSeed(seed));
  for (let i = 0; i < pu.slots.length; i++) {
    const o = pu.slots[i];
    o.active = false;
    o.type = POWER.NONE;
    o.lane = 0;
    o.s = 0;
  }
  pu.seen = 0;
  pu.active = 0;
  pu.nextAt = cfg.POWERUP_FIRST;
  pu.placed = 0;
  pu.picked = 0;
  pu.lastType = POWER.NONE;
  pu.dropped = 0;
  pu.bazooka = false;
  pu.fireRequested = false;
  pu.shots = 0;
  pu.blastMask = 0;
  for (let i = 0; i < LANES; i++) pu.blastS[i] = 0;
  pu.doubleTime = 0;
  pu.phaseTime = 0;
  pu.phaseEnds = 0;
}

/**
 * Seconds the player takes to travel `dist` units from run time `elapsed`,
 * on the speed ramp (SPEED_ACCEL up to SPEED_MAX; SPEC §3.5). Closed form,
 * allocation-free.
 */
export function travelTime(dist, elapsed, cfg) {
  if (dist <= 0) return 0;
  const v0 = speedAt(elapsed, cfg);
  const a = cfg.SPEED_ACCEL;
  if (v0 >= cfg.SPEED_MAX || a <= 0) return dist / v0;
  const tCap = (cfg.SPEED_MAX - v0) / a; // until the cap
  const dCap = v0 * tCap + 0.5 * a * tCap * tCap;
  if (dist <= dCap) return (Math.sqrt(v0 * v0 + 2 * a * dist) - v0) / a;
  return tCap + (dist - dCap) / cfg.SPEED_MAX;
}

/** Clear distance kept between a pickup's centre and either row's obstacle centres. */
export function powerupClearance(cfg) {
  return rowMargin(cfg) + cfg.POWERUP_HIT_D / 2;
}

/** Bitmask of lanes holding a shard inside [from, to] (the shard line of this gap, if any). */
function shardLanes(sh, from, to) {
  let mask = 0;
  for (let i = 0; i < sh.slots.length; i++) {
    const o = sh.slots[i];
    if (o.active && o.s >= from && o.s <= to) mask |= 1 << o.lane;
  }
  return mask;
}

/** The `pick`-th set lane of `mask` (0-based), or -1. */
function nthLane(mask, pick) {
  for (let i = 0; i < LANES; i++) {
    if ((mask & (1 << i)) === 0) continue;
    if (pick === 0) return i;
    pick--;
  }
  return -1;
}

function countLanes(mask) {
  let n = 0;
  for (let i = 0; i < LANES; i++) if (mask & (1 << i)) n++;
  return n;
}

/** Try to place the due pickup in gap [from, to] (centred). Returns true if placed. */
function tryPlace(pu, sh, from, to, prevOpen, nextOpen, cfg) {
  const clear = powerupClearance(cfg);
  if (to - from < 2 * clear) return false; // too short: wait for the next gap
  const taken = shardLanes(sh, from, to);
  // Prefer a lane open in both rows (stay in it from one row to the next), else open in the next row.
  let mask = prevOpen & nextOpen & ~taken;
  if (mask === 0) mask = nextOpen & ~taken;
  const n = countLanes(mask);
  if (n === 0) return false;
  let slot = -1;
  for (let i = 0; i < pu.slots.length; i++) {
    if (!pu.slots[i].active) {
      slot = i;
      break;
    }
  }
  if (slot < 0) {
    pu.dropped++;
    return false;
  }
  const o = pu.slots[slot];
  o.active = true;
  o.lane = nthLane(mask, Math.floor(pu.rng.next() * n));
  o.type = POWER_TYPES[Math.floor(pu.rng.next() * POWER_TYPES.length)];
  o.s = (from + to) / 2;
  pu.active++;
  pu.placed++;
  return true;
}

/**
 * Recycle pickups behind the camera, and put the next pickup in the first
 * newly logged gap that the player will reach at or after `nextAt` (and that
 * has room). Call right after updateShards (so this gap's shard line is
 * known). Allocation-free.
 */
export function updatePowerups(pu, sp, sh, scroll, elapsed, cfg) {
  for (let i = 0; i < pu.slots.length; i++) {
    const o = pu.slots[i];
    if (o.active && scroll - o.s > cfg.DESPAWN_Z) {
      o.active = false;
      pu.active--;
    }
  }
  if (sp.gaps - pu.seen > GAP_LOG) pu.seen = sp.gaps - GAP_LOG; // overwritten entries are lost (never happens in play)
  while (pu.seen < sp.gaps) {
    const k = pu.seen % GAP_LOG;
    pu.seen++;
    const from = sp.gapFrom[k];
    const to = sp.gapTo[k];
    const arrive = elapsed + travelTime((from + to) / 2 - scroll, elapsed, cfg);
    if (arrive < pu.nextAt) continue; // the player gets there too early
    if (tryPlace(pu, sh, from, to, sp.gapPrevOpen[k], sp.gapNextOpen[k], cfg)) {
      // On a fixed clock: waiting for a gap that fits never pushes later pickups back.
      do pu.nextAt += cfg.POWERUP_INTERVAL;
      while (pu.nextAt <= arrive);
    }
  }
}

/** Fill `box` with the pickup box of a power-up in `lane` at screen depth `z`: on the road, POWERUP_HIT_H tall. */
export function setPowerupBox(box, lane, z, cfg) {
  const x = laneX(lane, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  box.minX = x - cfg.POWERUP_HIT_W / 2;
  box.maxX = x + cfg.POWERUP_HIT_W / 2;
  box.minY = 0;
  box.maxY = cfg.POWERUP_HIT_H;
  box.minZ = z - cfg.POWERUP_HIT_D / 2;
  box.maxZ = z + cfg.POWERUP_HIT_D / 2;
  return box;
}

/** Turn on a power-up's effect. A timed one already running is reset to the full duration (R16). */
export function applyPower(pu, type, cfg) {
  if (type === POWER.BAZOOKA) pu.bazooka = true; // still one shot if you already held one
  else if (type === POWER.DOUBLE) pu.doubleTime = cfg.POWERUP_DURATION;
  else if (type === POWER.PHASE) pu.phaseTime = cfg.POWERUP_DURATION;
}

/** Collect every pickup touching `playerBox` and apply it. Returns how many were collected this step. */
export function collectPowerups(pu, playerBox, scroll, cfg, scratchBox) {
  const reach = cfg.POWERUP_HIT_D / 2 + (playerBox.maxZ - playerBox.minZ) / 2;
  let got = 0;
  for (let i = 0; i < pu.slots.length; i++) {
    const o = pu.slots[i];
    if (!o.active) continue;
    const z = scroll - o.s;
    if (z < -reach || z > reach) continue;
    if (overlaps(playerBox, setPowerupBox(scratchBox, o.lane, z, cfg))) {
      o.active = false;
      pu.active--;
      pu.picked++;
      pu.lastType = o.type;
      applyPower(pu, o.type, cfg);
      got++;
    }
  }
  return got;
}

/** F pressed: ask for a shot on the next step. Returns false (and does nothing) without a bazooka. */
export function requestFire(pu) {
  if (!pu.bazooka) return false;
  pu.fireRequested = true;
  return true;
}

/**
 * Fire the bazooka: destroy every obstacle in the next row, the closest row
 * with a live (not ignored) obstacle that hasn't fully passed the player.
 * Returns how many obstacles were destroyed. With no row ahead nothing
 * happens and the shot is kept. Allocation-free.
 */
export function fireBazooka(pu, sp, playerBox, scroll, cfg, scratchBox) {
  if (!pu.bazooka) return 0;
  let target = -1;
  let targetZ = -Infinity;
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (!o.active || o.ignored) continue;
    const z = scroll - o.s;
    setObstacleBox(scratchBox, o.type, o.lane, z, cfg);
    if (scratchBox.minZ > playerBox.maxZ) continue; // fully behind the player
    if (z > targetZ) {
      targetZ = z;
      target = i;
    }
  }
  if (target < 0) return 0;
  const row = sp.slots[target].row;
  pu.blastMask = 0;
  let n = 0;
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (!o.active || o.row !== row) continue;
    o.active = false;
    sp.active--;
    pu.blastMask |= 1 << o.lane;
    pu.blastS[o.lane] = o.s;
    n++;
  }
  pu.bazooka = false;
  pu.shots++;
  return n;
}

/** Score factor right now: POWERUP_SCORE_MULT while double score is on, else 1. */
export function scoreFactor(pu, cfg) {
  return pu.doubleTime > 0 ? cfg.POWERUP_SCORE_MULT : 1;
}

/** True while phase is on (obstacles can't hit). */
export function phasing(pu) {
  return pu.phaseTime > 0;
}

/**
 * Count the timers down by `h`. Returns true if phase ran out on this step
 * (the caller then ghosts what's just ahead: ghostAhead).
 */
export function tickPowerups(pu, h) {
  if (pu.doubleTime > 0) pu.doubleTime = pu.doubleTime > h ? pu.doubleTime - h : 0;
  if (pu.phaseTime > 0) {
    pu.phaseTime = pu.phaseTime > h ? pu.phaseTime - h : 0;
    if (pu.phaseTime === 0) {
      pu.phaseEnds++;
      return true;
    }
  }
  return false;
}

/**
 * Mark every live obstacle that hasn't passed the player and starts less
 * than `dist` ahead of them as ignored (passed through): the grace window as
 * phase ends. Returns how many were ghosted. Allocation-free.
 */
export function ghostAhead(sp, playerBox, scroll, dist, cfg, scratchBox) {
  let n = 0;
  for (let i = 0; i < sp.slots.length; i++) {
    const o = sp.slots[i];
    if (!o.active || o.ignored) continue;
    setObstacleBox(scratchBox, o.type, o.lane, scroll - o.s, cfg);
    if (scratchBox.minZ > playerBox.maxZ) continue; // already passed
    if (playerBox.minZ - scratchBox.maxZ > dist) continue; // further ahead than the window
    o.ignored = true;
    n++;
  }
  return n;
}
