// Player movement rules: lanes, jump, slide, fast-fall (SPEC §3.2, §3.3).
// Pure: no DOM, no THREE. State is a plain object mutated in place, so the
// per-step functions never allocate.

import { lerp, easeOutQuad } from './math.js';
import { laneX } from './world.js';

/** Gravity derived from design values: apex JUMP_HEIGHT, airtime JUMP_TIME. */
export function jumpGravity(cfg) {
  return (8 * cfg.JUMP_HEIGHT) / (cfg.JUMP_TIME * cfg.JUMP_TIME);
}

/** Launch speed derived from design values. */
export function jumpVelocity(cfg) {
  return (4 * cfg.JUMP_HEIGHT) / cfg.JUMP_TIME;
}

/**
 * Seconds from take-off until the feet are above `height` (e.g. a LOW
 * obstacle). Infinity if the jump never gets that high.
 */
export function jumpClearTime(height, cfg) {
  const g = jumpGravity(cfg);
  const v0 = jumpVelocity(cfg);
  const disc = v0 * v0 - 2 * g * height;
  if (disc < 0) return Infinity;
  return (v0 - Math.sqrt(disc)) / g;
}

export function createPlayer(cfg) {
  const p = {
    // Lanes. `lane` is the lane we are in or moving to; `fromLane` is where the
    // current move started (equal to `lane` when not moving). `restLane` is the
    // last lane the player actually reached and stood in: after a mid-move
    // reversal `fromLane` can be a lane we never reached, so Phase 4's
    // stumble must bounce back to `restLane`, not `fromLane`.
    lane: 0,
    fromLane: 0,
    restLane: 0,
    moving: false,
    bouncing: false, // a stumble is bouncing us back to restLane: lane input is locked until we get there
    laneT: 0, // seconds into the current lane move
    fromX: 0,
    toX: 0,
    x: 0,
    prevX: 0,
    queue: new Array(Math.max(0, cfg.LANE_QUEUE_MAX)).fill(0), // pending moves (-1 / +1); allocated once
    queueLen: 0,

    // Vertical
    y: 0,
    prevY: 0,
    vy: 0,
    grounded: true,
    jumpBuffer: 0, // seconds left on a buffered jump
    slideOnLand: false, // fast-fall was pressed: slide when we touch down

    // Slide
    sliding: false,
    slideTimer: 0,

    // Event counters for sound and effects (Phase 7): the view compares them
    // with what it last saw, so no event list (and no allocation) is needed.
    jumps: 0,
    landings: 0,
    landSpeed: 0, // downward speed at the last touchdown
    slides: 0,
  };
  resetPlayer(p, cfg);
  return p;
}

/** Put every piece of player state back to its start-of-run value. */
export function resetPlayer(p, cfg) {
  const center = Math.floor(cfg.LANE_COUNT / 2);
  const cx = laneX(center, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  p.lane = center;
  p.fromLane = center;
  p.restLane = center;
  p.moving = false;
  p.bouncing = false;
  p.laneT = 0;
  p.fromX = cx;
  p.toX = cx;
  p.x = cx;
  p.prevX = cx;
  for (let i = 0; i < p.queue.length; i++) p.queue[i] = 0;
  p.queueLen = 0;
  p.y = 0;
  p.prevY = 0;
  p.vy = 0;
  p.grounded = true;
  p.jumpBuffer = 0;
  p.slideOnLand = false;
  p.sliding = false;
  p.slideTimer = 0;
  p.jumps = 0;
  p.landings = 0;
  p.landSpeed = 0;
  p.slides = 0;
}

function startLaneMove(p, dir, cfg) {
  p.fromLane = p.lane;
  p.lane += dir;
  p.fromX = p.x;
  p.toX = laneX(p.lane, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  p.laneT = 0;
  p.moving = true;
}

/**
 * Request a one-lane move. dir: -1 = left, +1 = right.
 * - Not moving: starts immediately.
 * - Pressing the opposite way mid-move (nothing queued): turns straight back.
 * - Pressing opposite to the last queued move: cancels that queued move.
 * - Otherwise queued (up to LANE_QUEUE_MAX), so left-left moves two lanes.
 * Moves that would leave the road are ignored. Returns true if accepted.
 */
export function queueLaneMove(p, dir, cfg) {
  if (p.bouncing) return false; // no steering back through the obstacle we just bounced off
  let pending = 0;
  for (let i = 0; i < p.queueLen; i++) pending += p.queue[i];
  const finalLane = p.lane + pending + dir;
  if (finalLane < 0 || finalLane > cfg.LANE_COUNT - 1) return false;

  if (!p.moving) {
    startLaneMove(p, dir, cfg);
    return true;
  }
  if (p.queueLen > 0 && p.queue[p.queueLen - 1] === -dir) {
    p.queueLen--;
    return true;
  }
  if (p.queueLen === 0 && dir === p.fromLane - p.lane) {
    startLaneMove(p, dir, cfg); // reverse from the current x, back toward fromLane
    return true;
  }
  if (p.queueLen < p.queue.length) {
    p.queue[p.queueLen++] = dir;
    return true;
  }
  return false;
}

/**
 * Side-clip stumble (SPEC §3.6, ADR-0011): drop any queued moves and head
 * back to restLane, the last lane we actually stood in (not fromLane, which
 * after a mid-move reversal can be a lane we never reached). Lane input is
 * ignored until we arrive; jump and slide still work.
 */
export function bounceBack(p, cfg) {
  for (let i = 0; i < p.queue.length; i++) p.queue[i] = 0;
  p.queueLen = 0;
  p.fromLane = p.lane;
  p.lane = p.restLane;
  p.fromX = p.x;
  p.toX = laneX(p.restLane, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  p.laneT = 0;
  p.moving = true;
  p.bouncing = true;
}

function doJump(p, cfg) {
  p.jumps++;
  p.vy = jumpVelocity(cfg);
  p.grounded = false;
  p.sliding = false;
  p.slideTimer = 0;
  p.jumpBuffer = 0;
  p.slideOnLand = false;
}

function startSlide(p, cfg) {
  if (!p.sliding) p.slides++; // a fresh slide, not an extension
  p.sliding = true;
  p.slideTimer = cfg.SLIDE_TIME;
}

/** Jump: immediate on the ground (cancels a slide), buffered in the air. No double jump. */
export function requestJump(p, cfg) {
  if (p.grounded) {
    doJump(p, cfg);
  } else {
    p.jumpBuffer = cfg.JUMP_BUFFER;
    p.slideOnLand = false; // latest request wins
  }
}

/** Slide: immediate on the ground, fast-fall + slide-on-landing in the air. */
export function requestSlide(p, cfg) {
  if (p.grounded) {
    startSlide(p, cfg);
  } else {
    if (p.vy > -cfg.FASTFALL_V) p.vy = -cfg.FASTFALL_V;
    p.slideOnLand = true;
    p.jumpBuffer = 0; // latest request wins
  }
}

/** Advance the player by one fixed step of `dt` seconds. */
export function stepPlayer(p, dt, cfg) {
  p.prevX = p.x;
  p.prevY = p.y;

  // Lane movement: fixed-duration ease, then start the next queued move.
  if (p.moving) {
    p.laneT += dt;
    const t = p.laneT / cfg.LANE_CHANGE_TIME;
    if (t >= 1) {
      p.x = p.toX;
      p.moving = false;
      p.bouncing = false;
      p.fromLane = p.lane;
      p.restLane = p.lane;
      if (p.queueLen > 0) {
        const dir = p.queue[0];
        for (let i = 1; i < p.queueLen; i++) p.queue[i - 1] = p.queue[i];
        p.queueLen--;
        p.queue[p.queueLen] = 0;
        startLaneMove(p, dir, cfg);
      }
    } else {
      p.x = lerp(p.fromX, p.toX, easeOutQuad(t));
    }
  }

  // Vertical: exact integration for constant gravity (velocity Verlet), so
  // the apex and airtime match JUMP_HEIGHT / JUMP_TIME at any step size.
  if (!p.grounded) {
    const g = jumpGravity(cfg);
    p.y += p.vy * dt - 0.5 * g * dt * dt;
    p.vy -= g * dt;
    if (p.y <= 0) {
      p.landings++;
      p.landSpeed = -p.vy;
      p.y = 0;
      p.vy = 0;
      p.grounded = true;
      if (p.jumpBuffer > 0) {
        doJump(p, cfg);
      } else if (p.slideOnLand) {
        p.slideOnLand = false;
        startSlide(p, cfg);
      }
    }
  }
  if (p.jumpBuffer > 0) {
    p.jumpBuffer -= dt;
    if (p.jumpBuffer < 0) p.jumpBuffer = 0;
  }

  // Slide timer
  if (p.sliding) {
    p.slideTimer -= dt;
    if (p.slideTimer <= 0) {
      p.slideTimer = 0;
      p.sliding = false;
    }
  }
}

/** Current hitbox height: shorter while sliding (SPEC §3.6). */
export function playerHeight(p, cfg) {
  return p.sliding ? cfg.PLAYER_SLIDE_HEIGHT : cfg.PLAYER_HEIGHT;
}
