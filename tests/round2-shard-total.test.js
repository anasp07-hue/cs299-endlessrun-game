// Round 2 logic: the lifetime shard total survives closing the game (R4) and
// banking it never changes a run (R6). Game wiring and offline checks (R5) are
// in round2-wiring.test.js.
// See SPEC §1 (requirement IDs), §4 "Shard total persistence", and
// docs/decisions/0001-bank-shards-at-checkpoints.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRun, resetRun, stepRun } from '../js/logic/run.js';
import { requestSlide } from '../js/logic/player.js';
import { HIGH_SCORE_KEY } from '../js/logic/highscore.js';
import { SETTINGS_KEY } from '../js/logic/settings.js';
import {
  SHARD_TOTAL_KEY, parseShardTotal, addShards, loadShardTotal, saveShardTotal, unbankedShards, bankRunShards,
} from '../js/logic/shardbank.js';

const STEP = CONFIG.SIM_STEP;

/** A localStorage stand-in backed by a Map, counting writes. */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    writes: 0,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { this.writes++; m.set(k, String(v)); },
    raw: (k) => m.get(k),
  };
}
const throwingStorage = {
  getItem() { throw new Error('SecurityError: storage disabled'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

/** Play a god-mode run, sliding now and then, until it has collected at least `want` shards. */
function runWithShards(seed, want, maxSeconds = 120) {
  const run = createRun(CONFIG, seed);
  for (let t = 0; t < maxSeconds && run.shardCount < want; t += STEP) stepRun(run, STEP, CONFIG, true);
  assert.ok(run.shardCount >= want, `seed ${seed} collected only ${run.shardCount} shards`);
  return run;
}

// --- R4: shards are saved after closing, like the high score ---------------

test('R4: the shard total has its own storage key next to the high score and settings', () => {
  assert.equal(SHARD_TOTAL_KEY, 'neonWasteland.shardTotal');
  assert.notEqual(SHARD_TOTAL_KEY, HIGH_SCORE_KEY);
  assert.notEqual(SHARD_TOTAL_KEY, SETTINGS_KEY);
});

test('R4: stored totals parse like the high score: plain digits only, everything else is 0', () => {
  assert.equal(parseShardTotal('42'), 42);
  assert.equal(parseShardTotal(' 7 '), 7);
  assert.equal(parseShardTotal('0'), 0);
  for (const bad of [null, undefined, '', 'abc', '-5', '3.5', '1e9', '0x1F', 'Infinity', 'NaN']) {
    assert.equal(parseShardTotal(bad), 0, `${bad}`);
  }
  assert.equal(parseShardTotal('99999999999999999999'), Number.MAX_SAFE_INTEGER);
});

test('R4: addShards adds whole, non-negative counts and never overflows', () => {
  assert.equal(addShards(10, 5), 15);
  assert.equal(addShards(0, 0), 0);
  assert.equal(addShards(10, -3), 10, 'a negative count never takes shards away');
  assert.equal(addShards(10, NaN), 10);
  assert.equal(addShards(10, 2.9), 12, 'fractions are floored');
  assert.equal(addShards(Number.MAX_SAFE_INTEGER - 1, 5), Number.MAX_SAFE_INTEGER);
});

test('R4: the total saved in one session loads in the next (closing and reopening)', () => {
  const storage = fakeStorage();
  assert.equal(loadShardTotal(storage), 0, 'a first-ever session starts at 0');
  assert.equal(saveShardTotal(storage, 123), true);
  assert.equal(storage.raw(SHARD_TOTAL_KEY), '123', 'stored as a plain whole number');
  // A "new session": nothing kept in memory, only the same storage.
  assert.equal(loadShardTotal(storage), 123);
});

test('R4: a run\'s shards are added to the saved total when banked, and survive a reload', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '100' });
  let total = loadShardTotal(storage);
  const run = runWithShards(1, 4);
  const got = run.shardCount;
  total = bankRunShards(storage, total, run);
  assert.equal(total, 100 + got);
  assert.equal(run.shardsBanked, got);
  assert.equal(loadShardTotal(storage), 100 + got, 'what a reopened game would read');
});

test('R4: no shard is ever counted twice: banking mid-run (tab hidden) and again at the end adds only the new ones', () => {
  const storage = fakeStorage();
  const run = createRun(CONFIG, 2);
  let total = 0;
  let banks = 0;
  for (let t = 0; t < 90; t += STEP) {
    stepRun(run, STEP, CONFIG, true);
    if (Math.round(t / STEP) % 1500 === 0) { total = bankRunShards(storage, total, run); banks++; }
  }
  total = bankRunShards(storage, total, run); // run ends
  total = bankRunShards(storage, total, run); // e.g. pagehide right after: nothing new
  assert.ok(banks > 3 && run.shardCount > 0);
  assert.equal(total, run.shardCount);
  assert.equal(loadShardTotal(storage), run.shardCount);
});

test('R4: shards keep adding up across several runs (Play Again resets the run, not the total)', () => {
  const storage = fakeStorage();
  const run = createRun(CONFIG, 3);
  let total = loadShardTotal(storage);
  let expected = 0;
  for (const seed of [3, 4, 5]) {
    resetRun(run, CONFIG, seed);
    assert.equal(run.shardsBanked, 0, 'a fresh run has nothing banked');
    for (let t = 0; t < 40; t += STEP) stepRun(run, STEP, CONFIG, true);
    expected += run.shardCount;
    total = bankRunShards(storage, total, run);
  }
  assert.ok(expected > 0);
  assert.equal(total, expected);
  assert.equal(loadShardTotal(storage), expected);
});

test('R4: nothing new to bank means no storage write', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '9' });
  const run = createRun(CONFIG, 1); // shardCount 0
  assert.equal(unbankedShards(run), 0);
  assert.equal(bankRunShards(storage, 9, run), 9);
  assert.equal(storage.writes, 0);
});

test('R4: banking never overwrites shards another tab saved in the meantime', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '10' });
  const total = loadShardTotal(storage); // this tab read 10
  storage.setItem(SHARD_TOTAL_KEY, '25'); // another tab banked 15 more
  const run = runWithShards(1, 3);
  assert.equal(bankRunShards(storage, total, run), 25 + run.shardCount);
  assert.equal(loadShardTotal(storage), 25 + run.shardCount);
});

test('R4: without storage (private mode) the game keeps the total for the session and never throws', () => {
  for (const storage of [null, undefined, throwingStorage]) {
    assert.equal(loadShardTotal(storage), 0);
    assert.equal(saveShardTotal(storage, 5), false);
    const run = runWithShards(1, 2);
    let total = 0;
    total = bankRunShards(storage, total, run);
    assert.equal(total, run.shardCount, 'kept in memory');
    assert.equal(run.shardsBanked, run.shardCount);
  }
});

test('R4: a corrupted stored total is treated as 0 and repaired on the next bank', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: 'garbage' });
  const total = loadShardTotal(storage);
  assert.equal(total, 0);
  const run = runWithShards(1, 2);
  bankRunShards(storage, total, run);
  assert.equal(storage.raw(SHARD_TOTAL_KEY), String(run.shardCount));
});

test('R4: resetRun clears what was banked, so the next run banks from 0', () => {
  const run = runWithShards(1, 2);
  bankRunShards(null, 0, run);
  assert.ok(run.shardsBanked > 0);
  resetRun(run, CONFIG, 9);
  assert.equal(run.shardsBanked, 0);
  assert.equal(unbankedShards(run), 0);
});

// --- R6: nothing else breaks, runs are still smooth -------------------------

/** The parts of a run that decide gameplay. */
function gameplay(run) {
  return {
    score: run.score, scroll: run.scroll, shardCount: run.shardCount, caught: run.caught,
    rows: run.spawner.slots.filter((o) => o.active).map((o) => `${o.row}:${o.lane}:${o.type}:${o.s}`).join(','),
    shards: run.shards.slots.filter((o) => o.active).map((o) => `${o.lane}:${o.s}`).join(','),
  };
}

test('R6: banking (even often, mid-run) never changes the run: score, shards and obstacles match a twin run', () => {
  for (const seed of [1, 7, 42]) {
    const a = createRun(CONFIG, seed);
    const b = createRun(CONFIG, seed);
    const storage = fakeStorage();
    let total = 0;
    for (let i = 0; i < 60 / STEP; i++) {
      if (i % 400 === 200) { requestSlide(a.player, CONFIG); requestSlide(b.player, CONFIG); }
      stepRun(a, STEP, CONFIG, true);
      stepRun(b, STEP, CONFIG, true);
      if (i % 97 === 0) total = bankRunShards(storage, total, b);
    }
    assert.deepEqual(gameplay(b), gameplay(a), `seed ${seed}`);
    assert.ok(a.shardCount > 0);
  }
});

test('R6: the fixed step never banks: stepping a run alone leaves shardsBanked at 0 (no storage work per frame)', () => {
  const run = runWithShards(4, 3);
  assert.equal(run.shardsBanked, 0);
  assert.equal(unbankedShards(run), run.shardCount);
});
