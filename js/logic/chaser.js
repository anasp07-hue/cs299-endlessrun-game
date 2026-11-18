// The chaser (the Agent) and the stumble rule (SPEC §3.6, ADR-0011).
// Pure: no DOM, no THREE. State is a plain object mutated in place, so the
// per-step functions never allocate.
//
// - A hit is a SIDE CLIP when the player is changing lanes and the obstacle is
//   not in the lane they last stood in (restLane): they bumped into the lane
//   they were entering. Anything else is HEAD-ON (including an obstacle in the
//   lane being left, i.e. dodging too late).
// - A side clip is a stumble: the player bounces back to restLane and the
//   Agent lunges in from CHASER_GAP_NORMAL to CHASER_GAP_STUMBLE, then drifts
//   back over STUMBLE_WINDOW. A second stumble inside the window is a catch.
// - A catch (head-on, or the second stumble) starts a short "beat": the world
//   freezes while the Agent closes to CHASER_CATCH_GAP over CATCH_TIME. Only
//   then is the run marked caught (and game.js shows the game-over screen).

import { lerp, easeOutQuad } from './math.js';

export const HIT = Object.freeze({ NONE: 0, HEAD_ON: 1, SIDE_CLIP: 2 });
export const CAUGHT_BY = Object.freeze({ NONE: 0, HEAD_ON: 1, SECOND_STUMBLE: 2 });

/** hitAge value meaning "no hit yet this run" (a plain number, so state stays JSON-clean). */
export const HIT_AGE_NONE = 1e6;

/**
 * How many fixed steps behind the player's path the Agent is: he is `gap`
 * units back, and the path moves at `speed`. Used to sample the trail.
 */
export function chaserDelaySteps(gap, speed, cfg) {
  return speed > 0 ? gap / speed / cfg.SIM_STEP : 0;
}

/** 0 → 1 over the catch beat (1 once it has finished). */
export function catchProgress(c, cfg) {
  if (!c.catching) return 0;
  return c.catchT >= cfg.CATCH_TIME ? 1 : c.catchT / cfg.CATCH_TIME;
}

/** The Agent is drawn only while he's in front of the camera (gap < CAMERA_Z); further back he'd be behind it. */
export function agentInView(gap, cfg) {
  return gap < cfg.CAMERA_Z;
}

/** Classify a hit on an obstacle in `obstacleLane` from the player's lane state. */
export function classifyHit(p, obstacleLane) {
  return p.moving && obstacleLane !== p.restLane ? HIT.SIDE_CLIP : HIT.HEAD_ON;
}

export function createChaser(cfg) {
  const c = {
    gap: 0, // units behind the player (the Agent is drawn at z = +gap)
    prevGap: 0, // for render interpolation
    stumbleTimer: 0, // seconds left in the stumble window (0 = no recent stumble)
    stumbles: 0, // stumbles this run
    stumbleDir: 0, // -1 / +1: direction of the last bounce (0 for a head-on hit), for the animation
    hitAge: HIT_AGE_NONE, // seconds since the last stumble or head-on hit, for the animation
    catching: false, // the catch beat is playing
    catchT: 0, // seconds into the catch beat
    catchFrom: 0, // gap when the catch beat started
  };
  resetChaser(c, cfg);
  return c;
}

export function resetChaser(c, cfg) {
  c.gap = cfg.CHASER_GAP_NORMAL;
  c.prevGap = c.gap;
  c.stumbleTimer = 0;
  c.stumbles = 0;
  c.stumbleDir = 0;
  c.hitAge = HIT_AGE_NONE;
  c.catching = false;
  c.catchT = 0;
  c.catchFrom = 0;
}

/**
 * Where the Agent wants to be, given the time left in the stumble window.
 * Right after a stumble: CHASER_GAP_STUMBLE. It eases back (slowly at first,
 * so he lingers in view) and reaches CHASER_GAP_NORMAL exactly as the window
 * ends, so his distance doubles as the "you're still in danger" signal.
 */
export function gapTarget(stumbleTimer, cfg) {
  if (stumbleTimer <= 0) return cfg.CHASER_GAP_NORMAL;
  const left = stumbleTimer >= cfg.STUMBLE_WINDOW ? 1 : stumbleTimer / cfg.STUMBLE_WINDOW;
  const r = 1 - left; // 0 at the stumble → 1 at the end of the window
  return cfg.CHASER_GAP_STUMBLE + (cfg.CHASER_GAP_NORMAL - cfg.CHASER_GAP_STUMBLE) * r * r;
}

/**
 * Register a side-clip stumble bouncing the player in direction `dir`.
 * Returns true if this is the second stumble inside the window (caught).
 */
export function stumble(c, dir, cfg) {
  const caught = c.stumbleTimer > 0;
  c.stumbles++;
  c.stumbleDir = dir;
  c.hitAge = 0;
  c.stumbleTimer = cfg.STUMBLE_WINDOW;
  return caught;
}

/** Start the catch beat. A head-on hit also restarts the hit animation (no bounce direction). */
export function startCatch(c, headOn) {
  if (headOn) {
    c.hitAge = 0;
    c.stumbleDir = 0;
  }
  c.catching = true;
  c.catchT = 0;
  c.catchFrom = c.gap;
}

/**
 * Advance the chaser by `dt`. Returns true when the catch beat has finished
 * (the run is over); false otherwise.
 */
export function stepChaser(c, dt, cfg) {
  c.prevGap = c.gap;
  if (c.hitAge < HIT_AGE_NONE) {
    c.hitAge += dt;
    if (c.hitAge > HIT_AGE_NONE) c.hitAge = HIT_AGE_NONE;
  }

  if (c.catching) {
    c.catchT += dt;
    const t = c.catchT >= cfg.CATCH_TIME ? 1 : c.catchT / cfg.CATCH_TIME;
    c.gap = t >= 1 ? cfg.CHASER_CATCH_GAP : lerp(c.catchFrom, cfg.CHASER_CATCH_GAP, easeOutQuad(t));
    return t >= 1;
  }

  if (c.stumbleTimer > 0) {
    c.stumbleTimer -= dt;
    if (c.stumbleTimer < 0) c.stumbleTimer = 0;
  }
  const target = gapTarget(c.stumbleTimer, cfg);
  if (c.gap > target) {
    // Lunge in at a fixed speed (never overshooting), so it reads as motion, not a teleport.
    c.gap -= cfg.CHASER_CLOSE_SPEED * dt;
    if (c.gap < target) c.gap = target;
  } else {
    c.gap = target; // drifting back: the target itself is smooth
  }
  return false;
}
