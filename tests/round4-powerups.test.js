// Round 4: power-ups (SPEC §3.8, R11–R16; docs/decisions/0004).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRun, resetRun, stepRun } from '../js/logic/run.js';
import { requestJump, requestSlide, queueLaneMove } from '../js/logic/player.js';
import { OB, createBox, overlaps, setPlayerBox } from '../js/logic/collision.js';
import { createPlayer } from '../js/logic/player.js';
import { addScore, shardScore } from '../js/logic/difficulty.js';
import { createSpawner, updateSpawner, GAP_LOG } from '../js/logic/spawner.js';
import { createShards, updateShards } from '../js/logic/shards.js';
import { speedAt } from '../js/logic/difficulty.js';
import { ACTION, actionForKey } from '../js/logic/input.js';
import { STATE, CMD, commandFor } from '../js/logic/state.js';
import {
  POWER, POWER_TYPES, createPowerups, applyPower, setPowerupBox, collectPowerups, powerupClearance,
  requestFire, scoreFactor, phasing,
} from '../js/logic/powerups.js';

const STEP = CONFIG.SIM_STEP;
const DUR = CONFIG.POWERUP_DURATION; // double score (30 s)
const PHASE_DUR = CONFIG.POWERUP_PHASE_DURATION; // phase: 30 s in Round 4, 5 s since Round 5 (R17)

/** A fresh run with nothing on the road: no obstacles, shards or power-ups, and none due for a long time. */
function emptyRun(seed = 4) {
  const run = createRun(CONFIG, seed);
  for (const o of run.spawner.slots) o.active = false;
  run.spawner.active = 0;
  run.spawner.next.earliest = run.spawner.next.latest = 1e9; // never spawn another row
  for (const o of run.shards.slots) o.active = false;
  run.shards.active = 0;
  run.powerups.nextAt = 1e9;
  return run;
}

/** Hand-place an obstacle (a free slot) at track position s in `lane`, as row `row`. */
function place(run, type, lane, s, row = 1) {
  const o = run.spawner.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s, row, ignored: false, nearDone: false });
  run.spawner.active++;
  return o;
}

/** Hand-place a power-up pickup of `type` at track position s in `lane`. */
function placePickup(run, type, lane, s) {
  const o = run.powerups.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s });
  run.powerups.active++;
  return o;
}

function stepUntil(run, scroll) {
  while (run.scroll < scroll && !run.caught) stepRun(run, STEP, CONFIG);
}

function stepFor(run, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !run.caught; i++) stepRun(run, STEP, CONFIG);
}

// --- R11: three power-ups ----------------------------------------------------------------

test('R11: there are exactly three power-ups: bazooka, double score and phase', () => {
  assert.deepEqual([...POWER_TYPES].sort(), [POWER.BAZOOKA, POWER.DOUBLE, POWER.PHASE].sort());
  assert.equal(new Set(POWER_TYPES).size, 3);
  assert.ok(!POWER_TYPES.includes(POWER.NONE));
});

test('R11: a fresh run has no power-up active and no pickups on the road', () => {
  const run = createRun(CONFIG, 9);
  const pu = run.powerups;
  assert.equal(pu.bazooka, false);
  assert.equal(pu.doubleTime, 0);
  assert.equal(pu.phaseTime, 0);
  assert.equal(pu.active, 0);
  assert.equal(scoreFactor(pu, CONFIG), 1);
  assert.equal(phasing(pu), false);
});

test('R11: picking each power-up turns on its effect', () => {
  const pu = createPowerups(CONFIG, 1);
  applyPower(pu, POWER.BAZOOKA, CONFIG);
  assert.equal(pu.bazooka, true);
  applyPower(pu, POWER.DOUBLE, CONFIG);
  assert.equal(pu.doubleTime, DUR);
  assert.equal(scoreFactor(pu, CONFIG), 2);
  applyPower(pu, POWER.PHASE, CONFIG);
  assert.equal(pu.phaseTime, PHASE_DUR);
  assert.equal(phasing(pu), true);
});

// --- R14: picked up off the ground ---------------------------------------------------

test('R14: the pickup box stands on the road (y 0 to POWERUP_HIT_H); standing and sliding reach it', () => {
  const p = createPlayer(CONFIG);
  const pb = createBox();
  const b = setPowerupBox(createBox(), p.lane, 0, CONFIG);
  assert.equal(b.minY, 0, 'on the ground');
  assert.equal(b.maxY, CONFIG.POWERUP_HIT_H);
  assert.ok(CONFIG.POWERUP_HIT_H < CONFIG.JUMP_HEIGHT / 2, 'low enough to jump over');
  assert.ok(overlaps(setPlayerBox(pb, p, CONFIG), b), 'standing');
  p.sliding = true;
  assert.ok(overlaps(setPlayerBox(pb, p, CONFIG), b), 'sliding');
  p.sliding = false;
  p.y = b.maxY + 0.01;
  assert.equal(overlaps(setPlayerBox(pb, p, CONFIG), b), false, 'above it');
  assert.ok(CONFIG.POWERUP_HIT_W < CONFIG.LANE_WIDTH - CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE, 'never reached from the next lane');
});

test('R14: running through a pickup collects it once and turns its effect on', () => {
  for (const type of POWER_TYPES) {
    const run = emptyRun();
    const o = placePickup(run, type, 1, 20);
    stepUntil(run, 25);
    assert.equal(o.active, false, `type ${type}: consumed`);
    assert.equal(run.powerups.picked, 1, `type ${type}: collected once`);
    assert.equal(run.powerups.lastType, type);
  }
  const run = emptyRun();
  placePickup(run, POWER.PHASE, 1, 20);
  stepUntil(run, 25);
  assert.ok(phasing(run.powerups));
});

test('R14: sliding collects a pickup; jumping over it misses it; another lane misses it', () => {
  const slid = emptyRun();
  placePickup(slid, POWER.DOUBLE, 1, 20);
  while (20 - slid.scroll > 2 && !slid.caught) stepRun(slid, STEP, CONFIG);
  requestSlide(slid.player, CONFIG);
  stepUntil(slid, 25);
  assert.equal(slid.powerups.picked, 1);

  const jumped = emptyRun();
  const o = placePickup(jumped, POWER.DOUBLE, 1, 20);
  while (20 - jumped.scroll > jumped.speed * (CONFIG.JUMP_TIME / 2)) stepRun(jumped, STEP, CONFIG);
  requestJump(jumped.player, CONFIG);
  stepUntil(jumped, 25);
  assert.equal(jumped.powerups.picked, 0);
  assert.equal(o.active, true, 'missed, not consumed');
  assert.equal(scoreFactor(jumped.powerups, CONFIG), 1);

  const other = emptyRun();
  placePickup(other, POWER.DOUBLE, 0, 20);
  stepUntil(other, 25);
  assert.equal(other.powerups.picked, 0);
});

test('R14: pickups are recycled once behind the camera', () => {
  const run = emptyRun();
  const o = placePickup(run, POWER.BAZOOKA, 0, 10);
  stepUntil(run, 10 + CONFIG.DESPAWN_Z + 1);
  assert.equal(o.active, false);
  assert.equal(run.powerups.active, 0);
});

// --- R11/R14/R15: placement ----------------------------------------------------------

/** Play a god-mode run for `seconds`, calling `each(run)` after every step. */
function godRun(seed, seconds, each) {
  const run = createRun(CONFIG, seed);
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    stepRun(run, STEP, CONFIG, true);
    each(run);
  }
  return run;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const LONG = 400; // seconds per seed

// One shared pass over SEEDS × LONG seconds; the R11/R14/R15 tests below read it.
const placements = []; // { seed, t, type, lane, s, arrived }: t = placed, arrived = when it reached the player
const violations = [];
for (const seed of SEEDS) {
  let seen = 0;
  godRun(seed, LONG, (run) => {
    const pu = run.powerups;
    // A pickup reaches the player when its centre passes under them (z = 0).
    for (const p of placements) {
      if (p.seed === seed && p.arrived === undefined && run.scroll >= p.s) p.arrived = run.elapsed;
    }
    if (pu.placed === seen) return;
    seen = pu.placed;
    // The newest pickup: the active slot furthest ahead.
    let o = null;
    for (const x of pu.slots) if (x.active && (o === null || x.s > o.s)) o = x;
    placements.push({ seed, t: run.elapsed, type: o.type, lane: o.lane, s: o.s, arrived: undefined });
    const clear = powerupClearance(CONFIG);
    for (const b of run.spawner.slots) {
      if (b.active && Math.abs(b.s - o.s) < clear - 1e-9) violations.push(`seed ${seed}: pickup at ${o.s.toFixed(2)} within ${clear} of an obstacle at ${b.s.toFixed(2)}`);
    }
    const shardClear = (CONFIG.SHARD_HIT_D + CONFIG.POWERUP_HIT_D) / 2;
    for (const sh of run.shards.slots) {
      if (sh.active && sh.lane === o.lane && Math.abs(sh.s - o.s) < shardClear) violations.push(`seed ${seed}: pickup on a shard line at ${o.s.toFixed(2)}`);
    }
    // The next row is only planned when its gap is logged, so check against the
    // gap log: the pickup sits in a logged gap, clear of both rows, in a lane
    // that isn't BLOCKed in the next row.
    const sp = run.spawner;
    let inGap = false;
    for (let k = 0; k < GAP_LOG && k < sp.gaps; k++) {
      const from = sp.gapFrom[k];
      const to = sp.gapTo[k];
      if (o.s < from || o.s > to) continue;
      inGap = true;
      if (o.s < from + clear - 1e-9 || o.s > to - clear + 1e-9) violations.push(`seed ${seed}: pickup too close to a row`);
      if ((sp.gapNextOpen[k] & (1 << o.lane)) === 0) violations.push(`seed ${seed}: pickup in front of a BLOCK`);
    }
    if (!inGap) violations.push(`seed ${seed}: pickup at ${o.s.toFixed(2)} is not in a logged gap`);
  });
}

test('R11/R14: pickups are placed between rows: never on or next to an obstacle, never on a shard, never before a BLOCK', () => {
  assert.ok(placements.length >= SEEDS.length * 4, `${placements.length} placements`);
  assert.deepEqual(violations, []);
});

// R15 as changed by the user (2026-11-19): one reaches the player every 30 s,
// on a fixed clock (30, 60, 90 s…). A pickup can only sit in a gap between
// rows that has room, so each arrives up to SLACK after its slot, never before.
const SLACK = 3;

test('R15: a power-up reaches the player every 30 s (at 30, 60, 90 s…), the first about 30 s into the run', () => {
  assert.equal(CONFIG.POWERUP_FIRST, 30);
  assert.equal(CONFIG.POWERUP_INTERVAL, 30);
  let late = 0;
  let n = 0;
  for (const seed of SEEDS) {
    const ts = placements.filter((p) => p.seed === seed && p.arrived !== undefined).map((p) => p.arrived);
    // Every slot that has come round by the end of the run is filled (the last may still be on its way).
    assert.ok(ts.length >= Math.floor((LONG - SLACK) / CONFIG.POWERUP_INTERVAL) && ts.length <= Math.floor(LONG / CONFIG.POWERUP_INTERVAL), `seed ${seed}: ${ts.length} in ${LONG} s`);
    ts.forEach((t, i) => {
      const slot = CONFIG.POWERUP_FIRST + i * CONFIG.POWERUP_INTERVAL;
      assert.ok(t >= slot - 0.05 && t <= slot + SLACK, `seed ${seed}: pickup ${i + 1} reached the player at ${t.toFixed(2)} s (slot ${slot} s)`);
      late += t - slot;
      n++;
    });
  }
  assert.ok(late / n < 1.5, `on average ${(late / n).toFixed(2)} s after the slot`);
});

test('R15: a pickup is placed far enough ahead to be seen coming (never pops in)', () => {
  for (const p of placements) {
    if (p.arrived === undefined) continue;
    assert.ok(p.arrived - p.t > 3, `seed ${p.seed}: placed only ${(p.arrived - p.t).toFixed(2)} s before it arrived`);
  }
});

test('R15: placement is random: every type and every lane shows up, each type roughly a third of the time', () => {
  for (const type of POWER_TYPES) {
    const share = placements.filter((p) => p.type === type).length / placements.length;
    assert.ok(share > 0.18 && share < 0.5, `type ${type}: ${(share * 100).toFixed(0)}%`);
  }
  for (const lane of [0, 1, 2]) assert.ok(placements.some((p) => p.lane === lane), `lane ${lane}`);
  // Different seeds give different placements (which type, in which lane).
  const pattern = (seed) => placements.filter((p) => p.seed === seed).slice(0, 6).map((p) => `${p.type}${p.lane}`).join(' ');
  assert.ok(new Set(SEEDS.map(pattern)).size > SEEDS.length / 2, 'the type/lane sequence differs between seeds');
});

test('R15: placement is deterministic for a seed (its own seeded RNG)', () => {
  const log = (seed) => {
    const out = [];
    let seen = 0;
    godRun(seed, 150, (run) => {
      if (run.powerups.placed !== seen) {
        seen = run.powerups.placed;
        out.push(run.elapsed);
      }
    });
    return out;
  };
  assert.deepEqual(log(11), log(11));
});

test('R15: power-ups never change the obstacle or shard sequence of a seed', () => {
  for (const seed of [3, 21]) {
    // The run with power-ups (god mode: it collects them, but never fires).
    const run = createRun(CONFIG, seed);
    // The same spawner and shards, driven alone with the same scroll and speed.
    const sp = createSpawner(CONFIG, seed);
    const sh = createShards(CONFIG, seed);
    updateShards(sh, sp, 0, CONFIG);
    let scroll = 0;
    let elapsed = 0;
    let placed = 0;
    for (let i = 0; i < Math.round(200 / STEP); i++) {
      stepRun(run, STEP, CONFIG, true);
      elapsed += STEP;
      const v = speedAt(elapsed, CONFIG);
      scroll += v * STEP;
      updateSpawner(sp, scroll, v, elapsed, CONFIG);
      updateShards(sh, sp, scroll, CONFIG);
      placed = run.powerups.placed;
    }
    assert.ok(placed >= 2, `seed ${seed}: power-ups were placed (${placed})`);
    assert.equal(run.spawner.rows, sp.rows);
    assert.equal(run.spawner.rng.getState(), sp.rng.getState());
    assert.equal(run.shards.rng.getState(), sh.rng.getState());
    assert.equal(run.shards.lines, sh.lines);
    assert.deepEqual(run.spawner.slots.map((o) => [o.active, o.type, o.lane]), sp.slots.map((o) => [o.active, o.type, o.lane]));
  }
});

// --- R12: the bazooka ---------------------------------------------------------------------

test('R12: F is the fire key; it fires only while playing', () => {
  assert.equal(actionForKey('KeyF'), ACTION.FIRE);
  assert.equal(commandFor(STATE.PLAYING, ACTION.FIRE, 0, CONFIG), CMD.FIRE);
  for (const s of [STATE.MENU, STATE.PAUSED, STATE.GAMEOVER, STATE.SHOP]) {
    assert.equal(commandFor(s, ACTION.FIRE, 99, CONFIG), CMD.NONE, s);
  }
});

test('R12: one shot destroys every obstacle in the next row (and only that row), then the bazooka is gone', () => {
  const run = emptyRun();
  const a = place(run, OB.BLOCK, 0, 40, 5);
  const b = place(run, OB.BLOCK, 1, 40.6, 5); // staggered in the same row
  const c = place(run, OB.HIGH, 2, 41, 5);
  const later = place(run, OB.BLOCK, 1, 70, 6);
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  assert.equal(requestFire(run.powerups), true);
  stepRun(run, STEP, CONFIG);
  assert.deepEqual([a.active, b.active, c.active], [false, false, false]);
  assert.equal(later.active, true, 'the row after it is untouched');
  assert.equal(run.spawner.active, 1);
  assert.equal(run.powerups.bazooka, false, 'one shot');
  assert.equal(run.powerups.shots, 1);
  assert.equal(run.powerups.blastMask, 0b111);
  // Running on into where the row was: nothing to hit, until the next row.
  stepUntil(run, 60);
  assert.equal(run.caught, false);
  assert.equal(run.chaser.catching, false);
  // A second press does nothing: no shot left.
  assert.equal(requestFire(run.powerups), false);
  stepRun(run, STEP, CONFIG);
  assert.equal(later.active, true);
});

test('R12: the next row is the closest one that can still hit you; rows already passed are skipped', () => {
  const run = emptyRun();
  stepUntil(run, 30);
  const passed = place(run, OB.BLOCK, 0, run.scroll - 3, 3); // fully behind the player
  const next = place(run, OB.LOW, 0, run.scroll + 20, 4);
  const after = place(run, OB.LOW, 0, run.scroll + 40, 5);
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  requestFire(run.powerups);
  stepRun(run, STEP, CONFIG);
  assert.equal(passed.active, true);
  assert.equal(next.active, false);
  assert.equal(after.active, true);
});

test('R12: firing while running into an obstacle destroys it and saves you', () => {
  const run = emptyRun();
  const o = place(run, OB.BLOCK, 1, 20, 2);
  // Run straight at it until just before contact (it touches at 1.0 + the player's half-depth ≈ 1.38), then fire.
  while (20 - run.scroll > 1.5 && !run.caught) stepRun(run, STEP, CONFIG);
  assert.equal(run.chaser.catching, false, 'not hit yet');
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  requestFire(run.powerups);
  stepUntil(run, 30);
  assert.equal(o.active, false);
  assert.equal(run.caught, false);
  assert.equal(run.chaser.catching, false);
  assert.equal(run.chaser.stumbles, 0);

  const twin = emptyRun(); // the same without the bazooka gets caught
  place(twin, OB.BLOCK, 1, 20, 2);
  stepFor(twin, 5);
  assert.equal(twin.caught, true);
});

test('R12: with no row ahead the shot is kept; without a bazooka F does nothing', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  requestFire(run.powerups);
  stepRun(run, STEP, CONFIG);
  assert.equal(run.powerups.bazooka, true, 'kept');
  assert.equal(run.powerups.shots, 0);

  const none = emptyRun();
  const o = place(none, OB.BLOCK, 0, 30, 2);
  assert.equal(requestFire(none.powerups), false);
  stepRun(none, STEP, CONFIG);
  assert.equal(o.active, true);
  assert.equal(none.powerups.shots, 0);
});

test('R12: a fire request during the catch beat does nothing', () => {
  const run = emptyRun();
  place(run, OB.BLOCK, 1, 15, 2);
  while (!run.chaser.catching && !run.caught) stepRun(run, STEP, CONFIG);
  const o = place(run, OB.BLOCK, 0, run.scroll + 30, 3);
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  requestFire(run.powerups);
  stepFor(run, 1);
  assert.equal(run.caught, true);
  assert.equal(o.active, true);
});

// --- R13: double score lasts 30 s; phase lasted 30 s (5 s since Round 5, R17) ----------------

test('R13: double score doubles distance points, exactly, for 30 s', () => {
  const a = emptyRun();
  const b = emptyRun();
  stepUntil(a, 30);
  stepUntil(b, 30);
  assert.equal(a.score, b.score);
  applyPower(b.powerups, POWER.DOUBLE, CONFIG);
  const a0 = a.score;
  const b0 = b.score;
  stepFor(a, 10);
  stepFor(b, 10);
  assert.ok(Math.abs((b.score - b0) - 2 * (a.score - a0)) < 1e-6, 'twice the points');
  // It runs out at 30 s, and then points are normal again.
  stepFor(b, DUR - 10 - 0.01);
  assert.ok(b.powerups.doubleTime > 0);
  stepFor(b, 0.02);
  assert.equal(b.powerups.doubleTime, 0);
  assert.equal(scoreFactor(b.powerups, CONFIG), 1);
  const before = b.score;
  stepRun(b, STEP, CONFIG);
  assert.ok(Math.abs(b.score - addScore(before, b.speed, STEP, b.scroll, CONFIG)) < 1e-6);
});

test('R13: double score doubles shard points but not the shard count', () => {
  const make = (dbl) => {
    const run = emptyRun();
    Object.assign(run.shards.slots[0], { active: true, lane: 1, s: 20 });
    run.shards.active = 1;
    if (dbl) applyPower(run.powerups, POWER.DOUBLE, CONFIG);
    return run;
  };
  const a = make(false);
  const b = make(true);
  stepUntil(a, 25);
  stepUntil(b, 25);
  assert.equal(a.shardCount, 1);
  assert.equal(b.shardCount, 1, 'the count is not doubled');
  assert.ok(Math.abs(b.score - 2 * a.score) < 1e-6, 'distance and shard points both doubled');
  assert.ok(b.score - 2 * (a.score - shardScore(1, 20, CONFIG)) > shardScore(1, 20, CONFIG) * 1.5);
});

// The course is 10 units per obstacle (was 25) so all of it fits in a 5 s phase at the start speed.
test('R13/R17: phase lets you run straight through every obstacle type while it lasts: no catch, no stumble', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  let s = 8;
  for (const type of [OB.BLOCK, OB.LOW, OB.HIGH, OB.BLOCK]) {
    place(run, type, 1, s, s);
    s += 10;
  }
  // A side clip too: change lanes into a BLOCK.
  place(run, OB.BLOCK, 0, s, s);
  while (s - run.scroll > 0.8 && !run.caught) stepRun(run, STEP, CONFIG);
  queueLaneMove(run.player, -1, CONFIG);
  stepUntil(run, s + 4);
  assert.equal(run.caught, false);
  assert.equal(run.chaser.catching, false);
  assert.equal(run.chaser.stumbles, 0);
  assert.ok(run.elapsed < PHASE_DUR, `all inside the phase (${run.elapsed.toFixed(2)} s)`);
  assert.ok(phasing(run.powerups));
});

test('R13/R17: phase ends when its time is up (5 s), and then obstacles hit again', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  stepFor(run, PHASE_DUR - 0.01);
  assert.ok(phasing(run.powerups));
  stepFor(run, 0.02);
  assert.equal(phasing(run.powerups), false);
  assert.equal(run.powerups.phaseTime, 0);
  place(run, OB.BLOCK, 1, run.scroll + 30, 99);
  stepFor(run, 4);
  assert.equal(run.caught, true, 'solid again');
});

test('R13: as phase ends, anything less than 1 s ahead is passed through; further out is solid', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  stepFor(run, PHASE_DUR - 0.2);
  const v = run.speed;
  // At phase end (0.2 s from now) these are 0.6 s and 2.5 s ahead.
  const near = place(run, OB.BLOCK, 1, run.scroll + v * 0.8, 7);
  const far = place(run, OB.BLOCK, 1, run.scroll + v * 2.7 + 1, 8);
  stepFor(run, 0.3);
  assert.equal(phasing(run.powerups), false);
  assert.equal(near.ignored, true, 'ghosted by the grace window');
  assert.equal(far.ignored, false);
  while (run.scroll - near.s < 3 && !run.caught) stepRun(run, STEP, CONFIG);
  assert.equal(run.caught, false, 'passed through the near one');
  assert.equal(run.chaser.catching, false);
  stepFor(run, 3);
  assert.equal(run.caught, true, 'the far one, 2.5 s out, was dodgeable and is solid');
  assert.equal(CONFIG.POWERUP_PHASE_GRACE, 1);
});

test('R13: timers only count simulated run time (not while paused or during the catch beat)', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.DOUBLE, CONFIG);
  stepFor(run, 1);
  const left = run.powerups.doubleTime;
  assert.ok(Math.abs(left - (DUR - 1)) < 1e-6);
  // Pause: no steps run, so nothing changes. Catch beat: steps run, the world is frozen.
  place(run, OB.BLOCK, 1, run.scroll + 5, 2);
  while (!run.chaser.catching && !run.caught) stepRun(run, STEP, CONFIG);
  const atCatch = run.powerups.doubleTime;
  stepFor(run, 1);
  assert.equal(run.powerups.doubleTime, atCatch);
  assert.equal(CONFIG.POWERUP_DURATION, 30);
});

// --- R16: overlapping, resets, nothing breaks ---------------------------------------------

test('R16: power-ups overlap; picking an active timed one up again resets it to 30 s', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.DOUBLE, CONFIG);
  stepFor(run, 12);
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  const pu = run.powerups;
  assert.ok(pu.doubleTime > 0 && pu.phaseTime > 0 && pu.bazooka, 'all three at once');
  assert.ok(Math.abs(pu.doubleTime - (DUR - 12)) < 1e-6);
  // Pick up double score from the road: back to 30.
  placePickup(run, POWER.DOUBLE, 1, run.scroll + 5);
  stepUntil(run, run.scroll + 8);
  assert.ok(pu.doubleTime > DUR - 0.5, `reset to ${pu.doubleTime.toFixed(2)}`);
  // A second bazooka while holding one: still one shot.
  applyPower(pu, POWER.BAZOOKA, CONFIG);
  assert.equal(pu.bazooka, true);
  place(run, OB.LOW, 0, run.scroll + 20, 3);
  place(run, OB.LOW, 0, run.scroll + 40, 4);
  requestFire(pu);
  stepRun(run, STEP, CONFIG);
  assert.equal(pu.bazooka, false, 'one shot, not two');
  assert.equal(requestFire(pu), false);
});

test('R16: a new run starts with no power-ups (resetRun clears pickups, timers, the bazooka and the RNG)', () => {
  const run = createRun(CONFIG, 5);
  for (let i = 0; i < Math.round(120 / STEP); i++) stepRun(run, STEP, CONFIG, true);
  applyPower(run.powerups, POWER.BAZOOKA, CONFIG);
  applyPower(run.powerups, POWER.DOUBLE, CONFIG);
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  requestFire(run.powerups);
  assert.ok(run.powerups.placed > 0);
  resetRun(run, CONFIG, 77);
  const fresh = createRun(CONFIG, 77);
  assert.deepEqual(JSON.parse(JSON.stringify(run.powerups)), JSON.parse(JSON.stringify(fresh.powerups)));
  assert.equal(run.powerups.rng.getState(), fresh.powerups.rng.getState());
  assert.equal(run.powerups.bazooka, false);
  assert.equal(run.powerups.fireRequested, false);
});

test('R16: god-mode runs with power-ups still play for minutes without errors, and pickups get collected', () => {
  let picked = 0;
  for (const seed of [12, 13]) {
    const run = godRun(seed, 300, () => {});
    picked += run.powerups.picked;
    assert.equal(run.powerups.dropped, 0, 'the pickup pool never runs out');
    assert.ok(Number.isFinite(run.score));
  }
  assert.ok(picked > 0, 'running down the middle picks some up');
});

test('R16: power-ups are run state only: the rules modules never save them', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/logic/powerups.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, ''); // the header comment says "no THREE"
  assert.doesNotMatch(code, /localStorage|sessionStorage|setItem|neonWasteland|document|window|THREE/);
});
