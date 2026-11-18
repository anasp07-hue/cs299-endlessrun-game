import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRng } from '../js/logic/rng.js';
import { OB, createBox, setPlayerBox, obstacleDepth } from '../js/logic/collision.js';
import { speedAt, difficultyAt } from '../js/logic/difficulty.js';
import { createPlayer, stepPlayer, requestJump, jumpClearTime } from '../js/logic/player.js';
import { makeBot } from './bot.js';
import {
  PATTERNS,
  parsePattern,
  isPassable,
  hasObstacle,
  pickPattern,
  randomRow,
  fillsLanes,
  emptyLaneMask,
  transitionTime,
  canReach,
  arrivePathS,
  rowMargin,
  createSpawner,
  resetSpawner,
  updateSpawner,
  findHit,
} from '../js/logic/spawner.js';

const STEP = CONFIG.SIM_STEP;
const L = OB.LOW;
const H = OB.HIGH;
const B = OB.BLOCK;
const _ = OB.NONE;

// --- Pattern table & random rows --------------------------------------------------------

test('parsePattern reads L/H/B/. and rejects bad input', () => {
  assert.deepEqual(parsePattern('B.L'), [B, _, L]);
  assert.deepEqual(parsePattern('HHH'), [H, H, H]);
  for (const bad of ['', 'BB', 'BBBB', 'X..', null]) assert.throws(() => parsePattern(bad));
});

test('every table pattern has 3 lanes, at least one obstacle, and never 3 BLOCKs', () => {
  for (const p of PATTERNS) {
    assert.equal(p.lanes.length, CONFIG.LANE_COUNT, p.cells);
    assert.ok(hasObstacle(p.lanes), `${p.cells} is empty`);
    assert.ok(isPassable(p.lanes), `${p.cells} blocks every lane`);
  }
});

test('pattern table is well-formed: unique, difficulty in [0, 1], positive weights, easy patterns exist', () => {
  const seen = new Set();
  for (const p of PATTERNS) {
    assert.ok(!seen.has(p.cells), `duplicate ${p.cells}`);
    seen.add(p.cells);
    assert.ok(p.minDifficulty >= 0 && p.minDifficulty <= 1, p.cells);
    assert.ok(p.weight > 0, p.cells);
  }
  assert.ok(PATTERNS.some((p) => p.minDifficulty === 0));
});

test('isPassable: a full BLOCK wall is the only impassable row', () => {
  assert.equal(isPassable([B, B, B]), false);
  assert.equal(isPassable([B, B, L]), true);
  assert.equal(isPassable([H, H, H]), true);
});

test('random rows: never 3 BLOCKs, never empty, and cover many combinations', () => {
  const rng = createRng(11);
  const out = [0, 0, 0];
  const seen = new Set();
  for (let i = 0; i < 20000; i++) {
    randomRow(rng, out, CONFIG);
    assert.ok(isPassable(out), `all BLOCK: ${out}`);
    assert.ok(hasObstacle(out), 'empty row');
    seen.add(out.join(''));
  }
  // 4^3 = 64 combos, minus BBB and ... = 62 possible
  assert.equal(seen.size, 62);
});

test('random rows with required lanes: those lanes always get an obstacle, rows stay passable', () => {
  const rng = createRng(12);
  const out = [0, 0, 0];
  for (let mask = 0; mask < 8; mask++) {
    for (let i = 0; i < 3000; i++) {
      randomRow(rng, out, CONFIG, mask);
      assert.ok(fillsLanes(out, mask), `mask ${mask}: ${out}`);
      assert.ok(isPassable(out) && hasObstacle(out), `mask ${mask}: ${out}`);
    }
  }
});

test('pickPattern with required lanes only returns patterns that fill them (null if none fit)', () => {
  const rng = createRng(13);
  for (const d of [0, 0.2, 0.5, 1]) {
    for (let mask = 0; mask < 8; mask++) {
      for (let i = 0; i < 500; i++) {
        const p = pickPattern(rng, d, mask);
        if (p === null) {
          assert.ok(!PATTERNS.some((q) => q.minDifficulty <= d && fillsLanes(q.lanes, mask)), `null but a pattern fits (d ${d}, mask ${mask})`);
          break;
        }
        assert.ok(fillsLanes(p.lanes, mask), `${p.cells} leaves a required lane empty (mask ${mask})`);
        assert.ok(p.minDifficulty <= d);
      }
    }
  }
});

test('emptyLaneMask marks exactly the empty lanes', () => {
  assert.equal(emptyLaneMask({ types: [_, B, _] }), 0b101);
  assert.equal(emptyLaneMask({ types: [L, H, B] }), 0);
  assert.equal(emptyLaneMask({ types: [_, _, _] }), 0b111);
});

test('pickPattern never picks a pattern above the current difficulty', () => {
  const rng = createRng(5);
  for (const d of [0, 0.1, 0.3, 0.5, 0.75, 1]) {
    for (let i = 0; i < 2000; i++) {
      const p = pickPattern(rng, d);
      assert.ok(p.minDifficulty <= d, `${p.cells} at difficulty ${d}`);
    }
  }
});

test('pickPattern can reach every pattern at difficulty 1', () => {
  const rng = createRng(9);
  const seen = new Set();
  for (let i = 0; i < 20000; i++) seen.add(pickPattern(rng, 1).cells);
  assert.equal(seen.size, PATTERNS.length);
});

// --- Timing model (ADR-0007) --------------------------------------------------------------

test('transitionTime: reaction (+ time for a jump to clear a LOW) for any new action or lane change', () => {
  const R = CONFIG.REACTION_TIME;
  const LC = CONFIG.LANE_CHANGE_TIME;
  const clear = jumpClearTime(CONFIG.LOW_HEIGHT, CONFIG);
  assert.ok(clear > 0.05 && clear < 0.15, `clear time ${clear}`);
  assert.equal(transitionTime(_, _, 0, CONFIG), 0);
  assert.equal(transitionTime(_, L, 0, CONFIG), R + clear);
  assert.equal(transitionTime(H, H, 0, CONFIG), R, 'a slide takes effect at once');
  assert.equal(transitionTime(H, L, 0, CONFIG), R + clear, 'a jump cancels a slide at once');
  assert.equal(transitionTime(_, _, 2, CONFIG), R + 2 * LC);
});

test('jumpClearTime matches the jump arc and is Infinity above the apex', () => {
  const t = jumpClearTime(CONFIG.LOW_HEIGHT, CONFIG);
  const p = createPlayer(CONFIG);
  requestJump(p, CONFIG);
  let elapsed = 0;
  while (p.y < CONFIG.LOW_HEIGHT && elapsed < 1) {
    stepPlayer(p, STEP, CONFIG);
    elapsed += STEP;
  }
  assert.ok(Math.abs(elapsed - t) <= STEP + 1e-9, `sim ${elapsed} vs formula ${t}`);
  assert.equal(jumpClearTime(CONFIG.JUMP_HEIGHT + 0.1, CONFIG), Infinity);
});

test('transitionTime: after a jump, the next jump or slide needs a full jump of time', () => {
  const J = CONFIG.JUMP_TIME;
  assert.equal(transitionTime(L, L, 0, CONFIG), J);
  assert.equal(transitionTime(L, H, 0, CONFIG), J);
  assert.equal(transitionTime(L, H, 1, CONFIG), J + CONFIG.LANE_CHANGE_TIME);
  assert.equal(transitionTime(L, _, 0, CONFIG), 0, 'staying in the air over an empty lane is fine');
  assert.equal(transitionTime(L, _, 1, CONFIG), CONFIG.REACTION_TIME + CONFIG.LANE_CHANGE_TIME, 'lane change in the air');
});

test('arrivePathS: the first obstacle in any lane from i to j (inclusive)', () => {
  const row = { types: [B, B, L], s: [100, 95, 110] };
  assert.equal(arrivePathS(row, 0, 2), 95, 'the middle BLOCK comes first');
  assert.equal(arrivePathS(row, 2, 2), 110);
  assert.equal(arrivePathS(row, 0, 0), 100);
  assert.equal(arrivePathS({ types: [_, _, L], s: [0, 0, 50] }, 0, 1), Infinity, 'empty path');
});

test('canReach: a staggered obstacle in a lane you cross counts (code-review finding)', () => {
  // Previous row: player sliding under a HIGH in lane 0 at s = 0.
  const prev = { types: [H, H, L], s: [0, 0, 0], earliest: 0, latest: 0 };
  const v = 30;
  const needToLane2 = transitionTime(H, L, 2, CONFIG) * v + rowMargin(CONFIG); // react + clear a LOW + 2 lanes
  // Target LOW in lane 2 is late enough on its own, but the lane-1 BLOCK you must
  // cross arrives 6.7 units earlier — too early.
  const next = { types: [B, B, L], s: [needToLane2 + 1, needToLane2 - 5.7, needToLane2 + 1], earliest: needToLane2 - 5.7, latest: needToLane2 + 1 };
  assert.equal(canReach(prev, 0, next, 2, v, CONFIG), false);
  // Move the BLOCKs back behind the LOW: now it's reachable.
  next.s[0] = next.s[1] = needToLane2 + 2;
  next.earliest = needToLane2 + 1;
  assert.equal(canReach(prev, 0, next, 2, v, CONFIG), true);
});

test('createSpawner refuses a LANE_COUNT its 3-lane patterns cannot handle', () => {
  assert.throws(() => createSpawner({ ...CONFIG, LANE_COUNT: 4 }, 1), /3 lanes/);
});

test('resetSpawner(startS) restarts the first row FIRST_ROW_DISTANCE past startS', () => {
  const sp = createSpawner(CONFIG, 5);
  resetSpawner(sp, CONFIG, 5, 1000);
  assert.equal(sp.next.earliest, 1000 + CONFIG.FIRST_ROW_DISTANCE);
  assert.equal(sp.active, 0);
});

test('rows spawn beyond the camera far plane, so they never pop into view', () => {
  assert.ok(CONFIG.SPAWN_AHEAD >= CONFIG.CAMERA_FAR - CONFIG.CAMERA_Z, `${CONFIG.SPAWN_AHEAD} vs ${CONFIG.CAMERA_FAR - CONFIG.CAMERA_Z}`);
});

// --- Simulated runs -----------------------------------------------------------------------

/**
 * Run the spawner (no player) the way game.js does, for `seconds`. Returns every
 * spawned row with per-lane track positions and the speed the player has when
 * the row's last obstacle reaches them (the strictest speed for that row).
 */
function simulateRows(seed, seconds, cfg = CONFIG) {
  const sp = createSpawner(cfg, seed);
  const rows = new Map();
  let elapsed = 0;
  let scroll = 0;
  let maxActive = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    elapsed += STEP;
    const speed = speedAt(elapsed, cfg);
    scroll += speed * STEP;
    updateSpawner(sp, scroll, speed, elapsed, cfg);
    if (sp.active > maxActive) maxActive = sp.active;
    for (const o of sp.slots) {
      if (!o.active) continue;
      if (!rows.has(o.row)) rows.set(o.row, { types: [_, _, _], s: [NaN, NaN, NaN], earliest: Infinity, latest: -Infinity, arrive: null, speed: null });
      const r = rows.get(o.row);
      r.types[o.lane] = o.type;
      r.s[o.lane] = o.s;
      r.earliest = Math.min(r.earliest, o.s);
      r.latest = Math.max(r.latest, o.s);
    }
    for (const r of rows.values()) {
      if (r.arrive === null && scroll >= r.latest) {
        r.arrive = elapsed;
        r.speed = speed;
      }
    }
  }
  const list = [...rows.entries()].sort((a, b) => a[0] - b[0]).map(([, r]) => r).filter((r) => r.arrive !== null);
  return { sp, rows: list, maxActive };
}

const open = (r) => [0, 1, 2].filter((i) => r.types[i] !== B);

test('fairness: never 3 BLOCKs, and NO DEAD ENDS — from every open lane, some lane of the next row is reachable', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { sp, rows } = simulateRows(seed, 260); // past max speed (~209 s)
    assert.equal(sp.dropped, 0, `seed ${seed}: rows dropped`);
    assert.ok(rows.length > 150, `seed ${seed}: only ${rows.length} rows`);
    for (let k = 0; k < rows.length; k++) {
      assert.ok(isPassable(rows[k].types), `seed ${seed} row ${k}: three BLOCKs`);
      if (k === 0) continue;
      const prev = rows[k - 1];
      const next = rows[k];
      for (const i of open(prev)) {
        const ok = open(next).some((j) => canReach(prev, i, next, j, next.speed, CONFIG));
        assert.ok(ok, `seed ${seed} row ${k}: dead end from lane ${i} (${prev.types} → ${next.types})`);
      }
    }
  }
});

/**
 * Independent of canReach: from lane i of `prev`, the best reaction time the
 * player actually gets for some open lane j of `next` — counting every obstacle
 * they must be past on the way (lanes i..j), lane-change time, and the landing
 * time after a jump. Written separately so it can't share a bug with the spawner.
 */
function bestReactionFrom(prev, i, next, v) {
  let best = -Infinity;
  for (let j = 0; j < 3; j++) {
    if (next.types[j] === B) continue;
    let first = Infinity;
    for (let k = Math.min(i, j); k <= Math.max(i, j); k++) if (next.types[k] !== _) first = Math.min(first, next.s[k]);
    if (first === Infinity) return Infinity; // nothing in the way at all
    const leave = i === j ? (prev.types[i] !== _ ? prev.s[i] : prev.earliest) : prev.latest;
    const secs = (first - leave - rowMargin(CONFIG)) / v - Math.abs(i - j) * CONFIG.LANE_CHANGE_TIME;
    // Time to get the feet above a LOW after pressing jump (from the jump physics).
    const exec = next.types[j] === L ? jumpClearTime(CONFIG.LOW_HEIGHT, CONFIG) : 0;
    const mustLand = prev.types[i] === L && (next.types[j] === L || next.types[j] === H);
    // Reaction left after executing the action; after a jump, landing comes first.
    const reaction = mustLand ? Math.min(secs - exec, secs - (CONFIG.JUMP_TIME - CONFIG.REACTION_TIME)) : secs - exec;
    const needsInput = i !== j || next.types[j] === L || next.types[j] === H;
    best = Math.max(best, needsInput ? reaction : Infinity);
  }
  return best;
}

test('fairness (independent check): every open lane leaves the full REACTION_TIME, even with stagger', () => {
  let worst = Infinity;
  for (let seed = 1; seed <= 20; seed++) {
    const { rows } = simulateRows(seed, 240);
    for (let k = 1; k < rows.length; k++) {
      for (const i of open(rows[k - 1])) {
        const r = bestReactionFrom(rows[k - 1], i, rows[k], rows[k].speed);
        worst = Math.min(worst, r);
        assert.ok(r >= CONFIG.REACTION_TIME - 1e-6, `seed ${seed} row ${k} lane ${i}: only ${r.toFixed(3)} s to react (${rows[k - 1].types} → ${rows[k].types})`);
      }
    }
  }
  assert.ok(worst < Infinity);
});

test('fairness: a LOW is never followed in the same lane by a LOW/HIGH closer than a full jump', () => {
  for (let seed = 1; seed <= 8; seed++) {
    const { rows } = simulateRows(seed, 240);
    for (let k = 1; k < rows.length; k++) {
      for (let lane = 0; lane < 3; lane++) {
        const t = rows[k].types[lane];
        if (rows[k - 1].types[lane] === L && (t === L || t === H)) {
          const gap = rows[k].s[lane] - rows[k - 1].s[lane];
          assert.ok(gap >= rows[k].speed * CONFIG.JUMP_TIME, `seed ${seed} row ${k} lane ${lane}: gap ${gap.toFixed(2)}`);
        }
      }
    }
  }
});

test('no lane is ever empty for two rows in a row (you always have something to do)', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { sp, rows } = simulateRows(seed, 260);
    assert.equal(sp.dropped, 0);
    for (let k = 1; k < rows.length; k++) {
      for (let lane = 0; lane < 3; lane++) {
        assert.ok(
          !(rows[k - 1].types[lane] === _ && rows[k].types[lane] === _),
          `seed ${seed} row ${k} lane ${lane}: empty twice (${rows[k - 1].types} → ${rows[k].types})`,
        );
      }
    }
  }
});

test('rows never overlap each other', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { rows } = simulateRows(seed, 240);
    for (let k = 1; k < rows.length; k++) assert.ok(rows[k].earliest > rows[k - 1].latest, `seed ${seed} row ${k}`);
  }
});

test('chaos: row spacing is irregular, rows are staggered, and random rows appear', () => {
  const { sp, rows } = simulateRows(4, 240);
  const gaps = [];
  for (let k = 1; k < rows.length; k++) gaps.push(rows[k].arrive - rows[k - 1].arrive);
  const mean = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  const sd = Math.sqrt(gaps.reduce((a, g) => a + (g - mean) ** 2, 0) / gaps.length);
  assert.ok(sd / mean > 0.15, `gap variation only ${(sd / mean).toFixed(2)}`);

  const staggered = rows.filter((r) => r.latest - r.earliest > 1).length;
  assert.ok(staggered > rows.length * 0.25, `only ${staggered}/${rows.length} rows staggered`);

  assert.ok(sp.randomRows > 20, `only ${sp.randomRows} random rows`);
  const tableSet = new Set(PATTERNS.map((p) => p.lanes.join('')));
  const offTable = rows.filter((r) => !tableSet.has(r.types.join(''))).length;
  assert.ok(offTable > 0, 'random rows should produce combinations not in the table');
});

test('rows are closer together than the old fixed 1.25 s floor once the run heats up', () => {
  const { rows } = simulateRows(2, 240);
  const late = rows.filter((r) => r.arrive > 100);
  const avg = (late[late.length - 1].arrive - late[0].arrive) / (late.length - 1);
  assert.ok(avg < 1.25, `late rows average ${avg.toFixed(2)} s apart`);
  const tight = late.filter((r, k) => k > 0 && r.arrive - late[k - 1].arrive < 1.0).length;
  assert.ok(tight > 0, 'some rows come in under a second when it is safe');
});

test('difficulty: rows get denser and harder as the run goes on', () => {
  const { rows } = simulateRows(3, 240);
  const early = rows.filter((r) => r.arrive < 40);
  const late = rows.filter((r) => r.arrive > 150);
  const avgGapTime = (rs) => (rs[rs.length - 1].arrive - rs[0].arrive) / (rs.length - 1);
  const avgObstacles = (rs) => rs.reduce((n, r) => n + r.types.filter((c) => c !== _).length, 0) / rs.length;
  assert.ok(avgGapTime(late) < avgGapTime(early), `gap ${avgGapTime(early).toFixed(2)} → ${avgGapTime(late).toFixed(2)} s`);
  assert.ok(avgObstacles(late) > avgObstacles(early), `obstacles/row ${avgObstacles(early).toFixed(2)} → ${avgObstacles(late).toFixed(2)}`);
});

test('the first row arrives after a calm start', () => {
  const { rows } = simulateRows(1, 20);
  assert.ok(rows[0].earliest >= CONFIG.FIRST_ROW_DISTANCE - 1e-9);
  assert.ok(rows[0].arrive >= 4, `first row at ${rows[0].arrive.toFixed(2)} s`);
});

test('pool: live obstacles stay well under MAX_OBSTACLES at every speed; passed ones are recycled', () => {
  for (let seed = 1; seed <= 6; seed++) {
    const { sp, maxActive } = simulateRows(seed, 260);
    assert.ok(maxActive <= CONFIG.MAX_OBSTACLES / 2, `seed ${seed}: ${maxActive} live`);
    for (const o of sp.slots) if (o.active) assert.ok(o.s > 0);
  }
});

test('pool full: rows are skipped (counted), never crash or overwrite live obstacles', () => {
  const cfg = { ...CONFIG, MAX_OBSTACLES: 4 };
  const sp = createSpawner(cfg, 2);
  let elapsed = 0;
  let scroll = 0;
  for (let i = 0; i < 120 * 60; i++) {
    elapsed += STEP;
    const v = speedAt(elapsed, cfg);
    scroll += v * STEP;
    updateSpawner(sp, scroll, v, elapsed, cfg);
    assert.ok(sp.active <= 4);
    assert.equal(sp.active, sp.slots.filter((o) => o.active).length);
  }
  assert.ok(sp.dropped > 0, 'expected some rows to be skipped with only 4 slots');
  assert.ok(sp.randomRows <= sp.rows, 'skipped rows must not be counted as random rows');
});

test('same seed → same rows; resetSpawner replays the run', () => {
  const key = (rs) => rs.map((r) => `${r.s.map((x) => (Number.isNaN(x) ? '-' : x.toFixed(6))).join(',')}:${r.types.join('')}`);
  const a = key(simulateRows(77, 60).rows);
  assert.deepEqual(a, key(simulateRows(77, 60).rows));
  assert.notDeepEqual(a, key(simulateRows(78, 60).rows));

  const sp = createSpawner(CONFIG, 77);
  updateSpawner(sp, 500, 20, 30, CONFIG);
  resetSpawner(sp, CONFIG);
  const fresh = createSpawner(CONFIG, 77);
  assert.deepEqual({ ...sp, rng: sp.rng.getState() }, { ...fresh, rng: fresh.rng.getState() });
});

// --- End-to-end: a bot survives real runs --------------------------------------------------

/**
 * One full run, stepped like stepRun (elapsed → speed → scroll → player →
 * spawner → hit test), but STRICTER than the real game: any hit at all,
 * including a side clip that would only be a stumble, ends the run. So
 * surviving here proves rows are passable without ever stumbling. The real
 * step, with stumbles and bounces, is exercised in chaser.test.js.
 */
function playRun(seed, seconds, bot) {
  const p = createPlayer(CONFIG);
  const sp = createSpawner(CONFIG, seed);
  const pBox = createBox();
  const scratch = createBox();
  let elapsed = 0;
  let scroll = 0;
  for (let i = 0; i < Math.round(seconds / STEP); i++) {
    elapsed += STEP;
    const speed = speedAt(elapsed, CONFIG);
    scroll += speed * STEP;
    if (bot) bot(p, sp, scroll, speed, elapsed);
    stepPlayer(p, STEP, CONFIG);
    updateSpawner(sp, scroll, speed, elapsed, CONFIG);
    const hit = findHit(sp, setPlayerBox(pBox, p, CONFIG), scroll, CONFIG, scratch);
    if (hit >= 0) return { caught: true, elapsed, scroll, rows: sp.rows, obstacle: { ...sp.slots[hit] }, p };
  }
  return { caught: false, elapsed, scroll, rows: sp.rows, speed: speedAt(elapsed, CONFIG) };
}

test('every run is possible in practice: a bot that waits a full reaction time before moving survives 4-minute runs on 12 seeds', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const r = playRun(seed, 240, makeBot());
    assert.equal(
      r.caught,
      false,
      r.caught
        ? `seed ${seed}: caught at ${r.elapsed.toFixed(2)} s by ${['', 'LOW', 'HIGH', 'BLOCK'][r.obstacle.type]} in lane ${r.obstacle.lane} (player lane ${r.p.lane}, y ${r.p.y.toFixed(2)}, sliding ${r.p.sliding})`
        : '',
    );
    assert.equal(r.speed, CONFIG.SPEED_MAX, 'run reached max speed');
    assert.ok(difficultyAt(r.scroll, CONFIG) === 1, 'run reached max difficulty');
    assert.ok(r.rows > 160, `seed ${seed}: only ${r.rows} rows (the pre-chaos generator gave 152)`);
  }
});

test('collisions are real: a player who never presses anything gets caught', () => {
  for (let seed = 1; seed <= 5; seed++) {
    const r = playRun(seed, 120, null);
    assert.equal(r.caught, true, `seed ${seed}`);
    assert.ok(r.elapsed > 4, 'not before the first row arrives');
  }
});

test('findHit ignores obstacles in other lanes and far away', () => {
  const sp = createSpawner(CONFIG, 1);
  for (const o of sp.slots) o.active = false;
  sp.slots[0].active = true;
  sp.slots[0].type = B;
  sp.slots[0].lane = 0;
  sp.slots[0].s = 100;
  const pb = setPlayerBox(createBox(), createPlayer(CONFIG), CONFIG);
  const scratch = createBox();
  assert.equal(findHit(sp, pb, 100, CONFIG, scratch), -1, 'other lane');
  sp.slots[0].lane = 1;
  assert.equal(findHit(sp, pb, 100, CONFIG, scratch), 0, 'same lane, same z');
  assert.equal(findHit(sp, pb, 100 - obstacleDepth(B, CONFIG), CONFIG, scratch), -1, 'still ahead');
});
