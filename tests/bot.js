// Shared test helper (not a test file: the glob is tests/*.test.js).
// The survival bot used by spawner.test.js and chaser.test.js.

import { CONFIG } from '../js/logic/config.js';
import { OB } from '../js/logic/collision.js';
import { queueLaneMove, requestJump, requestSlide } from '../js/logic/player.js';
import { canReach } from '../js/logic/spawner.js';

const _ = OB.NONE;
const L = OB.LOW;
const H = OB.HIGH;
const B = OB.BLOCK;
const open = (r) => [0, 1, 2].filter((i) => r.types[i] !== B);

/**
 * Bot with perfect reaction (the timing model already budgets REACTION_TIME
 * for a human). For each row, once the previous row is fully behind it, it
 * picks a lane it can actually reach (canReach, the same rule the spawner
 * guarantees), preferring nearby empty lanes. Then it jumps/slides so the
 * middle of the action lines up with the obstacle in its lane.
 */
export function makeBot() {
  const passZ = (Math.max(CONFIG.LOW_DEPTH, CONFIG.HIGH_DEPTH, CONFIG.BLOCK_DEPTH) + CONFIG.PLAYER_WIDTH) / 2 + 0.05;
  const decided = new Map();
  const decidedAt = new Map();
  return function bot(p, sp, scroll, speed, now) {
    const rows = new Map();
    for (const o of sp.slots) {
      if (!o.active) continue;
      if (!rows.has(o.row)) rows.set(o.row, { types: [_, _, _], s: [NaN, NaN, NaN], earliest: Infinity, latest: -Infinity });
      const r = rows.get(o.row);
      r.types[o.lane] = o.type;
      r.s[o.lane] = o.s;
      r.earliest = Math.min(r.earliest, o.s);
      r.latest = Math.max(r.latest, o.s);
    }
    // The first row whose last obstacle hasn't fully passed the player.
    let id = Infinity;
    for (const [rid, r] of rows) if (scroll - r.latest < passZ && rid < id) id = rid;
    if (id === Infinity) return;
    const row = rows.get(id);

    if (!decided.has(id)) {
      const prev = rows.get(id - 1);
      let target = -1;
      let bestCost = Infinity;
      for (const j of open(row)) {
        if (prev && prev.types[p.lane] !== B && !canReach(prev, p.lane, row, j, speed, CONFIG)) continue;
        const cost = Math.abs(j - p.lane) * 10 + (row.types[j] === _ ? 0 : 1);
        if (cost < bestCost) {
          bestCost = cost;
          target = j;
        }
      }
      decided.set(id, target);
      decidedAt.set(id, now);
    }
    const target = decided.get(id);
    if (target < 0) return; // no reachable lane: the test will report the crash
    // Like a human: wait a full REACTION_TIME after the previous row clears
    // before starting to change lanes. Proves the reaction budget is real.
    const reacted = now - decidedAt.get(id) >= CONFIG.REACTION_TIME;
    if (reacted && !p.moving && p.lane !== target) queueLaneMove(p, target > p.lane ? 1 : -1, CONFIG);

    const type = row.types[target];
    if (type === _ || p.lane !== target || p.moving) return;
    const ahead = row.s[target] - scroll;
    if (ahead > 0 && ahead <= speed * (CONFIG.JUMP_TIME / 2)) {
      if (type === L && p.grounded) requestJump(p, CONFIG);
      if (type === H && !p.sliding && !p.slideOnLand) requestSlide(p, CONFIG);
    }
  };
}
