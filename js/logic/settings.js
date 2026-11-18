// Player settings persistence (SPEC §6 "mute setting is saved", game-systems
// skill, ADR-0015). Pure: game.js passes in a Storage-like object (or null),
// like highscore.js, so every path is testable in Node.

// Same legacy prefix as the high score (ADR-0010): saves survive the rename.
export const SETTINGS_KEY = 'neonWasteland.settings';

export const DEFAULT_SETTINGS = Object.freeze({ muted: false });

/**
 * Stored JSON → settings: known keys of the right type are taken, everything
 * else (missing, garbage, wrong types, unknown keys) falls back to defaults.
 */
export function parseSettings(raw) {
  const out = { ...DEFAULT_SETTINGS };
  if (typeof raw !== 'string' || raw === '') return out;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return out;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return out;
  if (typeof obj.muted === 'boolean') out.muted = obj.muted;
  return out;
}

export function loadSettings(storage) {
  if (!storage) return { ...DEFAULT_SETTINGS };
  try {
    return parseSettings(storage.getItem(SETTINGS_KEY));
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Returns true if saved; false if storage is missing or throws (the game carries on). */
export function saveSettings(storage, settings) {
  if (!storage) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify({ muted: settings.muted === true }));
    return true;
  } catch {
    return false;
  }
}
