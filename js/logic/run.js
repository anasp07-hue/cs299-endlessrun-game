// One run's simulation state, its full reset, and its fixed step (SPEC §4, §7.1).
// Pure: no DOM, no THREE. game.js keeps a single run object for the whole
// session and calls resetRun() on every Play / Play Again / Restart, so there
// is exactly one place that knows the start-of-run value of everything.
// RULE: any new per-run state (stumble timer, chaser gap, … in later phases)
// is added to resetRun() here, and the "reset equals fresh" test covers it.

import { createPlayer, resetPlayer, stepPlayer } from './player.js';
import { createSpawner, resetSpawner, updateSpawner, findHit } from './spawner.js';
import { createBox, setPlayerBox } from './collision.js';
import { speedAt, addScore } from './difficulty.js';

export function createRun(cfg, seed = 0) {
  const run = {
    seed: 0,
    elapsed: 0, // seconds of simulated run time (drives the speed ramp)
    speed: 0,
    scroll: 0, // total distance the world has moved (single shared offset)
    prevScroll: 0,
    score: 0,
    caught: false,
    hitSlot: -1, // spawner slot that ended the run, or -1
    player: createPlayer(cfg),
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
  run.hitSlot = -1;
  resetPlayer(run.player, cfg);
  resetSpawner(run.spawner, cfg, seed, 0);
  const b = run.playerBox;
  b.minX = b.maxX = b.minY = b.maxY = b.minZ = b.maxZ = 0;
  const s = run.scratchBox;
  s.minX = s.maxX = s.minY = s.maxY = s.minZ = s.maxZ = 0;
}

/**
 * Advance the run by one fixed step `h`. Collision is tested every step so
 * nothing tunnels at max speed. Returns the slot index that was hit, or -1.
 * On a hit (unless `god`), the run is marked caught and frozen.
 */
export function stepRun(run, h, cfg, god = false) {
  if (run.caught) return -1;
  run.elapsed += h;
  run.speed = speedAt(run.elapsed, cfg);
  run.prevScroll = run.scroll;
  run.scroll += run.speed * h;
  run.score = addScore(run.score, run.speed, h, run.scroll, cfg);
  stepPlayer(run.player, h, cfg);
  updateSpawner(run.spawner, run.scroll, run.speed, run.elapsed, cfg);

  setPlayerBox(run.playerBox, run.player, cfg);
  const hit = findHit(run.spawner, run.playerBox, run.scroll, cfg, run.scratchBox);
  if (hit >= 0 && !god) {
    run.caught = true;
    run.hitSlot = hit;
    freezeInterpolation(run);
  }
  return hit;
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
}
