// Round 4 wiring: static checks that game.js and index.html hook the pure
// power-up logic up to the page (SPEC §3.8, R11–R16). Like the Round 2 and 3
// wiring tests, these read the files as text.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const game = read('game.js');
const html = read('index.html');
const css = read('style.css');

test('R12: F reaches the run: CMD.FIRE asks the pure module for a shot, only while the run takes input', () => {
  assert.match(game, /from '\.\/js\/logic\/powerups\.js'/);
  assert.match(game, /cmd === CMD\.FIRE\) requestFire\(run\.powerups\)/);
  assert.match(game, /cmd === CMD\.SLIDE \|\| cmd === CMD\.FIRE\) \{\s*if \(!live\) return;/, 'ignored during the catch beat');
});

test('R11/R14: game.js draws the pickups, the carried bazooka and the shot from run state only', () => {
  assert.match(game, /from '\.\/js\/powerupModels\.js'/);
  assert.match(game, /run\.powerups\.slots/, 'pickups are drawn from the pool');
  assert.match(game, /run\.powerups\.bazooka/, 'the carried bazooka follows the held shot');
  assert.match(game, /audio\.powerup\(/);
  assert.match(game, /audio\.bazooka\(\)/);
  // The view never changes power-up rules: no fire/apply outside input and debug.
  const fires = game.match(/fireBazooka\(/g) || [];
  assert.equal(fires.length, 0, 'the shot is fired only inside stepRun');
});

test('R13/R16: the HUD shows each active power-up, and the menu explains them', () => {
  for (const id of ['hud-powers', 'hud-pw-bazooka', 'hud-pw-double', 'hud-pw-phase']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  assert.match(html, /<dt>F<\/dt><dd>fire the bazooka/);
  assert.match(html, /power-ups<\/dt>/);
  assert.match(css, /\.hud-power\.is-warn/);
  assert.match(game, /POWERUP_WARN_TIME/);
});

test('R16: power-ups are never saved: no storage call mentions them', () => {
  for (const line of game.split('\n')) {
    if (/setItem|saveSettings|saveHighScore|bankRunShards|spendShards/.test(line)) {
      assert.doesNotMatch(line, /power|bazooka|phase|double/i, line.trim());
    }
  }
});
