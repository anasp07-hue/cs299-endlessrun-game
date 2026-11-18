import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRun, resetRun, stepRun, freezeInterpolation } from '../js/logic/run.js';
import { queueLaneMove, requestJump, requestSlide } from '../js/logic/player.js';

const STEP = CONFIG.SIM_STEP;

/**
 * Everything observable about a run, as plain data (functions dropped, RNG
 * captured by its internal state). Two runs with equal snapshots behave
 * identically from here on.
 */
function snapshot(run) {
  const plain = JSON.parse(JSON.stringify(run));
  plain.spawner.rngState = run.spawner.rng.getState();
  plain.spawner.rngSeed = run.spawner.rng.seed;
  return plain;
}

/** Play until caught (no input), dirtying as much state as possible on the way. */
function playUntilCaught(run, maxSeconds = 120) {
  let t = 0;
  let i = 0;
  while (!run.caught && t < maxSeconds) {
    // Some input mid-run so player state (queue, slide, jump buffer) isn't at rest.
    if (i % 97 === 0) queueLaneMove(run.player, i % 194 === 0 ? 1 : -1, CONFIG);
    if (i % 131 === 0) requestJump(run.player, CONFIG);
    if (i % 173 === 0) requestSlide(run.player, CONFIG);
    stepRun(run, STEP, CONFIG);
    t += STEP;
    i++;
  }
  return t;
}

test('resetRun after a full run gives exactly the state of a fresh run (no leftovers)', () => {
  for (const seed of [1, 42, 9001]) {
    const run = createRun(CONFIG, seed);
    playUntilCaught(run);
    assert.equal(run.caught, true, `seed ${seed}: the no-skill run should get caught`);
    assert.ok(run.score > 0 && run.spawner.rows > 0 && run.elapsed > 0);

    const nextSeed = seed + 1000;
    resetRun(run, CONFIG, nextSeed);
    assert.deepEqual(snapshot(run), snapshot(createRun(CONFIG, nextSeed)), `seed ${seed}`);
  }
});

test('a reset run replays identically to a fresh run with the same seed', () => {
  const a = createRun(CONFIG, 7);
  playUntilCaught(a);
  resetRun(a, CONFIG, 123);
  const b = createRun(CONFIG, 123);
  for (let i = 0; i < 120 * 20; i++) {
    stepRun(a, STEP, CONFIG, true);
    stepRun(b, STEP, CONFIG, true);
  }
  assert.deepEqual(snapshot(a), snapshot(b));
});

test('a fresh run starts at rest: speed SPEED_START, score 0, center lane, no obstacles live', () => {
  const run = createRun(CONFIG, 5);
  assert.equal(run.speed, CONFIG.SPEED_START);
  assert.equal(run.score, 0);
  assert.equal(run.scroll, 0);
  assert.equal(run.elapsed, 0);
  assert.equal(run.caught, false);
  assert.equal(run.hitSlot, -1);
  assert.equal(run.player.lane, 1);
  assert.equal(run.spawner.active, 0);
  assert.equal(run.seed, 5);
});

test('stepRun: caught runs stop simulating and freeze interpolation', () => {
  const run = createRun(CONFIG, 1);
  playUntilCaught(run);
  assert.equal(run.caught, true);
  assert.ok(run.hitSlot >= 0);
  assert.equal(run.prevScroll, run.scroll);
  assert.equal(run.player.prevX, run.player.x);
  assert.equal(run.player.prevY, run.player.y);
  const before = snapshot(run);
  assert.equal(stepRun(run, STEP, CONFIG), -1);
  assert.deepEqual(snapshot(run), before, 'nothing moves after being caught');
});

test('stepRun with god mode reports hits but never ends the run', () => {
  const run = createRun(CONFIG, 1);
  let hits = 0;
  for (let i = 0; i < 120 * 30; i++) if (stepRun(run, STEP, CONFIG, true) >= 0) hits++;
  assert.ok(hits > 0, 'an idle player should overlap something in 30 s');
  assert.equal(run.caught, false);
  assert.ok(run.elapsed > 29.9);
});

test('freezeInterpolation makes prev equal current (pause shows the latest frame, resume has no jump)', () => {
  const run = createRun(CONFIG, 3);
  queueLaneMove(run.player, -1, CONFIG);
  requestJump(run.player, CONFIG);
  for (let i = 0; i < 10; i++) stepRun(run, STEP, CONFIG, true);
  assert.notEqual(run.prevScroll, run.scroll);
  freezeInterpolation(run);
  assert.equal(run.prevScroll, run.scroll);
  assert.equal(run.player.prevX, run.player.x);
  assert.equal(run.player.prevY, run.player.y);
});

test('pausing (not stepping) for any length of time changes nothing', () => {
  // The game simply doesn't call stepRun while PAUSED; this pins that a run's
  // state depends only on how many steps were taken, not on wall-clock time.
  const a = createRun(CONFIG, 11);
  const b = createRun(CONFIG, 11);
  for (let i = 0; i < 600; i++) stepRun(a, STEP, CONFIG, true);
  for (let i = 0; i < 300; i++) stepRun(b, STEP, CONFIG, true);
  freezeInterpolation(b); // pause
  freezeInterpolation(b); // ... long pause, resumed
  for (let i = 0; i < 300; i++) stepRun(b, STEP, CONFIG, true);
  assert.deepEqual(snapshot(a), snapshot(b));
});
