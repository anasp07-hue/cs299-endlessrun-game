// Round 4 visuals that rules depend on (SPEC §3.8): pickups must look like
// what you pick up, and the carried bazooka must not change the runner's
// outline (R9 still holds with it on). Uses the vendored three.js in Node,
// like round3-characters.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../libs/three.module.js';
import { CONFIG } from '../js/logic/config.js';
import { PALETTE } from '../js/palette.js';
import { POWER, POWER_TYPES } from '../js/logic/powerups.js';
import { buildPowerupModels, buildCarriedBazooka, POWER_COLORS } from '../js/powerupModels.js';
import { CHARACTER_IDS } from '../js/logic/shop.js';
import { RUNNER_BUILDERS, applyPose } from '../js/characters.js';
import { createPose, standPose, hackerRun, hackerSlide, hackerAir, hitOverlay } from '../js/logic/pose.js';

const models = buildPowerupModels();

function vertices(geo) {
  const p = geo.attributes.position.array;
  const out = [];
  for (let i = 0; i < p.length; i += 3) out.push([p[i], p[i + 1], p[i + 2]]);
  return out;
}

function colors(geo) {
  const c = geo.attributes.color.array;
  const out = new Set();
  for (let i = 0; i < c.length; i += 3) out.add(new THREE.Color(c[i], c[i + 1], c[i + 2]).getHexString());
  return out;
}

test('R14: every pickup model stands on the road inside its pickup box, at any spin angle', () => {
  const r = Math.min(CONFIG.POWERUP_HIT_W, CONFIG.POWERUP_HIT_D) / 2;
  for (const type of POWER_TYPES) {
    for (const part of ['body', 'glow']) {
      for (const [x, y, z] of vertices(models[type][part])) {
        assert.ok(y >= -1e-6 && y <= CONFIG.POWERUP_HIT_H + 1e-6, `type ${type} ${part}: y ${y.toFixed(3)}`);
        assert.ok(Math.hypot(x, z) <= r + 1e-6, `type ${type} ${part}: reach ${Math.hypot(x, z).toFixed(3)} > ${r}`);
      }
    }
    const all = new THREE.Box3().setFromBufferAttribute(models[type].body.attributes.position);
    assert.ok(all.min.y <= 0.01, `type ${type}: sits on the road`);
  }
});

test('R11: each power-up glows in its own colour, away from the obstacle cues and the shards', () => {
  const cues = [PALETTE.hazardAmber, PALETTE.sparkWhite, PALETTE.dangerRed, PALETTE.glowBlue].map((c) => new THREE.Color(c));
  const hues = [];
  for (const type of POWER_TYPES) {
    const own = new THREE.Color(POWER_COLORS[type]);
    for (const hex of colors(models[type].glow)) {
      const c = new THREE.Color('#' + hex);
      const a = {};
      const b = {};
      c.getHSL(a);
      own.getHSL(b);
      assert.ok(Math.abs(a.h - b.h) < 0.01, `type ${type}: glow #${hex} is its own colour (or a dimmer shade)`);
    }
    for (const cue of cues) {
      const d = Math.hypot(own.r - cue.r, own.g - cue.g, own.b - cue.b);
      assert.ok(d > 0.35, `type ${type} (${POWER_COLORS[type]}) too close to cue #${cue.getHexString()}`);
    }
    const h = {};
    own.getHSL(h);
    hues.push(h.h);
  }
  for (let i = 0; i < hues.length; i++) {
    for (let j = i + 1; j < hues.length; j++) {
      const d = Math.min(Math.abs(hues[i] - hues[j]), 1 - Math.abs(hues[i] - hues[j]));
      assert.ok(d > 0.08, 'the three power-ups are told apart by colour');
    }
  }
  assert.equal(POWER_COLORS[POWER.BAZOOKA], PALETTE.powerBazooka);
});

const POSES = [
  ['stand', (p) => standPose(p)],
  ...[0, 0.25, 0.5, 0.75].map((ph) => [`run ${ph}`, (p) => hackerRun(p, ph)]),
  ['slide', (p) => hackerSlide(p)],
  ['air', (p) => hackerAir(p, 0)],
  ['stumble', (p) => { hackerRun(p, 0.3); hitOverlay(p, 1, 1); }],
];

test('R12/R9: the carried bazooka never changes a runner\'s outline: no taller, no wider, still slides under a HIGH', () => {
  const gun = buildCarriedBazooka();
  const mat = new THREE.MeshBasicMaterial();
  const pose = createPose();
  for (const id of CHARACTER_IDS) {
    const bare = RUNNER_BUILDERS[id]();
    const armed = RUNNER_BUILDERS[id]();
    armed.torso.add(new THREE.Mesh(gun.body, mat), new THREE.Mesh(gun.glow, mat));
    for (const [label, fill] of POSES) {
      fill(pose);
      applyPose(bare, pose);
      applyPose(armed, pose);
      bare.root.updateMatrixWorld(true);
      armed.root.updateMatrixWorld(true);
      const a = new THREE.Box3().setFromObject(bare.root);
      const b = new THREE.Box3().setFromObject(armed.root);
      const where = `${id}, ${label}`;
      assert.ok(b.max.y <= a.max.y + 1e-6, `${where}: top ${b.max.y.toFixed(3)} vs ${a.max.y.toFixed(3)}`);
      assert.ok(b.min.x >= a.min.x - 1e-6 && b.max.x <= a.max.x + 1e-6, `${where}: width`);
      assert.ok(b.min.y >= a.min.y - 1e-6, `${where}: bottom`);
      if (label === 'slide') assert.ok(b.max.y < CONFIG.HIGH_BOTTOM, `${where}: under a HIGH`);
    }
  }
});
