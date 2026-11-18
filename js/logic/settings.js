// Player settings persistence (SPEC §6 "mute setting is saved", game-systems
// skill, ADR-0015). Pure: game.js passes in a Storage-like object (or null),
// like highscore.js, so every path is testable in Node.

// Same legacy prefix as the high score (ADR-0010): saves survive the rename.
export const SETTINGS_KEY = 'neonWasteland.settings';

/** Graphics quality (Phase 8, ADR-0016). */
export const QUALITY = Object.freeze({ HIGH: 'high', LOW: 'low' });

export const DEFAULT_SETTINGS = Object.freeze({ muted: false, quality: QUALITY.HIGH });

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
  if (obj.quality === QUALITY.HIGH || obj.quality === QUALITY.LOW) out.quality = obj.quality;
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
    const quality = settings.quality === QUALITY.LOW ? QUALITY.LOW : QUALITY.HIGH;
    storage.setItem(SETTINGS_KEY, JSON.stringify({ muted: settings.muted === true, quality }));
    return true;
  } catch {
    return false;
  }
}

/** The other quality level. */
export function toggleQuality(q) {
  return q === QUALITY.LOW ? QUALITY.HIGH : QUALITY.LOW;
}

/**
 * What a quality level turns on. LOW renders at most 1 pixel per CSS pixel and
 * drops the particle systems (dust, sparks). The game has no shadows to toggle
 * (SPEC §5: shadows off), so resolution takes their place (ADR-0016).
 * Gameplay is identical at both levels.
 */
export function qualityProfile(q, cfg) {
  const low = q === QUALITY.LOW;
  return {
    pixelRatioMax: low ? cfg.PIXEL_RATIO_MAX_LOW : cfg.PIXEL_RATIO_MAX,
    particles: !low,
  };
}
