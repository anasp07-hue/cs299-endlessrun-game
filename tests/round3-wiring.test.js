// Round 3 wiring: game.js and index.html put the shop (R7) and the new
// runners (R8) into the game, the skin stays cosmetic (R9), and nothing about
// skins is ever saved (R10). Static checks over the source files, like
// round2-wiring.test.js. See SPEC §1 (R7–R10), §4 "Shop".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

/** The source of `function name(` up to its closing brace at column 0. */
function body(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `function ${name} not found`);
  return src.slice(at, src.indexOf('\n}\n', at));
}

/** Every game source file: game.js, index.html, style.css, js/**. */
function gameSources() {
  const files = [join(ROOT, 'game.js'), join(ROOT, 'index.html'), join(ROOT, 'style.css')];
  for (const dir of ['js', 'js/logic']) {
    for (const f of readdirSync(join(ROOT, dir))) if (f.endsWith('.js')) files.push(join(ROOT, dir, f));
  }
  return files.map((f) => [f, readFileSync(f, 'utf8')]);
}

// --- R7 ------------------------------------------------------------------------

test('R7: the menu has a Shop button, and the shop screen has the total, the list and Back', () => {
  const menu = html.slice(html.indexOf('id="menu"'), html.indexOf('id="pause"'));
  assert.match(menu, /id="btn-shop"/);
  const shop = html.slice(html.indexOf('id="shop"'));
  assert.match(html, /<div id="shop" class="overlay screen[^"]*" hidden>/, 'the shop starts hidden');
  for (const id of ['shop-shards', 'shop-list', 'btn-shop-back']) assert.match(shop, new RegExp(`id="${id}"`), id);
  assert.match(shop, /close the game/i, 'the shop says purchases last only until the game is closed');
});

test('R7: game.js wires the shop into the state machine and buys / equips through shop.js', () => {
  assert.match(game, /from '\.\/js\/logic\/shop\.js'/);
  assert.match(game, /\[STATE\.SHOP\]: \$\('shop'\)/, 'the shop is one of the state screens');
  assert.match(game, /onClick\('btn-shop', CMD\.SHOP\)/);
  assert.match(game, /onClick\('btn-shop-back', CMD\.MENU\)/);
  assert.match(game, /buyCharacter\(shop, id, storage, shardTotal, CONFIG\)/, 'buying spends the saved total');
  assert.match(game, /equipCharacter\(shop, id\)/);
  assert.match(game, /\[STATE\.SHOP\]: [\d.]+/, 'the music has a level for the shop');
});

test('R7: leaving the shop does not reset the road (only the pause → menu path abandons a run)', () => {
  const d = body(game, 'dispatch');
  assert.match(d, /cmd === CMD\.MENU && from !== STATE\.SHOP\) resetRun/);
});

// --- R8 ------------------------------------------------------------------------

test('R8: game.js builds every runner up front from RUNNER_BUILDERS and shows only the equipped one', () => {
  assert.match(game, /RUNNER_BUILDERS\[id\]\(\)/);
  assert.match(game, /for \(const id of CHARACTER_IDS\)/);
  assert.doesNotMatch(game, /createHacker\(\)/, 'the Hacker is just one of the runners now');
  const show = body(game, 'showRunner');
  assert.match(show, /runners\[shop\.equipped\]/);
  assert.match(show, /\.visible = /);
});

// --- R9 ------------------------------------------------------------------------

test('R9: the simulation step is the same for every skin (stepRun gets no character)', () => {
  assert.match(body(game, 'simulate'), /stepRun\(run, h, CONFIG, debug\.god\)/);
  assert.doesNotMatch(game, /createRun\([^)]*shop/);
  assert.doesNotMatch(game, /resetRun\([^)]*shop/);
});

test('R9: the runner is posed by the same code whichever skin is equipped', () => {
  const chars = body(game, 'updateCharacters');
  assert.match(chars, /applyPose\(runner, runnerPose\)/);
  assert.doesNotMatch(chars, /shop\.equipped|CHARACTER\./, 'no per-skin animation branches');
});

test('R9: per-frame code never touches the shop', () => {
  for (const name of ['loop', 'render', 'updateHud', 'updateCharacters', 'renderFx']) {
    assert.doesNotMatch(body(game, name), /buyCharacter|equipCharacter|spendShards|renderShop|showRunner|setItem|getItem/, name);
  }
});

// --- R10 -----------------------------------------------------------------------

test('R10: no skin is ever saved: only the three existing localStorage keys exist anywhere in game code', () => {
  const keys = new Set();
  for (const [f, src] of gameSources()) {
    for (const m of src.matchAll(/neonWasteland\.(\w+)/g)) keys.add(m[1]);
    assert.doesNotMatch(src, /sessionStorage|indexedDB|document\.cookie|caches\.open/, `${f} uses another kind of storage`);
  }
  assert.deepEqual([...keys].sort(), ['highScore', 'settings', 'shardTotal']);
});

test('R10: the shop is created fresh on every page load and never handed to a save function', () => {
  assert.match(game, /const shop = createShop\(\);/);
  for (const save of ['saveSettings', 'saveHighScore', 'saveShardTotal']) {
    assert.doesNotMatch(game, new RegExp(`${save}\\([^)]*shop`), save);
  }
});
