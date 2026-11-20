// Round 3 characters: the Android and the Alien (R8) are built on the
// Hacker's skeleton and poses, so they move the same and fill the same
// hitbox (R9). These import three.js (vendored, DOM-free at import) to
// measure the real dressed rigs, like obstacles.test.js does.
// See SPEC §1 (R8, R9), §5 Characters, docs/decisions/0003.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from '../libs/three.module.js';
import { CONFIG } from '../js/logic/config.js';
import {
  createPose, standPose, hackerRun, hackerSlide, hackerAir, hitOverlay,
} from '../js/logic/pose.js';
import { CHARACTER, CHARACTER_IDS } from '../js/logic/shop.js';
import { RUNNER_BUILDERS, createHacker, createAndroid, createAlien, applyPose } from '../js/characters.js';

const SRGB = THREE.SRGBColorSpace;
const PIVOTS = ['root', 'body', 'hips', 'torso', 'head', 'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'legL', 'legR', 'kneeL', 'kneeR'];

/** Every pose a runner is shown in during play, as [label, fill(pose)]. */
const POSES = [
  ['stand', (p) => standPose(p)],
  ...[0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875].map((ph) => [`run ${ph}`, (p) => hackerRun(p, ph)]),
  ['slide', (p) => hackerSlide(p)],
  ['air rising', (p) => hackerAir(p, 1)],
  ['air apex', (p) => hackerAir(p, 0)],
  ['air falling', (p) => hackerAir(p, -1)],
  ['stumble', (p) => { hackerRun(p, 0.3); hitOverlay(p, 1, 1); }],
];

const pose = createPose();
function measure(sk, fill) {
  fill(pose);
  applyPose(sk, pose);
  sk.root.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(sk.root);
}

const rigs = Object.fromEntries(CHARACTER_IDS.map((id) => [id, RUNNER_BUILDERS[id]()]));

// --- R8 -------------------------------------------------------------------------

test('R8: there is a runner rig for every shop character, including the Android and the Alien', () => {
  assert.deepEqual(Object.keys(RUNNER_BUILDERS).sort(), [...CHARACTER_IDS].sort());
  assert.equal(RUNNER_BUILDERS[CHARACTER.HACKER], createHacker);
  assert.equal(RUNNER_BUILDERS[CHARACTER.ANDROID], createAndroid);
  assert.equal(RUNNER_BUILDERS[CHARACTER.ALIEN], createAlien);
  for (const id of CHARACTER_IDS) {
    for (const k of PIVOTS) assert.ok(rigs[id][k] instanceof THREE.Object3D, `${id}.${k}`);
  }
});

/** The colour covering the most volume on a rig (by mesh bounding-box volume), as THREE.Color. */
function dominantColour(sk) {
  const byHex = new Map();
  sk.root.traverse((o) => {
    if (!o.isMesh) return;
    o.geometry.computeBoundingBox();
    const s = o.geometry.boundingBox.getSize(new THREE.Vector3());
    const hex = o.material.color.getHexString();
    byHex.set(hex, (byHex.get(hex) || 0) + s.x * s.y * s.z);
  });
  const [hex] = [...byHex.entries()].sort((a, b) => b[1] - a[1])[0];
  return new THREE.Color('#' + hex);
}

test('R8: the Android is mostly silver: a light, nearly colourless grey', () => {
  const hsl = dominantColour(rigs[CHARACTER.ANDROID]).getHSL({}, THREE.SRGBColorSpace);
  assert.ok(hsl.s < 0.2, `saturation ${hsl.s.toFixed(2)}`);
  assert.ok(hsl.l > 0.6, `lightness ${hsl.l.toFixed(2)}`);
});

test('R8: the Alien is mostly green, muted rather than neon', () => {
  const hsl = dominantColour(rigs[CHARACTER.ALIEN]).getHSL({}, THREE.SRGBColorSpace);
  const hue = hsl.h * 360;
  assert.ok(hue > 80 && hue < 150, `hue ${hue.toFixed(0)}°`);
  assert.ok(hsl.s > 0.2 && hsl.s < 0.6, `saturation ${hsl.s.toFixed(2)} (green, not grey and not neon)`);
});

test('R8: the new runners never use the obstacle cue colours (amber / white / red stay gameplay signals)', () => {
  const cues = new Set(['ffb020', 'fff4c2', 'ff3344']);
  for (const id of [CHARACTER.ANDROID, CHARACTER.ALIEN]) {
    rigs[id].root.traverse((o) => {
      if (o.isMesh) assert.ok(!cues.has(o.material.color.getHexString(SRGB)), `${id} uses a cue colour`);
    });
  }
});

test('R8: each runner is its own set of meshes and materials (switching skins never rebuilds anything)', () => {
  const mats = (sk) => { const s = new Set(); sk.root.traverse((o) => { if (o.isMesh) s.add(o.material); }); return s; };
  const a = mats(rigs[CHARACTER.ANDROID]);
  const h = mats(rigs[CHARACTER.HACKER]);
  for (const m of a) assert.ok(!h.has(m));
});

// --- R9: same movement, same hitbox ----------------------------------------------

test('R9: every runner uses the identical skeleton: same pivots at the same places', () => {
  const ref = rigs[CHARACTER.HACKER];
  for (const id of CHARACTER_IDS) {
    for (const k of PIVOTS) {
      assert.ok(rigs[id][k].position.equals(ref[k].position), `${id}.${k} position`);
      assert.ok(rigs[id][k].scale.equals(ref[k].scale), `${id}.${k} scale`);
    }
  }
});

// Never taller than the Hacker by more than 0.03; up to 0.05 lower is fine (the
// Hacker's hood pokes up in the slide pose; a lower top can't touch more).
test('R9: in every pose each runner is as tall as the Hacker (+0.03 / −0.05), never sinks further into the road, and is no wider', () => {
  for (const [label, fill] of POSES) {
    const ref = measure(rigs[CHARACTER.HACKER], fill);
    for (const id of [CHARACTER.ANDROID, CHARACTER.ALIEN]) {
      const b = measure(rigs[id], fill);
      const where = `${id}, ${label}`;
      assert.ok(b.max.y <= ref.max.y + 0.03 && b.max.y >= ref.max.y - 0.05, `${where}: top ${b.max.y.toFixed(3)} vs ${ref.max.y.toFixed(3)}`);
      assert.ok(b.min.y >= ref.min.y - 0.01, `${where}: bottom ${b.min.y.toFixed(3)} vs ${ref.min.y.toFixed(3)}`);
      assert.ok(b.min.x >= ref.min.x - 0.02 && b.max.x <= ref.max.x + 0.02, `${where}: width`);
    }
  }
});

test('R9: every runner fits the shared hitbox the same way (standing covers it; sliding stays under a HIGH)', () => {
  const standBox = CONFIG.PLAYER_HEIGHT * CONFIG.HITBOX_SCALE;
  const halfW = (CONFIG.PLAYER_WIDTH * CONFIG.HITBOX_SCALE) / 2;
  for (const id of CHARACTER_IDS) {
    const stand = measure(rigs[id], POSES[0][1]);
    assert.ok(stand.max.y >= standBox, `${id}: the standing hitbox is inside the visual`);
    assert.ok(Math.abs(stand.max.y - CONFIG.PLAYER_HEIGHT) < 0.1, `${id}: about ${CONFIG.PLAYER_HEIGHT} tall`);
    assert.ok(stand.max.x <= halfW + 0.05 && stand.min.x >= -halfW - 0.05, `${id}: standing width ≈ hitbox width`);
    const slide = measure(rigs[id], (p) => hackerSlide(p));
    assert.ok(slide.max.y < CONFIG.HIGH_BOTTOM, `${id}: a slide clears a HIGH visually (${slide.max.y.toFixed(2)})`);
  }
});

test('R9: the run simulation never reads the skin: no rules module imports the shop or the rigs', () => {
  const rules = ['run', 'player', 'collision', 'chaser', 'spawner', 'shards', 'difficulty', 'trail', 'pose', 'config'];
  for (const name of rules) {
    const src = readFileSync(new URL(`../js/logic/${name}.js`, import.meta.url), 'utf8');
    assert.doesNotMatch(src, /from\s*['"][^'"]*(shop|characters)\.js['"]/, `${name}.js imports the skin`);
    assert.doesNotMatch(src, /\bequipped\b|\bCHARACTER\b/, `${name}.js reads the skin`);
  }
});
