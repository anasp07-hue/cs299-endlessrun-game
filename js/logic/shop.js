// Character shop (Round 3, R7–R10; SPEC §4 "Shop"; docs/decisions/0002).
// Pure: no DOM, no THREE, never touches the global localStorage. game.js
// passes in a Storage-like object (or null) only so a purchase can save the
// spent shard total through shardbank.js.
//
// R10 "skins don't save": which characters are owned and which one is
// equipped live only in this in-memory object. Nothing here writes them
// anywhere, so a reload starts again with just the Hacker. The shards spent
// on a purchase *are* saved (the user's choice): the deduction stays.
//
// The skin is cosmetic (R9): the run simulation (run.js, player.js,
// collision.js) never imports this module.

import { spendShards } from './shardbank.js';

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

/** A fresh session: only the Hacker owned and equipped. This is also what every reload starts from (R10). */
export function createShop() {
  return { owned: { [CHARACTER.HACKER]: true }, equipped: CHARACTER.HACKER };
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
 * re-reading storage first; see spendShards), mark it owned and equip it.
 * Returns { ok, total }. Unknown, already owned, or unaffordable → ok false,
 * nothing spent or written; `total` is then the current best-known total.
 */
export function buyCharacter(shop, id, storage, total, cfg) {
  if (!isCharacter(id) || owns(shop, id)) return { ok: false, total };
  const r = spendShards(storage, total, characterPrice(id, cfg));
  if (!r.ok) return r;
  shop.owned[id] = true;
  shop.equipped = id;
  return r;
}

/** Equip an owned character. Returns false (and changes nothing) for one you don't own. */
export function equipCharacter(shop, id) {
  if (!owns(shop, id)) return false;
  shop.equipped = id;
  return true;
}
