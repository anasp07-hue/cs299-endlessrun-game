// Data shards: optional pickups between obstacle rows (SPEC §3.7, Phase 8,
// ADR-0016). Pure: no DOM, no THREE.
//
// Placement reads the spawner's gap log (the open stretch between two rows)
// and lays a short line of shards in one lane, centred in the gap and at
// least rowMargin clear of both rows, so a shard never overlaps an obstacle.
// Shards draw from their OWN seeded RNG, so adding them leaves the obstacle
// sequence of every seed unchanged, and they never move or remove obstacles:
// fairness (ADR-0006/0007) is untouched. Collecting them is always optional.
//
// Like obstacles, a shard stores `s` (track position); its z is `scroll - s`.

import { createRng } from './rng.js';
import { overlaps } from './collision.js';
import { laneX } from './world.js';
import { rowMargin, GAP_LOG } from './spawner.js';

/** The shard RNG's seed: derived from the run seed, but a different stream from the spawner's. */
export function shardSeed(seed) {
  return (seed ^ 0x5eed5a) >>> 0;
}

export function createShards(cfg, seed = 0) {
  const slots = [];
  for (let i = 0; i < cfg.MAX_SHARDS; i++) slots.push({ active: false, lane: 0, s: 0 });
  const sh = {
    rng: createRng(shardSeed(seed)),
    slots,
    seen: 0, // spawner gap-log entries already handled
    active: 0,
    lines: 0, // lines placed this run
    dropped: 0, // shards not placed because the pool was full (should stay 0)
  };
  resetShards(sh, cfg, seed);
  return sh;
}

export function resetShards(sh, cfg, seed) {
  sh.rng.reset(shardSeed(seed));
  for (let i = 0; i < sh.slots.length; i++) {
    const o = sh.slots[i];
    o.active = false;
    o.lane = 0;
    o.s = 0;
  }
  sh.seen = 0;
  sh.active = 0;
  sh.lines = 0;
  sh.dropped = 0;
}

/** Clear distance kept between a shard's centre and either row's obstacle centres. */
export function shardClearance(cfg) {
  return rowMargin(cfg) + cfg.SHARD_HIT_D / 2;
}

/** Shards that fit in the open stretch [from, to] (0 if fewer than SHARD_RUN_MIN fit). */
export function shardsThatFit(from, to, cfg) {
  const c = shardClearance(cfg);
  const avail = to - from - 2 * c;
  if (avail < 0) return 0;
  const n = Math.min(cfg.SHARD_RUN_MAX, Math.floor(avail / cfg.SHARD_SPACING + 1e-9) + 1);
  return n >= cfg.SHARD_RUN_MIN ? n : 0;
}

/**
 * Lane for a line: one open (non-BLOCK) in BOTH rows if there is one, so you
 * can stay in it from one row to the next; otherwise one open in the next row.
 */
export function shardLane(prevOpen, nextOpen, rng, laneCount) {
  const both = prevOpen & nextOpen;
  const mask = both !== 0 ? both : nextOpen;
  let count = 0;
  for (let i = 0; i < laneCount; i++) if (mask & (1 << i)) count++;
  const r = rng.next(); // always drawn: a fixed number of draws per gap
  if (count === 0) return laneCount >> 1; // unreachable: every row has an open lane
  let pick = Math.floor(r * count);
  for (let i = 0; i < laneCount; i++) {
    if ((mask & (1 << i)) === 0) continue;
    if (pick === 0) return i;
    pick--;
  }
  return laneCount >> 1;
}

function placeLine(sh, from, to, prevOpen, nextOpen, cfg) {
  // Fixed draws per gap (chance, lane), so the stream doesn't depend on pool state.
  const roll = sh.rng.next();
  const lane = shardLane(prevOpen, nextOpen, sh.rng, cfg.LANE_COUNT);
  if (roll >= cfg.SHARD_RUN_CHANCE) return;
  const n = shardsThatFit(from, to, cfg);
  if (n === 0) return;
  const start = (from + to) / 2 - ((n - 1) * cfg.SHARD_SPACING) / 2;
  sh.lines++;
  let slot = 0;
  for (let k = 0; k < n; k++) {
    while (slot < sh.slots.length && sh.slots[slot].active) slot++;
    if (slot === sh.slots.length) {
      sh.dropped += n - k;
      return;
    }
    const o = sh.slots[slot];
    o.active = true;
    o.lane = lane;
    o.s = start + k * cfg.SHARD_SPACING;
    sh.active++;
  }
}

/**
 * Recycle shards behind the camera and place lines in any gaps the spawner
 * has logged since last time. Call right after updateSpawner. Allocation-free.
 */
export function updateShards(sh, sp, scroll, cfg) {
  for (let i = 0; i < sh.slots.length; i++) {
    const o = sh.slots[i];
    if (o.active && scroll - o.s > cfg.DESPAWN_Z) {
      o.active = false;
      sh.active--;
    }
  }
  if (sp.gaps - sh.seen > GAP_LOG) sh.seen = sp.gaps - GAP_LOG; // overwritten entries are lost (never happens in play)
  while (sh.seen < sp.gaps) {
    const k = sh.seen % GAP_LOG;
    placeLine(sh, sp.gapFrom[k], sp.gapTo[k], sp.gapPrevOpen[k], sp.gapNextOpen[k], cfg);
    sh.seen++;
  }
}

/** Fill `box` with the pickup box of a shard in `lane` at screen depth `z`. */
export function setShardBox(box, lane, z, cfg) {
  const x = laneX(lane, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  box.minX = x - cfg.SHARD_HIT_W / 2;
  box.maxX = x + cfg.SHARD_HIT_W / 2;
  box.minY = cfg.SHARD_Y - cfg.SHARD_HIT_H / 2;
  box.maxY = cfg.SHARD_Y + cfg.SHARD_HIT_H / 2;
  box.minZ = z - cfg.SHARD_HIT_D / 2;
  box.maxZ = z + cfg.SHARD_HIT_D / 2;
  return box;
}

/** Collect every shard touching `playerBox`. Returns how many were collected this step. */
export function collectShards(sh, playerBox, scroll, cfg, scratchBox) {
  const reach = cfg.SHARD_HIT_D / 2 + (playerBox.maxZ - playerBox.minZ) / 2;
  let got = 0;
  for (let i = 0; i < sh.slots.length; i++) {
    const o = sh.slots[i];
    if (!o.active) continue;
    const z = scroll - o.s;
    if (z < -reach || z > reach) continue;
    if (overlaps(playerBox, setShardBox(scratchBox, o.lane, z, cfg))) {
      o.active = false;
      sh.active--;
      got++;
    }
  }
  return got;
}
