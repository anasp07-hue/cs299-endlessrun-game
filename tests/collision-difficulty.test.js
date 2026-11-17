import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createPlayer, requestJump, requestSlide, stepPlayer, queueLaneMove, jumpVelocity, jumpGravity } from '../js/logic/player.js';
import { OB, createBox, overlaps, setPlayerBox, setObstacleBox } from '../js/logic/collision.js';
import { speedAt, difficultyAt, scoreMultiplier, addScore } from '../js/logic/difficulty.js';

const STEP = CONFIG.SIM_STEP;

function box(minX, maxX, minY, maxY, minZ, maxZ) {
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** Does a player in state `p` hit an obstacle of `type` in `lane` centred at z = 0? */
function hits(p, type, lane = 1) {
  const pb = setPlayerBox(createBox(), p, CONFIG);
  const ob = setObstacleBox(createBox(), type, lane, 0, CONFIG);
  return overlaps(pb, ob);
}

/** Player state at time `t` (s) into a jump from the ground. */
function jumpedFor(t) {
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  for (let i = 0; i < Math.round(t / STEP); i++) stepPlayer(p, STEP, CONFIG);
  return p;
}

// --- AABB basics -----------------------------------------------------------------

test('overlapping boxes collide', () => {
  assert.equal(overlaps(box(0, 2, 0, 2, 0, 2), box(1, 3, 1, 3, 1, 3)), true);
});

test('touching faces do not count as a hit (on every axis)', () => {
  const a = box(0, 1, 0, 1, 0, 1);
  assert.equal(overlaps(a, box(1, 2, 0, 1, 0, 1)), false);
  assert.equal(overlaps(a, box(0, 1, 1, 2, 0, 1)), false);
  assert.equal(overlaps(a, box(0, 1, 0, 1, 1, 2)), false);
});

test('separated on any single axis means no hit', () => {
  const a = box(0, 1, 0, 1, 0, 1);
  assert.equal(overlaps(a, box(5, 6, 0, 1, 0, 1)), false);
  assert.equal(overlaps(a, box(0, 1, 5, 6, 0, 1)), false);
  assert.equal(overlaps(a, box(0, 1, 0, 1, -6, -5)), false);
});

test('player hitbox is HITBOX_SCALE × the visual size, feet at y', () => {
  const p = createPlayer(CONFIG);
  const b = setPlayerBox(createBox(), p, CONFIG);
  assert.ok(Math.abs(b.maxX - b.minX - CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE) < 1e-12);
  assert.ok(Math.abs(b.maxY - CONFIG.PLAYER_HEIGHT * CONFIG.HITBOX_SCALE) < 1e-12);
  assert.equal(b.minY, 0);
});

// --- Each obstacle needs exactly its one action (SPEC §3.4) -------------------------

test('LOW: standing and sliding hit it; a jump clears it at the apex', () => {
  const p = createPlayer(CONFIG);
  assert.equal(hits(p, OB.LOW), true, 'standing');
  requestSlide(p, CONFIG);
  assert.equal(hits(p, OB.LOW), true, 'sliding');
  assert.equal(hits(jumpedFor(CONFIG.JUMP_TIME / 2), OB.LOW), false, 'jump apex');
});

test('LOW: a jump stays above it for a wide window (forgiving timing)', () => {
  // Above LOW_HEIGHT for over 0.5 s of the 0.7 s jump.
  let clear = 0;
  for (let t = 0; t <= CONFIG.JUMP_TIME; t += 0.01) if (!hits(jumpedFor(t), OB.LOW)) clear += 0.01;
  assert.ok(clear > 0.5, `clear for ${clear.toFixed(2)} s`);
});

test('HIGH: standing hits it, jumping hits it, sliding passes under', () => {
  const p = createPlayer(CONFIG);
  assert.equal(hits(p, OB.HIGH), true, 'standing');
  assert.equal(hits(jumpedFor(0.2), OB.HIGH), true, 'jumping');
  assert.equal(hits(jumpedFor(CONFIG.JUMP_TIME / 2), OB.HIGH), true, 'jump apex');
  requestSlide(p, CONFIG);
  assert.equal(hits(p, OB.HIGH), false, 'sliding');
});

test('HIGH: its top is above the jump apex, so a jump can never pass over it', () => {
  const vy0 = jumpVelocity(CONFIG);
  const apex = (vy0 * vy0) / (2 * jumpGravity(CONFIG));
  assert.ok(apex < CONFIG.HIGH_TOP, `apex ${apex} vs HIGH top ${CONFIG.HIGH_TOP}`);
  for (let t = 0; t <= CONFIG.JUMP_TIME; t += 0.01) assert.equal(hits(jumpedFor(t), OB.HIGH), true, `t=${t}`);
});

test('BLOCK: cannot be jumped (apex below its top) or slid under', () => {
  const vy0 = jumpVelocity(CONFIG);
  const apex = (vy0 * vy0) / (2 * jumpGravity(CONFIG));
  assert.ok(apex < CONFIG.BLOCK_HEIGHT, `apex ${apex} vs block ${CONFIG.BLOCK_HEIGHT}`);
  for (let t = 0; t <= CONFIG.JUMP_TIME; t += 0.01) assert.equal(hits(jumpedFor(t), OB.BLOCK), true, `t=${t}`);
  const p = createPlayer(CONFIG);
  requestSlide(p, CONFIG);
  assert.equal(hits(p, OB.BLOCK), true, 'sliding');
});

test('obstacles never touch a player standing in a neighbouring lane', () => {
  const p = createPlayer(CONFIG); // lane 1
  for (const type of [OB.LOW, OB.HIGH, OB.BLOCK]) {
    assert.equal(hits(p, type, 0), false);
    assert.equal(hits(p, type, 2), false);
  }
});

test('changing lanes through an obstacle collides mid-move', () => {
  const p = createPlayer(CONFIG);
  queueLaneMove(p, -1, CONFIG);
  let hitDuringMove = false;
  for (let i = 0; i < 20; i++) {
    stepPlayer(p, STEP, CONFIG);
    if (hits(p, OB.BLOCK, 0)) hitDuringMove = true;
  }
  assert.equal(hitDuringMove, true);
});

test('no tunnelling: one step at max speed moves less than the thinnest obstacle + player depth', () => {
  const perStep = CONFIG.SPEED_MAX * CONFIG.SIM_STEP;
  const thinnest = Math.min(CONFIG.LOW_DEPTH, CONFIG.HIGH_DEPTH, CONFIG.BLOCK_DEPTH);
  assert.ok(perStep < thinnest + CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE);
});

// --- Speed curve, difficulty, scoring (SPEC §3.5, §3.7) -------------------------------

test('speed starts at SPEED_START, rises monotonically, and caps at SPEED_MAX', () => {
  assert.equal(speedAt(0, CONFIG), CONFIG.SPEED_START);
  let last = 0;
  for (let t = 0; t < 600; t += 0.5) {
    const v = speedAt(t, CONFIG);
    assert.ok(v >= last, `dropped at t=${t}`);
    assert.ok(v <= CONFIG.SPEED_MAX);
    last = v;
  }
  assert.equal(speedAt(600, CONFIG), CONFIG.SPEED_MAX);
  assert.equal(speedAt(-5, CONFIG), CONFIG.SPEED_START);
});

test('speed reaches the cap in roughly 3–4 minutes (game-systems skill)', () => {
  const tMax = (CONFIG.SPEED_MAX - CONFIG.SPEED_START) / CONFIG.SPEED_ACCEL;
  assert.ok(tMax >= 180 && tMax <= 240, `reaches max at ${tMax.toFixed(0)} s`);
});

test('difficulty goes 0 → 1 with distance and is clamped', () => {
  assert.equal(difficultyAt(0, CONFIG), 0);
  assert.equal(difficultyAt(CONFIG.DIFFICULTY_DISTANCE / 2, CONFIG), 0.5);
  assert.equal(difficultyAt(CONFIG.DIFFICULTY_DISTANCE * 3, CONFIG), 1);
  assert.equal(difficultyAt(-10, CONFIG), 0);
});

test('score multiplier steps up by 0.1 every 500 units', () => {
  assert.equal(scoreMultiplier(0, CONFIG), 1);
  assert.equal(scoreMultiplier(499, CONFIG), 1);
  assert.ok(Math.abs(scoreMultiplier(500, CONFIG) - 1.1) < 1e-12);
  assert.ok(Math.abs(scoreMultiplier(2600, CONFIG) - 1.5) < 1e-12);
});

test('score = distance at multiplier 1, and grows faster later in a run', () => {
  let score = 0;
  let dist = 0;
  for (let i = 0; i < 120; i++) {
    score = addScore(score, 12, STEP, dist, CONFIG);
    dist += 12 * STEP;
  }
  assert.ok(Math.abs(score - 12) < 1e-9, `1 s at 12 u/s scores ${score}`);
  const early = addScore(0, 20, 1, 0, CONFIG);
  const late = addScore(0, 20, 1, 5000, CONFIG);
  assert.ok(late > early);
});
