// Round 5 wiring: game.js loads the saved characters at startup and saves
// them only on shop clicks (R19, replacing Round 3's R10 checks); the shop
// note says purchases are saved; phase's HUD timer copes with 5 s (R17).
// Static checks over the source files, like round3-wiring.test.js.
// See SPEC §1 (R17–R20), §4 "Shop", docs/decisions/0007.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONFIG } from '../js/logic/config.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `function ${name} not found`);
  return src.slice(at, src.indexOf('\n}\n', at));
}

function gameSources() {
  const files = [join(ROOT, 'game.js'), join(ROOT, 'index.html'), join(ROOT, 'style.css')];
  for (const dir of ['js', 'js/logic']) {
    for (const f of readdirSync(join(ROOT, dir))) if (f.endsWith('.js')) files.push(join(ROOT, dir, f));
  }
  return files.map((f) => [f, readFileSync(f, 'utf8')]);
}

test('R19: game code uses exactly four localStorage keys, the new one being neonWasteland.characters', () => {
  const keys = new Set();
  for (const [f, src] of gameSources()) {
    for (const m of src.matchAll(/neonWasteland\.(\w+)/g)) keys.add(m[1]);
    assert.doesNotMatch(src, /sessionStorage|indexedDB|document\.cookie|caches\.open/, `${f} uses another kind of storage`);
  }
  assert.deepEqual([...keys].sort(), ['characters', 'highScore', 'settings', 'shardTotal']);
});

test('R19: the shop is loaded from storage at startup, after storage is set up (no use before declaration)', () => {
  const decl = game.indexOf('let storage = null;');
  const load = game.indexOf('const shop = loadShop(storage);');
  assert.ok(decl >= 0, 'storage is declared');
  assert.ok(load > decl, 'the shop is loaded after storage exists');
  assert.ok(game.indexOf('runners[shop.equipped]') > load, 'the first runner shown is the saved one');
  assert.doesNotMatch(game, /createShop\(\)/, 'never a fresh, unsaved shop');
});

test('R19: buying and equipping save through shop.js; entering the shop picks up other tabs\' purchases', () => {
  const click = body(game, 'onShopButton');
  assert.match(click, /equipCharacter\(shop, id, storage\)/);
  assert.match(click, /buyCharacter\(shop, id, storage, shardTotal, CONFIG\)/);
  assert.match(body(game, 'dispatch'), /to === STATE\.SHOP\) \{[\s\S]*mergeStoredShop\(shop, storage\)/);
  assert.doesNotMatch(game, /saveShop\(/, 'game.js never saves the shop itself');
});

test('R19: per-frame code never touches the saved characters', () => {
  for (const name of ['loop', 'render', 'updateHud', 'updateCharacters', 'renderFx']) {
    assert.doesNotMatch(body(game, name), /loadShop|saveShop|mergeStoredShop|equipCharacter|buyCharacter|setItem|getItem/, name);
  }
});

test('R19: the shop note says bought characters are saved', () => {
  const note = html.match(/<p class="shop-note">([^<]*)<\/p>/);
  assert.ok(note, 'the shop has a note');
  assert.match(note[1], /saved/i);
  assert.doesNotMatch(note[1], /last until/i, 'not the Round 3 wording');
});

test('R17: the HUD timer strings cover the phase duration', () => {
  assert.ok(CONFIG.POWERUP_PHASE_DURATION <= CONFIG.POWERUP_DURATION, 'SECOND_STRINGS is sized by POWERUP_DURATION');
  assert.match(game, /showPowerTimer\(hudPwPhase, hudPwPhaseTime, pu\.phaseTime, 'phase'\)/);
});
