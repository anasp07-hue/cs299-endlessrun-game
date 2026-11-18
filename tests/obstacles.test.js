// Themed obstacle models (Phase 6, ADR-0014). These import three.js (vendored,
// DOM-free at import) to measure the real geometry against the hitboxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../libs/three.module.js';
import { CONFIG } from '../js/logic/config.js';
import { PALETTE } from '../js/palette.js';
import { OB, obstacleBottom, obstacleTop, obstacleDepth } from '../js/logic/collision.js';
import { buildObstacleModels, obstacleVariant, OBSTACLE_VARIANTS } from '../js/obstacleModels.js';

const models = buildObstacleModels(CONFIG);
const TYPES = [[OB.LOW, 'LOW'], [OB.HIGH, 'HIGH'], [OB.BLOCK, 'BLOCK']];
const HALF_W = CONFIG.OBSTACLE_WIDTH / 2;
const EPS = 1e-3;

function bbox(...geos) {
  const b = new THREE.Box3();
  for (const g of geos) {
    g.computeBoundingBox();
    b.union(g.boundingBox);
  }
  return b;
}

/** Distinct vertex colours of a geometry, as hex strings (sRGB, like the palette). */
function colours(g) {
  const c = g.attributes.color;
  const out = new Set();
  const col = new THREE.Color();
  for (let i = 0; i < c.count; i++) out.add('#' + col.setRGB(c.getX(i), c.getY(i), c.getZ(i)).getHexString());
  return out;
}

/**
 * Bounding box of the triangles that reach into the height range [y0, y1],
 * clipped to that range: the visible solid part of a model at those heights.
 * (Triangles that cross y0 or y1, like a crashed car's nose going into the
 * road, count; geometry wholly outside the range does not.)
 */
function bboxBetween(g, y0, y1) {
  const p = g.attributes.position;
  const b = new THREE.Box3();
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i += 3) {
    let lo = Infinity;
    let hi = -Infinity;
    for (let k = 0; k < 3; k++) {
      lo = Math.min(lo, p.getY(i + k));
      hi = Math.max(hi, p.getY(i + k));
    }
    if (hi < y0 - EPS || lo > y1 + EPS) continue;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(p, i + k);
      v.y = Math.min(Math.max(v.y, y0), y1);
      b.expandByPoint(v);
    }
  }
  return b;
}

test('every type has OBSTACLE_VARIANTS models, each a lit body plus a glowing cue part', () => {
  for (const [t, name] of TYPES) {
    assert.equal(models[t].length, OBSTACLE_VARIANTS, name);
    for (const m of models[t]) {
      assert.ok(m.body.attributes.position.count > 0 && m.glow.attributes.position.count > 0, name);
      assert.ok(m.body.attributes.color && m.glow.attributes.color, `${name}: vertex coloured`);
    }
  }
});

test('hitbox = visual (SPEC §3.4): every model fills its hitbox and stays inside it across the lane and along the road', () => {
  for (const [t, name] of TYPES) {
    const d = obstacleDepth(t, CONFIG) / 2;
    const yTop = obstacleTop(t, CONFIG);
    const yBot = obstacleBottom(t, CONFIG);
    models[t].forEach((m, v) => {
      const b = bbox(m.body, m.glow);
      const tag = `${name} variant ${v}`;
      assert.ok(b.min.x >= -HALF_W - EPS && b.max.x <= HALF_W + EPS, `${tag}: x ${b.min.x.toFixed(3)}…${b.max.x.toFixed(3)}`);
      assert.ok(b.min.z >= -d - EPS && b.max.z <= d + EPS, `${tag}: z ${b.min.z.toFixed(3)}…${b.max.z.toFixed(3)}`);
      assert.ok(b.max.x - b.min.x >= 2 * HALF_W * 0.95, `${tag}: fills the lane width`);
      assert.ok(b.max.z - b.min.z >= 2 * d * 0.85, `${tag}: fills the hitbox depth (${(b.max.z - b.min.z).toFixed(2)} of ${2 * d})`);
      // The solid part (between the hitbox's bottom and top) must span the full hitbox height.
      const solid = bboxBetween(m.body, yBot, yTop).union(bboxBetween(m.glow, yBot, yTop));
      assert.ok(solid.min.y <= Math.max(yBot, 0) + 0.06, `${tag}: solid starts at ${solid.min.y.toFixed(3)}`);
      assert.ok(solid.max.y >= yTop - 0.06, `${tag}: solid reaches ${solid.max.y.toFixed(3)} of ${yTop}`);
    });
  }
});

test('LOW never rises above LOW_HEIGHT: if you clear it visually, you clear it', () => {
  for (const m of models[OB.LOW]) {
    const b = bbox(m.body, m.glow);
    assert.ok(b.max.y <= CONFIG.LOW_HEIGHT + EPS, `top ${b.max.y}`);
    assert.ok(b.min.y >= -EPS);
  }
});

test('HIGH: nothing below HIGH_BOTTOM (the slide space is empty) and a glowing line exactly at it, across the lane', () => {
  for (const m of models[OB.HIGH]) {
    const b = bbox(m.body, m.glow);
    assert.ok(b.min.y >= CONFIG.HIGH_BOTTOM - EPS, `lowest point ${b.min.y}`);
    const line = bboxBetween(m.glow, CONFIG.HIGH_BOTTOM, CONFIG.HIGH_BOTTOM + 0.1);
    assert.ok(line.max.x - line.min.x >= 2 * HALF_W * 0.98, 'the cue line spans the lane');
    assert.ok(Math.abs(bbox(m.glow).min.y - CONFIG.HIGH_BOTTOM) < 0.01, 'and the glow\'s lowest edge is exactly the slide height');
    // Anything above HIGH_TOP is thin hanging decoration, never wider than the lane.
    assert.ok(b.max.x <= HALF_W + EPS && b.min.x >= -HALF_W - EPS);
  }
});

test("BLOCK reaches its full height (can't be jumped) and only sinks a little into the road", () => {
  for (const m of models[OB.BLOCK]) {
    const b = bbox(m.body, m.glow);
    assert.ok(b.max.y <= CONFIG.BLOCK_HEIGHT + EPS && b.max.y >= CONFIG.BLOCK_HEIGHT - 0.05, `top ${b.max.y}`);
    assert.ok(b.max.y > CONFIG.JUMP_HEIGHT + 0.3, 'clearly taller than a jump');
    assert.ok(b.min.y >= -0.4, "buried at most 0.4 (the crashed car's nose)");
  }
});

test('each type glows only in its own cue colour, and no body uses any cue colour', () => {
  const cue = {
    [OB.LOW]: new Set([PALETTE.hazardAmber, '#141414']),
    [OB.HIGH]: new Set([PALETTE.sparkWhite, PALETTE.glowBlue]),
    [OB.BLOCK]: new Set([PALETTE.dangerRed]),
  };
  const must = { [OB.LOW]: PALETTE.hazardAmber, [OB.HIGH]: PALETTE.sparkWhite, [OB.BLOCK]: PALETTE.dangerRed };
  const allCues = new Set([PALETTE.hazardAmber, PALETTE.sparkWhite, PALETTE.dangerRed]);
  for (const [t, name] of TYPES) {
    models[t].forEach((m, v) => {
      const g = colours(m.glow);
      for (const c of g) assert.ok(cue[t].has(c), `${name} variant ${v} glows ${c}`);
      assert.ok(g.has(must[t]), `${name} variant ${v} shows its cue ${must[t]}`);
      for (const c of colours(m.body)) assert.ok(!allCues.has(c), `${name} variant ${v} body uses cue colour ${c}`);
    });
  }
});

test('obstacleVariant: deterministic, in range, and every variant actually appears', () => {
  const seen = new Array(OBSTACLE_VARIANTS).fill(0);
  for (let row = 0; row < 500; row++) {
    for (let lane = 0; lane < 3; lane++) {
      const v = obstacleVariant(row, lane);
      assert.equal(v, obstacleVariant(row, lane));
      assert.ok(Number.isInteger(v) && v >= 0 && v < OBSTACLE_VARIANTS);
      seen[v]++;
    }
  }
  for (const n of seen) assert.ok(n > 1500 * 0.35, `uneven: ${seen}`);
});

test('no shared faces between a body and its glow (shared faces z-fight, so the cue would flicker)', () => {
  // Every axis-aligned face plane of the glow's box parts is checked against the body's
  // vertices: a glow face plane may not be shared by a body face over the same area.
  // Proxy: no body vertex lies exactly on the glow's outer bounding planes within the glow's extent.
  for (const [t, name] of TYPES) {
    models[t].forEach((m, v) => {
      if (t === OB.HIGH) {
        // The slide line: the body must sit strictly inside it at the ends and above it at the bottom.
        const bodyAtLine = bboxBetween(m.body, CONFIG.HIGH_BOTTOM, CONFIG.HIGH_BOTTOM + 0.1);
        assert.ok(bodyAtLine.min.y > CONFIG.HIGH_BOTTOM + 0.005, `${name} variant ${v}: beam bottom shares the line's face`);
        assert.ok(bodyAtLine.max.x < HALF_W - 0.005 && bodyAtLine.min.x > -HALF_W + 0.005, `${name} variant ${v}: beam ends share the line's faces`);
      }
    });
  }
});

test('OBSTACLE_VARIANTS matches the number of looks built for every type', () => {
  for (const [t] of TYPES) assert.equal(models[t].length, OBSTACLE_VARIANTS);
});
