// Character shop (Round 3, R7–R9; Round 5, R19–R20; SPEC §4 "Shop";
// docs/decisions/0002, 0007). Pure: no DOM, no THREE, never touches the
// global localStorage. game.js passes in a Storage-like object (or null).
//
// Round 5 (R19, replacing Round 3's R10 "skins don't save"): which characters
// are owned and which one is equipped are saved as JSON under
// CHARACTERS_KEY, only on a shop click: a successful purchase (after the
// spent shard total is saved) or equipping another character. Saving keeps
// the union with what's stored, so another tab's purchase isn't lost.
//
// The skin is cosmetic (R9): the run simulation (run.js, player.js,
// collision.js) never imports this module.

import { spendShards } from './shardbank.js';

// Same `neonWasteland.` prefix as the other saves (ADR-0010). The fourth and last key (docs/decisions/0007).
export const CHARACTERS_KEY = 'neonWasteland.characters';

export const CHARACTER = Object.freeze({
  HACKER: 'hacker',
  ANDROID: 'android',
  ALIEN: 'alien',
});

/** Shop order. The Hacker is free and owned from the start. */
export const CHARACTER_IDS = Object.freeze([CHARACTER.HACKER, CHARACTER.ANDROID, CHARACTER.ALIEN]);

export const CHARACTER_INFO = Object.freeze({
  [CHARACTER.HACKER]: Object.freeze({ name: 'HACKER', blurb: 'Black hoodie, blue visor. The original.' }),
  [CHARACTER.ANDROID]: Object.freeze({ name: 'ANDROID', blurb: 'Silver plating, one glowing eye band.' }),
  [CHARACTER.ALIEN]: Object.freeze({ name: 'ALIEN', blurb: 'Green, big-eyed, a long way from home.' }),
});

export function isCharacter(id) {
  return typeof id === 'string' && CHARACTER_IDS.includes(id);
}

/** Price in shards (0 for the Hacker), or -1 for an unknown id. */
export function characterPrice(id, cfg) {
  switch (id) {
    case CHARACTER.HACKER: return 0;
    case CHARACTER.ANDROID: return cfg.PRICE_ANDROID;
    case CHARACTER.ALIEN: return cfg.PRICE_ALIEN;
    default: return -1;
  }
}

/** A first visit: only the Hacker owned and equipped. Also what missing or bad storage loads as. */
export function createShop() {
  return { owned: { [CHARACTER.HACKER]: true }, equipped: CHARACTER.HACKER };
}

/**
 * Stored JSON → a shop. Unknown ids (and non-strings) are dropped, the
 * Hacker is always owned, and an equipped id that isn't owned falls back to
 * the Hacker. Missing or garbage input gives createShop().
 */
export function parseShop(raw) {
  const shop = createShop();
  if (typeof raw !== 'string' || raw === '') return shop;
  let obj;
  try {
    obj = JSON.parse(raw);
  } catch {
    return shop;
  }
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj) || !Array.isArray(obj.owned)) return shop;
  for (const id of obj.owned) if (isCharacter(id)) shop.owned[id] = true;
  if (owns(shop, obj.equipped)) shop.equipped = obj.equipped;
  return shop;
}

/** Read the saved shop. Missing storage or a throwing getItem → createShop(). */
export function loadShop(storage) {
  if (!storage) return createShop();
  try {
    return parseShop(storage.getItem(CHARACTERS_KEY));
  } catch {
    return createShop();
  }
}

/**
 * Add characters bought in another tab (the stored list) to `shop`. Never
 * changes the equipped character and never writes. Returns true if anything
 * was added.
 */
export function mergeStoredShop(shop, storage) {
  const stored = loadShop(storage);
  let added = false;
  for (const id of CHARACTER_IDS) {
    if (owns(stored, id) && !owns(shop, id)) {
      shop.owned[id] = true;
      added = true;
    }
  }
  return added;
}

/**
 * Save the shop: first merge in what's stored (so another tab's purchase
 * survives), then write { owned: [ids in shop order], equipped }. Returns
 * false if storage is missing or throws; the shop still works this session.
 * Called only from a shop click, never per frame.
 */
export function saveShop(storage, shop) {
  if (!storage) return false;
  mergeStoredShop(shop, storage);
  try {
    const owned = CHARACTER_IDS.filter((id) => owns(shop, id));
    storage.setItem(CHARACTERS_KEY, JSON.stringify({ owned, equipped: shop.equipped }));
    return true;
  } catch {
    return false;
  }
}

export function owns(shop, id) {
  return isCharacter(id) && shop.owned[id] === true;
}

/** True if `id` is for sale (not owned yet) and `total` covers its price. */
export function canBuy(shop, id, total, cfg) {
  return isCharacter(id) && !owns(shop, id) && total >= characterPrice(id, cfg);
}

/**
 * Buy a character: spend its price from the lifetime total (saved at once,
 * re-reading storage first; see spendShards), mark it owned and equip it,
 * then save the shop (R19).
 * Returns { ok, total }. Unknown, already owned, or unaffordable → ok false,
 * nothing spent or written; `total` is then the current best-known total.
 */
export function buyCharacter(shop, id, storage, total, cfg) {
  if (!isCharacter(id) || owns(shop, id)) return { ok: false, total };
  const r = spendShards(storage, total, characterPrice(id, cfg));
  if (!r.ok) return r;
  shop.owned[id] = true;
  shop.equipped = id;
  saveShop(storage, shop);
  return r;
}

/**
 * Equip an owned character and save the choice (R19) when `storage` is given
 * and it's a change. Returns false (and changes nothing) for one you don't own.
 */
export function equipCharacter(shop, id, storage = null) {
  if (!owns(shop, id)) return false;
  if (shop.equipped === id) return true;
  shop.equipped = id;
  saveShop(storage, shop);
  return true;
}
