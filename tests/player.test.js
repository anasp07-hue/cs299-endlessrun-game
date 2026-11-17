import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRng } from '../js/logic/rng.js';
import { laneX } from '../js/logic/world.js';
import {
  createPlayer,
  resetPlayer,
  queueLaneMove,
  requestJump,
  requestSlide,
  stepPlayer,
  playerHeight,
  jumpGravity,
  jumpVelocity,
} from '../js/logic/player.js';

const STEP = CONFIG.SIM_STEP;
const X = (lane) => laneX(lane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT);

/** Step the player for `seconds` of fixed steps. Optional per-step callback. */
function run(p, seconds, cfg = CONFIG, step = STEP, each) {
  const n = Math.round(seconds / step);
  for (let i = 0; i < n; i++) {
    stepPlayer(p, step, cfg);
    if (each) each(p, (i + 1) * step);
  }
}

/** Seconds until the player is grounded again (max 5 s). */
function timeToLand(p, cfg = CONFIG, step = STEP) {
  let t = 0;
  while (!p.grounded && t < 5) {
    stepPlayer(p, step, cfg);
    t += step;
  }
  return t;
}

// --- Setup -------------------------------------------------------------------

test('a new player starts grounded, standing, in the center lane', () => {
  const p = createPlayer(CONFIG);
  assert.equal(p.lane, 1);
  assert.equal(p.x, 0);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
  assert.equal(p.sliding, false);
  assert.equal(playerHeight(p, CONFIG), CONFIG.PLAYER_HEIGHT);
});

test('jump physics are derived from JUMP_HEIGHT and JUMP_TIME (game-systems skill)', () => {
  assert.ok(Math.abs(jumpGravity(CONFIG) - 35.918) < 0.01);
  assert.ok(Math.abs(jumpVelocity(CONFIG) - 12.571) < 0.01);
});

// --- Jump ----------------------------------------------------------------------

test('jump reaches JUMP_HEIGHT at the apex and lands after JUMP_TIME', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  let apex = 0;
  let airtime = 0;
  while (!p.grounded) {
    stepPlayer(p, STEP, CONFIG);
    airtime += STEP;
    if (p.y > apex) apex = p.y;
  }
  assert.ok(Math.abs(apex - CONFIG.JUMP_HEIGHT) < 0.01, `apex ${apex}`);
  assert.ok(Math.abs(airtime - CONFIG.JUMP_TIME) <= STEP + 1e-9, `airtime ${airtime}`);
  assert.equal(p.y, 0);
  assert.equal(p.vy, 0);
});

test('jump airtime is the same at 60, 120, and 240 Hz steps', () => {
  for (const step of [1 / 60, 1 / 120, 1 / 240]) {
    const p = createPlayer(CONFIG);
    requestJump(p, CONFIG);
    const t = timeToLand(p, CONFIG, step);
    assert.ok(Math.abs(t - CONFIG.JUMP_TIME) <= step + 1e-9, `step ${step}: airtime ${t}`);
  }
});

test('no double jump: jumping in the air does not add height', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, 0.2);
  const vyBefore = p.vy;
  requestJump(p, CONFIG);
  assert.equal(p.vy, vyBefore);
  let apex = 0;
  while (!p.grounded) {
    stepPlayer(p, STEP, CONFIG);
    if (p.y > apex) apex = p.y;
  }
  assert.ok(apex < CONFIG.JUMP_HEIGHT + 0.01, `apex ${apex}`);
});

test('jump buffer: a jump pressed just before landing fires on landing', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, CONFIG.JUMP_TIME - 0.08); // 80 ms before touchdown
  assert.equal(p.grounded, false);
  requestJump(p, CONFIG);
  run(p, 0.15); // past the first landing
  assert.equal(p.grounded, false, 'should already be in a second jump');
  assert.ok(p.y > 0);
});

test('jump buffer: a jump pressed too early (before the buffer window) is dropped', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, CONFIG.JUMP_TIME - 0.25); // 250 ms before touchdown > 100 ms buffer
  requestJump(p, CONFIG);
  timeToLand(p);
  run(p, 0.1);
  assert.equal(p.grounded, true);
  assert.equal(p.y, 0);
});

// --- Slide ---------------------------------------------------------------------

test('slide lowers the hitbox for SLIDE_TIME, then stands back up', () => {
  const p = createPlayer(CONFIG);
  requestSlide(p, CONFIG);
  assert.equal(p.sliding, true);
  assert.equal(playerHeight(p, CONFIG), CONFIG.PLAYER_SLIDE_HEIGHT);
  run(p, CONFIG.SLIDE_TIME - 0.05);
  assert.equal(p.sliding, true);
  run(p, 0.05 + STEP);
  assert.equal(p.sliding, false);
  assert.equal(playerHeight(p, CONFIG), CONFIG.PLAYER_HEIGHT);
});

test('slide heights match SPEC: slide (0.8) passes under a HIGH bar from 1.1, standing (1.8) does not', () => {
  assert.ok(CONFIG.PLAYER_SLIDE_HEIGHT < 1.1);
  assert.ok(CONFIG.PLAYER_HEIGHT > 1.1);
});

test('jumping while sliding cancels the slide', () => {
  const p = createPlayer(CONFIG);
  requestSlide(p, CONFIG);
  run(p, 0.2);
  requestJump(p, CONFIG);
  assert.equal(p.sliding, false);
  assert.equal(p.grounded, false);
  assert.equal(playerHeight(p, CONFIG), CONFIG.PLAYER_HEIGHT);
});

test('fast-fall: slide in the air drops fast, then slides on landing', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, CONFIG.JUMP_TIME / 2); // around the apex
  requestSlide(p, CONFIG);
  assert.equal(p.vy, -CONFIG.FASTFALL_V);
  assert.equal(p.sliding, false, 'no slide until touchdown');
  const fall = timeToLand(p);
  assert.ok(fall < 0.15, `fast-fall took ${fall}s (normal fall is ${CONFIG.JUMP_TIME / 2}s)`);
  assert.equal(p.sliding, true);
  assert.ok(Math.abs(p.slideTimer - CONFIG.SLIDE_TIME) <= STEP + 1e-9);
});

test('fast-fall never slows down a fall that is already faster', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, 0.1);
  p.vy = -40;
  requestSlide(p, CONFIG);
  assert.equal(p.vy, -40);
});

test('latest request wins in the air: fast-fall then jump → jumps on landing', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  run(p, 0.5);
  requestSlide(p, CONFIG); // fast-fall, wants a slide on landing
  run(p, 0.02);
  requestJump(p, CONFIG); // changes mind: buffered jump
  // Fast-fall lands within ~0.05 s; the landing step re-launches straight away,
  // so 0.1 s later we should be rising in a new jump, not sliding.
  run(p, 0.1);
  assert.equal(p.sliding, false);
  assert.equal(p.grounded, false);
  assert.ok(p.vy > 0, `expected to be rising, vy ${p.vy}`);
});

// --- Lanes ---------------------------------------------------------------------

test('a lane change takes LANE_CHANGE_TIME and ends exactly on the lane', () => {
  const p = createPlayer(CONFIG);
  assert.equal(queueLaneMove(p, -1, CONFIG), true);
  run(p, CONFIG.LANE_CHANGE_TIME / 2);
  assert.ok(p.x < 0 && p.x > X(0), `midway x ${p.x}`);
  run(p, CONFIG.LANE_CHANGE_TIME / 2 + STEP);
  assert.equal(p.x, X(0));
  assert.equal(p.lane, 0);
  assert.equal(p.moving, false);
  assert.equal(p.fromLane, 0);
});

test('lane motion is monotonic and never overshoots the target lane', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG);
  let last = p.x;
  run(p, 0.3, CONFIG, STEP, (q) => {
    assert.ok(q.x >= last - 1e-12, 'moved backwards');
    assert.ok(q.x <= X(2) + 1e-12, 'overshot');
    last = q.x;
  });
});

test('fromLane is the lane being left during a move (needed for side clips in Phase 4)', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG);
  stepPlayer(p, STEP, CONFIG);
  assert.equal(p.fromLane, 1);
  assert.equal(p.lane, 2);
});

test('queued moves: pressing left twice from the right lane moves two lanes', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG);
  run(p, 0.2);
  assert.equal(p.lane, 2);
  assert.equal(queueLaneMove(p, -1, CONFIG), true);
  assert.equal(queueLaneMove(p, -1, CONFIG), true);
  assert.equal(p.queueLen, 1);
  run(p, 2 * CONFIG.LANE_CHANGE_TIME + 2 * STEP);
  assert.equal(p.lane, 0);
  assert.equal(p.x, X(0));
  assert.equal(p.queueLen, 0);
});

test('moves off the edge of the road are ignored', () => {
  const p = createPlayer(CONFIG);
  assert.equal(queueLaneMove(p, -1, CONFIG), true);
  assert.equal(queueLaneMove(p, -1, CONFIG), false); // would end in lane -1
  run(p, 0.3);
  assert.equal(p.lane, 0);
  assert.equal(queueLaneMove(p, -1, CONFIG), false);
  assert.equal(p.moving, false);
});

test('pressing the opposite way mid-move turns straight back', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG);
  run(p, 0.05);
  assert.equal(queueLaneMove(p, 1, CONFIG), true);
  assert.equal(p.lane, 1);
  assert.equal(p.fromLane, 0);
  assert.equal(p.queueLen, 0);
  run(p, CONFIG.LANE_CHANGE_TIME + STEP);
  assert.equal(p.x, X(1));
  assert.equal(p.moving, false);
});

test('restLane is the last lane actually reached, even after a mid-move reversal', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG); // 1 -> 2
  run(p, 0.05);
  assert.equal(p.restLane, 1, 'still counts as lane 1 until we arrive');
  queueLaneMove(p, -1, CONFIG); // reverse before reaching lane 2
  assert.equal(p.fromLane, 2, 'fromLane = start of the current (reversed) move');
  assert.equal(p.restLane, 1, 'but lane 2 was never reached');
  run(p, 0.2);
  assert.equal(p.restLane, 1);
  queueLaneMove(p, -1, CONFIG); // 1 -> 0, completes
  run(p, 0.2);
  assert.equal(p.restLane, 0);
});

test('pressing opposite to a queued move cancels that queued move', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG);
  run(p, 0.2); // now in lane 2
  queueLaneMove(p, -1, CONFIG); // moving to 1
  queueLaneMove(p, -1, CONFIG); // queued: to 0
  assert.equal(queueLaneMove(p, 1, CONFIG), true); // cancels the queued move
  assert.equal(p.queueLen, 0);
  run(p, 0.5);
  assert.equal(p.lane, 1);
});

test('the queue holds at most LANE_QUEUE_MAX moves (checked on a 5-lane road)', () => {
  const cfg = { ...CONFIG, LANE_COUNT: 5 };
  const p = createPlayer(cfg);
  assert.equal(p.lane, 2);
  resetPlayer(p, cfg);
  // Move to lane 0 first, so 4 rightward moves are all on the road.
  queueLaneMove(p, -1, cfg);
  queueLaneMove(p, -1, cfg);
  run(p, 1, cfg);
  assert.equal(p.lane, 0);
  assert.equal(queueLaneMove(p, 1, cfg), true); // starts now
  assert.equal(queueLaneMove(p, 1, cfg), true); // queued 1
  assert.equal(queueLaneMove(p, 1, cfg), true); // queued 2
  assert.equal(queueLaneMove(p, 1, cfg), false); // queue full
  run(p, 1, cfg);
  assert.equal(p.lane, 3);
});

test('the queue size follows LANE_QUEUE_MAX (3 queued moves on a 7-lane road, FIFO order kept)', () => {
  const cfg = { ...CONFIG, LANE_COUNT: 7, LANE_QUEUE_MAX: 3 };
  const p = createPlayer(cfg);
  assert.equal(p.queue.length, 3);
  for (let i = 0; i < 3; i++) queueLaneMove(p, -1, cfg);
  run(p, 1, cfg);
  assert.equal(p.lane, 0);
  assert.equal(queueLaneMove(p, 1, cfg), true); // starts now
  assert.equal(queueLaneMove(p, 1, cfg), true); // queued 1
  assert.equal(queueLaneMove(p, 1, cfg), true); // queued 2
  assert.equal(queueLaneMove(p, 1, cfg), true); // queued 3
  assert.equal(queueLaneMove(p, 1, cfg), false); // queue full
  assert.equal(p.queueLen, 3);
  run(p, 1, cfg);
  assert.equal(p.lane, 4);
  assert.equal(p.queueLen, 0);
  assert.deepEqual(p.queue, [0, 0, 0]);
});

test('lane changes and jumps work at the same time', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  queueLaneMove(p, 1, CONFIG);
  run(p, CONFIG.LANE_CHANGE_TIME + STEP);
  assert.equal(p.x, X(2));
  assert.equal(p.grounded, false);
});

// --- Interpolation + reset -------------------------------------------------------

test('prevX / prevY hold the previous step for render interpolation', () => {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  queueLaneMove(p, 1, CONFIG);
  stepPlayer(p, STEP, CONFIG);
  const { x, y } = p;
  stepPlayer(p, STEP, CONFIG);
  assert.equal(p.prevX, x);
  assert.equal(p.prevY, y);
});

test('resetPlayer restores every field to a fresh player', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, 1, CONFIG);
  requestJump(p, CONFIG);
  run(p, 0.3);
  requestSlide(p, CONFIG);
  queueLaneMove(p, -1, CONFIG);
  queueLaneMove(p, -1, CONFIG);
  resetPlayer(p, CONFIG);
  assert.deepEqual(p, createPlayer(CONFIG));
});

// --- Fuzz: invariants hold under random input ------------------------------------

test('random input never breaks player invariants (seeded fuzz, 20 s × 10 seeds)', () => {
  for (let seed = 1; seed <= 10; seed++) {
    const rng = createRng(seed);
    const p = createPlayer(CONFIG);
    const steps = Math.round(20 / STEP);
    for (let i = 0; i < steps; i++) {
      if (rng.next() < 0.03) {
        const r = rng.int(4);
        if (r === 0) queueLaneMove(p, -1, CONFIG);
        else if (r === 1) queueLaneMove(p, 1, CONFIG);
        else if (r === 2) requestJump(p, CONFIG);
        else requestSlide(p, CONFIG);
      }
      stepPlayer(p, STEP, CONFIG);
      const ctx = `seed ${seed} step ${i}`;
      assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.vy), ctx);
      assert.ok(p.lane >= 0 && p.lane < CONFIG.LANE_COUNT, `${ctx}: lane ${p.lane}`);
      assert.ok(p.x >= X(0) - 1e-9 && p.x <= X(2) + 1e-9, `${ctx}: x ${p.x}`);
      assert.ok(p.y >= 0 && p.y <= CONFIG.JUMP_HEIGHT + 0.01, `${ctx}: y ${p.y}`);
      assert.ok(p.queueLen >= 0 && p.queueLen <= CONFIG.LANE_QUEUE_MAX, ctx);
      if (!p.moving) assert.equal(p.x, X(p.lane), `${ctx}: resting off-lane`);
      if (!p.moving) assert.equal(p.restLane, p.lane, `${ctx}: restLane not updated`);
      assert.ok(p.restLane >= 0 && p.restLane < CONFIG.LANE_COUNT, ctx);
      if (p.grounded) assert.equal(p.y, 0, ctx);
      if (p.sliding) assert.equal(p.grounded, true, `${ctx}: sliding in the air`);
    }
  }
});
