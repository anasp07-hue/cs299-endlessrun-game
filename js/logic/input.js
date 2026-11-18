// Keyboard → action mapping (SPEC §3.3, §4). Pure: no DOM, no THREE.
// Uses KeyboardEvent.code (physical key position), so WASD works on any layout.
// What an action *does* depends on the game state: see commandFor() in state.js.

export const ACTION = Object.freeze({
  LEFT: 'LEFT',
  RIGHT: 'RIGHT',
  JUMP: 'JUMP',
  SLIDE: 'SLIDE',
  PAUSE: 'PAUSE', // Esc / P: toggle pause (SPEC §3.3)
  CONFIRM: 'CONFIRM', // Enter: Play / Play Again (Space also confirms on menus, via JUMP)
});

const KEY_TO_ACTION = Object.freeze({
  ArrowLeft: ACTION.LEFT,
  KeyA: ACTION.LEFT,
  ArrowRight: ACTION.RIGHT,
  KeyD: ACTION.RIGHT,
  ArrowUp: ACTION.JUMP,
  KeyW: ACTION.JUMP,
  Space: ACTION.JUMP,
  ArrowDown: ACTION.SLIDE,
  KeyS: ACTION.SLIDE,
  Escape: ACTION.PAUSE,
  KeyP: ACTION.PAUSE,
  Enter: ACTION.CONFIRM,
  NumpadEnter: ACTION.CONFIRM,
});

/**
 * Action for a keydown event (anything with code/ctrlKey/metaKey/altKey), or
 * null. Returns null when Ctrl, Cmd, or Alt is held, so browser/OS shortcuts
 * (Cmd+← Back, Cmd+D, Ctrl+S, Cmd+P print, Alt+←) are never swallowed by the
 * game. Shift is allowed.
 */
export function actionForKeyEvent(e) {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  return actionForKey(e.code);
}

/** Action for a KeyboardEvent.code, or null if the key isn't a game key. */
export function actionForKey(code) {
  return Object.prototype.hasOwnProperty.call(KEY_TO_ACTION, code) ? KEY_TO_ACTION[code] : null;
}
