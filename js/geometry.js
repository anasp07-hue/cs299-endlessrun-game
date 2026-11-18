// Shared low-poly geometry builders (view code, but no DOM: Node tests can
// import this and measure the shapes). Used by js/city.js for set dressing
// and js/obstacleModels.js for the themed obstacles (ADR-0013, ADR-0014).

import * as THREE from '../libs/three.module.js';
import { PALETTE } from './palette.js';

/** A box of size w × h × d with its centre at (x, y, z). */
export function box(w, h, d, x = 0, y = 0, z = 0) {
  return new THREE.BoxGeometry(w, h, d).translate(x, y, z);
}

/**
 * Merge non-indexed copies of several geometries into one, each part painted
 * one vertex colour: [[geometry, '#rrggbb'], ...]. One draw call per merge.
 */
export function mergeColored(parts) {
  const pos = [];
  const nor = [];
  const col = [];
  for (const [geo, color] of parts) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const c = new THREE.Color(color);
    for (let i = 0; i < p.length; i += 3) {
      pos.push(p[i], p[i + 1], p[i + 2]);
      nor.push(n[i], n[i + 1], n[i + 2]);
      col.push(c.r, c.g, c.b);
    }
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/** Hover-car parts facing −Z, base at y = 0, as [geometry, colour] pairs (merge them, or transform first). */
export function carParts(W, Lc) {
  const body = new THREE.BoxGeometry(W, 0.6, Lc, 1, 1, 1);
  // Wedge: drop the top front edge.
  const p = body.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) > 0 && p.getZ(i) < 0) p.setY(i, p.getY(i) - 0.35);
  body.computeVertexNormals();
  body.translate(0, 0.62, 0);
  const cockpit = new THREE.SphereGeometry(0.62, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2);
  cockpit.scale(1, 0.75, 1.5);
  cockpit.translate(0, 0.88, 0.25);
  const parts = [[body, PALETTE.rust], [cockpit, '#0c1218']];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      parts.push([box(0.62, 0.2, 1.0, sx * (W / 2 - 0.3), 0.12, sz * (Lc / 2 - 0.65)), '#2a2d31']);
    }
  }
  parts.push([box(W * 0.7, 0.35, 0.25, 0, 0.72, Lc / 2 + 0.1), '#202326']); // tail
  return parts;
}

/** A wrecked hover-car facing −Z: wedge body, cockpit bubble, flat thruster pods (no wheels). Base at y = 0. */
export function makeCarGeometry(W, Lc) {
  return mergeColored(carParts(W, Lc));
}

/** The sloped "jersey" barrier profile as an extruded geometry: width × height, long axis along z. */
export function barrierShapeGeometry(width, height, length) {
  const w = width / 2;
  const h = height;
  const shape = new THREE.Shape();
  shape.moveTo(-w, 0);
  shape.lineTo(w, 0);
  shape.lineTo(w, h * 0.15);
  shape.lineTo(w * 0.45, h * 0.38);
  shape.lineTo(w * 0.38, h);
  shape.lineTo(-w * 0.38, h);
  shape.lineTo(-w * 0.45, h * 0.38);
  shape.lineTo(-w, h * 0.15);
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: length, bevelEnabled: false });
  g.translate(0, 0, -length / 2);
  g.computeVertexNormals();
  return g;
}

/** A concrete road barrier, long axis along z, base at y = 0, in one colour. */
export function makeBarrierGeometry(width, height, length, color) {
  return mergeColored([[barrierShapeGeometry(width, height, length), color]]);
}

/** A tube along a list of [x, y, z] points (cables). */
export function tube(points, radius, segments = 16, radial = 5) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, segments, radius, radial, false);
}
