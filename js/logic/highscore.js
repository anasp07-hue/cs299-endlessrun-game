// High-score persistence rules (SPEC §4). Pure: never touches the global
// localStorage. game.js passes in a Storage-like object ({ getItem, setItem })
// or null when storage is unavailable, so every path can be tested in Node.

// The prefix is the game's old working title. It is kept on purpose after the
// rename to "Apocalypse Run" so existing saved high scores aren't lost (ADR-0010).
export const HIGH_SCORE_KEY = 'neonWasteland.highScore';

/**
 * Turn a stored value into a safe high score: a non-negative integer.
 * The game only ever writes plain digits, so only plain digits (with optional
 * surrounding whitespace) are accepted. Everything else reads as 0: null, '',
 * garbage ('abc'), negatives, decimals, and number syntax a hand-edited or
 * corrupted save might contain ('1e9', '0x1F', 'Infinity').
 * Absurdly large values are capped at Number.MAX_SAFE_INTEGER.
 */
const DIGITS_ONLY = /^\d+$/;
export function parseHighScore(raw) {
  if (raw === null || raw === undefined) return 0;
  const s = String(raw).trim();
  if (!DIGITS_ONLY.test(s)) return 0;
  const n = Number(s);
  return n >= Number.MAX_SAFE_INTEGER ? Number.MAX_SAFE_INTEGER : n;
}

/** The score as shown and stored: whole points, never negative. */
export function finalScore(score) {
  return Number.isFinite(score) && score > 0 ? Math.floor(score) : 0;
}

/** A run beats the high score only if it is strictly higher (and above 0). */
export function isNewHighScore(score, high) {
  const s = finalScore(score);
  return s > 0 && s > high;
}

/** Read the high score. Missing storage, a throwing getItem, or garbage → 0. */
export function loadHighScore(storage) {
  if (!storage) return 0;
  try {
    return parseHighScore(storage.getItem(HIGH_SCORE_KEY));
  } catch {
    return 0;
  }
}

/**
 * Write the high score. Returns true if it was saved; false if storage is
 * missing or throws (private mode, quota exceeded). The game keeps going
 * either way: the score just isn't kept.
 */
export function saveHighScore(storage, score) {
  if (!storage) return false;
  try {
    storage.setItem(HIGH_SCORE_KEY, String(finalScore(score)));
    return true;
  } catch {
    return false;
  }
}
