// Game state machine (SPEC §4, ADR-0008). Pure: no DOM, no THREE.
//
//  SHOP ◀──SHOP── MENU ──PLAY──▶ PLAYING ◀──RESUME── PAUSED
//   └──MENU (Back/Esc/P)──▶ ▲      │  ──PAUSE (Esc/P/blur)──▶
//                           │      ▼ CAUGHT
//                           │  GAMEOVER ──PLAY──▶ PLAYING
//                           └──MENU──┘
//
// SHOP (Round 3, R7) is reached only from the menu, so the equipped
// character can never change mid-run.
//
// game.js owns the side effects (overlays, resetRun, saving the high score);
// this module only says which transitions are legal and what a key means in
// each state, so both can be tested in Node.

import { ACTION } from './input.js';

export const STATE = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
  SHOP: 'SHOP', // character shop (Round 3)
});

/** What the game should do in response to input or an event. */
export const CMD = Object.freeze({
  NONE: 'NONE',
  PLAY: 'PLAY', // start a fresh run (from MENU, GAMEOVER, or PAUSED → Restart)
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  MENU: 'MENU', // back to the main menu (abandons the run)
  CAUGHT: 'CAUGHT', // the run ended
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  JUMP: 'JUMP',
  SLIDE: 'SLIDE',
  MUTE: 'MUTE', // toggle sound; never changes state (game.js handles it directly)
  SHOP: 'SHOP', // open the character shop from the menu (Round 3)
  FIRE: 'FIRE', // fire the held bazooka; never changes state (Round 4, R12)
});

// Legal transitions: TRANSITIONS[from][cmd] = to. Anything missing is ignored.
const TRANSITIONS = Object.freeze({
  [STATE.MENU]: Object.freeze({ [CMD.PLAY]: STATE.PLAYING, [CMD.SHOP]: STATE.SHOP }),
  [STATE.SHOP]: Object.freeze({ [CMD.MENU]: STATE.MENU }), // Back
  [STATE.PLAYING]: Object.freeze({
    [CMD.PAUSE]: STATE.PAUSED,
    [CMD.CAUGHT]: STATE.GAMEOVER,
  }),
  [STATE.PAUSED]: Object.freeze({
    [CMD.RESUME]: STATE.PLAYING,
    [CMD.PLAY]: STATE.PLAYING, // Restart
    [CMD.MENU]: STATE.MENU,
  }),
  [STATE.GAMEOVER]: Object.freeze({
    [CMD.PLAY]: STATE.PLAYING, // Play Again
    [CMD.MENU]: STATE.MENU,
  }),
});

/**
 * The state that `cmd` leads to from `state`, or null if the command doesn't
 * apply there (e.g. PAUSE from MENU, or a blur while already paused).
 */
export function nextState(state, cmd) {
  const row = Object.prototype.hasOwnProperty.call(TRANSITIONS, state) ? TRANSITIONS[state] : null;
  if (row === null || !Object.prototype.hasOwnProperty.call(row, cmd)) return null;
  return row[cmd];
}

/** True if this transition starts a brand-new run (so run state must be reset). */
export function startsNewRun(from, cmd) {
  return cmd === CMD.PLAY && nextState(from, cmd) === STATE.PLAYING;
}

/**
 * What a key action means in the current state.
 * - MENU: Enter / Space → Play.
 * - PLAYING: movement keys move; F fires the bazooka (Round 4); Esc / P pause.
 * - PAUSED: Esc / P / Enter resume. Movement keys do nothing.
 * - SHOP: Esc / P → back to the menu. Enter / Space do nothing on their own
 *   (a focused shop button handles them), so a stray key can't start a run.
 * - GAMEOVER: Enter / Space → Play Again, but only once `gameOverAge` (seconds
 *   since the run ended) reaches GAMEOVER_INPUT_DELAY, so a jump that was
 *   being mashed as you got caught can't instantly restart the run.
 * The key that starts a run maps to PLAY only, never JUMP as well, so it
 * can't also make the player jump on the first frame.
 */
export function commandFor(state, action, gameOverAge, cfg) {
  // M toggles sound in every real state, even mid-run (an unknown state still does nothing).
  if (action === ACTION.MUTE) return Object.prototype.hasOwnProperty.call(TRANSITIONS, state) ? CMD.MUTE : CMD.NONE;
  switch (state) {
    case STATE.MENU:
      return action === ACTION.CONFIRM || action === ACTION.JUMP ? CMD.PLAY : CMD.NONE;
    case STATE.PLAYING:
      if (action === ACTION.LEFT) return CMD.LEFT;
      if (action === ACTION.RIGHT) return CMD.RIGHT;
      if (action === ACTION.JUMP) return CMD.JUMP;
      if (action === ACTION.SLIDE) return CMD.SLIDE;
      if (action === ACTION.FIRE) return CMD.FIRE;
      if (action === ACTION.PAUSE) return CMD.PAUSE;
      return CMD.NONE;
    case STATE.PAUSED:
      return action === ACTION.PAUSE || action === ACTION.CONFIRM ? CMD.RESUME : CMD.NONE;
    case STATE.SHOP:
      return action === ACTION.PAUSE ? CMD.MENU : CMD.NONE;
    case STATE.GAMEOVER:
      if (action !== ACTION.CONFIRM && action !== ACTION.JUMP) return CMD.NONE;
      return canRestart(gameOverAge, cfg) ? CMD.PLAY : CMD.NONE;
    default:
      return CMD.NONE;
  }
}

/**
 * True once the game-over screen has been up for GAMEOVER_INPUT_DELAY. Every
 * Play Again path uses this (keys, and the button too, since a focused button
 * can be pressed with Enter/Space), so none of them can skip the screen.
 */
export function canRestart(gameOverAge, cfg) {
  return gameOverAge >= cfg.GAMEOVER_INPUT_DELAY;
}

/** True for transitions that leave a run unfinished (Restart / Main Menu from pause). */
export function abandonsRun(from, cmd) {
  return from === STATE.PAUSED && (cmd === CMD.PLAY || cmd === CMD.MENU);
}

/** Only an active run auto-pauses when the tab loses focus (SPEC §4). */
export function shouldAutoPause(state) {
  return state === STATE.PLAYING;
}
