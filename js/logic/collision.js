// Axis-aligned box collision (SPEC §3.6). Pure: no DOM, no THREE.
// Boxes are plain {minX, maxX, minY, maxY, minZ, maxZ} objects. Create them
// once (createBox) and refill them each step, so nothing is allocated per frame.

import { laneX } from './world.js';
import { playerHeight } from './player.js';

export const OB = Object.freeze({ NONE: 0, LOW: 1, HIGH: 2, BLOCK: 3 });

export function createBox() {
  return { minX: 0, maxX: 0, minY: 0, maxY: 0, minZ: 0, maxZ: 0 };
}

/** True if the boxes overlap. Touching faces do NOT count as a hit. */
export function overlaps(a, b) {
  return (
    a.minX < b.maxX && a.maxX > b.minX &&
    a.minY < b.maxY && a.maxY > b.minY &&
    a.minZ < b.maxZ && a.maxZ > b.minZ
  );
}

/**
 * Player hitbox at z = 0: HITBOX_SCALE × the visual size, feet kept at y so
 * jumping over a LOW obstacle needs the full clearance. Shorter while sliding.
 */
export function setPlayerBox(box, p, cfg) {
  const halfW = (cfg.PLAYER_WIDTH * cfg.HITBOX_SCALE) / 2;
  box.minX = p.x - halfW;
  box.maxX = p.x + halfW;
  box.minY = p.y;
  box.maxY = p.y + playerHeight(p, cfg) * cfg.HITBOX_SCALE;
  box.minZ = -halfW;
  box.maxZ = halfW;
  return box;
}

/** Vertical extent [bottom, top] and depth of an obstacle type. */
export function obstacleBottom(type, cfg) {
  return type === OB.HIGH ? cfg.HIGH_BOTTOM : 0;
}
export function obstacleTop(type, cfg) {
  if (type === OB.LOW) return cfg.LOW_HEIGHT;
  if (type === OB.HIGH) return cfg.HIGH_TOP;
  return cfg.BLOCK_HEIGHT;
}
export function obstacleDepth(type, cfg) {
  if (type === OB.LOW) return cfg.LOW_DEPTH;
  if (type === OB.HIGH) return cfg.HIGH_DEPTH;
  return cfg.BLOCK_DEPTH;
}

/** Obstacle hitbox, centred on its lane and on z (z = scroll - trackPosition). */
export function setObstacleBox(box, type, lane, z, cfg) {
  const x = laneX(lane, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  const halfW = cfg.OBSTACLE_WIDTH / 2;
  const halfD = obstacleDepth(type, cfg) / 2;
  box.minX = x - halfW;
  box.maxX = x + halfW;
  box.minY = obstacleBottom(type, cfg);
  box.maxY = obstacleTop(type, cfg);
  box.minZ = z - halfD;
  box.maxZ = z + halfD;
  return box;
}
