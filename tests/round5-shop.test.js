// Round 5: bought skins are saved, and cost more (SPEC §4 "Shop", R19–R20;
// docs/decisions/0007). Ownership and the equipped character are stored as
// JSON under neonWasteland.characters, written only on a shop click.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import {
  CHARACTER, CHARACTER_IDS, CHARACTERS_KEY, characterPrice, createShop, owns, canBuy, buyCharacter, equipCharacter,
  parseShop, loadShop, saveShop, mergeStoredShop,
} from '../js/logic/shop.js';
import { SHARD_TOTAL_KEY, loadShardTotal } from '../js/logic/shardbank.js';

/** A Storage-like Map that records every write. */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    writes: [],
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { this.writes.push(k); m.set(k, String(v)); },
    raw: (k) => m.get(k),
    keys: () => [...m.keys()],
  };
}

const throwing = {
  getItem() { throw new Error('denied'); },
  setItem() { throw new Error('denied'); },
};

// --- R20: higher prices -----------------------------------------------------------------

test('R20: the Android costs 300 shards and the Alien 600 (was 100 / 200)', () => {
  assert.equal(CONFIG.PRICE_ANDROID, 300);
  assert.equal(CONFIG.PRICE_ALIEN, 600);
  assert.equal(characterPrice(CHARACTER.ANDROID, CONFIG), 300);
  assert.equal(characterPrice(CHARACTER.ALIEN, CONFIG), 600);
  assert.equal(characterPrice(CHARACTER.HACKER, CONFIG), 0);
});

test('R20: the shop charges the new price: 299 is not enough for the Android, 300 is', () => {
  const shop = createShop();
  assert.equal(canBuy(shop, CHARACTER.ANDROID, 299, CONFIG), false);
  assert.equal(buyCharacter(shop, CHARACTER.ANDROID, fakeStorage({ [SHARD_TOTAL_KEY]: '299' }), 299, CONFIG).ok, false);
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '650' });
  assert.deepEqual(buyCharacter(shop, CHARACTER.ANDROID, storage, 650, CONFIG), { ok: true, total: 350 });
  assert.equal(canBuy(shop, CHARACTER.ALIEN, 350, CONFIG), false, '600 for the Alien');
  assert.equal(loadShardTotal(storage), 350);
});

// --- R19: owned and equipped characters are saved ----------------------------------------

test('R19: the key keeps the neonWasteland. prefix', () => {
  assert.equal(CHARACTERS_KEY, 'neonWasteland.characters');
});

test('R19: after buying, equipping and a "reload", the same characters are owned and the same one equipped', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '1000' });
  let total = loadShardTotal(storage);
  const shop = loadShop(storage);
  assert.deepEqual(shop, createShop(), 'first visit: Hacker only');
  total = buyCharacter(shop, CHARACTER.ANDROID, storage, total, CONFIG).total;
  total = buyCharacter(shop, CHARACTER.ALIEN, storage, total, CONFIG).total;
  assert.equal(total, 100);
  assert.ok(equipCharacter(shop, CHARACTER.ANDROID, storage));

  // Reload: everything is rebuilt from storage alone.
  const reloaded = loadShop(storage);
  for (const id of CHARACTER_IDS) assert.equal(owns(reloaded, id), true, id);
  assert.equal(reloaded.equipped, CHARACTER.ANDROID);
  assert.equal(loadShardTotal(storage), 100, 'spent shards stay spent');
  assert.equal(canBuy(reloaded, CHARACTER.ALIEN, 1e6, CONFIG), false, 'not for sale again');
});

test('R19: a purchase saves the total and then the characters; equipping saves only the characters', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '400' });
  const shop = createShop();
  buyCharacter(shop, CHARACTER.ANDROID, storage, 400, CONFIG);
  assert.deepEqual(storage.writes, [SHARD_TOTAL_KEY, CHARACTERS_KEY]);
  assert.deepEqual(JSON.parse(storage.raw(CHARACTERS_KEY)), { owned: ['hacker', 'android'], equipped: 'android' });
  storage.writes.length = 0;
  equipCharacter(shop, CHARACTER.HACKER, storage);
  assert.deepEqual(storage.writes, [CHARACTERS_KEY]);
  assert.deepEqual(JSON.parse(storage.raw(CHARACTERS_KEY)), { owned: ['hacker', 'android'], equipped: 'hacker' });
  // Refused actions write nothing.
  storage.writes.length = 0;
  assert.equal(equipCharacter(shop, CHARACTER.ALIEN, storage), false, 'not owned');
  assert.equal(buyCharacter(shop, CHARACTER.ALIEN, storage, 100, CONFIG).ok, false, 'too poor');
  assert.equal(buyCharacter(shop, CHARACTER.ANDROID, storage, 1e6, CONFIG).ok, false, 'already owned');
  assert.deepEqual(storage.writes, []);
});

test('R19: missing, garbage or unreadable storage loads as "Hacker only, Hacker equipped"', () => {
  const fresh = createShop();
  assert.deepEqual(loadShop(null), fresh);
  assert.deepEqual(loadShop(fakeStorage()), fresh);
  assert.deepEqual(loadShop(throwing), fresh);
  for (const raw of ['', 'nope', '{', 'null', '[]', '42', '"android"', '{"owned":"android"}', '{"owned":[1,2]}']) {
    assert.deepEqual(parseShop(raw), fresh, JSON.stringify(raw));
  }
});

test('R19: loading drops unknown ids, always owns the Hacker, and never equips a character not owned', () => {
  const a = parseShop('{"owned":["alien","dragon","alien"],"equipped":"alien"}');
  assert.equal(owns(a, CHARACTER.HACKER), true);
  assert.equal(owns(a, CHARACTER.ALIEN), true);
  assert.equal(owns(a, CHARACTER.ANDROID), false);
  assert.equal(a.equipped, CHARACTER.ALIEN);
  assert.equal(Object.keys(a.owned).length, 2, 'no "dragon"');
  assert.equal(parseShop('{"owned":["hacker"],"equipped":"alien"}').equipped, CHARACTER.HACKER, 'equipped but not owned');
  assert.equal(parseShop('{"owned":["android"],"equipped":"dragon"}').equipped, CHARACTER.HACKER);
  assert.equal(parseShop('{"owned":["android"]}').equipped, CHARACTER.HACKER);
  assert.equal(parseShop('{"owned":["__proto__","constructor"],"equipped":"constructor"}').equipped, CHARACTER.HACKER);
});

test('R19: saving keeps characters another tab bought (union), and entering the shop picks them up', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '2000' });
  const tabA = loadShop(storage);
  const tabB = loadShop(storage);
  buyCharacter(tabB, CHARACTER.ALIEN, storage, 2000, CONFIG); // tab B buys the Alien
  buyCharacter(tabA, CHARACTER.ANDROID, storage, 1400, CONFIG); // tab A, which doesn't know, buys the Android
  const reloaded = loadShop(storage);
  assert.equal(owns(reloaded, CHARACTER.ALIEN), true, 'tab B\'s purchase survived tab A\'s save');
  assert.equal(owns(reloaded, CHARACTER.ANDROID), true);
  assert.equal(reloaded.equipped, CHARACTER.ANDROID, 'the last save\'s choice');
  assert.equal(owns(tabA, CHARACTER.ALIEN), true, 'tab A learned of it on saving');

  const tabC = createShop();
  assert.equal(mergeStoredShop(tabC, storage), true, 'something new');
  assert.equal(owns(tabC, CHARACTER.ALIEN), true);
  assert.equal(tabC.equipped, CHARACTER.HACKER, 'merging never changes this tab\'s equipped character');
  assert.equal(mergeStoredShop(tabC, storage), false, 'nothing new the second time');
  assert.deepEqual(storage.writes.filter((k) => k === CHARACTERS_KEY).length, 2, 'merging never writes');
});

test('R19: without storage (private mode), buying and equipping still work for the session', () => {
  for (const storage of [null, throwing]) {
    const shop = createShop();
    const r = buyCharacter(shop, CHARACTER.ANDROID, storage, 300, CONFIG);
    assert.deepEqual(r, { ok: true, total: 0 });
    assert.equal(shop.equipped, CHARACTER.ANDROID);
    assert.equal(equipCharacter(shop, CHARACTER.HACKER, storage), true);
    assert.equal(saveShop(storage, shop), false);
    assert.equal(mergeStoredShop(shop, storage), false);
  }
});

test('R19: the shop module never touches the global localStorage', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../js/logic/shop.js', import.meta.url), 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(code, /localStorage|sessionStorage|window|document/);
});
