import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { OB } from '../js/logic/collision.js';
import { speedAt } from '../js/logic/difficulty.js';
import { createPlayer, stepPlayer, queueLaneMove, requestJump, bounceBack } from '../js/logic/player.js';
import {
  HIT, CAUGHT_BY, HIT_AGE_NONE, classifyHit, createChaser, resetChaser, gapTarget, stumble, startCatch, stepChaser,
  catchProgress, agentInView,
} from '../js/logic/chaser.js';
import { createRun, stepRun, acceptsInput } from '../js/logic/run.js';
import { makeBot } from './bot.js';

const STEP = CONFIG.SIM_STEP;
const steps = (seconds) => Math.round(seconds / STEP);

function stepP(p, seconds) {
  for (let i = 0; i < steps(seconds); i++) stepPlayer(p, STEP, CONFIG);
}

// --- Hit classification ------------------------------------------------------------------

test('classifyHit: standing still in a lane, any hit is head-on', () => {
  const p = createPlayer(CONFIG);
  assert.equal(classifyHit(p, 1), HIT.HEAD_ON);
});

test('classifyHit: mid-move, an obstacle in the lane being entered is a side clip', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG); // 1 → 0
  stepP(p, 0.05);
  assert.equal(p.moving, true);
  assert.equal(classifyHit(p, 0), HIT.SIDE_CLIP);
});

test('classifyHit: mid-move, an obstacle in the lane being left is head-on (dodged too late)', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG);
  stepP(p, 0.05);
  assert.equal(classifyHit(p, 1), HIT.HEAD_ON);
});

test('classifyHit: after a mid-move reversal, restLane (not fromLane) decides', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG); // 1 → 0
  stepP(p, 0.04);
  queueLaneMove(p, 1, CONFIG); // turn back toward 1
  assert.equal(p.fromLane, 0, 'fromLane is a lane we never reached');
  assert.equal(p.restLane, 1);
  assert.equal(classifyHit(p, 0), HIT.SIDE_CLIP, 'bumped the lane we were trying');
  assert.equal(classifyHit(p, 1), HIT.HEAD_ON, 'ran back into our own lane');
});

test('classifyHit: on the second lane of a queued two-lane move, the middle lane is the rest lane', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG); // 1 → 2 ... start from lane 2 first
  stepP(p, 0.2);
  assert.equal(p.restLane, 2);
  queueLaneMove(p, -1, CONFIG);
  queueLaneMove(p, -1, CONFIG); // 2 → 1 → 0
  stepP(p, CONFIG.LANE_CHANGE_TIME + 0.03);
  assert.equal(p.moving, true);
  assert.equal(p.restLane, 1);
  assert.equal(classifyHit(p, 0), HIT.SIDE_CLIP);
  assert.equal(classifyHit(p, 1), HIT.HEAD_ON);
});

// --- Bounce back ---------------------------------------------------------------------------

test('bounceBack returns to restLane, drops queued moves, and locks lane input until it arrives', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG);
  queueLaneMove(p, 1, CONFIG); // reverses
  queueLaneMove(p, 1, CONFIG); // queued 1 → 2
  stepP(p, 0.03);
  bounceBack(p, CONFIG);
  assert.equal(p.queueLen, 0);
  assert.equal(p.lane, 1);
  assert.equal(p.bouncing, true);
  assert.equal(queueLaneMove(p, -1, CONFIG), false, 'no steering back through the obstacle');
  requestJump(p, CONFIG);
  assert.equal(p.grounded, false, 'jump still works during the bounce');
  stepP(p, CONFIG.LANE_CHANGE_TIME + 0.02);
  assert.equal(p.moving, false);
  assert.equal(p.bouncing, false);
  assert.equal(p.restLane, 1);
  assert.equal(p.x, 0);
  assert.equal(queueLaneMove(p, -1, CONFIG), true, 'input is back');
});

// --- Stumble window ------------------------------------------------------------------------

test('stumble: the first is a stumble, a second inside STUMBLE_WINDOW is a catch', () => {
  const c = createChaser(CONFIG);
  assert.equal(stumble(c, 1, CONFIG), false);
  for (let i = 0; i < steps(CONFIG.STUMBLE_WINDOW - 0.5); i++) stepChaser(c, STEP, CONFIG);
  assert.equal(stumble(c, -1, CONFIG), true);
  assert.equal(c.stumbles, 2);
});

test('stumble: a second stumble after the window has expired starts a fresh window', () => {
  const c = createChaser(CONFIG);
  stumble(c, 1, CONFIG);
  for (let i = 0; i < steps(CONFIG.STUMBLE_WINDOW + 0.05); i++) stepChaser(c, STEP, CONFIG);
  assert.equal(c.stumbleTimer, 0);
  assert.equal(c.gap, CONFIG.CHASER_GAP_NORMAL, 'the Agent is fully back');
  assert.equal(stumble(c, 1, CONFIG), false);
  assert.equal(c.stumbleTimer, CONFIG.STUMBLE_WINDOW);
});

// --- Chaser gap ----------------------------------------------------------------------------

test('gapTarget: STUMBLE right after a stumble, NORMAL at the end of the window, monotonic between', () => {
  assert.equal(gapTarget(0, CONFIG), CONFIG.CHASER_GAP_NORMAL);
  assert.equal(gapTarget(CONFIG.STUMBLE_WINDOW, CONFIG), CONFIG.CHASER_GAP_STUMBLE);
  let prev = -Infinity;
  for (let t = CONFIG.STUMBLE_WINDOW; t >= 0; t -= 0.05) {
    const g = gapTarget(t, CONFIG);
    assert.ok(g >= prev - 1e-12, `not monotonic at ${t}`);
    prev = g;
  }
});

test('gap: lunges in quickly after a stumble, then recovers monotonically to NORMAL over the window', () => {
  const c = createChaser(CONFIG);
  for (let i = 0; i < 120; i++) stepChaser(c, STEP, CONFIG);
  assert.equal(c.gap, CONFIG.CHASER_GAP_NORMAL, 'stays back with no stumble');

  stumble(c, 1, CONFIG);
  let t = 0;
  let min = Infinity;
  while (c.gap > CONFIG.CHASER_GAP_STUMBLE + 0.05) {
    const before = c.gap;
    stepChaser(c, STEP, CONFIG);
    assert.ok(c.gap < before, 'closing in every step');
    t += STEP;
  }
  assert.ok(t < 0.4, `lunge took ${t.toFixed(2)} s`);
  assert.ok(t > 0.1, 'a lunge, not a teleport');

  let prev = c.gap;
  let reachedNormalAt = -1;
  for (let i = 0; i < steps(CONFIG.STUMBLE_WINDOW + 1); i++) {
    stepChaser(c, STEP, CONFIG);
    t += STEP;
    min = Math.min(min, c.gap);
    assert.ok(c.gap >= prev - 1e-9, `gap went down while recovering at ${t.toFixed(2)} s`);
    if (reachedNormalAt < 0 && c.gap === CONFIG.CHASER_GAP_NORMAL) reachedNormalAt = t;
    prev = c.gap;
  }
  assert.ok(min >= CONFIG.CHASER_GAP_STUMBLE - 1e-9, 'never closer than CHASER_GAP_STUMBLE');
  assert.ok(Math.abs(reachedNormalAt - CONFIG.STUMBLE_WINDOW) < 0.02, `back at ${reachedNormalAt}`);
  // He lingers close for the first part of the window (that's the danger signal).
  assert.ok(gapTarget(CONFIG.STUMBLE_WINDOW - 2, CONFIG) < CONFIG.CHASER_GAP_STUMBLE + 1);
});

test('catch beat: the Agent closes from wherever he is to CATCH_GAP over CATCH_TIME, then reports done', () => {
  for (const from of [CONFIG.CHASER_GAP_NORMAL, 6]) {
    const c = createChaser(CONFIG);
    c.gap = from;
    startCatch(c, true);
    assert.equal(c.catching, true);
    assert.equal(c.hitAge, 0);
    let prev = c.gap;
    let doneAt = -1;
    for (let i = 1; i <= steps(CONFIG.CATCH_TIME + 0.1); i++) {
      const done = stepChaser(c, STEP, CONFIG);
      assert.ok(c.gap <= prev + 1e-12);
      prev = c.gap;
      if (done) {
        doneAt = i * STEP;
        break;
      }
    }
    assert.ok(Math.abs(doneAt - CONFIG.CATCH_TIME) < STEP + 1e-9, `done at ${doneAt}`);
    assert.equal(c.gap, CONFIG.CHASER_CATCH_GAP);
  }
});

test('resetChaser after use equals a fresh chaser', () => {
  const c = createChaser(CONFIG);
  stumble(c, -1, CONFIG);
  for (let i = 0; i < 200; i++) stepChaser(c, STEP, CONFIG);
  startCatch(c, false);
  for (let i = 0; i < 30; i++) stepChaser(c, STEP, CONFIG);
  resetChaser(c, CONFIG);
  assert.deepEqual(c, createChaser(CONFIG));
  assert.equal(c.hitAge, HIT_AGE_NONE);
});

// --- Wired into the run --------------------------------------------------------------------

/** A run whose spawner never spawns its own rows, so only hand-placed obstacles exist. */
function quietRun(seed = 1) {
  const run = createRun(CONFIG, seed);
  run.spawner.next.earliest = Infinity;
  return run;
}

/** Put one obstacle on the track by hand. */
function place(run, type, lane, s) {
  const sp = run.spawner;
  const o = sp.slots.find((x) => !x.active);
  Object.assign(o, { active: true, type, lane, s, row: 9999, ignored: false });
  sp.active++;
  return o;
}

/** Step until the player's centre is `lead` units short of track position `s`, then steer `dir`. */
function steerInto(run, s, lead, dir) {
  while (s - run.scroll > lead) stepRun(run, STEP, CONFIG);
  queueLaneMove(run.player, dir, CONFIG);
}

/** Step the run for `seconds` (stops early once caught). */
function runFor(run, seconds) {
  for (let i = 0; i < steps(seconds) && !run.caught; i++) stepRun(run, STEP, CONFIG);
}

test('side clip in a real run: stumble, bounce back to the rest lane, obstacle ignored, Agent closes in', () => {
  const run = quietRun();
  const o = place(run, OB.BLOCK, 0, 15);
  steerInto(run, 15, 0.6, -1);
  runFor(run, 0.05);
  assert.equal(run.chaser.stumbles, 1);
  assert.equal(o.ignored, true);
  assert.equal(run.chaser.stumbleDir, 1, 'bounced to the right, away from lane 0');
  assert.equal(run.player.bouncing, true);
  assert.equal(run.caught, false);
  assert.equal(run.chaser.catching, false);
  runFor(run, 0.5);
  assert.equal(run.player.lane, 1);
  assert.equal(run.player.x, 0);
  assert.ok(run.chaser.gap < CONFIG.CHASER_GAP_STUMBLE + 0.5, `gap ${run.chaser.gap}`);
  assert.equal(acceptsInput(run), true);
});

test('the clipped obstacle is only ignored during the bounce: steering back into it is a real hit', () => {
  const run = quietRun();
  const o = place(run, OB.BLOCK, 0, 15);
  steerInto(run, 15, 0.6, -1);
  runFor(run, 0.05); // clipped, still mid-bounce
  assert.equal(run.player.bouncing, true);
  assert.equal(o.ignored, true);
  assert.equal(run.clipSlot, run.spawner.slots.indexOf(o));
  while (run.player.bouncing) stepRun(run, STEP, CONFIG);
  stepRun(run, STEP, CONFIG);
  assert.equal(o.ignored, false, 'solid again once back in the rest lane');
  assert.equal(run.clipSlot, -1);
  // Stretch it out (as if BLOCK_DEPTH were longer) and steer back in: caught, no walk-through.
  o.s = run.scroll + 0.5;
  queueLaneMove(run.player, -1, CONFIG);
  runFor(run, 0.1);
  assert.equal(run.chaser.stumbles, 2);
  assert.equal(run.caughtBy, CAUGHT_BY.SECOND_STUMBLE);
});

test('catchProgress runs 0 → 1 over CATCH_TIME; agentInView only in front of the camera', () => {
  const c = createChaser(CONFIG);
  assert.equal(catchProgress(c, CONFIG), 0);
  startCatch(c, true);
  for (let i = 0; i < steps(CONFIG.CATCH_TIME / 2); i++) stepChaser(c, STEP, CONFIG);
  assert.ok(Math.abs(catchProgress(c, CONFIG) - 0.5) < 0.02);
  for (let i = 0; i < steps(CONFIG.CATCH_TIME); i++) stepChaser(c, STEP, CONFIG);
  assert.equal(catchProgress(c, CONFIG), 1);
  assert.equal(agentInView(CONFIG.CHASER_GAP_NORMAL, CONFIG), false, 'normally off-screen behind the camera');
  assert.equal(agentInView(CONFIG.CHASER_GAP_STUMBLE, CONFIG), true, 'visible after a stumble');
  assert.equal(agentInView(CONFIG.CHASER_CATCH_GAP, CONFIG), true);
});

test('second side clip inside the window: catch beat, then caught by SECOND_STUMBLE', () => {
  const run = quietRun();
  place(run, OB.BLOCK, 0, 15);
  place(run, OB.BLOCK, 2, 40);
  steerInto(run, 15, 0.6, -1);
  runFor(run, 0.5);
  assert.equal(run.chaser.stumbles, 1);
  steerInto(run, 40, 0.6, 1);
  runFor(run, 0.05);
  assert.equal(run.chaser.catching, true);
  assert.equal(run.caught, false, 'not over until the beat ends');
  assert.equal(run.caughtBy, CAUGHT_BY.SECOND_STUMBLE);
  assert.equal(run.spawner.slots[run.hitSlot].lane, 2);
  runFor(run, CONFIG.CATCH_TIME + 0.05);
  assert.equal(run.caught, true);
  assert.equal(run.chaser.gap, CONFIG.CHASER_CATCH_GAP);
});

test('a side clip after the window has closed is just another stumble', () => {
  const run = quietRun();
  place(run, OB.BLOCK, 0, 15);
  const sLater = 15 + CONFIG.SPEED_START * (CONFIG.STUMBLE_WINDOW + 1.5); // ~9.5 s later
  place(run, OB.BLOCK, 2, sLater);
  steerInto(run, 15, 0.6, -1);
  runFor(run, 0.5);
  assert.equal(run.chaser.stumbles, 1);
  steerInto(run, sLater, 0.6, 1);
  assert.equal(run.chaser.stumbleTimer, 0);
  runFor(run, 0.05);
  assert.equal(run.chaser.stumbles, 2);
  assert.equal(run.chaser.catching, false);
  assert.equal(run.caught, false);
});

test('head-on hit: a catch beat with the world frozen and input ignored, then caught by HEAD_ON', () => {
  const run = quietRun();
  place(run, OB.BLOCK, 1, 15);
  while (!run.chaser.catching) stepRun(run, STEP, CONFIG);
  assert.equal(run.caughtBy, CAUGHT_BY.HEAD_ON);
  assert.equal(run.chaser.stumbles, 0);
  assert.equal(run.caught, false);
  assert.equal(acceptsInput(run), false);
  const scroll = run.scroll;
  const score = run.score;
  const x = run.player.x;
  let beatSteps = 0;
  while (!run.caught) {
    stepRun(run, STEP, CONFIG);
    beatSteps++;
    assert.equal(run.scroll, scroll, 'world frozen');
    assert.equal(run.prevScroll, scroll);
    assert.equal(run.score, score);
    assert.equal(run.player.x, x);
  }
  assert.ok(Math.abs(beatSteps * STEP - CONFIG.CATCH_TIME) <= STEP + 1e-9);
  assert.equal(run.chaser.gap, CONFIG.CHASER_CATCH_GAP);
  assert.equal(run.chaser.prevGap, run.chaser.gap, 'frozen for render interpolation');
});

test('a side clip that also overlaps a head-on obstacle in the same step is still a catch', () => {
  const run = quietRun();
  place(run, OB.BLOCK, 0, 15);
  place(run, OB.BLOCK, 1, 15.5); // our own lane: we're dodging too late
  steerInto(run, 15, 1.9, -1);
  runFor(run, 0.3);
  assert.equal(run.caughtBy, CAUGHT_BY.HEAD_ON);
});

test('god mode: hits are reported but nothing stumbles or catches', () => {
  const run = quietRun();
  place(run, OB.BLOCK, 0, 15);
  let hits = 0;
  while (15 - run.scroll > 0.6) stepRun(run, STEP, CONFIG, true);
  queueLaneMove(run.player, -1, CONFIG);
  for (let i = 0; i < 60; i++) if (stepRun(run, STEP, CONFIG, true) >= 0) hits++;
  assert.ok(hits > 0);
  assert.equal(run.chaser.stumbles, 0);
  assert.equal(run.chaser.catching, false);
});

// --- Fairness: a bounce never leaves you in a dead end ---------------------------------------

/**
 * The survival bot from spawner.test.js, driven through stepRun (the real
 * game step). Once, after `clipAfter` seconds, it deliberately steps into the
 * side of a BLOCK in a neighbouring lane while its own lane is clear for the
 * next second, the way a player who mistimes a dodge would. It must then get
 * bounced back and carry on surviving the rest of the run.
 */
function playClipRun(seed, seconds, clipAfter) {
  const run = createRun(CONFIG, seed);
  // No power-ups (Round 4) in these runs: this tests the stumble and bounce,
  // and a phase pickup would pass the deliberate clip straight through.
  // Obstacles are unchanged (power-ups use their own RNG). Phasing through a
  // clip is tested in round4-powerups.test.js.
  run.powerups.nextAt = Infinity;
  const bot = makeBot();
  const p = run.player;
  const sp = run.spawner;
  let clipped = false;
  let minGapAfterClip = Infinity;
  for (let i = 0; i < steps(seconds) && !run.caught && !run.chaser.catching; i++) {
    // The values stepRun is about to use, so the bot sees what playRun gave it.
    const elapsed = run.elapsed + STEP;
    const speed = speedAt(elapsed, CONFIG);
    const scroll = run.scroll + speed * STEP;

    if (!clipped && elapsed >= clipAfter && !p.moving && p.grounded && !p.sliding) {
      let ownLaneClear = true;
      let target = null;
      for (const o of sp.slots) {
        if (!o.active) continue;
        const ahead = o.s - scroll;
        if (o.lane === p.lane && ahead > -2 && ahead < speed * 1.0) ownLaneClear = false;
        if (o.type === OB.BLOCK && Math.abs(o.lane - p.lane) === 1 && ahead > -0.3 && ahead <= 0.6) target = o;
      }
      if (ownLaneClear && target) {
        queueLaneMove(p, target.lane > p.lane ? 1 : -1, CONFIG);
        clipped = elapsed;
      }
    }
    if (!clipped || p.restLane === p.lane) bot(p, sp, scroll, speed, elapsed);
    stepRun(run, STEP, CONFIG);
    if (clipped) minGapAfterClip = Math.min(minGapAfterClip, run.chaser.gap);
  }
  return { run, clipped, minGapAfterClip };
}

test('fairness: after one deliberate side clip, the bot is bounced back and survives 4-minute runs on 18 seeds', () => {
  // Clips from ~25 s (difficulty ramping) to past 200 s (max speed, max difficulty).
  const cases = [];
  for (let seed = 1; seed <= 12; seed++) cases.push([seed, 20 + seed * 5]);
  for (let seed = 13; seed <= 18; seed++) cases.push([seed, 200 + (seed - 12) * 3]);
  for (const [seed, clipAfter] of cases) {
    const { run, clipped, minGapAfterClip } = playClipRun(seed, 240, clipAfter);
    assert.ok(clipped, `seed ${seed}: never found a block to clip`);
    assert.equal(run.chaser.stumbles, 1, `seed ${seed}: clipped ${run.chaser.stumbles} times`);
    const o = run.spawner.slots[run.hitSlot];
    assert.equal(
      run.caughtBy,
      CAUGHT_BY.NONE,
      `seed ${seed}: clipped at ${clipped.toFixed(2)} s, then caught at ${run.elapsed.toFixed(2)} s by ` +
        `${o ? ['', 'LOW', 'HIGH', 'BLOCK'][o.type] : '?'} in lane ${o ? o.lane : '?'} (player lane ${run.player.lane})`,
    );
    // The window clock runs during the ~0.3 s lunge, so he arrives a hair past STUMBLE.
    assert.ok(minGapAfterClip < CONFIG.CHASER_GAP_STUMBLE + 0.1, `the Agent came close (${minGapAfterClip})`);
    assert.equal(run.chaser.gap, CONFIG.CHASER_GAP_NORMAL, 'and dropped back afterwards');
    assert.ok(run.elapsed > 239.9);
  }
});
