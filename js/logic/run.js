// One run's simulation state, its full reset, and its fixed step (SPEC §4, §7.1).
// Pure: no DOM, no THREE. game.js keeps a single run object for the whole
// session and calls resetRun() on every Play / Play Again / Restart, so there
// is exactly one place that knows the start-of-run value of everything.
// RULE: any new per-run state is added to resetRun() here, and the "reset
// equals fresh" test covers it.

import { createPlayer, resetPlayer, stepPlayer, bounceBack } from './player.js';
import {
  HIT, CAUGHT_BY, classifyHit, createChaser, resetChaser, stumble, startCatch, stepChaser,
} from './chaser.js';
import { createSpawner, resetSpawner, updateSpawner, findHit } from './spawner.js';
import { createBox, setPlayerBox } from './collision.js';
import { trackNearMisses } from './spawner.js';
import { createTrail, resetTrail, pushTrail } from './trail.js';
import { speedAt, addScore } from './difficulty.js';

export function createRun(cfg, seed = 0) {
  const run = {
    seed: 0,
    elapsed: 0, // seconds of simulated run time (drives the speed ramp)
    speed: 0,
    scroll: 0, // total distance the world has moved (single shared offset)
    prevScroll: 0,
    score: 0,
    caught: false, // the run is over (set when the catch beat finishes)
    caughtBy: CAUGHT_BY.NONE,
    hitSlot: -1, // spawner slot that ended the run, or -1
    clipSlot: -1, // slot side-clipped by the current bounce (ignored until the bounce ends), or -1
    nearMisses: 0, // near-miss count (Phase 7 effects compare it with what they last saw)
    nearMissType: 0, // obstacle type of the latest near miss
    nearMissLane: 0,
    player: createPlayer(cfg),
    chaser: createChaser(cfg),
    trail: createTrail(cfg.TRAIL_STEPS), // the player's recent path, which the Agent follows
    spawner: createSpawner(cfg, seed),
    playerBox: createBox(), // scratch, refilled every step
    scratchBox: createBox(),
  };
  resetRun(run, cfg, seed);
  return run;
}

/** Put every piece of run state back to its start-of-run value, with a new seed. */
export function resetRun(run, cfg, seed) {
  run.seed = seed;
  run.elapsed = 0;
  run.speed = speedAt(0, cfg);
  run.scroll = 0;
  run.prevScroll = 0;
  run.score = 0;
  run.caught = false;
  run.caughtBy = CAUGHT_BY.NONE;
  run.hitSlot = -1;
  run.clipSlot = -1;
  run.nearMisses = 0;
  run.nearMissType = 0;
  run.nearMissLane = 0;
  resetPlayer(run.player, cfg);
  resetChaser(run.chaser, cfg);
  resetTrail(run.trail, run.player.x);
  resetSpawner(run.spawner, cfg, seed, 0);
  const b = run.playerBox;
  b.minX = b.maxX = b.minY = b.maxY = b.minZ = b.maxZ = 0;
  const s = run.scratchBox;
  s.minX = s.maxX = s.minY = s.maxY = s.minZ = s.maxZ = 0;
}

/** Gameplay input (lanes, jump, slide) counts only while the run is live, not during the catch beat. */
export function acceptsInput(run) {
  return !run.caught && !run.chaser.catching;
}

function beginCatch(run, slot, by) {
  run.hitSlot = slot;
  run.caughtBy = by;
  startCatch(run.chaser, by === CAUGHT_BY.HEAD_ON);
  freezeInterpolation(run);
}

/**
 * Advance the run by one fixed step `h`. Collision is tested every step so
 * nothing tunnels at max speed. Returns the first slot index hit this step,
 * or -1.
 *
 * A side clip bounces the player back and is a stumble; a head-on hit, or a
 * second stumble inside the window, starts the catch beat (SPEC §3.6,
 * ADR-0011). During the beat the world is frozen and only the Agent moves;
 * when it ends the run is marked caught. With `god`, hits have no effect.
 */
export function stepRun(run, h, cfg, god = false) {
  if (run.caught) return -1;
  const c = run.chaser;
  if (c.catching) {
    if (stepChaser(c, h, cfg)) {
      run.caught = true;
      freezeInterpolation(run);
    }
    return -1;
  }

  run.elapsed += h;
  run.speed = speedAt(run.elapsed, cfg);
  run.prevScroll = run.scroll;
  run.scroll += run.speed * h;
  run.score = addScore(run.score, run.speed, h, run.scroll, cfg);
  stepPlayer(run.player, h, cfg);
  pushTrail(run.trail, run.player.x, run.player.y, run.player.sliding);
  if (run.clipSlot >= 0 && !run.player.bouncing) {
    // Back in the rest lane, clear of it: the clipped obstacle is solid again,
    // so steering back into it is a real hit (not a walk-through).
    run.spawner.slots[run.clipSlot].ignored = false;
    run.clipSlot = -1;
  }
  updateSpawner(run.spawner, run.scroll, run.speed, run.elapsed, cfg);
  stepChaser(c, h, cfg);

  const p = run.player;
  const sp = run.spawner;
  setPlayerBox(run.playerBox, p, cfg);
  const first = findHit(sp, run.playerBox, run.scroll, cfg, run.scratchBox);
  if (god) return first;

  // The player box can overlap two obstacles at once mid-move (one in each
  // lane), so after a side clip look again: a head-on hit still counts.
  let hit = first;
  for (let guard = 0; hit >= 0 && guard < cfg.LANE_COUNT; guard++) {
    const o = sp.slots[hit];
    if (classifyHit(p, o.lane) !== HIT.SIDE_CLIP) {
      beginCatch(run, hit, CAUGHT_BY.HEAD_ON);
      break;
    }
    o.ignored = true; // can't hit twice while bouncing off it
    if (run.clipSlot >= 0 && run.clipSlot !== hit) sp.slots[run.clipSlot].ignored = false;
    run.clipSlot = hit;
    const dir = p.restLane > o.lane ? 1 : -1; // bounce away from the obstacle
    if (stumble(c, dir, cfg)) {
      beginCatch(run, hit, CAUGHT_BY.SECOND_STUMBLE);
      break;
    }
    bounceBack(p, cfg);
    hit = findHit(sp, run.playerBox, run.scroll, cfg, run.scratchBox);
  }
  if (!c.catching) {
    const near = trackNearMisses(sp, run.playerBox, run.scroll, cfg.NEAR_MISS_MARGIN, cfg, run.scratchBox);
    if (near >= 0) {
      run.nearMisses++;
      run.nearMissType = sp.slots[near].type;
      run.nearMissLane = sp.slots[near].lane;
    }
  }
  return first;
}

/**
 * Make the previous-step values equal the current ones, so render
 * interpolation shows exactly the latest state. Used when the run is caught
 * or paused, so the frozen frame can't wobble or jump back on resume.
 */
export function freezeInterpolation(run) {
  run.prevScroll = run.scroll;
  run.player.prevX = run.player.x;
  run.player.prevY = run.player.y;
  run.chaser.prevGap = run.chaser.gap;
}
