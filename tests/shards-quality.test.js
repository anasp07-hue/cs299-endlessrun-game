// Phase 8: data-shard collectibles and the quality setting (ADR-0016).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRng } from '../js/logic/rng.js';
import { OB, createBox, overlaps, setObstacleBox, setPlayerBox } from '../js/logic/collision.js';
import { createSpawner, updateSpawner, openMask, GAP_LOG } from '../js/logic/spawner.js';
import {
  createShards, updateShards, collectShards, setShardBox, shardsThatFit, shardLane, shardClearance, shardSeed,
} from '../js/logic/shards.js';
import { createRun, resetRun, stepRun } from '../js/logic/run.js';
import { requestJump, requestSlide, createPlayer } from '../js/logic/player.js';
import { shardScore, scoreMultiplier, speedAt } from '../js/logic/difficulty.js';
import { createSparks, emitSparks, stepSparks } from '../js/logic/particles.js';
import {
  QUALITY, DEFAULT_SETTINGS, parseSettings, loadSettings, saveSettings, toggleQuality, qualityProfile,
} from '../js/logic/settings.js';

const STEP = CONFIG.SIM_STEP;

/** Run in god mode (hits ignored) for `seconds`, recording every row and every shard ever placed. */
function recordRun(seed, seconds) {
  const run = createRun(CONFIG, seed);
  const rows = new Map(); // row id → { types, s }
  const shards = new Map(); // `${lane}:${s}` → { lane, s }
  let maxActive = 0;
  for (let t = 0; t < seconds; t += STEP) {
    stepRun(run, STEP, CONFIG, true);
    for (const o of run.spawner.slots) {
      if (!o.active) continue;
      if (!rows.has(o.row)) rows.set(o.row, { types: [OB.NONE, OB.NONE, OB.NONE], s: [NaN, NaN, NaN] });
      const r = rows.get(o.row);
      r.types[o.lane] = o.type;
      r.s[o.lane] = o.s;
    }
    for (const o of run.shards.slots) if (o.active) shards.set(`${o.lane}:${o.s}`, { lane: o.lane, s: o.s });
    if (run.shards.active > maxActive) maxActive = run.shards.active;
  }
  return { run, rows: [...rows.values()], shards: [...shards.values()], maxActive };
}

// --- Placement ------------------------------------------------------------------------

test('shardsThatFit: none in a short gap, a full line in a long one, never more than SHARD_RUN_MAX', () => {
  const c = shardClearance(CONFIG);
  const minLen = 2 * c + (CONFIG.SHARD_RUN_MIN - 1) * CONFIG.SHARD_SPACING;
  assert.equal(shardsThatFit(0, minLen - 0.01, CONFIG), 0);
  assert.equal(shardsThatFit(0, minLen, CONFIG), CONFIG.SHARD_RUN_MIN);
  assert.equal(shardsThatFit(0, 1000, CONFIG), CONFIG.SHARD_RUN_MAX);
  assert.equal(shardsThatFit(10, 5, CONFIG), 0); // backwards gap
});

test('shardLane prefers a lane open in both rows, else one open in the next row', () => {
  const rng = createRng(5);
  for (let i = 0; i < 200; i++) {
    assert.equal(shardLane(0b001, 0b011, rng, 3), 0); // only lane 0 is open in both
    assert.ok([0, 1].includes(shardLane(0b100, 0b011, rng, 3))); // none shared: a next-row open lane
    assert.ok([0, 2].includes(shardLane(0b111, 0b101, rng, 3)));
  }
  // All open lanes of the preferred mask actually get used.
  const seen = new Set();
  for (let i = 0; i < 200; i++) seen.add(shardLane(0b111, 0b111, rng, 3));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('openMask marks the non-BLOCK lanes', () => {
  assert.equal(openMask([OB.BLOCK, OB.NONE, OB.LOW]), 0b110);
  assert.equal(openMask([OB.HIGH, OB.BLOCK, OB.BLOCK]), 0b001);
});

test('no shard ever overlaps an obstacle: each is shardClearance clear of every obstacle (start to max speed)', () => {
  const c = shardClearance(CONFIG);
  const box = createBox();
  const shardBox = createBox();
  for (const seed of [1, 2, 3, 77, 4242]) {
    const { rows, shards, run } = recordRun(seed, 240); // > 3.5 min: reaches SPEED_MAX
    assert.ok(run.speed === CONFIG.SPEED_MAX, `seed ${seed}: reached max speed`);
    assert.ok(shards.length > 100, `seed ${seed}: ${shards.length} shards placed`);
    for (const sh of shards) {
      for (const r of rows) {
        for (let lane = 0; lane < 3; lane++) {
          if (r.types[lane] === OB.NONE) continue;
          const d = Math.abs(sh.s - r.s[lane]);
          assert.ok(d >= c - 1e-9, `seed ${seed}: shard at ${sh.s} is ${d.toFixed(2)} from an obstacle`);
          // And the boxes never touch, at the same depth reference.
          setObstacleBox(box, r.types[lane], lane, 0, CONFIG);
          setShardBox(shardBox, sh.lane, r.s[lane] - sh.s, CONFIG);
          assert.equal(overlaps(box, shardBox), false);
        }
      }
    }
  }
});

test('a shard line sits in a lane that is not BLOCKed in the row after it', () => {
  for (const seed of [8, 9, 10]) {
    const { rows, shards } = recordRun(seed, 120);
    const earliest = rows.map((r) => ({ r, e: Math.min(...r.s.filter((v) => !Number.isNaN(v))) }));
    earliest.sort((a, b) => a.e - b.e);
    for (const sh of shards) {
      const next = earliest.find((x) => x.e > sh.s);
      if (!next) continue; // its row hadn't spawned by the end of the recording
      assert.notEqual(next.r.types[sh.lane], OB.BLOCK, `seed ${seed}: shard at ${sh.s} lane ${sh.lane}`);
    }
  }
});

test('shards never change the obstacle sequence (own RNG stream)', () => {
  const seed = 31337;
  const run = createRun(CONFIG, seed);
  const sp = createSpawner(CONFIG, seed); // no shards attached
  let scroll = 0;
  let t = 0;
  for (let i = 0; i < 12000; i++) {
    stepRun(run, STEP, CONFIG, true);
    t += STEP;
    scroll += speedAt(t, CONFIG) * STEP;
    updateSpawner(sp, scroll, speedAt(t, CONFIG), t, CONFIG);
  }
  assert.equal(run.spawner.rows, sp.rows);
  assert.deepEqual(run.spawner.rng.getState(), sp.rng.getState());
  assert.notEqual(shardSeed(seed), seed);
});

test('the pool never runs dry and lines keep coming (no dropped shards)', () => {
  for (const seed of [11, 12]) {
    const { run, maxActive } = recordRun(seed, 240);
    assert.equal(run.shards.dropped, 0);
    assert.ok(maxActive <= CONFIG.MAX_SHARDS);
    assert.ok(run.shards.lines > 40, `seed ${seed}: ${run.shards.lines} lines`);
    assert.ok(run.spawner.gaps - run.shards.seen === 0, 'every logged gap was handled');
  }
});

test('updateShards skips gap-log entries that were overwritten instead of reading stale ones', () => {
  const sp = createSpawner(CONFIG, 1);
  const sh = createShards(CONFIG, 1);
  sp.gaps += GAP_LOG * 3; // pretend far more gaps were logged than the ring holds
  updateShards(sh, sp, 0, CONFIG);
  assert.equal(sh.seen, sp.gaps);
});

// --- Collection & scoring -------------------------------------------------------------

/** A fresh run with no shards except one placed at track position 20 in lane 1 (the start lane). */
function runWithOneShard(seed = 4) {
  const run = createRun(CONFIG, seed);
  stepRun(run, STEP, CONFIG); // let the first gaps be placed, then clear them
  for (const o of run.shards.slots) o.active = false;
  Object.assign(run.shards.slots[0], { active: true, lane: 1, s: 20 });
  run.shards.active = 1;
  return run;
}

test('running through a shard collects it once and scores SHARD_POINTS × the multiplier', () => {
  const run = runWithOneShard();
  const twin = runWithOneShard(); // identical, minus the shard
  twin.shards.slots[0].active = false;
  twin.shards.active = 0;
  assert.equal(run.player.lane, 1);
  let bonusAt = -1;
  while (run.scroll < 25) {
    stepRun(run, STEP, CONFIG);
    stepRun(twin, STEP, CONFIG);
    if (run.shardCount === 1 && bonusAt < 0) bonusAt = run.scroll;
  }
  assert.equal(run.shardCount, 1);
  assert.equal(twin.shardCount, 0);
  assert.ok(Math.abs(run.score - twin.score - shardScore(1, bonusAt, CONFIG)) < 1e-6);
  assert.equal(run.shards.slots[0].active, false, 'the collected shard is consumed (new lines further ahead may exist)');
  assert.equal(run.shards.active, twin.shards.active, 'same as the twin, which never had this shard');
});

test('sliding collects a shard; jumping over it at the right moment misses it', () => {
  const slid = runWithOneShard();
  while (20 - slid.scroll > 2) stepRun(slid, STEP, CONFIG);
  requestSlide(slid.player, CONFIG);
  while (slid.scroll < 25) stepRun(slid, STEP, CONFIG);
  assert.equal(slid.shardCount, 1, 'slide box (top 0.68) reaches the shard (bottom 0.45)');

  const jumped = runWithOneShard();
  // Jump so the apex is at the shard: half the airtime before reaching it.
  while (20 - jumped.scroll > jumped.speed * (CONFIG.JUMP_TIME / 2)) stepRun(jumped, STEP, CONFIG);
  requestJump(jumped.player, CONFIG);
  while (jumped.scroll < 25) stepRun(jumped, STEP, CONFIG);
  assert.equal(jumped.shardCount, 0);
  assert.equal(jumped.shards.slots[0].active, true, 'missed, not consumed (5 units behind: not yet recycled)');
});

test('a shard in another lane is not collected', () => {
  const run = runWithOneShard();
  run.shards.slots[0].lane = 0;
  while (run.scroll < 25) stepRun(run, STEP, CONFIG);
  assert.equal(run.shardCount, 0);
});

test('collectShards: pickup box matches the documented heights (standing and sliding reach it)', () => {
  const p = createPlayer(CONFIG);
  const pb = createBox();
  const sb = setShardBox(createBox(), p.lane, 0, CONFIG);
  assert.ok(Math.abs(sb.minY - 0.45) < 1e-9 && Math.abs(sb.maxY - 1.25) < 1e-9);
  assert.ok(overlaps(setPlayerBox(pb, p, CONFIG), sb), 'standing');
  p.sliding = true;
  assert.ok(overlaps(setPlayerBox(pb, p, CONFIG), sb), 'sliding');
  p.sliding = false;
  p.y = sb.maxY + 0.01;
  assert.equal(overlaps(setPlayerBox(pb, p, CONFIG), sb), false, 'above it');
  const sh = createShards(CONFIG, 1);
  Object.assign(sh.slots[3], { active: true, lane: p.lane, s: 0 });
  sh.active = 1;
  p.y = 0;
  assert.equal(collectShards(sh, setPlayerBox(pb, p, CONFIG), 0, CONFIG, createBox()), 1);
  assert.equal(collectShards(sh, pb, 0, CONFIG, createBox()), 0, 'only once');
});

test('shardScore scales with the distance multiplier', () => {
  assert.equal(shardScore(1, 0, CONFIG), CONFIG.SHARD_POINTS);
  assert.equal(shardScore(3, 0, CONFIG), 3 * CONFIG.SHARD_POINTS);
  assert.ok(Math.abs(shardScore(2, 1000, CONFIG) - 2 * CONFIG.SHARD_POINTS * 1.2) < 1e-9);
});

test('resetRun clears shards: count, pool, gap cursor, and the shard RNG', () => {
  const { run } = recordRun(21, 60);
  run.shardCount = 9; // also dirty the counter directly
  resetRun(run, CONFIG, 500);
  const fresh = createRun(CONFIG, 500);
  assert.equal(run.shardCount, 0);
  assert.deepEqual(run.shards.rng.getState(), fresh.shards.rng.getState());
  assert.deepEqual(JSON.parse(JSON.stringify(run.shards)), JSON.parse(JSON.stringify(fresh.shards)));
  assert.equal(run.spawner.gaps, fresh.spawner.gaps);
  assert.deepEqual(run.spawner.gapFrom, fresh.spawner.gapFrom);
});

// --- Quality setting --------------------------------------------------------------------

test('quality: default HIGH; LOW and HIGH parse; anything else falls back', () => {
  assert.equal(DEFAULT_SETTINGS.quality, QUALITY.HIGH);
  assert.equal(parseSettings('{"quality":"low"}').quality, QUALITY.LOW);
  assert.equal(parseSettings('{"quality":"high"}').quality, QUALITY.HIGH);
  for (const bad of ['"ultra"', '1', 'true', 'null', '"LOW"']) {
    assert.equal(parseSettings(`{"quality":${bad}}`).quality, QUALITY.HIGH, bad);
  }
  // Mute and quality are independent.
  assert.deepEqual(parseSettings('{"muted":true,"quality":"low"}'), { muted: true, quality: QUALITY.LOW });
});

test('quality: saved and restored; an invalid value is saved as HIGH', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  saveSettings(storage, { muted: false, quality: QUALITY.LOW });
  assert.deepEqual(loadSettings(storage), { muted: false, quality: QUALITY.LOW });
  saveSettings(storage, { muted: false, quality: 'ultra' });
  assert.equal(loadSettings(storage).quality, QUALITY.HIGH);
});

test('toggleQuality flips; qualityProfile: LOW caps resolution and drops particles', () => {
  assert.equal(toggleQuality(QUALITY.HIGH), QUALITY.LOW);
  assert.equal(toggleQuality(QUALITY.LOW), QUALITY.HIGH);
  assert.equal(toggleQuality('junk'), QUALITY.LOW);
  assert.deepEqual(qualityProfile(QUALITY.HIGH, CONFIG), { pixelRatioMax: CONFIG.PIXEL_RATIO_MAX, particles: true });
  assert.deepEqual(qualityProfile(QUALITY.LOW, CONFIG), { pixelRatioMax: CONFIG.PIXEL_RATIO_MAX_LOW, particles: false });
  assert.ok(CONFIG.PIXEL_RATIO_MAX_LOW < CONFIG.PIXEL_RATIO_MAX);
});

// --- Review fixes (pre-commit code review) ----------------------------------------------

test('a shard touched on the step you get caught does not count', () => {
  const box = createBox();
  let sameStep = 0;
  for (let d = -0.15; d <= 0.15 + 1e-9; d += 0.01) {
    const run = runWithOneShard();
    const bs = 30; // a BLOCK in the player's lane: a head-on catch
    const o = run.spawner.slots[run.spawner.slots.length - 1];
    Object.assign(o, { active: true, type: OB.BLOCK, lane: 1, s: bs, row: 0, ignored: false });
    run.spawner.active++;
    // Shard just in front of the block's near face, so both are first touched at about the same step.
    run.shards.slots[0].s = bs - CONFIG.BLOCK_DEPTH / 2 + CONFIG.SHARD_HIT_D / 2 + d;
    while (!run.chaser.catching) stepRun(run, STEP, CONFIG);
    const touching = overlaps(run.playerBox, setShardBox(box, 1, run.scroll - run.shards.slots[0].s, CONFIG));
    if (touching && run.shards.slots[0].active) {
      sameStep++;
      assert.equal(run.shardCount, 0, `offset ${d.toFixed(2)}`);
    }
  }
  assert.ok(sameStep > 0, 'the same-step case was actually exercised');
});

test('the run-up line is placed by resetRun, before the first step (no pop-in)', () => {
  let withLine = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const run = createRun(CONFIG, seed);
    assert.equal(run.shards.seen, run.spawner.gaps, 'the run-up gap is handled at reset');
    if (run.shards.active > 0) {
      withLine++;
      for (const o of run.shards.slots) if (o.active) assert.ok(o.s > 0 && o.s < CONFIG.FIRST_ROW_DISTANCE);
    }
  }
  assert.ok(withLine > 0 && withLine < 20, `${withLine}/20 runs start with a line (SHARD_RUN_CHANCE)`);
});

test('sparks.enabled = false (LOW quality) makes emit and step no-ops', () => {
  const sp = createSparks(16);
  sp.enabled = false;
  emitSparks(sp, 0, 1, 0, 8, 5, 0.5, 0, createRng(1), CONFIG);
  assert.equal(sp.life.every((v) => v === 0), true);
  assert.equal(stepSparks(sp, 0.016, 0, CONFIG), 0);
  sp.enabled = true;
  emitSparks(sp, 0, 1, 0, 8, 5, 0.5, 0, createRng(1), CONFIG);
  assert.equal(stepSparks(sp, 0.016, 0, CONFIG), 8);
});

test('the drawn shard (plus its bob) stays inside its pickup box', () => {
  assert.ok(CONFIG.SHARD_VISUAL_W <= CONFIG.SHARD_HIT_W / 2);
  assert.ok(CONFIG.SHARD_VISUAL_W <= CONFIG.SHARD_HIT_D / 2);
  assert.ok(CONFIG.SHARD_VISUAL_H + CONFIG.SHARD_BOB <= CONFIG.SHARD_HIT_H / 2 + 1e-9);
});
