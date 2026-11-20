// Procedural character rigs: the runners (the Hacker, plus the Android and
// the Alien from the Round 3 shop) and the Agent (chaser)
// (SPEC §5 Characters, art-direction skill, ADR-0012). Every runner is
// dressed on the same skeleton (RIG) and posed by the same functions, so they
// move identically and fill the same hitbox (R9); only the dressing differs.
// View code: builds THREE.Group skeletons from the pure RIG dimensions in
// js/logic/pose.js, dresses them in low-poly boxes with shared materials, and
// applies a pose (plain joint angles) to the pivots every frame. Everything
// is created once at startup; applyPose only writes numbers (no allocation).

import * as THREE from '../libs/three.module.js';
import { RIG, AGENT_SCALE } from './logic/pose.js';
import { PALETTE } from './palette.js';
import { CHARACTER } from './logic/shop.js';

/** A box geometry with its centre moved to (x, y, z) in the pivot's space. */
function box(w, h, d, x = 0, y = 0, z = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function add(parent, geo, mat) {
  const m = new THREE.Mesh(geo, mat);
  parent.add(m);
  return m;
}

/**
 * The bare skeleton: root → body (roll, at the feet) → hips → torso → neck/head,
 * shoulders → elbows; hips → legs → knees. Feet at y = 0, facing −Z.
 */
function createSkeleton() {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const hips = new THREE.Group();
  body.add(hips);
  const torso = new THREE.Group();
  hips.add(torso);
  const head = new THREE.Group();
  head.position.y = RIG.TORSO;
  torso.add(head);

  const shoulderY = RIG.TORSO - RIG.SHOULDER_DROP;
  const shoulderL = new THREE.Group();
  shoulderL.position.set(-RIG.SHOULDER_SPREAD, shoulderY, 0);
  const shoulderR = new THREE.Group();
  shoulderR.position.set(RIG.SHOULDER_SPREAD, shoulderY, 0);
  torso.add(shoulderL, shoulderR);
  const elbowL = new THREE.Group();
  elbowL.position.y = -RIG.UPPER_ARM;
  shoulderL.add(elbowL);
  const elbowR = new THREE.Group();
  elbowR.position.y = -RIG.UPPER_ARM;
  shoulderR.add(elbowR);

  const legL = new THREE.Group();
  legL.position.x = -RIG.HIP_SPREAD;
  const legR = new THREE.Group();
  legR.position.x = RIG.HIP_SPREAD;
  hips.add(legL, legR);
  const kneeL = new THREE.Group();
  kneeL.position.y = -RIG.THIGH;
  legL.add(kneeL);
  const kneeR = new THREE.Group();
  kneeR.position.y = -RIG.THIGH;
  legR.add(kneeR);

  return { root, body, hips, torso, head, shoulderL, shoulderR, elbowL, elbowR, legL, legR, kneeL, kneeR };
}

/** Write a pose's joint angles into a skeleton's pivots. */
export function applyPose(sk, pose) {
  sk.body.rotation.z = pose.roll;
  sk.hips.position.y = pose.hipY;
  sk.torso.rotation.x = pose.lean;
  sk.head.rotation.x = pose.head;
  sk.legL.rotation.x = pose.thighL;
  sk.legR.rotation.x = pose.thighR;
  sk.kneeL.rotation.x = pose.kneeL;
  sk.kneeR.rotation.x = pose.kneeR;
  sk.shoulderL.rotation.x = pose.shoulderL;
  sk.shoulderR.rotation.x = pose.shoulderR;
  sk.shoulderL.rotation.z = -pose.armOut; // left arm is on −X: spreading moves the hand to −X
  sk.shoulderR.rotation.z = pose.armOut;
  sk.elbowL.rotation.x = pose.elbowL;
  sk.elbowR.rotation.x = pose.elbowR;
}

/** Arms and legs: upper/lower limb boxes hung from their pivots. m.legW (default 0.17) thins the legs. */
function dressLimbs(sk, m) {
  const ua = RIG.UPPER_ARM;
  const fa = RIG.FOREARM;
  for (const [sh, el] of [[sk.shoulderL, sk.elbowL], [sk.shoulderR, sk.elbowR]]) {
    add(sh, box(m.armW, ua, m.armW, 0, -ua / 2, 0), m.sleeve);
    add(el, box(m.armW * 0.9, fa, m.armW * 0.9, 0, -fa / 2, 0), m.sleeve);
    if (m.hand) add(el, box(0.085, 0.1, 0.085, 0, -fa - 0.04, 0), m.hand);
  }
  const th = RIG.THIGH;
  const shin = RIG.SHIN - 0.08; // the shoe makes up the rest
  const lw = m.legW || 0.17;
  for (const [leg, knee] of [[sk.legL, sk.kneeL], [sk.legR, sk.kneeR]]) {
    add(leg, box(lw, th, lw + 0.01, 0, -th / 2, 0), m.pants);
    add(knee, box(lw - 0.03, shin, lw - 0.02, 0, -shin / 2, 0), m.pants);
    add(knee, box(0.15, 0.08, 0.28, 0, -RIG.SHIN + 0.04, -0.05), m.shoe);
  }
}

/**
 * The Hacker: near-black hoodie with the hood up, black cargo pants, black
 * shoes. The only bright accents are cold glowBlue: a thin visor (wider than
 * the hood, so its tips show from behind) and a backpack LED strip, since the
 * camera mostly sees his back.
 */
export function createHacker() {
  const sk = createSkeleton();
  const hoodie = new THREE.MeshLambertMaterial({ color: '#272a32' }); // charcoal-black: reads as black, keeps a shape
  const m = {
    armW: 0.13,
    sleeve: hoodie,
    pants: new THREE.MeshLambertMaterial({ color: '#1c1e23' }),
    shoe: new THREE.MeshLambertMaterial({ color: '#1d2026' }),
    hand: null, // sleeves pulled over the hands
  };
  const glow = new THREE.MeshBasicMaterial({ color: PALETTE.glowBlue });
  const softGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glowBlue).multiplyScalar(0.75) });

  // Torso + hood
  add(sk.torso, box(0.44, RIG.TORSO + 0.02, 0.26, 0, RIG.TORSO / 2, 0), hoodie);
  const headMid = RIG.NECK + RIG.HEAD / 2;
  add(sk.head, box(0.3, RIG.HEAD + 0.08, 0.32, 0, headMid + 0.02, 0.02), hoodie); // hood shell
  add(sk.head, box(0.21, 0.18, 0.04, 0, headMid - 0.01, -0.14), new THREE.MeshLambertMaterial({ color: '#07070a' })); // shadowed face
  add(sk.head, box(0.32, 0.035, 0.05, 0, headMid + 0.02, -0.15), glow); // visor
  // Backpack with an LED strip, facing the camera
  add(sk.torso, box(0.3, 0.32, 0.12, 0, RIG.TORSO * 0.58, 0.19), new THREE.MeshLambertMaterial({ color: '#202329' }));
  add(sk.torso, box(0.22, 0.03, 0.02, 0, RIG.TORSO * 0.66, 0.255), softGlow);
  dressLimbs(sk, m);
  return sk;
}

/**
 * The Android (Round 3 shop, R8): brushed-silver plating over graphite
 * joints, a squared helmet with a thin glowing eye band, a short antenna, and
 * a back vent with a soft glow strip (the camera sees his back). The silver
 * is the lightest thing on the road, so he reads easily against the night.
 */
export function createAndroid() {
  const sk = createSkeleton();
  const silver = new THREE.MeshLambertMaterial({ color: '#b4bcc5' });
  const graphite = new THREE.MeshLambertMaterial({ color: '#3a3f47' });
  const glow = new THREE.MeshBasicMaterial({ color: PALETTE.glowBlue });
  const softGlow = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.glowBlue).multiplyScalar(0.75) });
  // No separate hands (like the Hacker): a hand box would dip into the road in the slide pose.
  const m = { armW: 0.12, sleeve: silver, pants: silver, shoe: graphite, hand: null, legW: 0.16 };

  // Torso: a chest plate over a graphite core, with a silver collar.
  add(sk.torso, box(0.42, RIG.TORSO * 0.62, 0.26, 0, RIG.TORSO * 0.66, 0), silver); // chest plate
  add(sk.torso, box(0.32, RIG.TORSO * 0.42, 0.2, 0, RIG.TORSO * 0.22, 0), graphite); // waist core
  add(sk.torso, box(0.2, 0.06, 0.18, 0, RIG.TORSO + 0.01, 0), graphite); // neck ring
  // Back vent with a glow strip, facing the camera
  add(sk.torso, box(0.26, 0.24, 0.06, 0, RIG.TORSO * 0.62, 0.155), graphite);
  add(sk.torso, box(0.18, 0.025, 0.02, 0, RIG.TORSO * 0.62, 0.19), softGlow);
  // Shoulder pads ride on the shoulder pivots, so they swing with the arms.
  add(sk.shoulderL, box(0.16, 0.08, 0.19, 0, 0.02, 0), silver);
  add(sk.shoulderR, box(0.16, 0.08, 0.19, 0, 0.02, 0), silver);
  // Elbow and knee joints in graphite
  for (const j of [sk.elbowL, sk.elbowR]) add(j, box(0.13, 0.06, 0.13), graphite);
  for (const j of [sk.kneeL, sk.kneeR]) add(j, box(0.17, 0.07, 0.17), graphite);

  // Head: squared helmet, eye band wider than the helmet (tips show from behind), antenna.
  const headMid = RIG.NECK + RIG.HEAD / 2;
  add(sk.head, box(0.25, RIG.HEAD + 0.02, 0.26, 0, headMid + 0.01, 0), silver);
  add(sk.head, box(0.29, 0.035, 0.05, 0, headMid + 0.03, -0.12), glow); // eye band
  add(sk.head, box(0.18, 0.05, 0.03, 0, headMid - 0.06, -0.125), graphite); // jaw grille
  // Short antenna: its tip stays level with the top of the Hacker's hood (same height, R9).
  const helmetTop = headMid + 0.01 + (RIG.HEAD + 0.02) / 2;
  add(sk.head, box(0.03, 0.04, 0.03, 0.07, helmetTop + 0.02, 0.03), graphite); // antenna
  add(sk.head, box(0.045, 0.025, 0.045, 0.07, helmetTop + 0.03, 0.03), softGlow); // antenna tip
  dressLimbs(sk, m);
  return sk;
}

/**
 * The Alien (Round 3 shop, R8): muted green skin, a big domed head wider
 * than it is tall, large black almond eyes, thin limbs, a dark grey-green
 * vest, and a faint green glow line down the back. The green stays
 * desaturated so the obstacle cues still own the bright warm colours.
 */
export function createAlien() {
  const sk = createSkeleton();
  const skinGreen = new THREE.MeshLambertMaterial({ color: '#79a95b' });
  const vest = new THREE.MeshLambertMaterial({ color: '#2a352c' });
  const eye = new THREE.MeshLambertMaterial({ color: '#050607' });
  const glow = new THREE.MeshBasicMaterial({ color: '#8fcf78' });
  const m = {
    armW: 0.1, sleeve: skinGreen, pants: skinGreen, shoe: new THREE.MeshLambertMaterial({ color: '#1f2620' }),
    hand: null, legW: 0.14, // thin green forearms end in the hand; no box to dip into the road
  };

  // Torso: thin green body under a dark vest; glow line down the back.
  add(sk.torso, box(0.34, RIG.TORSO + 0.02, 0.21, 0, RIG.TORSO / 2, 0), skinGreen);
  add(sk.torso, box(0.37, RIG.TORSO * 0.55, 0.24, 0, RIG.TORSO * 0.6, 0), vest);
  add(sk.torso, box(0.03, RIG.TORSO * 0.5, 0.02, 0, RIG.TORSO * 0.58, 0.125), glow);
  add(sk.torso, box(0.09, 0.08, 0.09, 0, RIG.TORSO + 0.04, 0), skinGreen); // thin neck

  // Head: a wide cranium with a narrower cap (dome), a small chin, two big slanted eyes.
  const headMid = RIG.NECK + RIG.HEAD / 2;
  add(sk.head, box(0.36, 0.22, 0.3, 0, headMid + 0.04, 0.01), skinGreen); // cranium
  add(sk.head, box(0.26, 0.05, 0.24, 0, headMid + 0.165, 0.01), skinGreen); // dome cap
  add(sk.head, box(0.16, 0.09, 0.17, 0, headMid - 0.1, -0.02), skinGreen); // chin
  for (const side of [-1, 1]) {
    const g = new THREE.BoxGeometry(0.12, 0.06, 0.02);
    g.rotateZ(side * 0.4); // slanted up and out
    g.translate(side * 0.085, headMid + 0.02, -0.15);
    add(sk.head, g, eye);
  }
  dressLimbs(sk, m);
  return sk;
}

/** Runner builders by shop id (SPEC §5): all on the same skeleton and poses. */
export const RUNNER_BUILDERS = Object.freeze({
  [CHARACTER.HACKER]: createHacker,
  [CHARACTER.ANDROID]: createAndroid,
  [CHARACTER.ALIEN]: createAlien,
});

/**
 * The Agent: charcoal suit, white shirt collar, thin black tie, sunglasses,
 * short dark hair, pale skin. Upright and stiff (see agentRun in pose.js).
 */
export function createAgent() {
  const sk = createSkeleton();
  sk.root.scale.setScalar(AGENT_SCALE);
  const suit = new THREE.MeshLambertMaterial({ color: '#26272b' });
  const skin = new THREE.MeshLambertMaterial({ color: '#d6c2b4' });
  const black = new THREE.MeshLambertMaterial({ color: '#060607' });
  const m = {
    armW: 0.13,
    sleeve: suit,
    pants: suit,
    shoe: black,
    hand: skin,
  };
  add(sk.torso, box(0.48, RIG.TORSO + 0.02, 0.28, 0, RIG.TORSO / 2, 0), suit);
  add(sk.torso, box(0.17, 0.08, 0.18, 0, RIG.TORSO + 0.02, 0), new THREE.MeshLambertMaterial({ color: '#e9ecef' })); // shirt collar
  add(sk.torso, box(0.05, 0.3, 0.02, 0, RIG.TORSO - 0.19, -0.145), black); // tie
  const headMid = RIG.NECK + RIG.HEAD / 2;
  add(sk.head, box(0.2, RIG.HEAD, 0.23, 0, headMid, 0), skin);
  const hair = new THREE.MeshLambertMaterial({ color: '#17130f' });
  add(sk.head, box(0.215, 0.1, 0.245, 0, RIG.NECK + RIG.HEAD - 0.04, 0.01), hair); // short hair: top
  add(sk.head, box(0.215, 0.15, 0.06, 0, headMid + 0.02, 0.095), hair); // ...and the back (what the camera sees)
  add(sk.head, box(0.23, 0.05, 0.03, 0, headMid + 0.03, -0.12), black); // sunglasses
  dressLimbs(sk, m);
  return sk;
}
