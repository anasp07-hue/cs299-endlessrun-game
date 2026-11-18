// Character poses as plain joint angles (ADR-0012). Pure: no DOM, no THREE.
// js/characters.js builds the Hacker and Agent rigs from RIG and applies a
// pose to their pivots every frame. Keeping the angles here means the
// "visual matches the hitbox" rules (standing height, slide height, feet on
// the ground) can be tested in Node.
//
// Conventions (rotations in radians, character faces −Z):
// - Limb rotation.x > 0 swings a hanging limb FORWARD (toward −Z).
// - lean (torso rotation.x) > 0 tilts the torso BACK; < 0 leans forward.
// - head is relative to the torso; > 0 tips the head back.
// - roll is the whole body's rotation.z; > 0 tips the top toward −X.
// - armOut spreads both arms sideways (abduction).
// - hipY is the hip height above the character's feet origin.

export const RIG = Object.freeze({
  HIP_HEIGHT: 0.92,
  HIP_SPREAD: 0.11, // hip joints at ±x
  THIGH: 0.46,
  SHIN: 0.46, // includes the foot: a straight leg is HIP_HEIGHT long
  TORSO: 0.56, // hips → top of the shoulders
  NECK: 0.08,
  HEAD: 0.24, // standing height = 0.92 + 0.56 + 0.08 + 0.24 = 1.80
  SHOULDER_SPREAD: 0.24, // shoulder joints at ±x
  SHOULDER_DROP: 0.07, // shoulder joints sit this far below the torso top
  UPPER_ARM: 0.3,
  FOREARM: 0.28,
});

/** The Agent is drawn this much bigger than the Hacker (imposing); tests use it for his heights. */
export const AGENT_SCALE = 1.05;

export const POSE_KEYS = Object.freeze([
  'hipY', 'lean', 'roll', 'head',
  'thighL', 'thighR', 'kneeL', 'kneeR',
  'shoulderL', 'shoulderR', 'elbowL', 'elbowR', 'armOut',
]);

const TAU = Math.PI * 2;

export function createPose() {
  const p = {};
  for (const k of POSE_KEYS) p[k] = 0;
  standPose(p);
  return p;
}

export function copyPose(out, src) {
  for (let i = 0; i < POSE_KEYS.length; i++) out[POSE_KEYS[i]] = src[POSE_KEYS[i]];
  return out;
}

/** out ← out + (target − out)·w. w = 0 leaves out unchanged, w = 1 copies target. */
export function blendPose(out, target, w) {
  if (w <= 0) return out;
  if (w >= 1) return copyPose(out, target);
  for (let i = 0; i < POSE_KEYS.length; i++) {
    const k = POSE_KEYS[i];
    out[k] += (target[k] - out[k]) * w;
  }
  return out;
}

/** Run cycles per second (one cycle = two steps). Rises with game speed. */
export function cycleRate(speed, cfg) {
  return cfg.RUN_CYCLE_BASE + cfg.RUN_CYCLE_PER_SPEED * speed;
}

/** Advance a run-cycle phase in [0, 1). */
export function advancePhase(phase, speed, dt, cfg) {
  const p = phase + cycleRate(speed, cfg) * dt;
  return p - Math.floor(p);
}

// --- Poses -------------------------------------------------------------------------

/** Relaxed standing (menu). */
export function standPose(out) {
  out.hipY = RIG.HIP_HEIGHT;
  out.lean = -0.05;
  out.roll = 0;
  out.head = 0.03;
  out.thighL = 0.04;
  out.thighR = -0.04;
  out.kneeL = -0.06;
  out.kneeR = -0.04;
  out.shoulderL = 0.06;
  out.shoulderR = -0.02;
  out.elbowL = 0.3;
  out.elbowR = 0.25;
  out.armOut = 0.1;
  return out;
}

/** Hacker run cycle: leans forward, loose, big knee lift, wide arm swing. */
export function hackerRun(out, phase) {
  const a = phase * TAU;
  const s = Math.sin(a);
  const c = Math.cos(a);
  out.hipY = RIG.HIP_HEIGHT - 0.07 + 0.07 * Math.abs(c); // highest as the legs pass
  out.lean = -0.3;
  out.roll = 0.04 * s; // a little sway
  out.head = 0.22; // look up the road despite the lean
  out.thighL = 0.85 * s;
  out.thighR = -0.85 * s;
  // The swinging-forward leg (thigh angle rising) has its knee bent.
  out.kneeL = -(0.25 + 1.1 * Math.max(0, c));
  out.kneeR = -(0.25 + 1.1 * Math.max(0, -c));
  out.shoulderL = -0.8 * s;
  out.shoulderR = 0.8 * s;
  out.elbowL = 1.25 + 0.25 * Math.max(0, -s);
  out.elbowR = 1.25 + 0.25 * Math.max(0, s);
  out.armOut = 0.14;
  return out;
}

/** Hacker in the air. `rise` = vy / jump launch speed (1 at take-off, 0 at the apex, < 0 falling). */
export function hackerAir(out, rise) {
  const r = rise > 1 ? 1 : rise < -1 ? -1 : rise;
  const tuck = 1 - 0.55 * Math.abs(r); // knees tucked hardest at the apex
  out.hipY = RIG.HIP_HEIGHT;
  out.lean = -0.2;
  out.roll = 0;
  out.head = 0.2;
  out.thighL = 1.3 * tuck;
  out.thighR = 0.95 * tuck;
  out.kneeL = -1.75 * tuck;
  out.kneeR = -1.45 * tuck;
  out.shoulderL = 0.9;
  out.shoulderR = -0.5;
  out.elbowL = 0.9;
  out.elbowR = 1.1;
  out.armOut = 0.45;
  return out;
}

/** Hacker sliding: leaning back, legs out front, low (fits the slide hitbox). */
export function hackerSlide(out) {
  out.hipY = 0.32;
  out.lean = 1.15;
  out.roll = 0;
  out.head = -0.75; // keep eyes on the road
  out.thighL = 1.45; // hips are this low, so both legs stay near horizontal
  out.thighR = 1.55;
  out.kneeL = -0.15;
  out.kneeR = -0.35;
  out.shoulderL = -1.6; // hand trailing on the road
  out.shoulderR = 0.2; // other arm forward over the knees
  out.elbowL = 0.3;
  out.elbowR = 0.9;
  out.armOut = 0.3;
  return out;
}

/** Agent run cycle: upright, stiff, piston arms locked at 90°. */
export function agentRun(out, phase) {
  const a = phase * TAU;
  const s = Math.sin(a);
  const c = Math.cos(a);
  // Piston: a squarer wave than a sine, so the arms snap rather than swing.
  const piston = (s < 0 ? -1 : 1) * Math.sqrt(Math.abs(s));
  out.hipY = RIG.HIP_HEIGHT - 0.03 + 0.03 * Math.abs(c);
  out.lean = -0.07;
  out.roll = 0;
  out.head = 0.03;
  out.thighL = 0.6 * s;
  out.thighR = -0.6 * s;
  out.kneeL = -(0.12 + 0.6 * Math.max(0, c));
  out.kneeR = -(0.12 + 0.6 * Math.max(0, -c));
  out.shoulderL = -0.55 * piston;
  out.shoulderR = 0.55 * piston;
  out.elbowL = Math.PI / 2;
  out.elbowR = Math.PI / 2;
  out.armOut = 0.08;
  return out;
}

/** Agent in the air (following the Hacker's path over a LOW): stiff, legs together. */
export function agentAir(out) {
  out.hipY = RIG.HIP_HEIGHT;
  out.lean = -0.1;
  out.roll = 0;
  out.head = 0.03;
  out.thighL = 0.7;
  out.thighR = 0.5;
  out.kneeL = -1.1;
  out.kneeR = -0.9;
  out.shoulderL = 0.5;
  out.shoulderR = -0.4;
  out.elbowL = Math.PI / 2;
  out.elbowR = Math.PI / 2;
  out.armOut = 0.12;
  return out;
}

/** Agent sliding under a HIGH: same low profile as the Hacker, arms tighter. */
export function agentSlide(out) {
  hackerSlide(out);
  out.shoulderL = -1.2;
  out.shoulderR = -1.2;
  out.elbowL = 0.6;
  out.elbowR = 0.6;
  out.armOut = 0.2;
  return out;
}

/** Agent grabbing: arms straight out in front, lunging. */
export function agentReach(out) {
  out.hipY = RIG.HIP_HEIGHT - 0.04;
  out.lean = -0.32;
  out.roll = 0;
  out.head = 0.25;
  out.thighL = 0.55;
  out.thighR = -0.45;
  out.kneeL = -0.35;
  out.kneeR = -0.5;
  out.shoulderL = 1.75;
  out.shoulderR = 1.65;
  out.elbowL = 0.15;
  out.elbowR = 0.2;
  out.armOut = 0.12;
  return out;
}

/**
 * How strongly the hit (stumble / head-on) reaction shows, `age` seconds
 * after the hit: rises and falls over STUMBLE_ANIM_TIME. With `hold` (the
 * run is being caught) it rises and then stays at 1.
 */
export function hitWeight(age, cfg, hold) {
  const t = age / cfg.STUMBLE_ANIM_TIME;
  if (!(t >= 0)) return 0;
  if (hold) return t >= 0.5 ? 1 : Math.sin(Math.PI * t);
  return t >= 1 ? 0 : Math.sin(Math.PI * t);
}

/**
 * Add the hit reaction on top of a pose, at strength w (0..1). `dir` is the
 * bounce direction (−1 left, +1 right): the body is knocked that way. dir = 0
 * (head-on) throws the body straight back.
 */
export function hitOverlay(out, w, dir) {
  if (w <= 0) return out;
  out.roll += -dir * 0.4 * w;
  out.lean += (dir === 0 ? 0.55 : 0.25) * w;
  out.head += 0.3 * w;
  out.shoulderL -= 0.7 * w;
  out.shoulderR -= 0.4 * w;
  out.elbowL -= 0.6 * w;
  out.elbowR -= 0.6 * w;
  out.armOut += 1.0 * w;
  return out;
}

// --- Forward kinematics in the side (y–z) plane, for tests ---------------------------

/** Height of the top of the head above the feet origin (scale 1). */
export function headTopY(pose) {
  const up =
    (RIG.TORSO + RIG.NECK) * Math.cos(pose.lean) + RIG.HEAD * Math.cos(pose.lean + pose.head);
  return (pose.hipY + up) * Math.cos(pose.roll);
}

/** Height of the foot ('L' or 'R') above the feet origin (scale 1). */
export function footY(pose, side) {
  const thigh = side === 'L' ? pose.thighL : pose.thighR;
  const knee = side === 'L' ? pose.kneeL : pose.kneeR;
  return pose.hipY - RIG.THIGH * Math.cos(thigh) - RIG.SHIN * Math.cos(thigh + knee);
}
