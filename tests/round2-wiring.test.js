// Round 2 wiring: game.js loads, banks and shows the lifetime shard total (R4),
// the game still runs offline with no build step (R5), and the per-frame path
// does no storage work (R6). Static checks over the source files.
// See SPEC §1 (requirement IDs) and docs/decisions/0001-bank-shards-at-checkpoints.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// --- R4 ---------------------------------------------------------------------

test('R4: the game wires the total in: it loads, banks on run end, abandon and page hide, and shows it', () => {
  const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(game, /from '\.\/js\/logic\/shardbank\.js'/);
  assert.match(game, /loadShardTotal\(storage\)/);
  assert.match(game, /addEventListener\('pagehide'/, 'banks when the page is closed');
  assert.match(game, /visibilitychange/, 'banks when the tab is hidden (mobile/Safari may not fire pagehide)');
  assert.ok((game.match(/bankShards\(\)/g) || []).length >= 4, 'banked on catch, abandon, hide and close');
  assert.match(html, /id="menu-shards"/, 'menu shows the lifetime total');
  assert.match(html, /id="final-shard-total"/, 'game over shows the lifetime total');
});

// --- R5: still offline, still no build step ---------------------------------

/** Every static import specifier in a JS source file. */
function importsOf(src) {
  const out = [];
  const re = /(?:^|[\s;])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|(?:^|[\s;])import\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/gm;
  let m;
  while ((m = re.exec(src))) out.push(m[1] || m[2] || m[3]);
  return out;
}

test('R5: every module the game loads is a local file in the repo (no CDN, no bare npm specifiers)', () => {
  const seen = new Set();
  const queue = [join(ROOT, 'game.js')];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    if (file.includes(`${join(ROOT, 'libs')}`)) continue; // vendored three.js: existence checked below
    for (const spec of importsOf(readFileSync(file, 'utf8'))) {
      assert.ok(spec.startsWith('./') || spec.startsWith('../'), `${file}: non-local import "${spec}"`);
      const target = resolve(dirname(file), spec);
      assert.ok(existsSync(target), `${file}: "${spec}" does not exist`);
      queue.push(target);
    }
  }
  assert.ok(seen.has(join(ROOT, 'js/logic/shardbank.js')), 'the new module is part of the game');
  assert.ok(seen.has(join(ROOT, 'libs/three.module.js')));
  assert.ok(existsSync(join(ROOT, 'libs/three.core.js')));
});

test('R5: no network access in game code: no remote URLs, fetch, XHR or sockets', () => {
  const files = [join(ROOT, 'game.js'), join(ROOT, 'index.html'), join(ROOT, 'style.css')];
  for (const dir of ['js', 'js/logic']) {
    for (const f of readdirSync(join(ROOT, dir))) if (f.endsWith('.js')) files.push(join(ROOT, dir, f));
  }
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    assert.doesNotMatch(src, /https?:\/\//, `${f} references a remote URL`);
    assert.doesNotMatch(src, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon/, `${f} uses the network`);
  }
});

test('R5: no build step: index.html loads game.js directly as a module, and there is no package.json', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="game\.js"><\/script>/);
  for (const m of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const url = m[1];
    assert.ok(url.startsWith('data:') || existsSync(join(ROOT, url)), `index.html: "${url}" is not a local file`);
  }
  assert.equal(existsSync(join(ROOT, 'package.json')), false, 'the game must not need npm');
});

// --- R6 ---------------------------------------------------------------------

test('R6: the per-frame HUD path in game.js does not touch storage or bank shards', () => {
  const game = readFileSync(join(ROOT, 'game.js'), 'utf8');
  const hud = game.slice(game.indexOf('function updateHud()'), game.indexOf('\n}\n', game.indexOf('function updateHud()')));
  const loop = game.slice(game.indexOf('function loop('), game.indexOf('\n}\n', game.indexOf('function loop(')));
  assert.ok(hud.length > 0 && loop.length > 0);
  for (const body of [hud, loop]) {
    assert.doesNotMatch(body, /bankShards|bankRunShards|saveShardTotal|loadShardTotal|setItem|getItem/);
  }
});
