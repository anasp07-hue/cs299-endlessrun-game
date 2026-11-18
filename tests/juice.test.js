import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRng } from '../js/logic/rng.js';
import { OB } from '../js/logic/collision.js';
import { ACTION, actionForKey } from '../js/logic/input.js';
import { STATE, CMD, commandFor, nextState } from '../js/logic/state.js';
import { SETTINGS_KEY, DEFAULT_SETTINGS, parseSettings, loadSettings, saveSettings } from '../js/logic/settings.js';
import { createPlayer, stepPlayer, requestJump, requestSlide, jumpVelocity, jumpGravity } from '../js/logic/player.js';
import { createRun, stepRun } from '../js/logic/run.js';
import {
  createShake, resetShake, addTrauma, stepShake, shakeOffset, noise1, squashScale, landingStrength, nearMissFlash,
} from '../js/logic/juice.js';
import { createSparks, clearSparks, emitSparks, stepSparks, sparkFade } from '../js/logic/particles.js';

const STEP = CONFIG.SIM_STEP;
const steps = (s) => Math.round(s / STEP);

// --- Settings (mute) -----------------------------------------------------------------

test('parseSettings: defaults for missing/garbage/wrong types; takes a valid muted flag', () => {
  for (const raw of [null, undefined, '', 'abc', '[]', 'null', '42', '{"muted":"yes"}', '{"muted":1}', '{']) {
    assert.deepEqual(parseSettings(raw), { ...DEFAULT_SETTINGS }, String(raw));
  }
  // Phase 8 added `quality`: a Phase 7 save (mute only) still loads, with the default quality.
  assert.deepEqual(parseSettings('{"muted":true}'), { muted: true, quality: 'high' });
  assert.deepEqual(parseSettings('{"muted":false,"junk":9}'), { muted: false, quality: 'high' });
});

test('load/save settings through an injected storage; missing or throwing storage is harmless', () => {
  const mem = new Map();
  const storage = { getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => mem.set(k, v) };
  assert.deepEqual(loadSettings(storage), { muted: false, quality: 'high' });
  assert.equal(saveSettings(storage, { muted: true, quality: 'high' }), true);
  assert.equal(mem.get(SETTINGS_KEY), '{"muted":true,"quality":"high"}');
  assert.deepEqual(loadSettings(storage), { muted: true, quality: 'high' });
  assert.equal(SETTINGS_KEY, 'neonWasteland.settings');
  const broken = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); } };
  assert.deepEqual(loadSettings(broken), { muted: false, quality: 'high' });
  assert.equal(saveSettings(broken, { muted: true }), false);
  assert.deepEqual(loadSettings(null), { muted: false, quality: 'high' });
  assert.equal(saveSettings(null, { muted: true }), false);
  // A fresh object each time: callers can't mutate the defaults.
  const a = loadSettings(null);
  a.muted = true;
  assert.equal(DEFAULT_SETTINGS.muted, false);
});

test('M toggles mute in every state and never changes state', () => {
  assert.equal(actionForKey('KeyM'), ACTION.MUTE);
  for (const s of Object.values(STATE)) {
    assert.equal(commandFor(s, ACTION.MUTE, 99, CONFIG), CMD.MUTE, s);
    assert.equal(nextState(s, CMD.MUTE), null, 'no transition');
  }
});

// --- Event counters ------------------------------------------------------------------

test('player counts jumps, landings (with impact speed) and fresh slides', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  assert.equal(p.jumps, 1);
  for (let i = 0; i < steps(CONFIG.JUMP_TIME + 0.05); i++) stepPlayer(p, STEP, CONFIG);
  assert.equal(p.landings, 1);
  // Recorded at the end of the landing step: at most one step of gravity past the launch speed.
  assert.ok(Math.abs(p.landSpeed - jumpVelocity(CONFIG)) <= jumpGravity(CONFIG) * STEP + 1e-6, `landed at ${p.landSpeed}`);
  requestSlide(p, CONFIG);
  requestSlide(p, CONFIG); // pressing again mid-slide extends it: not a new slide
  assert.equal(p.slides, 1);
  // Buffered jump on landing: one landing AND one jump in the same step.
  for (let i = 0; i < steps(1); i++) stepPlayer(p, STEP, CONFIG);
  requestJump(p, CONFIG);
  for (let i = 0; i < steps(CONFIG.JUMP_TIME - 0.05); i++) stepPlayer(p, STEP, CONFIG);
  requestJump(p, CONFIG); // buffered
  for (let i = 0; i < steps(0.1); i++) stepPlayer(p, STEP, CONFIG);
  assert.equal(p.landings, 2);
  assert.equal(p.jumps, 3);
  // Fast-fall into a slide: a hard landing, then a slide.
  for (let i = 0; i < steps(1); i++) stepPlayer(p, STEP, CONFIG);
  requestJump(p, CONFIG);
  for (let i = 0; i < steps(0.3); i++) stepPlayer(p, STEP, CONFIG);
  requestSlide(p, CONFIG);
  for (let i = 0; i < steps(0.3); i++) stepPlayer(p, STEP, CONFIG);
  assert.equal(p.landings, 4);
  assert.ok(p.landSpeed >= CONFIG.FASTFALL_V - 1e-9, 'fast-fall lands hard');
  assert.equal(p.slides, 2);
});

// --- Near misses ----------------------------------------------------------------------

function quietRun() {
  const run = createRun(CONFIG, 1);
  run.spawner.next.earliest = Infinity;
  return run;
}
function place(run, type, lane, s) {
  const o = run.spawner.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s, row: 1, ignored: false, nearGap: 1e9, nearDone: false });
  run.spawner.active++;
  return o;
}

test('near miss: a jump that only just clears a LOW counts; a comfortable clearance and a hit do not', () => {
  const outcomes = { near: 0, clear: 0, caught: 0 };
  for (let lead = 0.4; lead <= 7; lead += 0.05) {
    const run = quietRun();
    place(run, OB.LOW, 1, 15);
    let minClear = Infinity;
    let jumped = false;
    const reach = (CONFIG.LOW_DEPTH + CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE) / 2;
    while (run.scroll < 15 + 4 && !run.chaser.catching) {
      if (!jumped && 15 - run.scroll <= lead) {
        requestJump(run.player, CONFIG);
        jumped = true;
      }
      stepRun(run, STEP, CONFIG);
      if (Math.abs(run.scroll - 15) < reach) minClear = Math.min(minClear, run.player.y - CONFIG.LOW_HEIGHT);
    }
    if (run.chaser.catching) {
      outcomes.caught++;
      assert.equal(run.nearMisses, 0, 'a hit is never a near miss');
      continue;
    }
    // Independent check: near miss exactly when the feet cleared it by less than the margin.
    const expectNear = minClear > 0 && minClear < CONFIG.NEAR_MISS_MARGIN;
    assert.equal(run.nearMisses, expectNear ? 1 : 0, `lead ${lead.toFixed(2)}: clearance ${minClear.toFixed(3)}`);
    if (expectNear) {
      outcomes.near++;
      assert.equal(run.nearMissType, OB.LOW);
      assert.equal(run.nearMissLane, 1);
    } else outcomes.clear++;
  }
  assert.ok(outcomes.near > 0 && outcomes.clear > 0 && outcomes.caught > 0, JSON.stringify(outcomes));
});

test('near miss: an ordinary slide under a HIGH, or a BLOCK in the next lane, is not one; a side clip is not one', () => {
  const run = quietRun();
  place(run, OB.HIGH, 1, 15);
  place(run, OB.BLOCK, 0, 30);
  while (15 - run.scroll > 3) stepRun(run, STEP, CONFIG);
  requestSlide(run.player, CONFIG);
  while (run.scroll < 36) stepRun(run, STEP, CONFIG);
  assert.equal(run.caught || run.chaser.catching, false);
  assert.equal(run.nearMisses, 0);

  const r2 = quietRun();
  const o = place(r2, OB.BLOCK, 0, 15);
  while (15 - r2.scroll > 0.6) stepRun(r2, STEP, CONFIG);
  queueLaneMoveLeft(r2);
  while (r2.scroll < 20) stepRun(r2, STEP, CONFIG);
  assert.equal(r2.chaser.stumbles, 1);
  assert.equal(o.nearDone, true);
  assert.equal(r2.nearMisses, 0, 'a stumble is not a near miss');
});

import { queueLaneMove } from '../js/logic/player.js';
function queueLaneMoveLeft(run) {
  queueLaneMove(run.player, -1, CONFIG);
}

test('near miss: brushing past a BLOCK while changing lanes counts', () => {
  // Leave lane 1 for lane 2 just as a BLOCK in lane 2 has nearly passed: the box gap across the lane is tiny.
  let found = false;
  for (let lead = -2.2; lead <= -0.8 && !found; lead += 0.02) {
    const run = quietRun();
    place(run, OB.BLOCK, 2, 15);
    while (15 - run.scroll > lead) stepRun(run, STEP, CONFIG);
    queueLaneMove(run.player, 1, CONFIG);
    while (run.scroll < 22) stepRun(run, STEP, CONFIG);
    if (!run.chaser.catching && run.chaser.stumbles === 0 && run.nearMisses === 1) found = run.nearMissType === OB.BLOCK;
  }
  assert.ok(found, 'some late lane change shaves past the BLOCK');
});

// --- Shake, squash, flash ----------------------------------------------------------------

test('shake: trauma clamps at 1, decays to 0, and the offset is bounded and zero at rest', () => {
  const sh = createShake();
  const o = { x: 0, y: 0, roll: 0 };
  shakeOffset(sh, CONFIG, o);
  assert.deepEqual(o, { x: 0, y: 0, roll: 0 });
  addTrauma(sh, 0.7);
  addTrauma(sh, 0.7);
  assert.equal(sh.trauma, 1);
  let maxX = 0;
  for (let i = 0; i < 600; i++) {
    stepShake(sh, 1 / 120, CONFIG);
    shakeOffset(sh, CONFIG, o);
    maxX = Math.max(maxX, Math.abs(o.x));
    assert.ok(Math.abs(o.x) <= CONFIG.SHAKE_MAX_OFFSET + 1e-9 && Math.abs(o.roll) <= CONFIG.SHAKE_MAX_ROLL + 1e-9);
  }
  assert.ok(maxX > CONFIG.SHAKE_MAX_OFFSET * 0.2, 'it actually shakes');
  assert.equal(sh.trauma, 0, `gone after ${1 / CONFIG.SHAKE_DECAY} s`);
  resetShake(sh);
  assert.deepEqual(sh, createShake());
  for (let t = 0; t < 50; t += 0.37) assert.ok(Math.abs(noise1(t, 2)) <= 1);
});

test('landing squash: strongest at touchdown, back to 1 by SQUASH_TIME; strength from impact speed', () => {
  const out = { y: 0, xz: 0 };
  squashScale(0, 1, CONFIG, out);
  assert.ok(Math.abs(out.y - (1 - CONFIG.SQUASH_AMOUNT)) < 1e-12 && out.xz > 1);
  squashScale(CONFIG.SQUASH_TIME, 1, CONFIG, out);
  assert.deepEqual(out, { y: 1, xz: 1 });
  squashScale(0.05, 0, CONFIG, out);
  assert.deepEqual(out, { y: 1, xz: 1 });
  let prev = 0;
  for (let a = 0; a < CONFIG.SQUASH_TIME; a += 0.01) {
    squashScale(a, 1, CONFIG, out);
    assert.ok(out.y >= prev - 1e-12, 'recovers monotonically');
    prev = out.y;
  }
  const v0 = jumpVelocity(CONFIG);
  assert.ok(landingStrength(v0, v0) > 0.4 && landingStrength(v0, v0) < 1);
  assert.equal(landingStrength(CONFIG.FASTFALL_V * 2, v0), 1);
  assert.equal(landingStrength(0, v0), 0);
});

test('near-miss flash: flickers then fades to 0 by NEAR_MISS_FLASH_TIME', () => {
  assert.equal(nearMissFlash(0, CONFIG), CONFIG.NEAR_MISS_FLASH_PEAK);
  assert.ok(nearMissFlash(CONFIG.NEAR_MISS_FLASH_TIME * 0.3, CONFIG) < CONFIG.NEAR_MISS_FLASH_PEAK * 0.5, 'the stutter');
  assert.equal(nearMissFlash(CONFIG.NEAR_MISS_FLASH_TIME, CONFIG), 0);
  assert.equal(nearMissFlash(-1, CONFIG), 0);
  for (let a = 0; a < 1; a += 0.01) assert.ok(nearMissFlash(a, CONFIG) <= CONFIG.NEAR_MISS_FLASH_PEAK);
});

// --- Sparks -------------------------------------------------------------------------------

test('sparks: a fixed pool (oldest overwritten), gravity, scroll, a bounce, and they die', () => {
  const sp = createSparks(16);
  const arrays = [sp.x, sp.y, sp.z, sp.life];
  const rng = createRng(3);
  emitSparks(sp, 0, 1.5, -2, 40, 6, 0.5, 0, rng, CONFIG); // more than the pool holds
  let alive = stepSparks(sp, 0.001, 0, CONFIG);
  assert.equal(alive, 16, 'never more than the pool');
  const vy0 = sp.vy[0];
  const z0 = sp.z[0];
  stepSparks(sp, 0.05, 2, CONFIG);
  assert.ok(sp.vy[0] < vy0, 'gravity');
  assert.ok(sp.z[0] > z0 + 1.9, 'carried along by the world scroll');
  for (let i = 0; i < 200; i++) {
    stepSparks(sp, 0.01, 0, CONFIG);
    for (let k = 0; k < sp.max; k++) assert.ok(sp.y[k] >= 0.02 - 1e-6, 'never through the road');
  }
  alive = stepSparks(sp, 0.01, 0, CONFIG);
  assert.equal(alive, 0, `all dead after ${CONFIG.SPARK_LIFE_MAX} s`);
  assert.equal(sparkFade(sp, 0), 0);
  assert.deepEqual([sp.x, sp.y, sp.z, sp.life], arrays, 'same arrays: no allocation');
  emitSparks(sp, 0, 1, 0, 1, 3, 1, 1, rng, CONFIG);
  const i = (sp.next + sp.max - 1) % sp.max;
  assert.ok(sp.vy[i] > 0 && sparkFade(sp, i) === 1);
  clearSparks(sp);
  assert.equal(stepSparks(sp, 0.01, 0, CONFIG), 0);
});
