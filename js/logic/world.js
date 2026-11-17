// Ground-segment recycling (SPEC §3.2, §7.2). Pure: no DOM, no THREE.
//
// The player stays at z = 0 and the world scrolls toward +Z. Every segment's
// position is computed from ONE shared scroll distance, so segments can never
// drift apart or leave gaps, however long the run.

import { mod } from './math.js';

/**
 * Center z of ground segment `i` after the world has scrolled `scroll` units.
 *
 * Segments move toward +Z as scroll grows. A segment wraps to the far end of
 * the strip only once its FAR edge has passed `backZ`, so the strip's near
 * edge is always in (backZ, backZ + length] (keep backZ behind the camera)
 * and its far edge is always in (backZ - total, backZ + length - total].
 */
export function segmentZ(i, scroll, length, count, backZ) {
  return backZ + length / 2 - mod(i * length - scroll, length * count);
}

/** X position of a lane index (0 = left, center = (count-1)/2). */
export function laneX(lane, laneWidth, laneCount) {
  return (lane - (laneCount - 1) / 2) * laneWidth;
}
