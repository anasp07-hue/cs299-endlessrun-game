import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { createRng } from '../js/logic/rng.js';
import { PALETTE } from '../js/palette.js';
import {
  MAX_BUILDINGS, MAX_DEBRIS, MAX_SCREENS, SCREEN_KIND,
  chunkForSlot, chunkZ, chunkSeed, createChunk, generateChunk, carReach,
  hexToRgb, skyColors, skyColorAt, smoothstep, skyGlsl, glslFloat,
  LAMP_STATE, lampsPerChunk, lampWeight, lampBrightness, halfExtentX, DEBRIS_KIND, MAX_CARS, blockedByVehicles,
  wallHeightAt, flickerValue,
} from '../js/logic/scenery.js';

const L = CONFIG.CITY_CHUNK_LENGTH;
const N = CONFIG.CITY_CHUNK_COUNT;
const LANE_EDGE = CONFIG.LANE_WIDTH * (CONFIG.LANE_COUNT / 2); // 3.75: outer edge of the outer lanes
const SCROLLS = [];
for (let s = 0; s < 4000; s += 7.3) SCROLLS.push(s);
SCROLLS.push(0, L - CONFIG.CITY_BACK, 39.999, 40, 40.001, 1e6 + 0.5);

function chunks(count = 300, seed = CONFIG.CITY_SEED) {
  const rng = createRng(1);
  const out = [];
  for (let k = 0; k < count; k++) out.push(generateChunk(createChunk(), k, seed, rng, CONFIG));
  return out;
}

// --- Recycling -----------------------------------------------------------------------

test('chunk slots: each slot shows a different chunk, together a contiguous run of N', () => {
  for (const s of SCROLLS) {
    const ks = [];
    for (let i = 0; i < N; i++) {
      const k = chunkForSlot(i, s, CONFIG);
      assert.equal(((k % N) + N) % N, i, 'slot i shows a chunk ≡ i (mod N)');
      ks.push(k);
    }
    ks.sort((a, b) => a - b);
    for (let j = 1; j < N; j++) assert.equal(ks[j], ks[0] + j, `scroll ${s}`);
  }
});

test('chunks cover from CITY_BACK behind the player to beyond FOG_FAR ahead, at every scroll', () => {
  for (const s of SCROLLS) {
    let nearest = Infinity;
    let farthest = -Infinity;
    for (let i = 0; i < N; i++) {
      const z0 = chunkZ(chunkForSlot(i, s, CONFIG), s, CONFIG); // near end
      nearest = Math.max(nearest === Infinity ? -Infinity : nearest, z0);
      farthest = Math.min(farthest === -Infinity ? Infinity : farthest, z0 - L);
    }
    assert.ok(nearest >= CONFIG.CITY_BACK - 1e-9, `scroll ${s}: nearest edge ${nearest} is in front of CITY_BACK`);
    // New content first appears at the far end: it must already be fully fogged there.
    const farFromCamera = CONFIG.CAMERA_Z - farthest;
    assert.ok(farFromCamera >= CONFIG.FOG_FAR, `scroll ${s}: far end only ${farFromCamera} from the camera`);
  }
});

test('a slot changes chunk only when it wraps: once per L of scroll, from back to front', () => {
  for (let i = 0; i < N; i++) {
    let prev = chunkForSlot(i, 0, CONFIG);
    let changes = 0;
    for (let s = 0; s <= 10 * L * N; s += 0.5) {
      const k = chunkForSlot(i, s, CONFIG);
      if (k !== prev) {
        assert.equal(k, prev + N, 'jumps to the far end');
        assert.ok(chunkZ(prev, s, CONFIG) - L >= CONFIG.CITY_BACK - 0.5, 'the old chunk was behind the camera');
        changes++;
        prev = k;
      }
    }
    assert.ok(changes >= 9 && changes <= 11, `${changes} wraps in 10 laps`);
  }
});

test('chunkSeed: deterministic, and neighbouring chunks get unrelated seeds', () => {
  assert.equal(chunkSeed(5, 9), chunkSeed(5, 9));
  const seen = new Set();
  for (let k = -50; k < 500; k++) seen.add(chunkSeed(CONFIG.CITY_SEED, k));
  assert.equal(seen.size, 550);
  assert.notEqual(chunkSeed(1, 0), chunkSeed(2, 0));
});

// --- Generation --------------------------------------------------------------------------

test('generateChunk is deterministic per (seed, k) and reuses the same records (no allocation)', () => {
  const rng = createRng(0);
  const c = createChunk();
  const refs = [c.buildings, c.debris, c.screens, c.wires, c.cars, c.buildings[0], c.debris[0]];
  generateChunk(c, 7, 99, rng, CONFIG);
  const a = JSON.stringify(c);
  generateChunk(c, 8, 99, rng, CONFIG);
  assert.notEqual(JSON.stringify(c), a, 'different chunks differ');
  generateChunk(c, 7, 99, rng, CONFIG);
  assert.equal(JSON.stringify(c), a, 'same chunk, same content, whatever came before');
  const after = [c.buildings, c.debris, c.screens, c.wires, c.cars, c.buildings[0], c.debris[0]];
  for (let i = 0; i < refs.length; i++) assert.equal(after[i], refs[i]);
  assert.equal(c.buildings.length, MAX_BUILDINGS);
  assert.equal(c.debris.length, MAX_DEBRIS);
});

test('buildings line both sides, stay in their chunk, never overlap, never reach the sidewalk', () => {
  for (const c of chunks()) {
    assert.ok(c.nb >= 4, `chunk ${c.k}: only ${c.nb} buildings`);
    for (const side of [-1, 1]) {
      const row = c.buildings.slice(0, c.nb).filter((b) => b.side === side).sort((a, b) => b.z - a.z);
      assert.ok(row.length >= 2, `chunk ${c.k} side ${side}`);
      let covered = 0;
      for (let i = 0; i < row.length; i++) {
        const b = row[i];
        assert.ok(b.z + b.d / 2 <= 1e-9 && b.z - b.d / 2 >= -L - 1e-9, 'inside the chunk');
        assert.ok(b.inner >= CONFIG.BUILDING_SETBACK_MIN && b.inner <= CONFIG.BUILDING_SETBACK_MAX);
        assert.ok(Math.abs(Math.abs(b.x) - b.w / 2 - b.inner) < 1e-9, 'inner wall at the setback');
        assert.ok(b.h >= CONFIG.BUILDING_HEIGHT_MIN && b.h <= CONFIG.BUILDING_HEIGHT_MAX);
        if (i > 0) assert.ok(row[i - 1].z - row[i - 1].d / 2 >= b.z + b.d / 2 - 1e-9, 'no overlap');
        covered += b.d;
      }
      assert.ok(covered > L * 0.5, `chunk ${c.k} side ${side}: mostly built up (${covered.toFixed(1)} of ${L})`);
    }
  }
});

test('set dressing stays off the lanes: rubble and wrecks are clear of the road, cables far overhead', () => {
  const reach = carReach(CONFIG);
  let cars = 0;
  let wires = 0;
  let screens = 0;
  let tipped = 0;
  for (const c of chunks()) {
    for (let i = 0; i < c.nd; i++) {
      const d = c.debris[i];
      // Conservative reach: a tilted piece can lean its height sideways too.
      const r = d.rx || d.rz ? Math.hypot(d.w, d.d, d.h) / 2 : Math.hypot(d.w, d.d) / 2;
      // Either a roof piece (high up), or clutter on the shoulder/sidewalk: clear of the lanes and the buildings.
      if (d.y > CONFIG.BUILDING_HEIGHT_MIN * 0.9) continue;
      assert.ok(Math.abs(d.x) - r >= LANE_EDGE + CONFIG.PROP_LANE_MARGIN - 1e-9, `debris at x ${d.x.toFixed(2)} (r ${r.toFixed(2)}) reaches a lane`);
    }
    for (let i = 0; i < c.nr; i++) {
      const b = c.barriers[i];
      const hx = halfExtentX(CONFIG.BARRIER_WIDTH, CONFIG.BARRIER_LENGTH, b.ry);
      assert.ok(Math.abs(b.x) - hx >= LANE_EDGE + CONFIG.PROP_LANE_MARGIN - 1e-9, `barrier at ${b.x.toFixed(2)} reaches a lane`);
      assert.ok(Math.abs(b.x) + hx < CONFIG.ROAD_ASPHALT_HALF, 'barriers stay on the asphalt shoulder');
      assert.ok(Math.abs(b.ry) <= CONFIG.BARRIER_TILT + 1e-9);
    }
    for (let i = 0; i < c.nc; i++) {
      const car = c.cars[i];
      cars++;
      if (car.tipped) tipped++;
      assert.ok(Math.abs(car.x) - reach >= LANE_EDGE + 0.25 - 1e-9, `car at ${car.x} reaches into a lane`);
      assert.ok(Math.abs(car.x) + reach <= CONFIG.BUILDING_SETBACK_MIN + 1e-9, 'car inside a building');
      assert.ok(car.z <= 0 && car.z >= -L);
    }
    for (let i = 0; i < c.nw; i++) {
      const w = c.wires[i];
      wires++;
      assert.ok(w.y - w.sag >= CONFIG.WIRE_MIN_Y - 1e-9, 'lowest point stays high');
      assert.ok(w.y <= CONFIG.WIRE_MAX_Y + 1e-9);
      assert.ok(w.variant >= 0 && w.variant < CONFIG.WIRE_VARIANTS);
    }
    for (let i = 0; i < c.ns; i++) {
      const s = c.screens[i];
      screens++;
      assert.ok(Math.abs(s.x) >= CONFIG.BUILDING_SETBACK_MIN - 0.1, 'on a wall, not over the road');
      assert.ok(s.y - s.h / 2 >= CONFIG.SCREEN_Y_MIN - 1e-9, 'above street level');
      assert.ok([SCREEN_KIND.DEAD, SCREEN_KIND.FLICKER, SCREEN_KIND.GLITCH].includes(s.kind));
    }
    assert.ok(c.ns <= MAX_SCREENS);
  }
  // Cables must clear the highest thing in play by a wide margin.
  assert.ok(CONFIG.WIRE_MIN_Y > CONFIG.JUMP_HEIGHT + CONFIG.PLAYER_HEIGHT + 2);
  assert.ok(CONFIG.WIRE_MIN_Y > CONFIG.BLOCK_HEIGHT + 3);
  // ...and every kind of dressing actually shows up.
  assert.ok(cars > 100 && wires > 150 && screens > 80 && tipped > 10, `${cars} cars, ${wires} wires, ${screens} screens`);
});

// --- Sky ---------------------------------------------------------------------------------

test('sky: horizon colour at and below the horizon (it is the fog colour), darker going up', () => {
  const colors = skyColors(PALETTE, CONFIG);
  assert.deepEqual(skyColorAt(0, colors, CONFIG), colors.horizon);
  assert.deepEqual(skyColorAt(-0.5, colors, CONFIG), colors.horizon);
  assert.deepEqual(skyColorAt(1, colors, CONFIG), colors.zenith);
  let prev = Infinity;
  for (let y = 0; y <= 1; y += 0.02) {
    const c = skyColorAt(y, colors, CONFIG);
    const lum = c[0] + c[1] + c[2];
    assert.ok(lum <= prev + 1e-12, 'never brightens going up');
    prev = lum;
  }
  // Lifted from skyHaze toward skyGlow at the horizon, darkened at the zenith.
  const haze = hexToRgb(PALETTE.skyHaze);
  const sum = (c) => c[0] + c[1] + c[2];
  assert.ok(sum(colors.horizon) > sum(haze) && sum(colors.zenith) < sum(haze));
  // An obstacle-height object at the fog limit is below the fade: plain fog = sky there.
  const elev = (CONFIG.BLOCK_HEIGHT - CONFIG.CAMERA_Y) / CONFIG.FOG_FAR;
  assert.ok(elev < CONFIG.SKY_FADE_START + 0.01);
});

test('hexToRgb / smoothstep basics', () => {
  assert.deepEqual(hexToRgb('#ff8000'), [1, 128 / 255, 0]);
  assert.equal(smoothstep(0, 1, -1), 0);
  assert.equal(smoothstep(0, 1, 2), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test('skyGlsl is an exact twin of skyColorAt (so fogged ruins dissolve into the dome without a seam)', () => {
  const src = skyGlsl(PALETTE, CONFIG);
  // Pull the constants back out of the shader source and evaluate its formula in JS.
  const num = '(-?[0-9.e-]+)';
  const ss = src.match(new RegExp(`smoothstep\\( ${num}, ${num}, y \\)`));
  const vecs = [...src.matchAll(new RegExp(`vec3\\( ${num}, ${num}, ${num} \\)`, 'g'))].map((m) => m.slice(1, 4).map(Number));
  assert.ok(ss && vecs.length === 2, src);
  const [e0, e1] = [Number(ss[1]), Number(ss[2])];
  const colors = skyColors(PALETTE, CONFIG);
  for (let y = -0.2; y <= 1; y += 0.01) {
    const t = smoothstep(e0, e1, y);
    const glsl = [0, 1, 2].map((i) => vecs[0][i] * (1 - t) + vecs[1][i] * t);
    const js = skyColorAt(y, colors, CONFIG);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(glsl[i] - js[i]) < 1e-12, `y ${y.toFixed(2)}`);
  }
  assert.equal(glslFloat(1), '1.0');
  assert.equal(glslFloat(0.25), '0.25');
});

// --- Streetlights ----------------------------------------------------------------------

test('streetlights: one every STREETLIGHT_SPACING, alternating sides, the rhythm unbroken across chunks', () => {
  assert.equal(L % CONFIG.STREETLIGHT_SPACING, 0, 'spacing divides the chunk length');
  const all = [];
  for (const c of chunks(60)) {
    assert.equal(c.nl, lampsPerChunk(CONFIG));
    for (let i = 0; i < c.nl; i++) all.push({ s: c.k * L - c.lamps[i].z, ...c.lamps[i] }); // track position
  }
  all.sort((a, b) => a.s - b.s);
  const states = { 0: 0, 1: 0, 2: 0 };
  for (let i = 0; i < all.length; i++) {
    states[all[i].state]++;
    assert.equal(Math.abs(all[i].x), CONFIG.STREETLIGHT_X);
    if (i > 0) {
      assert.ok(Math.abs(all[i].s - all[i - 1].s - CONFIG.STREETLIGHT_SPACING) < 1e-9, 'even spacing');
      assert.equal(all[i].side, -all[i - 1].side, 'alternating sides');
    }
  }
  assert.ok(states[LAMP_STATE.ON] > states[LAMP_STATE.DEAD] && states[LAMP_STATE.DEAD] > 0 && states[LAMP_STATE.FLICKER] > 0, JSON.stringify(states));
  // The lamp head hangs over the shoulder: off the lanes, under the cables.
  assert.ok(CONFIG.STREETLIGHT_X - CONFIG.STREETLIGHT_ARM > LANE_EDGE + 1);
  assert.ok(CONFIG.STREETLIGHT_HEIGHT < CONFIG.WIRE_MIN_Y - 0.2);
  assert.ok(CONFIG.STREETLIGHT_X > CONFIG.ROAD_ASPHALT_HALF && CONFIG.STREETLIGHT_X < CONFIG.BUILDING_SETBACK_MIN, 'on the sidewalk');
});

test('streetlights: wrecks park on the other kerb and rubble keeps clear of the posts', () => {
  const reach = carReach(CONFIG);
  for (const c of chunks()) {
    for (let i = 0; i < c.nl; i++) {
      const l = c.lamps[i];
      for (let j = 0; j < c.nc; j++) {
        const car = c.cars[j];
        if (car.side === l.side) assert.ok(Math.abs(car.z - l.z) > reach + 0.3, `chunk ${c.k}: car by a lamp post`);
      }
      for (let j = 0; j < c.nd; j++) {
        const d = c.debris[j];
        if (d.y > 3 || Math.sign(d.x) !== l.side) continue; // roof pieces / other side
        assert.ok(Math.abs(d.z - l.z) >= CONFIG.STREETLIGHT_CLEARANCE - 1e-9 || Math.abs(Math.abs(d.x) - CONFIG.STREETLIGHT_X) > 1, `chunk ${c.k}: rubble on a lamp post`);
      }
    }
  }
});

test('lampWeight: full near the player, zero at both window edges, never more than STREETLIGHT_LIGHTS lamps at once', () => {
  assert.equal(lampWeight(-CONFIG.STREETLIGHT_FADE_AHEAD, CONFIG), 0);
  assert.equal(lampWeight(CONFIG.STREETLIGHT_FADE_BEHIND, CONFIG), 0);
  assert.equal(lampWeight(-CONFIG.STREETLIGHT_FULL_AHEAD, CONFIG), 1);
  assert.equal(lampWeight(0, CONFIG), 1);
  // Continuous: no jumps anywhere (a light hopping lamps must be invisible).
  let prev = lampWeight(-40, CONFIG);
  for (let z = -40; z <= 15; z += 0.01) {
    const w = lampWeight(z, CONFIG);
    assert.ok(Math.abs(w - prev) < 0.01, `jump at ${z.toFixed(2)}`);
    prev = w;
  }
  // However the street has scrolled, lamps with weight > 0 never outnumber the real lights.
  for (let scroll = 0; scroll < 600; scroll += 0.37) {
    let lit = 0;
    for (let g = -5; g < 60; g++) {
      const z = scroll - (g + 0.5) * CONFIG.STREETLIGHT_SPACING; // world z of lamp g
      if (lampWeight(z, CONFIG) > 0) lit++;
    }
    assert.ok(lit <= CONFIG.STREETLIGHT_LIGHTS, `scroll ${scroll}: ${lit} lamps want a light`);
  }
});

test('lampBrightness: dead is dark, on is steady, flicker stutters', () => {
  const seen = new Set();
  for (let t = 0; t < 10; t += 0.05) {
    assert.equal(lampBrightness(LAMP_STATE.DEAD, 3, t), 0);
    assert.equal(lampBrightness(LAMP_STATE.ON, 3, t), 1);
    const b = lampBrightness(LAMP_STATE.FLICKER, 3, t);
    assert.ok(b > 0 && b <= 1);
    seen.add(b);
  }
  assert.ok(seen.size >= 2, 'it actually flickers');
});

// --- Street clutter ----------------------------------------------------------------------

test('the shoulders and sidewalks are filled: wrecks, barrier runs, heaps, crates, and nothing overlaps', () => {
  let barriers = 0;
  let crates = 0;
  let carsPerChunk = 0;
  const cs = chunks();
  for (const c of cs) {
    carsPerChunk += c.nc;
    barriers += c.nr;
    // Clutter per side, as z intervals: wrecks and barriers. Heaps/crates are checked against them below.
    for (const side of [-1, 1]) {
      const spans = [];
      for (let i = 0; i < c.nc; i++) if (c.cars[i].side === side) spans.push([c.cars[i].z - carReach(CONFIG), c.cars[i].z + carReach(CONFIG)]);
      for (let i = 0; i < c.nr; i++) {
        const b = c.barriers[i];
        if (b.side === side) spans.push([b.z - CONFIG.BARRIER_LENGTH / 2, b.z + CONFIG.BARRIER_LENGTH / 2]);
      }
      spans.sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < spans.length; i++) assert.ok(spans[i][0] >= spans[i - 1][1] - 0.2, `chunk ${c.k}: clutter overlaps`);
      // No street-level piece inside a wreck's reach or a barrier's footprint, and pieces of
      // different heaps / crate stacks / rubble never overlap (pieces of one heap may touch).
      const street = c.debris.slice(0, c.nd).filter((d) => Math.sign(d.x) === side && d.y <= CONFIG.STREET_LEVEL_Y);
      for (const d of street) {
        const r = (Math.hypot(d.w, d.d) / 2) * 0.9; // touching is fine, overlapping is not
        assert.ok(!blockedByVehicles(c, d.x, d.z, r, CONFIG), `chunk ${c.k}: a piece at (${d.x.toFixed(2)}, ${d.z.toFixed(2)}) overlaps a wreck or barrier`);
        for (const e of street) {
          if (e.group === d.group) continue;
          const gap = Math.hypot(d.x - e.x, d.z - e.z) - (Math.hypot(d.w, d.d) + Math.hypot(e.w, e.d)) / 2;
          assert.ok(gap > -1e-9, `chunk ${c.k}: pieces of groups ${d.group} and ${e.group} overlap by ${(-gap).toFixed(2)}`);
        }
      }
      // Nothing reaches across a chunk seam into the next chunk's clutter.
      for (const d of street) {
        const r = Math.hypot(d.w, d.d) / 2;
        assert.ok(d.z + r <= 1e-9 && d.z - r >= -L - 1e-9, `chunk ${c.k}: a piece crosses the chunk seam (z ${d.z.toFixed(2)})`);
      }
    }
    for (let i = 0; i < c.nd; i++) {
      const d = c.debris[i];
      if (d.kind === DEBRIS_KIND.CRATE) {
        crates++;
        assert.ok(Math.abs(d.x) + Math.hypot(d.w, d.d) / 2 <= CONFIG.BUILDING_SETBACK_MIN + 1e-9, 'crate inside a building');
      }
    }
  }
  assert.ok(carsPerChunk / cs.length > 1.5, `only ${(carsPerChunk / cs.length).toFixed(2)} wrecks per chunk`);
  assert.ok(barriers / cs.length > 2 && crates / cs.length > 1, `${barriers} barriers, ${crates} crates in ${cs.length} chunks`);
  assert.ok(Math.max(...cs.map((c) => c.nc)) <= MAX_CARS);
});

test('the shoulders are actually full: on every side of every chunk, clutter fills a good share', () => {
  let total = 0;
  const cs = chunks(300);
  for (const c of cs) {
    for (const side of [0, 1]) {
      assert.ok(c.fill[side] > L * 0.4, `chunk ${c.k} side ${side}: only ${c.fill[side].toFixed(1)} of ${L} filled`);
      total += c.fill[side];
    }
  }
  assert.ok(total / (cs.length * 2) > L * 0.6, `average fill ${(total / (cs.length * 2)).toFixed(1)} of ${L}`);
});

test('halfExtentX: a footprint turned by ry', () => {
  assert.equal(halfExtentX(2, 4, 0), 1);
  assert.ok(Math.abs(halfExtentX(2, 4, Math.PI / 2) - 2) < 1e-12);
  assert.ok(Math.abs(halfExtentX(2, 4, -Math.PI / 2) - 2) < 1e-12);
});

test('cables only cross between two walls, anchored below both roofs (never floating over an alley)', () => {
  let n = 0;
  for (const c of chunks()) {
    for (let i = 0; i < c.nw; i++) {
      const w = c.wires[i];
      n++;
      const zl = w.z + Math.tan(w.ry) * CONFIG.WIRE_ANCHOR_X;
      const zr = w.z - Math.tan(w.ry) * CONFIG.WIRE_ANCHOR_X;
      const hl = wallHeightAt(c, -1, zl);
      const hr = wallHeightAt(c, 1, zr);
      assert.ok(hl > 0 && hr > 0, `chunk ${c.k}: cable over an alley`);
      assert.ok(w.y <= Math.min(hl, hr) - CONFIG.WIRE_ROOF_GAP + 1e-9, `chunk ${c.k}: cable above a roof`);
    }
  }
  assert.ok(n > 150, `${n} cables`);
  assert.ok(CONFIG.WIRE_SPAN > CONFIG.BUILDING_SETBACK_MAX, 'cable ends run into the walls');
});

test('flickerValue: deterministic, in [0, 1), steps `rate` times a second', () => {
  assert.equal(flickerValue(3, 1.234, 9), flickerValue(3, 1.234, 9));
  for (let t = 0; t < 5; t += 0.013) {
    const v = flickerValue(7, t, 11);
    assert.ok(v >= 0 && v < 1);
    // Same step (same floor(t·rate + seed·3.1)) → same value.
    const stepStart = (Math.floor(t * 11 + 7 * 3.1) - 7 * 3.1) / 11;
    assert.equal(flickerValue(7, stepStart + 1e-9, 11), v);
  }
  // Holds steady within one step, changes across steps.
  const a = flickerValue(2, 0.0, 10);
  assert.equal(flickerValue(2, 0.02, 10), a);
  const seen = new Set();
  for (let k = 0; k < 40; k++) seen.add(flickerValue(2, k / 10 + 0.001, 10));
  assert.ok(seen.size > 30);
});

test('the sidewalk texture reaches the deepest building setback (no bare floor in front of any wall)', () => {
  assert.ok(CONFIG.GROUND_WIDTH / 2 >= CONFIG.BUILDING_SETBACK_MAX);
});
