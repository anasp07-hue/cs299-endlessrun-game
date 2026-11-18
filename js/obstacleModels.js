// Themed obstacle models (SPEC §3.4, §9 Phase 6, ADR-0014). View code with no
// DOM: Node tests import it to measure the shapes against the hitboxes.
//
// Every model is two merged geometries:
//   body: lit, vertex-coloured parts (concrete, steel, rust, dark glass)
//   glow: unlit, vertex-coloured cue parts, in that type's cue colour only:
//         LOW = hazardAmber stripes, HIGH = a sparkWhite line exactly at the
//         slide height (glowBlue allowed as a secondary spark), BLOCK = dangerRed.
// Hitbox = visual: each model is fitted (by a measured transform) to its
// hitbox. HIGH may hang decoration above its top (cables up to the gloom), but
// nothing goes below HIGH_BOTTOM: the space you slide through is empty.

import * as THREE from '../libs/three.module.js';
import { PALETTE } from './palette.js';
import { OB } from './logic/collision.js';
import { box, mergeColored, carParts, barrierShapeGeometry, tube } from './geometry.js';


const STRIPE_DARK = '#141414'; // the black of the hazard stripes
// Body parts touching a glow part are pulled in by this much, so no face is
// shared between the two draw calls (shared faces z-fight: the cue would flicker).
const INSET = 0.012;

/** Which look an obstacle gets: deterministic from its row and lane, so it never changes mid-pass. */
export function obstacleVariant(row, lane) {
  const h = Math.imul((row | 0) ^ Math.imul(lane | 0, 0x45d9f3b), 0x9e3779b1) >>> 0;
  return (h >>> 16) % OBSTACLE_VARIANTS;
}

/**
 * Hazard stripes: n alternating amber/black slats filling a w × h × d band
 * centred at (x, y, z), slanted by `slant` (x shift per unit of the band's
 * long-cross axis) so they read as diagonal chevrons.
 * `across` = 'y' slants along height (a front-facing band), 'z' along depth (a top band).
 */
function stripes(w, h, d, x, y, z, n, slant, across, colorA = PALETTE.hazardAmber) {
  const parts = [];
  const sw = w / n;
  for (let i = 0; i < n; i++) {
    const g = box(sw, h, d, x - w / 2 + sw * (i + 0.5), y, z);
    const p = g.attributes.position;
    for (let v = 0; v < p.count; v++) {
      const t = across === 'y' ? (p.getY(v) - y) / h : (p.getZ(v) - z) / d; // −0.5 … 0.5
      // Slant inner edges only, so the band's outer ends stay square (and inside the hitbox).
      const px = p.getX(v);
      if (px > x - w / 2 + 1e-6 && px < x + w / 2 - 1e-6) p.setX(v, px + t * slant);
    }
    g.computeVertexNormals();
    parts.push([g, i % 2 === 0 ? colorA : STRIPE_DARK]);
  }
  return parts;
}

/** Bounding box of several [geometry, colour] part lists. */
function bboxOf(...lists) {
  const b = new THREE.Box3();
  const tmp = new THREE.Box3();
  for (const list of lists) {
    for (const [g] of list) {
      g.computeBoundingBox();
      tmp.copy(g.boundingBox);
      b.union(tmp);
    }
  }
  return b;
}

/** Map the box `from` onto [min, max] (per axis) and apply that to every part. */
function fitTo(lists, from, min, max) {
  const s = new THREE.Vector3(
    (max[0] - min[0]) / (from.max.x - from.min.x),
    (max[1] - min[1]) / (from.max.y - from.min.y),
    (max[2] - min[2]) / (from.max.z - from.min.z),
  );
  const m = new THREE.Matrix4()
    .makeTranslation(min[0], min[1], min[2])
    .multiply(new THREE.Matrix4().makeScale(s.x, s.y, s.z))
    .multiply(new THREE.Matrix4().makeTranslation(-from.min.x, -from.min.y, -from.min.z));
  for (const list of lists) for (const [g] of list) g.applyMatrix4(m);
}

function transformAll(lists, m) {
  for (const list of lists) for (const [g] of list) g.applyMatrix4(m);
}

// --- LOW: jump over ------------------------------------------------------------------

function fitLow(body, glow, cfg) {
  const d = (cfg.LOW_DEPTH / 2) * 0.99;
  fitTo([body, glow], bboxOf(body, glow), [-0.99, 0, -d], [0.99, cfg.LOW_HEIGHT, d]);
}

/** A fallen screen panel on a bed of rubble, amber/black stripes along its front and top edges. */
function lowFallenScreen(cfg) {
  const body = [
    [box(2.0, 0.4, 1.0, 0, 0.2, 0), '#3a4148'], // rubble bed
    [box(0.55, 0.22, 0.5, -0.72, 0.5, 0.18), '#333a41'], // chunks
    [box(0.4, 0.18, 0.45, 0.78, 0.49, -0.2), '#2f353b'],
    [box(2.0, 0.36, 0.86, 0, 0.6, -0.04), '#171b20'], // the screen's frame
    [box(1.8, 0.03, 0.62, 0, 0.795, -0.1), '#0a0e13'], // dead glass (stops short of the striped lip: no shared faces)
  ];
  const glow = [
    ...stripes(2.0, 0.18, 0.03, 0, 0.6, 0.405, 10, 0.12, 'y'), // front edge
    ...stripes(2.0, 0.03, 0.14, 0, 0.795, 0.31, 10, 0.08, 'z'), // top front lip
  ];
  fitLow(body, glow, cfg);
  return { body, glow };
}

/** A concrete barrier laid across the lane, amber/black stripes on its cap and foot. */
function lowBarrier(cfg) {
  const shape = barrierShapeGeometry(0.95, 0.85, 2.0).rotateY(Math.PI / 2); // long axis along x
  const body = [[shape, '#4f575f']];
  const capW = 0.95 * 0.38 * 2; // the profile's top width
  const glow = [
    ...stripes(2.0, 0.03, capW * 0.9, 0, 0.865, 0, 10, 0.1, 'z'),
    ...stripes(2.0, 0.11, 0.03, 0, 0.065, 0.49, 10, 0.08, 'y'), // within the profile's vertical foot (0.1275)
  ];
  fitLow(body, glow, cfg);
  return { body, glow };
}

// --- HIGH: slide under ------------------------------------------------------------------

function hangingCables(xs, fromY, toY, color = '#101215') {
  return xs.map((x) => [box(0.045, toY - fromY, 0.045, x, (fromY + toY) / 2, 0), color]);
}

/** A sagging billboard frame: dark steel, a dead screen, a glowing line along its bottom edge. */
function highBillboard(cfg) {
  const y0 = cfg.HIGH_BOTTOM;
  const y1 = cfg.HIGH_TOP;
  const steel = '#2a2e33';
  const body = [
    [box(2.0 - 2 * INSET, 0.2 - INSET, 0.5, 0, y0 + 0.1 + INSET / 2, 0), steel], // bottom beam (inset: the glow line owns the edges)
    [box(2.0, 0.16, 0.42, 0, y1 - 0.08, 0), steel], // top beam
    // Side posts start above the glow line and stop short of its ends (no shared faces).
    [box(0.12, y1 - y0 - 0.08, 0.3, -(0.94 - INSET), (y0 + 0.08 + y1) / 2, 0), steel],
    [box(0.12, y1 - y0 - 0.08, 0.3, 0.94 - INSET, (y0 + 0.08 + y1) / 2, 0), steel],
    [box(1.76, y1 - y0 - 0.38, 0.06, 0, (y0 + y1) / 2 + 0.01, -0.05), '#0b0f14'], // dead screen
    ...hangingCables([-0.7, 0.7], y1, y1 + 5.5),
  ];
  const glow = [
    [box(2.0, 0.08, 0.52, 0, y0 + 0.04, 0), PALETTE.sparkWhite], // the slide line
    [box(0.36, 0.035, 0.07, -0.45, y0 + 0.23, 0.22), PALETTE.sparkWhite], // live sparks along the beam
    [box(0.2, 0.035, 0.07, 0.52, y0 + 0.23, 0.22), PALETTE.sparkWhite],
    [box(1.1, 0.07, 0.02, 0.15, y0 + 0.85, -0.01), PALETTE.glowBlue], // a last flicker of the screen
  ];
  return { body, glow };
}

/** A broken steel beam with a bundle of sparking cables draped over it. */
function highCableBeam(cfg) {
  const y0 = cfg.HIGH_BOTTOM;
  const y1 = cfg.HIGH_TOP;
  const rust = '#4a3a32';
  // Cables hang from the top of the hitbox at both ends and sag toward the beam.
  const cable = (z, mid, r) => tube([[-1 + r, y1 - r, z], [-0.4, mid + 0.2, z], [0, mid, z], [0.4, mid + 0.15, z], [1 - r, y1 - r, z]], r, 20, 5);
  const body = [
    [box(2.0 - 2 * INSET, 0.06 - INSET, 0.56, 0, y0 + 0.03 + INSET / 2, 0), rust], // I-beam: bottom flange (inset: the glow line owns the edges)
    [box(2.0 - 2 * INSET, 0.24, 0.08, 0, y0 + 0.18, 0), rust], // web
    [box(2.0 - 2 * INSET, 0.06, 0.56, 0, y0 + 0.33, 0), rust], // top flange
    [cable(-0.14, y0 + 0.62, 0.07), '#121417'],
    [cable(0.0, y0 + 0.8, 0.06), '#16181b'],
    ...hangingCables([-0.85, 0.85], y1 - 0.2, y1 + 5.5),
  ];
  const glow = [
    [box(2.0, 0.08, 0.58, 0, y0 + 0.04, 0), PALETTE.sparkWhite], // the slide line
    [cable(0.14, y0 + 0.7, 0.045), PALETTE.sparkWhite], // a live cable, glowing
    [box(0.5, 0.04, 0.05, -0.2, y0 + 0.39, 0.12), PALETTE.glowBlue], // arcing where it touches the beam
  ];
  return { body, glow };
}

// --- BLOCK: change lanes ------------------------------------------------------------------

/** A hover-car crashed tail-first into the road, nose in the air and its roof toward you, red lights still on. */
function blockCar(cfg) {
  const W = 2.0;
  const Lc = 3.8;
  const body = carParts(W, Lc);
  const glow = [
    [box(W * 0.86, 0.2, 0.06, 0, 0.42, -Lc / 2 - 0.03), PALETTE.dangerRed], // full-width light bar across the raised nose
    [box(W + 0.04, 0.14, Lc * 0.8, 0, 0.5, 0.05), PALETTE.dangerRed], // side strips, wrapping the body
    [box(W * 0.5, 0.06, 0.5, 0, 1.2, 0.9), PALETTE.dangerRed], // a warning light on the roof
  ];
  transformAll([body, glow], new THREE.Matrix4().makeRotationX(1.05)); // tail down into the road, nose up, roof facing the camera
  fitTo([body, glow], bboxOf(body, glow), [-0.99, -0.35, -cfg.BLOCK_DEPTH / 2 * 0.99], [0.99, cfg.BLOCK_HEIGHT, cfg.BLOCK_DEPTH / 2 * 0.99]);
  return { body, glow };
}

/** A broken concrete pillar with a red warning band and beacon. */
function blockPillar(cfg) {
  const c = '#434b53';
  const body = [
    [box(1.7, 2.25, 1.7, 0, 1.125, 0), c],
    [box(1.45, 0.4, 1.25, 0.08, 2.4, -0.05), '#3b4249'], // broken crown
    [box(0.5, 0.35, 0.6, -0.72, 0.17, 0.62), '#353c43'], // fallen chunks at the foot
    [box(0.45, 0.28, 0.5, 0.75, 0.14, -0.6), '#353c43'],
    [box(0.05, 0.45, 0.05, -0.45, 2.75, 0.35), PALETTE.rust], // rebar
    [box(0.05, 0.38, 0.05, 0.4, 2.7, -0.3), PALETTE.rust],
  ];
  const glow = [];
  for (const band of [0.75, 1.75]) { // two red warning bands wrapped round the pillar
    glow.push(
      [box(1.72, 0.22, 0.02, 0, band, 0.86), PALETTE.dangerRed],
      [box(1.72, 0.22, 0.02, 0, band, -0.86), PALETTE.dangerRed],
      [box(0.02, 0.22, 1.72, 0.86, band, 0), PALETTE.dangerRed],
      [box(0.02, 0.22, 1.72, -0.86, band, 0), PALETTE.dangerRed],
    );
  }
  glow.push([box(0.24, 0.16, 0.24, 0.35, 2.67, 0.2), PALETTE.dangerRed]); // beacon
  fitTo([body, glow], bboxOf(body, glow), [-0.99, 0, -cfg.BLOCK_DEPTH / 2 * 0.99], [0.99, cfg.BLOCK_HEIGHT, cfg.BLOCK_DEPTH / 2 * 0.99]);
  return { body, glow };
}

/**
 * All models: models[type][variant] = { body, glow } as merged BufferGeometries
 * in the obstacle's local space (x across the lane, y up from the road, z along
 * the road), to be drawn at (laneX, 0, z).
 */
export function buildObstacleModels(cfg) {
  const make = (m) => ({ body: mergeColored(m.body), glow: mergeColored(m.glow) });
  const models = [];
  for (const t of [OB.LOW, OB.HIGH, OB.BLOCK]) models[t] = BUILDERS[t].map((build) => make(build(cfg)));
  return models;
}

// The looks per type. Add a look by adding a builder to every type's list.
const BUILDERS = [];
BUILDERS[OB.LOW] = [lowFallenScreen, lowBarrier];
BUILDERS[OB.HIGH] = [highBillboard, highCableBeam];
BUILDERS[OB.BLOCK] = [blockCar, blockPillar];
if (BUILDERS[OB.HIGH].length !== BUILDERS[OB.LOW].length || BUILDERS[OB.BLOCK].length !== BUILDERS[OB.LOW].length) {
  throw new Error('obstacleModels: every type needs the same number of looks');
}

/** How many looks each type has (derived from the builders, so it can't drift). */
export const OBSTACLE_VARIANTS = BUILDERS[OB.LOW].length;
