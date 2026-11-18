import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { jumpVelocity } from '../js/logic/player.js';
import {
  RIG, POSE_KEYS, createPose, copyPose, blendPose, cycleRate, advancePhase, standPose,
  hackerRun, hackerAir, hackerSlide, agentRun, agentAir, agentSlide, agentReach,
  hitWeight, hitOverlay, headTopY, footY, AGENT_SCALE,
} from '../js/logic/pose.js';
import { createTrail, resetTrail, pushTrail, sampleTrail } from '../js/logic/trail.js';
import { chaserDelaySteps } from '../js/logic/chaser.js';
import { createRun, stepRun } from '../js/logic/run.js';

const PHASES = Array.from({ length: 41 }, (_, i) => i / 40);

function allFinite(p) {
  for (const k of POSE_KEYS) assert.ok(Number.isFinite(p[k]), `${k} = ${p[k]}`);
}

// --- Pose: visuals match the hitbox --------------------------------------------------------

test('RIG: a straight standing rig is exactly PLAYER_HEIGHT tall, legs reach the ground', () => {
  const flat = createPose();
  for (const k of POSE_KEYS) flat[k] = 0;
  flat.hipY = RIG.HIP_HEIGHT;
  assert.ok(Math.abs(headTopY(flat) - CONFIG.PLAYER_HEIGHT) < 1e-9);
  assert.ok(Math.abs(footY(flat, 'L')) < 1e-9);
});

test('Hacker run cycle: about PLAYER_HEIGHT tall all the way through, feet never through the road', () => {
  const p = createPose();
  for (const ph of PHASES) {
    hackerRun(p, ph);
    allFinite(p);
    const h = headTopY(p);
    assert.ok(Math.abs(h - CONFIG.PLAYER_HEIGHT) < 0.15, `phase ${ph}: head top ${h.toFixed(3)}`);
    assert.ok(footY(p, 'L') > -0.03 && footY(p, 'R') > -0.03, `phase ${ph}: feet ${footY(p, 'L')}, ${footY(p, 'R')}`);
  }
});

test('Hacker slide pose fits the slide hitbox height and clears a HIGH obstacle with room to spare', () => {
  const p = hackerSlide(createPose());
  allFinite(p);
  const h = headTopY(p);
  assert.ok(h <= CONFIG.PLAYER_SLIDE_HEIGHT + 0.05, `slide head top ${h.toFixed(3)}`);
  assert.ok(h < CONFIG.HIGH_BOTTOM - 0.2, 'reads clearly as passing under');
  assert.ok(footY(p, 'L') > -0.03 && footY(p, 'R') > -0.03);
});

test('Agent: run cycle and slide also fit (drawn at AGENT_SCALE), and he never clips the road', () => {
  const p = createPose();
  for (const ph of PHASES) {
    agentRun(p, ph);
    allFinite(p);
    assert.ok(footY(p, 'L') > -0.03 && footY(p, 'R') > -0.03, `phase ${ph}`);
    assert.ok(Math.abs(headTopY(p) * AGENT_SCALE - CONFIG.PLAYER_HEIGHT * AGENT_SCALE) < 0.12);
  }
  agentSlide(p);
  assert.ok(headTopY(p) * AGENT_SCALE < CONFIG.HIGH_BOTTOM - 0.15, 'follows the Hacker under a HIGH');
});

test('the Agent is stiffer and more upright than the Hacker', () => {
  const h = createPose();
  const a = createPose();
  let hKnee = 0;
  let aKnee = 0;
  let hThigh = 0;
  let aThigh = 0;
  for (const ph of PHASES) {
    hackerRun(h, ph);
    agentRun(a, ph);
    hKnee = Math.max(hKnee, -h.kneeL);
    aKnee = Math.max(aKnee, -a.kneeL);
    hThigh = Math.max(hThigh, h.thighL);
    aThigh = Math.max(aThigh, a.thighL);
  }
  assert.ok(aKnee < hKnee && aThigh < hThigh);
  assert.ok(Math.abs(a.lean) < Math.abs(h.lean));
  assert.equal(a.elbowL, Math.PI / 2, 'piston arms locked at 90°');
});

test('jump pose tucks the knees hardest at the apex', () => {
  const p = createPose();
  const kneeAt = (rise) => -hackerAir(p, rise).kneeL;
  assert.ok(kneeAt(0) > kneeAt(1) && kneeAt(0) > kneeAt(-1));
  assert.equal(kneeAt(5), kneeAt(1), 'rise is clamped');
  allFinite(hackerAir(p, -3));
  allFinite(agentAir(p));
  allFinite(agentReach(p));
  allFinite(standPose(p));
});

test('run cycle is periodic and its rate rises with speed', () => {
  const a = hackerRun(createPose(), 0);
  const b = hackerRun(createPose(), 1);
  for (const k of POSE_KEYS) assert.ok(Math.abs(a[k] - b[k]) < 1e-9, k);
  assert.ok(cycleRate(CONFIG.SPEED_MAX, CONFIG) > cycleRate(CONFIG.SPEED_START, CONFIG));
  assert.ok(cycleRate(CONFIG.SPEED_START, CONFIG) > 1.5 && cycleRate(CONFIG.SPEED_MAX, CONFIG) < 3.5);
  let ph = 0.9;
  for (let i = 0; i < 1000; i++) {
    ph = advancePhase(ph, 35, 1 / 60, CONFIG);
    assert.ok(ph >= 0 && ph < 1);
  }
  assert.ok(Math.abs(advancePhase(0.25, 12, 0.1, CONFIG) - (0.25 + cycleRate(12, CONFIG) * 0.1)) < 1e-12);
});

test('blendPose: w = 0 keeps, w = 1 copies, 0.5 is halfway; copyPose copies every key', () => {
  const run = hackerRun(createPose(), 0.3);
  const slide = hackerSlide(createPose());
  const out = copyPose(createPose(), run);
  blendPose(out, slide, 0);
  assert.deepEqual(out, run);
  blendPose(out, slide, 0.5);
  for (const k of POSE_KEYS) assert.ok(Math.abs(out[k] - (run[k] + slide[k]) / 2) < 1e-12, k);
  blendPose(out, slide, 1);
  assert.deepEqual(out, slide);
});

test('hit reaction: rises and falls over STUMBLE_ANIM_TIME; held while being caught', () => {
  const T = CONFIG.STUMBLE_ANIM_TIME;
  assert.equal(hitWeight(0, CONFIG, false), 0);
  assert.ok(Math.abs(hitWeight(T / 2, CONFIG, false) - 1) < 1e-12);
  assert.equal(hitWeight(T, CONFIG, false), 0);
  assert.equal(hitWeight(1e6, CONFIG, false), 0);
  assert.equal(hitWeight(1e6, CONFIG, true), 1);
  assert.equal(hitWeight(T * 0.75, CONFIG, true), 1);
  // Knocked in the bounce direction: +1 (right, +X) tips the top toward +X (roll < 0).
  const p = hitOverlay(standPose(createPose()), 1, 1);
  assert.ok(p.roll < 0);
  const q = hitOverlay(standPose(createPose()), 1, -1);
  assert.ok(q.roll > 0);
  const base = standPose(createPose());
  assert.deepEqual(hitOverlay(standPose(createPose()), 0, 1), base, 'w = 0 changes nothing');
});

// --- Trail ---------------------------------------------------------------------------------

test('trail: starts filled with the start position, records, and samples back with interpolation', () => {
  const t = createTrail(8, 1.5);
  const o = { x: 0, y: 0, slide: 0 };
  assert.deepEqual(sampleTrail(t, 7, o), { x: 1.5, y: 0, slide: 0 });
  for (let i = 1; i <= 5; i++) pushTrail(t, i, i * 10, i % 2 === 0);
  assert.deepEqual(sampleTrail(t, 0, o), { x: 5, y: 50, slide: 0 });
  assert.deepEqual(sampleTrail(t, 1, o), { x: 4, y: 40, slide: 1 });
  assert.deepEqual(sampleTrail(t, 0.5, o), { x: 4.5, y: 45, slide: 0.5 });
  assert.deepEqual(sampleTrail(t, 6, o), { x: 1.5, y: 0, slide: 0 }, 'older than recorded: the start');
  assert.deepEqual(sampleTrail(t, -3, o), sampleTrail(t, 0, { x: 0, y: 0, slide: 0 }), 'clamped');
  assert.deepEqual(sampleTrail(t, 99, o), sampleTrail(t, 7, { x: 0, y: 0, slide: 0 }), 'clamped');
});

test('trail: wraps around the ring buffer correctly', () => {
  const t = createTrail(4, 0);
  const o = { x: 0, y: 0, slide: 0 };
  for (let i = 1; i <= 11; i++) pushTrail(t, i, 0, false);
  for (let back = 0; back < 4; back++) assert.equal(sampleTrail(t, back, o).x, 11 - back);
  resetTrail(t, -2);
  assert.equal(sampleTrail(t, 0, o).x, -2);
  assert.equal(sampleTrail(t, 3, o).x, -2);
});

test('the run records the player path every step and the Agent can always look back far enough', () => {
  const run = createRun(CONFIG, 4);
  const o = { x: 0, y: 0, slide: 0 };
  for (let i = 0; i < 30; i++) stepRun(run, CONFIG.SIM_STEP, CONFIG, true);
  assert.equal(sampleTrail(run.trail, 0, o).x, run.player.x);
  assert.equal(o.y, run.player.y);
  // The furthest back the Agent ever looks: normal gap at the slowest speed.
  const worst = chaserDelaySteps(CONFIG.CHASER_GAP_NORMAL, CONFIG.SPEED_START, CONFIG);
  assert.ok(worst < CONFIG.TRAIL_STEPS - 2, `needs ${worst} steps`);
  assert.equal(chaserDelaySteps(3.5, 35, CONFIG), 3.5 / 35 / CONFIG.SIM_STEP);
  assert.equal(chaserDelaySteps(3.5, 0, CONFIG), 0);
});

test('trail: the Agent following the bot path would never stand inside a BLOCK', async () => {
  // Following the path delayed by gap/speed means he is where the player was
  // when that stretch of road was at the player's z. The player was never
  // inside a BLOCK (they survived), so neither is he. Checked directly: replay
  // a stumble run and test the Agent's position against every live BLOCK.
  const { makeBot } = await import('./bot.js');
  const { speedAt } = await import('../js/logic/difficulty.js');
  const { OB, createBox, setObstacleBox, overlaps } = await import('../js/logic/collision.js');
  const run = createRun(CONFIG, 2);
  const bot = makeBot();
  const STEP = CONFIG.SIM_STEP;
  run.chaser.gap = CONFIG.CHASER_GAP_STUMBLE; // keep him close the whole run
  const agent = createBox();
  const ob = createBox();
  const o = { x: 0, y: 0, slide: 0 };
  let checked = 0;
  for (let i = 0; i < 120 * 90 && !run.caught; i++) {
    const elapsed = run.elapsed + STEP;
    const speed = speedAt(elapsed, CONFIG);
    bot(run.player, run.spawner, run.scroll + speed * STEP, speed, elapsed);
    stepRun(run, STEP, CONFIG);
    run.chaser.gap = CONFIG.CHASER_GAP_STUMBLE;
    const gap = run.chaser.gap;
    sampleTrail(run.trail, chaserDelaySteps(gap, run.speed, CONFIG), o);
    const half = (CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE) / 2;
    Object.assign(agent, { minX: o.x - half, maxX: o.x + half, minY: o.y, maxY: o.y + 1.5, minZ: gap - half, maxZ: gap + half });
    for (const s of run.spawner.slots) {
      if (!s.active || s.type !== OB.BLOCK) continue;
      setObstacleBox(ob, s.type, s.lane, run.scroll - s.s, CONFIG);
      assert.ok(!overlaps(agent, ob), `t ${run.elapsed.toFixed(2)}: Agent inside a BLOCK in lane ${s.lane}`);
      checked++;
    }
  }
  assert.equal(run.caught, false);
  assert.ok(checked > 1000);

});
