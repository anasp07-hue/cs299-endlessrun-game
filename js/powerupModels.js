// Power-up pickups and the carried bazooka (Round 4, SPEC §3.8). View code
// with no DOM: Node tests import it to measure the shapes against the pickup
// box and the runner.
//
// Every pickup is the same small case standing on the road (a dark plinth
// and crate with a glowing band and a ring on the road) with a glowing glyph
// on top that says what it is:
//   BAZOOKA: a rocket          (powerBazooka, rose-magenta)
//   DOUBLE:  two up-chevrons   (powerDouble, lime)
//   PHASE:   a hollow ring     (powerPhase, violet)
// Two merged geometries per type: body (lit, vertex-coloured) and glow
// (unlit, the type's colour only). All of it fits inside the pickup box
// (POWERUP_HIT_W × POWERUP_HIT_H × POWERUP_HIT_D, from the road up), so what
// you see is what you pick up. Colours avoid the obstacle cues and glowBlue.

import * as THREE from '../libs/three.module.js';
import { PALETTE } from './palette.js';
import { POWER } from './logic/powerups.js';
import { box, mergeColored } from './geometry.js';
import { RIG } from './logic/pose.js';

export const POWER_COLORS = Object.freeze({
  [POWER.BAZOOKA]: PALETTE.powerBazooka,
  [POWER.DOUBLE]: PALETTE.powerDouble,
  [POWER.PHASE]: PALETTE.powerPhase,
});

const CASE_DARK = '#1b2027';
const CASE_MID = '#2c333c';
const GLYPH_Y = 0.74; // centre of the glyph above the crate

/** `color` scaled toward black (for the dimmer ring on the road). */
function dim(color, k) {
  return '#' + new THREE.Color(color).multiplyScalar(k).getHexString();
}

function cylinderX(r, len, x, y, z, seg = 8) {
  return new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(x, y, z);
}

function caseParts() {
  return [
    [new THREE.CylinderGeometry(0.42, 0.44, 0.08, 6).translate(0, 0.04, 0), CASE_DARK], // plinth
    [box(0.48, 0.36, 0.48, 0, 0.26, 0), CASE_MID], // crate
    [box(0.4, 0.03, 0.4, 0, 0.455, 0), CASE_DARK], // lid
  ];
}

function caseGlow(color) {
  return [
    // Band round the crate (slightly larger, so no face is shared with the body: no z-fighting).
    [box(0.5, 0.05, 0.5, 0, 0.3, 0), color],
    // A thin ring on the road around the plinth.
    [new THREE.TorusGeometry(0.46, 0.022, 4, 24).rotateX(Math.PI / 2).translate(0, 0.03, 0), dim(color, 0.7)],
  ];
}

function rocketGlyph(color) {
  return [
    [cylinderX(0.075, 0.4, -0.04, GLYPH_Y, 0), color], // body
    [new THREE.ConeGeometry(0.075, 0.16, 8).rotateZ(-Math.PI / 2).translate(0.24, GLYPH_Y, 0), color], // nose
    [box(0.1, 0.24, 0.03, -0.2, GLYPH_Y, 0), color], // fins
    [box(0.1, 0.03, 0.24, -0.2, GLYPH_Y, 0), color],
  ];
}

function chevron(y, color) {
  const bar = (dir) => box(0.24, 0.065, 0.065, 0, 0, 0).rotateZ(dir * Math.PI / 4).translate(dir * -0.085, y, 0);
  return [[bar(1), color], [bar(-1), color]];
}

function ringGlyph(color) {
  return [
    [new THREE.TorusGeometry(0.17, 0.035, 6, 20).translate(0, GLYPH_Y, 0), color],
    [new THREE.OctahedronGeometry(0.06, 0).translate(0, GLYPH_Y, 0), color],
  ];
}

const GLYPHS = Object.freeze({
  [POWER.BAZOOKA]: rocketGlyph,
  [POWER.DOUBLE]: (c) => [...chevron(GLYPH_Y - 0.1, c), ...chevron(GLYPH_Y + 0.08, c)],
  [POWER.PHASE]: ringGlyph,
});

/** { [type]: { body, glow } } merged geometries for the three pickups, built once at startup. */
export function buildPowerupModels() {
  const out = {};
  for (const type of [POWER.BAZOOKA, POWER.DOUBLE, POWER.PHASE]) {
    const color = POWER_COLORS[type];
    out[type] = {
      body: mergeColored(caseParts()),
      glow: mergeColored([...caseGlow(color), ...GLYPHS[type](color)]),
    };
  }
  return out;
}

/**
 * A thin beam of light rising from a pickup, so a rare power-up is easy to
 * spot far down the road. Vertex colours fade from white at the bottom to
 * black at the top; drawn additively in the type's colour, black is invisible.
 * It starts above the pickup box (so it's clearly not something to touch).
 */
export function buildPowerupBeam(cfg) {
  const h = 3.2;
  const g = new THREE.CylinderGeometry(0.035, 0.07, h, 6, 1, true).translate(0, cfg.POWERUP_HIT_H + h / 2, 0);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const k = 1 - (pos.getY(i) - cfg.POWERUP_HIT_H) / h; // 1 at the bottom, 0 at the top
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k * k;
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

/**
 * The bazooka a runner carries while holding the shot: a launcher tube
 * strapped diagonally across the back (the side the camera sees), in torso
 * space. It stays inside the torso's width and below the shoulders, so it
 * never changes the runner's outline against the hitbox (R9).
 */
export function buildCarriedBazooka() {
  const tilt = 0.4; // radians: right end up
  const y = RIG.TORSO * 0.55;
  const z = 0.3; // just behind the back (and any backpack)
  const tube = (r, len, x) => new THREE.CylinderGeometry(r, r, len, 8).rotateZ(Math.PI / 2).translate(x, 0, 0);
  const place = (g) => g.rotateZ(tilt).translate(0, y, z);
  return {
    body: mergeColored([
      [place(tube(0.065, 0.46, 0)), '#2a2f36'],
      [place(box(0.07, 0.1, 0.07, -0.04, -0.09, 0)), '#1b1f25'], // grip
    ]),
    glow: mergeColored([
      [place(tube(0.072, 0.05, 0.2)), PALETTE.powerBazooka], // muzzle band
      [place(tube(0.072, 0.03, -0.17)), PALETTE.powerBazooka], // rear band
    ]),
  };
}
