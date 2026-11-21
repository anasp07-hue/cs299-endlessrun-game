// Round 5: power-up balance (SPEC §3.8, R17–R18; docs/decisions/0008).
// R17: phase lasts 5 s (double score stays 30 s, the 1 s grace stays).
// R18: a pickup is never the same type as the one placed before it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRun, resetRun, stepRun } from '../js/logic/run.js';
import { OB } from '../js/logic/collision.js';
import { POWER, POWER_TYPES, createPowerups, applyPower, phasing, scoreFactor } from '../js/logic/powerups.js';

const STEP = CONFIG.SIM_STEP;
const PHASE = CONFIG.POWERUP_PHASE_DURATION;

/** A fresh run with nothing on the road and nothing due (as in round4-powerups.test.js). */
function emptyRun(seed = 4) {
  const run = createRun(CONFIG, seed);
  for (const o of run.spawner.slots) o.active = false;
  run.spawner.active = 0;
  run.spawner.next.earliest = run.spawner.next.latest = 1e9;
  for (const o of run.shards.slots) o.active = false;
  run.shards.active = 0;
  run.powerups.nextAt = 1e9;
  return run;
}

function place(run, type, lane, s, row = 1) {
  const o = run.spawner.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s, row, ignored: false, nearDone: false });
  run.spawner.active++;
  return o;
}

function placePickup(run, type, lane, s) {
  const o = run.powerups.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s });
  run.powerups.active++;
  return o;
}

function stepFor(run, seconds) {
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n && !run.caught; i++) stepRun(run, STEP, CONFIG);
}

function stepUntil(run, scroll) {
  while (run.scroll < scroll && !run.caught) stepRun(run, STEP, CONFIG);
}

// --- R17: phase lasts 5 s -------------------------------------------------------------

test('R17: phase lasts 5 s; double score still lasts 30 s', () => {
  assert.equal(CONFIG.POWERUP_PHASE_DURATION, 5);
  assert.equal(CONFIG.POWERUP_DURATION, 30, 'double score unchanged');
  const pu = createPowerups(CONFIG, 1);
  applyPower(pu, POWER.PHASE, CONFIG);
  assert.equal(pu.phaseTime, 5);
  applyPower(pu, POWER.DOUBLE, CONFIG);
  assert.equal(pu.doubleTime, 30);
});

test('R17: a phase picked up off the road ends after 5 s, and then obstacles hit again', () => {
  const run = emptyRun();
  placePickup(run, POWER.PHASE, 1, 10);
  while (run.powerups.picked === 0 && run.scroll < 12) stepRun(run, STEP, CONFIG);
  assert.ok(phasing(run.powerups), 'picked up');
  const t0 = run.elapsed;
  assert.ok(Math.abs(run.powerups.phaseTime - PHASE) < 0.02, `${run.powerups.phaseTime} s at pickup`);
  // Something to pass through while phasing.
  place(run, OB.BLOCK, 1, run.scroll + 20, 3);
  while (phasing(run.powerups) && !run.caught) stepRun(run, STEP, CONFIG);
  assert.equal(run.caught, false, 'passed through while phasing');
  assert.ok(Math.abs(run.elapsed - t0 - PHASE) < 0.1, `phase lasted ${(run.elapsed - t0).toFixed(2)} s`);
  // Well after the grace window, obstacles are solid.
  place(run, OB.BLOCK, 1, run.scroll + 40, 4);
  stepFor(run, 6);
  assert.equal(run.caught, true, 'solid again after 5 s');
});

test('R17: double score picked up together with phase keeps going after phase ends', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.DOUBLE, CONFIG);
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  stepFor(run, PHASE + 0.5);
  assert.equal(phasing(run.powerups), false);
  assert.equal(scoreFactor(run.powerups, CONFIG), 2, 'still doubling');
  assert.ok(Math.abs(run.powerups.doubleTime - (30 - PHASE - 0.5)) < 1e-6);
});

test('R17: the 1 s grace still applies when a 5 s phase ends', () => {
  const run = emptyRun();
  applyPower(run.powerups, POWER.PHASE, CONFIG);
  stepFor(run, PHASE - 0.2);
  const v = run.speed;
  const near = place(run, OB.BLOCK, 1, run.scroll + v * 0.8, 7); // 0.6 s ahead when phase ends
  const far = place(run, OB.BLOCK, 1, run.scroll + v * 2.7 + 1, 8); // 2.5 s ahead: dodgeable
  stepFor(run, 0.3);
  assert.equal(phasing(run.powerups), false);
  assert.equal(near.ignored, true);
  assert.equal(far.ignored, false);
  while (run.scroll - near.s < 3 && !run.caught) stepRun(run, STEP, CONFIG);
  assert.equal(run.caught, false, 'passed through the near one');
  stepFor(run, 3);
  assert.equal(run.caught, true, 'the far one is solid');
});

// --- R18: never the same type twice in a row --------------------------------------------

/** The types placed in a god-mode run of `seconds`, in placement order. */
function placedTypes(seed, seconds, run = createRun(CONFIG, seed)) {
  const out = [];
  let seen = run.powerups.placed;
  const n = Math.round(seconds / STEP);
  for (let i = 0; i < n; i++) {
    stepRun(run, STEP, CONFIG, true);
    const pu = run.powerups;
    if (pu.placed === seen) continue;
    seen = pu.placed;
    let o = null;
    for (const x of pu.slots) if (x.active && (o === null || x.s > o.s)) o = x;
    out.push(o.type);
    assert.equal(pu.lastPlaced, o.type, 'lastPlaced tracks the newest pickup');
  }
  return out;
}

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const SEQS = SEEDS.map((seed) => placedTypes(seed, 400));

test('R18: on every seed, no two pickups in a row have the same type', () => {
  for (let i = 0; i < SEEDS.length; i++) {
    const seq = SEQS[i];
    assert.ok(seq.length >= 12, `seed ${SEEDS[i]}: ${seq.length} pickups`);
    for (let k = 1; k < seq.length; k++) {
      assert.notEqual(seq[k], seq[k - 1], `seed ${SEEDS[i]}: pickups ${k} and ${k + 1} are both type ${seq[k]}`);
    }
  }
});

test('R18: it holds for missed pickups too (placement never looks at what was picked up)', () => {
  // A god-mode run that never steers stays in the middle lane, so pickups in the side lanes are missed.
  const run = createRun(CONFIG, 3);
  const types = [];
  let seen = 0;
  for (let i = 0; i < Math.round(200 / STEP); i++) {
    stepRun(run, STEP, CONFIG, true);
    const pu = run.powerups;
    if (pu.placed !== seen) {
      seen = pu.placed;
      types.push(pu.lastPlaced);
    }
  }
  const missed = run.powerups.placed - run.powerups.picked;
  assert.ok(missed > 0, 'some pickups were missed');
  for (let k = 1; k < types.length; k++) assert.notEqual(types[k], types[k - 1]);
});

test('R18: after a pickup, the next is one of the other two types, about 50/50', () => {
  const counts = { [POWER.BAZOOKA]: {}, [POWER.DOUBLE]: {}, [POWER.PHASE]: {} };
  for (const seq of SEQS) {
    for (let k = 1; k < seq.length; k++) {
      const c = counts[seq[k - 1]];
      c[seq[k]] = (c[seq[k]] || 0) + 1;
    }
  }
  for (const prev of POWER_TYPES) {
    const others = POWER_TYPES.filter((t) => t !== prev);
    const a = counts[prev][others[0]] || 0;
    const b = counts[prev][others[1]] || 0;
    assert.equal(counts[prev][prev] || 0, 0);
    const share = a / (a + b);
    assert.ok(a + b >= 20, `after type ${prev}: ${a + b} follow-ups`);
    assert.ok(share > 0.25 && share < 0.75, `after type ${prev}: ${a} vs ${b}`);
  }
});

test('R18: each type is still about a third of all pickups, and the first of a run can be any type', () => {
  const all = SEQS.flat();
  for (const type of POWER_TYPES) {
    const share = all.filter((t) => t === type).length / all.length;
    assert.ok(share > 0.22 && share < 0.45, `type ${type}: ${(share * 100).toFixed(0)}%`);
  }
  const firsts = new Set();
  for (let seed = 1; seed <= 40 && firsts.size < 3; seed++) firsts.add(placedTypes(seed, 40)[0]);
  assert.equal(firsts.size, 3, 'the first pickup of a run is drawn from all three');
});

test('R18: a new run forgets the previous run\'s last pickup', () => {
  const run = createRun(CONFIG, 5);
  placedTypes(5, 100, run);
  assert.notEqual(run.powerups.lastPlaced, POWER.NONE);
  resetRun(run, CONFIG, 5);
  assert.equal(run.powerups.lastPlaced, POWER.NONE);
  assert.deepEqual(placedTypes(5, 100, run), placedTypes(5, 100), 'same as a fresh run of that seed');
});

test('R18: placement is still deterministic per seed, and obstacles and shards are unchanged', () => {
  assert.deepEqual(placedTypes(7, 200), placedTypes(7, 200));
  const a = createRun(CONFIG, 7);
  const b = createRun(CONFIG, 7);
  b.powerups.nextAt = Infinity; // no power-ups at all
  for (let i = 0; i < Math.round(200 / STEP); i++) {
    stepRun(a, STEP, CONFIG, true);
    stepRun(b, STEP, CONFIG, true);
  }
  assert.equal(a.spawner.rng.getState(), b.spawner.rng.getState());
  assert.equal(a.shards.rng.getState(), b.shards.rng.getState());
  assert.equal(a.spawner.rows, b.spawner.rows);
});
