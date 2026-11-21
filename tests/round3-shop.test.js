// Round 3 logic: the character shop (R7) and its two new characters (R8).
// Round 3's "skins don't save" (R10) was replaced in Round 5 by R19 (skins are
// saved), and the prices went up (R20): those tests are in round5-shop.test.js.
// Amounts here are worked out from the CONFIG prices, so they hold at any price.
// See SPEC §1 (R7–R10, R19–R20), §4 "Shop", docs/decisions/0002, 0003, 0007.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { ACTION } from '../js/logic/input.js';
import { STATE, CMD, nextState, commandFor, startsNewRun, abandonsRun, shouldAutoPause } from '../js/logic/state.js';
import { SHARD_TOTAL_KEY, loadShardTotal, spendShards, bankRunShards } from '../js/logic/shardbank.js';
import {
  CHARACTER, CHARACTER_IDS, CHARACTER_INFO, CHARACTERS_KEY, characterPrice, createShop, owns, canBuy, buyCharacter,
  equipCharacter, isCharacter,
} from '../js/logic/shop.js';

const P = CONFIG.PRICE_ANDROID;

/** A localStorage stand-in backed by a Map, recording every write. */
function fakeStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    writes: [],
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem(k, v) { this.writes.push(k); m.set(k, String(v)); },
    keys: () => [...m.keys()],
    raw: (k) => m.get(k),
  };
}
const throwingStorage = {
  getItem() { throw new Error('SecurityError: storage disabled'); },
  setItem() { throw new Error('QuotaExceededError'); },
};

// --- R7: the shop -------------------------------------------------------------

test('R7: the shop sells three characters in order: Hacker (free), Android, Alien', () => {
  assert.deepEqual([...CHARACTER_IDS], ['hacker', 'android', 'alien']);
  for (const id of CHARACTER_IDS) {
    assert.ok(isCharacter(id));
    assert.equal(typeof CHARACTER_INFO[id].name, 'string');
    assert.ok(CHARACTER_INFO[id].blurb.length > 0);
  }
  assert.equal(characterPrice(CHARACTER.HACKER, CONFIG), 0);
  assert.equal(isCharacter('agent'), false, 'the chaser is not for sale');
  assert.equal(isCharacter('toString'), false);
  assert.equal(characterPrice('nope', CONFIG), -1);
});

test('R7: a fresh shop owns and equips only the Hacker', () => {
  const shop = createShop();
  assert.equal(shop.equipped, CHARACTER.HACKER);
  assert.deepEqual(CHARACTER_IDS.filter((id) => owns(shop, id)), [CHARACTER.HACKER]);
});

test('R7: buying with enough shards spends exactly the price, saves the total, and equips the character', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: String(P + 30) });
  const shop = createShop();
  assert.equal(canBuy(shop, CHARACTER.ANDROID, P + 30, CONFIG), true);
  const r = buyCharacter(shop, CHARACTER.ANDROID, storage, P + 30, CONFIG);
  assert.deepEqual(r, { ok: true, total: 30 });
  assert.equal(storage.raw(SHARD_TOTAL_KEY), '30');
  assert.deepEqual(storage.writes, [SHARD_TOTAL_KEY, CHARACTERS_KEY], 'the shard total once, then the characters (R19)');
  assert.equal(owns(shop, CHARACTER.ANDROID), true);
  assert.equal(shop.equipped, CHARACTER.ANDROID);
});

test('R7: an exact balance is enough; one shard short is not, and nothing changes', () => {
  const price = CONFIG.PRICE_ALIEN;
  const short = fakeStorage({ [SHARD_TOTAL_KEY]: String(price - 1) });
  const shop = createShop();
  assert.equal(canBuy(shop, CHARACTER.ALIEN, price - 1, CONFIG), false);
  const r = buyCharacter(shop, CHARACTER.ALIEN, short, price - 1, CONFIG);
  assert.deepEqual(r, { ok: false, total: price - 1 });
  assert.equal(short.writes.length, 0, 'a refused purchase writes nothing');
  assert.equal(owns(shop, CHARACTER.ALIEN), false);
  assert.equal(shop.equipped, CHARACTER.HACKER);

  const exact = fakeStorage({ [SHARD_TOTAL_KEY]: String(price) });
  assert.deepEqual(buyCharacter(shop, CHARACTER.ALIEN, exact, price, CONFIG), { ok: true, total: 0 });
  assert.equal(loadShardTotal(exact), 0);
});

test('R7: an owned character cannot be bought again, and the Hacker is never sold', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: String(P + 400) });
  const shop = createShop();
  assert.equal(buyCharacter(shop, CHARACTER.ANDROID, storage, P + 400, CONFIG).total, 400);
  assert.equal(canBuy(shop, CHARACTER.ANDROID, 400, CONFIG), false);
  assert.deepEqual(buyCharacter(shop, CHARACTER.ANDROID, storage, 400, CONFIG), { ok: false, total: 400 });
  assert.deepEqual(buyCharacter(shop, CHARACTER.HACKER, storage, 400, CONFIG), { ok: false, total: 400 });
  assert.deepEqual(buyCharacter(shop, 'agent', storage, 400, CONFIG), { ok: false, total: 400 });
  assert.equal(loadShardTotal(storage), 400, 'only the first purchase spent anything');
});

test('R7: equipping works only for owned characters', () => {
  const shop = createShop();
  assert.equal(equipCharacter(shop, CHARACTER.ALIEN), false);
  assert.equal(shop.equipped, CHARACTER.HACKER);
  buyCharacter(shop, CHARACTER.ALIEN, null, 1000, CONFIG);
  assert.equal(shop.equipped, CHARACTER.ALIEN);
  assert.equal(equipCharacter(shop, CHARACTER.HACKER), true);
  assert.equal(shop.equipped, CHARACTER.HACKER);
  assert.equal(equipCharacter(shop, CHARACTER.ALIEN), true, 'a bought character can be re-equipped for free');
  assert.equal(equipCharacter(shop, 'bogus'), false);
  assert.equal(shop.equipped, CHARACTER.ALIEN);
});

test('R7: spending re-reads storage, so shards another tab banked are not overwritten', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '250' }); // another tab banked up to 250
  const r = spendShards(storage, 120, 100); // this tab still thinks 120
  assert.deepEqual(r, { ok: true, total: 150 });
  assert.equal(loadShardTotal(storage), 150);
  // ...and the in-memory total wins when it is the larger one
  const stale = fakeStorage({ [SHARD_TOTAL_KEY]: '50' });
  assert.deepEqual(spendShards(stale, 120, 100), { ok: true, total: 20 });
});

test('R7: the total never goes negative, and bad prices are refused', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: '40' });
  for (const price of [41, 0, -5, 1.5, NaN, Infinity]) {
    assert.equal(spendShards(storage, 40, price).ok, false, String(price));
  }
  assert.equal(storage.writes.length, 0);
  assert.equal(loadShardTotal(storage), 40);
});

test('R7: without storage (private mode / throwing) buying still works for the session', () => {
  for (const storage of [null, throwingStorage]) {
    const shop = createShop();
    const r = buyCharacter(shop, CHARACTER.ANDROID, storage, P + 50, CONFIG);
    assert.deepEqual(r, { ok: true, total: 50 });
    assert.equal(shop.equipped, CHARACTER.ANDROID);
  }
});

test('R7: shards banked after a purchase add on top of the spent total (no refund, no double count)', () => {
  const storage = fakeStorage({ [SHARD_TOTAL_KEY]: String(P + 20) });
  let total = P + 20;
  total = buyCharacter(createShop(), CHARACTER.ANDROID, storage, total, CONFIG).total; // 20
  const run = { shardCount: 15, shardsBanked: 0 };
  total = bankRunShards(storage, total, run);
  assert.equal(total, 35);
  assert.equal(loadShardTotal(storage), 35);
});

test('R7: the SHOP state is reached only from the menu and goes back only to the menu', () => {
  assert.equal(nextState(STATE.MENU, CMD.SHOP), STATE.SHOP);
  assert.equal(nextState(STATE.SHOP, CMD.MENU), STATE.MENU);
  for (const s of [STATE.PLAYING, STATE.PAUSED, STATE.GAMEOVER]) {
    assert.equal(nextState(s, CMD.SHOP), null, `no shop from ${s}: the skin never changes mid-run`);
  }
  for (const cmd of [CMD.PLAY, CMD.PAUSE, CMD.RESUME, CMD.CAUGHT]) {
    assert.equal(nextState(STATE.SHOP, cmd), null, `${cmd} from SHOP`);
  }
  assert.equal(startsNewRun(STATE.SHOP, CMD.MENU), false);
  assert.equal(abandonsRun(STATE.SHOP, CMD.MENU), false);
  assert.equal(shouldAutoPause(STATE.SHOP), false);
});

test('R7: in the shop Esc / P go back, M toggles sound, and Enter / Space / movement do nothing', () => {
  assert.equal(commandFor(STATE.SHOP, ACTION.PAUSE, 0, CONFIG), CMD.MENU);
  assert.equal(commandFor(STATE.SHOP, ACTION.MUTE, 0, CONFIG), CMD.MUTE);
  for (const a of [ACTION.CONFIRM, ACTION.JUMP, ACTION.LEFT, ACTION.RIGHT, ACTION.SLIDE]) {
    assert.equal(commandFor(STATE.SHOP, a, 99, CONFIG), CMD.NONE, a);
  }
  assert.equal(commandFor(STATE.MENU, ACTION.CONFIRM, 0, CONFIG), CMD.PLAY, 'the menu still plays on Enter');
});

// --- R8: two new characters, priced as the user chose ---------------------------

// The prices were 100 / 200 in Round 3; Round 5 raised them (R20, round5-shop.test.js).
test('R8: the Android (silver robot) and the Alien (green alien) are for sale, the Alien for twice the price', () => {
  assert.equal(characterPrice(CHARACTER.ANDROID, CONFIG), CONFIG.PRICE_ANDROID);
  assert.equal(characterPrice(CHARACTER.ALIEN, CONFIG), CONFIG.PRICE_ALIEN);
  assert.ok(CONFIG.PRICE_ANDROID > 0);
  assert.equal(CONFIG.PRICE_ALIEN, 2 * CONFIG.PRICE_ANDROID);
  assert.equal(CHARACTER_INFO[CHARACTER.ANDROID].name, 'ANDROID');
  assert.equal(CHARACTER_INFO[CHARACTER.ALIEN].name, 'ALIEN');
});

// --- R10 (Round 3) was replaced by R19 in Round 5 -----------------------------------
// R10 said bought skins are lost on reload and no storage key is added. R19
// reverses both: round5-shop.test.js checks that a reload keeps them (and that
// the spend still stays deducted, which R10 also checked).

test('R7: two separate shop objects do not share ownership in memory', () => {
  const a = createShop();
  buyCharacter(a, CHARACTER.ALIEN, null, 999, CONFIG);
  const b = createShop();
  assert.equal(owns(b, CHARACTER.ALIEN), false);
  assert.equal(b.equipped, CHARACTER.HACKER);
});
