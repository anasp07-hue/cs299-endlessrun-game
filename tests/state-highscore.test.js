import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { ACTION } from '../js/logic/input.js';
import {
  STATE, CMD, nextState, startsNewRun, commandFor, shouldAutoPause, canRestart, abandonsRun,
} from '../js/logic/state.js';
import {
  HIGH_SCORE_KEY,
  parseHighScore,
  finalScore,
  isNewHighScore,
  loadHighScore,
  saveHighScore,
} from '../js/logic/highscore.js';
import { writeDigits, DIGIT_STRINGS } from '../js/logic/hud.js';

const ALL_STATES = Object.values(STATE);
const ALL_ACTIONS = Object.values(ACTION);
const READY = CONFIG.GAMEOVER_INPUT_DELAY; // game-over age at which restart keys work

// --- State machine (SPEC §4) --------------------------------------------------------

test('the SPEC §4 transitions are exactly the legal ones', () => {
  const legal = [];
  for (const from of ALL_STATES) {
    for (const cmd of Object.values(CMD)) {
      const to = nextState(from, cmd);
      if (to !== null) legal.push(`${from} -${cmd}-> ${to}`);
    }
  }
  assert.deepEqual(legal.sort(), [
    'GAMEOVER -MENU-> MENU',
    'GAMEOVER -PLAY-> PLAYING',
    'MENU -PLAY-> PLAYING',
    'MENU -SHOP-> SHOP', // Round 3 (R7): the character shop
    'PAUSED -MENU-> MENU',
    'PAUSED -PLAY-> PLAYING',
    'PAUSED -RESUME-> PLAYING',
    'PLAYING -CAUGHT-> GAMEOVER',
    'PLAYING -PAUSE-> PAUSED',
    'SHOP -MENU-> MENU', // Round 3 (R7): Back
  ]);
});

test('illegal or unknown transitions return null (ignored, never a crash)', () => {
  assert.equal(nextState(STATE.MENU, CMD.PAUSE), null);
  assert.equal(nextState(STATE.PAUSED, CMD.PAUSE), null); // blur while already paused
  assert.equal(nextState(STATE.GAMEOVER, CMD.RESUME), null);
  assert.equal(nextState(STATE.MENU, CMD.CAUGHT), null);
  assert.equal(nextState(STATE.PLAYING, CMD.PLAY), null); // no restart mid-run without pausing
  assert.equal(nextState('BOGUS', CMD.PLAY), null);
  assert.equal(nextState(STATE.MENU, 'toString'), null);
  assert.equal(nextState('__proto__', CMD.PLAY), null);
});

test('Play, Play Again and Restart start a new run; Resume does not', () => {
  assert.equal(startsNewRun(STATE.MENU, CMD.PLAY), true);
  assert.equal(startsNewRun(STATE.GAMEOVER, CMD.PLAY), true);
  assert.equal(startsNewRun(STATE.PAUSED, CMD.PLAY), true);
  assert.equal(startsNewRun(STATE.PAUSED, CMD.RESUME), false);
  assert.equal(startsNewRun(STATE.PLAYING, CMD.PLAY), false);
});

test('the full loop menu → play → pause → resume → caught → play again → caught → menu is legal', () => {
  let s = STATE.MENU;
  for (const cmd of [CMD.PLAY, CMD.PAUSE, CMD.RESUME, CMD.CAUGHT, CMD.PLAY, CMD.CAUGHT, CMD.MENU, CMD.PLAY]) {
    const next = nextState(s, cmd);
    assert.notEqual(next, null, `${cmd} from ${s}`);
    s = next;
  }
  assert.equal(s, STATE.PLAYING);
});

test('movement keys only act while PLAYING', () => {
  for (const state of ALL_STATES) {
    for (const a of [ACTION.LEFT, ACTION.RIGHT, ACTION.SLIDE]) {
      const cmd = commandFor(state, a, READY, CONFIG);
      if (state === STATE.PLAYING) assert.equal(cmd, a, `${a} while PLAYING`);
      else assert.equal(cmd, CMD.NONE, `${a} in ${state}`);
    }
  }
  assert.equal(commandFor(STATE.PLAYING, ACTION.JUMP, 0, CONFIG), CMD.JUMP);
});

test('Enter / Space start a run from the menu, as PLAY only (never also a JUMP)', () => {
  assert.equal(commandFor(STATE.MENU, ACTION.CONFIRM, 0, CONFIG), CMD.PLAY);
  assert.equal(commandFor(STATE.MENU, ACTION.JUMP, 0, CONFIG), CMD.PLAY);
  assert.equal(commandFor(STATE.MENU, ACTION.PAUSE, 0, CONFIG), CMD.NONE);
});

test('Esc / P toggle pause; Enter also resumes; Space does not (no accidental resume)', () => {
  assert.equal(commandFor(STATE.PLAYING, ACTION.PAUSE, 0, CONFIG), CMD.PAUSE);
  assert.equal(commandFor(STATE.PAUSED, ACTION.PAUSE, 0, CONFIG), CMD.RESUME);
  assert.equal(commandFor(STATE.PAUSED, ACTION.CONFIRM, 0, CONFIG), CMD.RESUME);
  assert.equal(commandFor(STATE.PAUSED, ACTION.JUMP, 0, CONFIG), CMD.NONE);
  assert.equal(commandFor(STATE.PLAYING, ACTION.CONFIRM, 0, CONFIG), CMD.NONE);
});

test('game over: Enter / Space → Play Again only after GAMEOVER_INPUT_DELAY', () => {
  assert.ok(CONFIG.GAMEOVER_INPUT_DELAY > 0 && CONFIG.GAMEOVER_INPUT_DELAY <= 1.5, 'short, but long enough to stop a mashed jump');
  for (const a of [ACTION.CONFIRM, ACTION.JUMP]) {
    assert.equal(commandFor(STATE.GAMEOVER, a, 0, CONFIG), CMD.NONE, `${a} at 0 s`);
    assert.equal(commandFor(STATE.GAMEOVER, a, READY - 0.01, CONFIG), CMD.NONE, `${a} just before`);
    assert.equal(commandFor(STATE.GAMEOVER, a, READY, CONFIG), CMD.PLAY, `${a} at the delay`);
    assert.equal(commandFor(STATE.GAMEOVER, a, 30, CONFIG), CMD.PLAY, `${a} much later`);
  }
  assert.equal(commandFor(STATE.GAMEOVER, ACTION.PAUSE, 30, CONFIG), CMD.NONE);
});

test('canRestart gates every Play Again path (keys and the button) by GAMEOVER_INPUT_DELAY', () => {
  assert.equal(canRestart(0, CONFIG), false);
  assert.equal(canRestart(READY - 0.001, CONFIG), false);
  assert.equal(canRestart(READY, CONFIG), true);
  assert.equal(canRestart(60, CONFIG), true);
});

test('abandonsRun: only Restart / Main Menu from PAUSED leave a run unfinished', () => {
  assert.equal(abandonsRun(STATE.PAUSED, CMD.PLAY), true); // Restart
  assert.equal(abandonsRun(STATE.PAUSED, CMD.MENU), true);
  assert.equal(abandonsRun(STATE.PAUSED, CMD.RESUME), false);
  assert.equal(abandonsRun(STATE.GAMEOVER, CMD.PLAY), false); // already ended (score committed on CAUGHT)
  assert.equal(abandonsRun(STATE.GAMEOVER, CMD.MENU), false);
  assert.equal(abandonsRun(STATE.MENU, CMD.PLAY), false);
});

test('unknown state or action → NONE', () => {
  for (const a of ALL_ACTIONS) assert.equal(commandFor('BOGUS', a, 99, CONFIG), CMD.NONE);
  for (const s of ALL_STATES) assert.equal(commandFor(s, null, 99, CONFIG), CMD.NONE);
});

test('auto-pause on blur only while PLAYING', () => {
  for (const s of ALL_STATES) assert.equal(shouldAutoPause(s), s === STATE.PLAYING, s);
});

// --- High score (SPEC §4) --------------------------------------------------------------

test('the storage key is the one in SPEC §4', () => {
  assert.equal(HIGH_SCORE_KEY, 'neonWasteland.highScore');
});

test('parseHighScore: missing, garbage, negative and non-finite values become 0', () => {
  for (const raw of [null, undefined, '', '   ', 'abc', '12abc', 'NaN', 'Infinity', '-Infinity', '-5', '0', '-0', '{}', '[]x']) {
    assert.equal(parseHighScore(raw), 0, JSON.stringify(raw));
  }
});

test('parseHighScore: plain digit strings become whole non-negative numbers', () => {
  assert.equal(parseHighScore('1234'), 1234);
  assert.equal(parseHighScore('  42 '), 42);
  assert.equal(parseHighScore('007'), 7);
  assert.equal(parseHighScore(77), 77);
  assert.equal(parseHighScore('9'.repeat(30)), Number.MAX_SAFE_INTEGER); // absurd values are capped
  assert.equal(parseHighScore(String(Number.MAX_SAFE_INTEGER)), Number.MAX_SAFE_INTEGER);
});

test('parseHighScore: other number syntax is garbage (the game only writes plain digits)', () => {
  // Code review, Phase 3: Number() accepted these, so a corrupted or
  // hand-edited save like '1e9' loaded as a billion. They now read as 0.
  for (const raw of ['1e3', '1e9', '1e300', '0x1F', '0b101', '0o17', '99.9', '+5', '1_000', '1 000']) {
    assert.equal(parseHighScore(raw), 0, raw);
  }
});

test('finalScore floors and rejects junk', () => {
  assert.equal(finalScore(119.97), 119);
  assert.equal(finalScore(0), 0);
  assert.equal(finalScore(-3), 0);
  assert.equal(finalScore(NaN), 0);
  assert.equal(finalScore(Infinity), 0);
});

test('a new high score must strictly beat the old one (and be above 0)', () => {
  assert.equal(isNewHighScore(101, 100), true);
  assert.equal(isNewHighScore(100.9, 100), false); // shows as 100: a tie is not a new record
  assert.equal(isNewHighScore(100, 100), false);
  assert.equal(isNewHighScore(50, 100), false);
  assert.equal(isNewHighScore(0.5, 0), false); // a 0-point run isn't a record
  assert.equal(isNewHighScore(1, 0), true); // first ever run
});

function memoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem: (k) => (Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null),
    setItem: (k, v) => {
      data[k] = String(v);
    },
  };
}
const throwingStorage = {
  getItem() {
    throw new Error('SecurityError: storage disabled');
  },
  setItem() {
    throw new Error('QuotaExceededError');
  },
};

test('load/save round-trip through a Storage-like object', () => {
  const st = memoryStorage();
  assert.equal(loadHighScore(st), 0); // nothing saved yet
  assert.equal(saveHighScore(st, 1234.8), true);
  assert.equal(st.data[HIGH_SCORE_KEY], '1234'); // stored as a whole number
  assert.equal(loadHighScore(st), 1234); // "survives a refresh": a new load reads it back
});

test('garbage in storage loads as 0', () => {
  assert.equal(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: 'hello' })), 0);
  assert.equal(loadHighScore(memoryStorage({ [HIGH_SCORE_KEY]: '-50' })), 0);
});

test('unavailable or throwing storage never crashes the game (private mode)', () => {
  assert.equal(loadHighScore(null), 0);
  assert.equal(saveHighScore(null, 500), false);
  assert.equal(loadHighScore(throwingStorage), 0);
  assert.equal(saveHighScore(throwingStorage, 500), false);
});

// --- HUD digits (no per-frame strings) ---------------------------------------------

test('writeDigits writes floor(n) most-significant first', () => {
  const out = new Array(CONFIG.HUD_DIGITS).fill(-1);
  assert.equal(writeDigits(0, out), 1);
  assert.deepEqual(out.slice(0, 1), [0]);
  assert.equal(writeDigits(7.9, out), 1);
  assert.deepEqual(out.slice(0, 1), [7]);
  assert.equal(writeDigits(10, out), 2);
  assert.deepEqual(out.slice(0, 2), [1, 0]);
  assert.equal(writeDigits(1234567, out), 7);
  assert.deepEqual(out.slice(0, 7), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(writeDigits(999999999, out), 9);
  assert.deepEqual(out, [9, 9, 9, 9, 9, 9, 9, 9, 9]);
});

test('writeDigits matches String(Math.floor(n)) across a sweep of values', () => {
  const out = new Array(CONFIG.HUD_DIGITS);
  for (let n = 0; n < 200000; n += 37.3) {
    const len = writeDigits(n, out);
    let s = '';
    for (let i = 0; i < len; i++) s += DIGIT_STRINGS[out[i]];
    assert.equal(s, String(Math.floor(n)));
  }
});

test('writeDigits: junk shows 0; overflow pins to all nines; empty buffer writes nothing', () => {
  const out = [0, 0, 0];
  for (const n of [-5, NaN, -Infinity]) {
    assert.equal(writeDigits(n, out), 1, String(n));
    assert.equal(out[0], 0);
  }
  assert.equal(writeDigits(12345, out), 3);
  assert.deepEqual(out, [9, 9, 9]);
  assert.equal(writeDigits(Infinity, out), 1); // non-finite is junk, not "huge"
  assert.equal(writeDigits(5, []), 0);
});
