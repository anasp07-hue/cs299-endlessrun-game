// Apocalypse Run — browser entry point.
// Phase 3: game states (MENU / PLAYING / PAUSED / GAMEOVER) with HTML overlay
// screens, a live HUD, auto-pause on blur, Play Again with a full run reset,
// and a persistent high score (ADR-0008). Underneath: the endless road,
// placeholder player box, color-coded placeholder obstacles from a fair
// pattern spawner (ADR-0006/0007), AABB collision, and the speed ramp.
// Game rules live in js/logic/ (ADR-0001); the loop runs a fixed-step
// simulation with render interpolation (ADR-0005).

import * as THREE from './libs/three.module.js';
import { CONFIG } from './js/logic/config.js';
import { clampDt } from './js/logic/time.js';
import { createFixedStepper } from './js/logic/loop.js';
import { lerp, damp } from './js/logic/math.js';
import { segmentZ, laneX } from './js/logic/world.js';
import { createRng } from './js/logic/rng.js';
import { actionForKeyEvent } from './js/logic/input.js';
import { queueLaneMove, requestJump, requestSlide, playerHeight } from './js/logic/player.js';
import { difficultyAt } from './js/logic/difficulty.js';
import { OB, obstacleBottom, obstacleTop, obstacleDepth } from './js/logic/collision.js';
import { resetSpawner } from './js/logic/spawner.js';
import { createRun, resetRun, stepRun, freezeInterpolation } from './js/logic/run.js';
import {
  STATE, CMD, nextState, startsNewRun, commandFor, shouldAutoPause, canRestart, abandonsRun,
} from './js/logic/state.js';
import { loadHighScore, saveHighScore, finalScore, isNewHighScore } from './js/logic/highscore.js';
import { writeDigits, DIGIT_STRINGS } from './js/logic/hud.js';
import { PALETTE } from './js/palette.js';

const params = new URLSearchParams(window.location.search);
const DEBUG = params.has('debug');

// --- Renderer ---------------------------------------------------------------
const container = document.getElementById('game-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.PIXEL_RATIO_MAX));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.skyHaze);

const camera = new THREE.PerspectiveCamera(
  CONFIG.CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  CONFIG.CAMERA_NEAR,
  CONFIG.CAMERA_FAR,
);
camera.position.set(0, CONFIG.CAMERA_Y, CONFIG.CAMERA_Z);
camera.lookAt(0, CONFIG.CAMERA_LOOK_Y, CONFIG.CAMERA_LOOK_Z);

// --- Lights -----------------------------------------------------------------
scene.add(new THREE.HemisphereLight(PALETTE.skyGlow, PALETTE.asphalt, CONFIG.HEMI_INTENSITY));
const sun = new THREE.DirectionalLight(PALETTE.moonlight, CONFIG.SUN_INTENSITY); // cold moonlight key light
sun.position.set(-4, 10, 6);
scene.add(sun);

// --- Ground: recycled road segments (one shared geometry/material/texture) ---
function makeRoadTexture() {
  const W = 256;
  const H = 512; // canvas spans one segment: GROUND_WIDTH × GROUND_SEGMENT_LENGTH
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, W, H);

  // Speckle so the scroll is visible (seeded, so it looks the same every load).
  const rng = createRng(1337);
  for (let i = 0; i < 1400; i++) {
    const v = 22 + rng.int(26);
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(rng.int(W), rng.int(H), 1 + rng.int(3), 1 + rng.int(3));
  }

  const unitsToPx = W / CONFIG.GROUND_WIDTH;
  const xPx = (x) => W / 2 + x * unitsToPx;
  const half = CONFIG.LANE_WIDTH / 2;
  const lx = (i) => laneX(i, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT);

  ctx.fillStyle = PALETTE.laneLine;
  // Solid road edges: half a lane outside the outer lanes
  ctx.fillRect(xPx(lx(0) - half) - 2, 0, 4, H);
  ctx.fillRect(xPx(lx(CONFIG.LANE_COUNT - 1) + half) - 2, 0, 4, H);
  // Dashed dividers between neighbouring lanes: 4 dashes per segment (seamless tile)
  const dash = H / 4;
  for (let i = 0; i < CONFIG.LANE_COUNT - 1; i++) {
    const x = xPx(lx(i) + half);
    for (let y = 0; y < H; y += dash) ctx.fillRect(x - 2, y + dash * 0.25, 4, dash * 0.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

const roadGeo = new THREE.PlaneGeometry(CONFIG.GROUND_WIDTH, CONFIG.GROUND_SEGMENT_LENGTH);
roadGeo.rotateX(-Math.PI / 2);
const roadMat = new THREE.MeshLambertMaterial({ map: makeRoadTexture() });
const roadSegments = [];
for (let i = 0; i < CONFIG.GROUND_SEGMENT_COUNT; i++) {
  const seg = new THREE.Mesh(roadGeo, roadMat);
  scene.add(seg);
  roadSegments.push(seg);
}

// Static dark wasteland floor beyond the road edges, so there's no void.
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(CONFIG.FLOOR_SIZE, CONFIG.FLOOR_SIZE).rotateX(-Math.PI / 2),
  new THREE.MeshLambertMaterial({ color: PALETTE.concreteDark }),
);
floor.position.set(0, -0.02, CONFIG.GROUND_BACK_Z - CONFIG.FLOOR_SIZE / 2);
scene.add(floor);

// --- Player: placeholder box, feet at y = 0 (replaced by the Hacker in Phase 4) ---
const playerGeo = new THREE.BoxGeometry(CONFIG.PLAYER_WIDTH, CONFIG.PLAYER_HEIGHT, CONFIG.PLAYER_WIDTH);
playerGeo.translate(0, CONFIG.PLAYER_HEIGHT / 2, 0);
const playerMesh = new THREE.Mesh(
  playerGeo,
  new THREE.MeshLambertMaterial({ color: PALETTE.glowBlue, emissive: PALETTE.glowBlue, emissiveIntensity: 0.2 }),
);
scene.add(playerMesh);

// --- Obstacles: one InstancedMesh per type (3 draw calls total), pooled ------
// Placeholder color cues from the art-direction skill: LOW = hazard amber,
// HIGH = spark white glow, BLOCK = danger red. Themed models come in Phase 6.
function makeObstacleMesh(type, color, glow) {
  const geo = new THREE.BoxGeometry(
    CONFIG.OBSTACLE_WIDTH,
    obstacleTop(type, CONFIG) - obstacleBottom(type, CONFIG),
    obstacleDepth(type, CONFIG),
  );
  const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: glow });
  const mesh = new THREE.InstancedMesh(geo, mat, CONFIG.MAX_OBSTACLES);
  mesh.count = 0;
  mesh.frustumCulled = false; // instances move every frame; the cached bounds would be stale
  scene.add(mesh);
  return mesh;
}
const obstacleMeshes = [];
obstacleMeshes[OB.LOW] = makeObstacleMesh(OB.LOW, PALETTE.hazardAmber, 0.35);
obstacleMeshes[OB.HIGH] = makeObstacleMesh(OB.HIGH, PALETTE.sparkWhite, 0.6);
obstacleMeshes[OB.BLOCK] = makeObstacleMesh(OB.BLOCK, PALETTE.dangerRed, 0.35);
const obstacleCenterY = [];
for (const t of [OB.LOW, OB.HIGH, OB.BLOCK]) {
  obstacleCenterY[t] = (obstacleBottom(t, CONFIG) + obstacleTop(t, CONFIG)) / 2;
}
const scratchMatrix = new THREE.Matrix4();

// --- Run state ----------------------------------------------------------------
// One run object for the whole session; resetRun() (js/logic/run.js) restores
// every piece of it on Play / Play Again / Restart / Main Menu.
// ?seed=N makes every run replay that seed (dev aid); normal play picks a new
// seed from the clock for each run.
const seedParam = Number.parseInt(params.get('seed'), 10);
const FIXED_SEED = Number.isFinite(seedParam) ? seedParam : null;
let runCount = 0;
function nextSeed() {
  runCount++;
  return FIXED_SEED !== null ? FIXED_SEED : Date.now() + runCount * 7919;
}

const run = createRun(CONFIG, nextSeed());
const stepper = createFixedStepper(CONFIG.SIM_STEP, CONFIG.SIM_MAX_STEPS);
let cameraX = 0;
const debug = { god: false }; // ?debug only: god mode ignores hits

// --- Persistence (SPEC §4): localStorage may be missing or throw (private mode) ---
let storage = null;
try {
  storage = window.localStorage;
} catch {
  storage = null; // the game still works; it just won't remember the high score
}
let highScore = loadHighScore(storage);

// --- UI elements --------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const screens = {
  [STATE.MENU]: $('menu'),
  [STATE.PAUSED]: $('pause'),
  [STATE.GAMEOVER]: $('gameover'),
};
const hud = $('hud');
const menuBest = $('menu-best');
const finalScoreEl = $('final-score');
const finalBestEl = $('final-best');
const newHighBadge = $('new-high');

/**
 * A number readout made of one text node per digit. update() only swaps in a
 * preallocated '0'–'9' string when a digit actually changes, so the HUD can
 * refresh every frame with no string building (SPEC §7.3).
 */
function createDigitDisplay(el, slots) {
  el.textContent = '';
  const nodes = [];
  const shown = [];
  for (let i = 0; i < slots; i++) {
    nodes.push(el.appendChild(document.createTextNode('')));
    shown.push(-1);
  }
  const digits = new Array(slots).fill(0);
  return {
    update(n) {
      const len = writeDigits(n, digits);
      for (let i = 0; i < slots; i++) {
        const want = i < len ? digits[i] : -1;
        if (want !== shown[i]) {
          nodes[i].nodeValue = want < 0 ? '' : DIGIT_STRINGS[want];
          shown[i] = want;
        }
      }
    },
  };
}
const hudScore = createDigitDisplay($('hud-score'), CONFIG.HUD_DIGITS);
const hudBest = createDigitDisplay($('hud-best'), CONFIG.HUD_DIGITS);

let hudShownScore = -1;
let hudShownBest = -1;
function updateHud() {
  const s = finalScore(run.score);
  const best = s > highScore ? s : highScore; // BEST tracks you live once you pass it
  if (s !== hudShownScore) {
    hudScore.update(s);
    hudShownScore = s;
  }
  if (best !== hudShownBest) {
    hudBest.update(best);
    hudShownBest = best;
  }
}

/** Pick up a higher score saved by another tab since we last looked. */
function syncHighScore() {
  const stored = loadHighScore(storage);
  if (stored > highScore) highScore = stored;
}

/**
 * Keep `score` as the high score if it beats the best known in any tab.
 * Called when a run ends and when one is abandoned from the pause screen, so
 * a BEST the HUD showed live is never silently dropped. Returns true if new.
 */
function commitHighScore(score) {
  syncHighScore(); // never overwrite another tab's higher score
  const final = finalScore(score);
  if (!isNewHighScore(final, highScore)) return false;
  highScore = final;
  saveHighScore(storage, final); // only written when beaten
  return true;
}

// --- State machine (SPEC §4, ADR-0008) ---------------------------------------
let state = STATE.MENU;
let gameOverAge = 0; // seconds since the run ended (gates Enter/Space → Play Again)

/** Show exactly the overlay(s) for `s`. The HUD stays visible, dimmed, while paused. */
function showScreens(s) {
  for (const key in screens) screens[key].hidden = key !== s;
  hud.hidden = !(s === STATE.PLAYING || s === STATE.PAUSED);
}

/** Never leave focus on a button that is hidden, or on one Space could press mid-run. */
function releaseFocus() {
  const el = document.activeElement;
  if (el && el !== document.body && typeof el.blur === 'function') el.blur();
}

/**
 * The single way to change state. Ignores commands that don't apply in the
 * current state (nextState returns null), then runs the side effects.
 */
function dispatch(cmd) {
  const from = state;
  const to = nextState(from, cmd);
  if (to === null) return false;

  if (abandonsRun(from, cmd)) commitHighScore(run.score); // before the reset wipes it
  if (startsNewRun(from, cmd)) {
    syncHighScore();
    resetRun(run, CONFIG, nextSeed());
  }
  if (cmd === CMD.PAUSE) freezeInterpolation(run); // pause shows the latest frame exactly
  if (cmd === CMD.MENU) resetRun(run, CONFIG, nextSeed()); // menu shows a clean road
  if (cmd === CMD.CAUGHT) onRunEnded();
  if (to === STATE.PLAYING) stepper.reset(); // no time debt carried into the run or across a pause
  if (to === STATE.MENU) {
    syncHighScore();
    menuBest.textContent = String(highScore);
  }

  state = to;
  releaseFocus();
  showScreens(to);
  if (to === STATE.PLAYING || to === STATE.PAUSED) updateHud();
  return true;
}

function onRunEnded() {
  gameOverAge = 0;
  const final = finalScore(run.score);
  const isNew = commitHighScore(final);
  finalScoreEl.textContent = String(final);
  finalBestEl.textContent = String(highScore);
  newHighBadge.hidden = !isNew;

  if (DEBUG) {
    const o = run.spawner.slots[run.hitSlot];
    const name = o ? ['', 'LOW', 'HIGH', 'BLOCK'][o.type] : '?';
    console.info(
      `[Apocalypse Run] CAUGHT by a ${name} obstacle in lane ${o ? o.lane : '?'}. ` +
        `Score ${final}, distance ${Math.floor(run.scroll)}, ${run.elapsed.toFixed(1)} s, seed ${run.seed}.`,
    );
  }
}

// --- Simulation -----------------------------------------------------------------
function simulate(h) {
  stepRun(run, h, CONFIG, debug.god);
  if (run.caught) dispatch(CMD.CAUGHT);
}

// --- Input (keyboard + buttons) ------------------------------------------------
function isButton(el) {
  return el instanceof HTMLButtonElement;
}

function onKeyDown(e) {
  const action = actionForKeyEvent(e); // null for non-game keys and for Ctrl/Cmd/Alt shortcuts
  if (action === null) return;
  // A button the player tabbed to handles its own Enter/Space (so Tab → Main
  // Menu → Enter goes to the menu, not Play Again). Mid-run, Space is a jump.
  if (
    state !== STATE.PLAYING &&
    isButton(e.target) &&
    (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')
  ) {
    return;
  }
  e.preventDefault(); // stop arrows/space from scrolling the page or pressing a button
  if (e.repeat) return; // holding a key must not spam moves or restarts

  const cmd = commandFor(state, action, gameOverAge, CONFIG);
  const p = run.player;
  if (cmd === CMD.LEFT) queueLaneMove(p, -1, CONFIG);
  else if (cmd === CMD.RIGHT) queueLaneMove(p, 1, CONFIG);
  else if (cmd === CMD.JUMP) requestJump(p, CONFIG);
  else if (cmd === CMD.SLIDE) requestSlide(p, CONFIG);
  else if (cmd !== CMD.NONE) dispatch(cmd); // PLAY / PAUSE / RESUME
}
window.addEventListener('keydown', onKeyDown);
// Buttons activate on Space *keyup*. If a button somehow has focus mid-run
// (e.g. Tab was pressed), a jump must not also press it.
window.addEventListener('keyup', (e) => {
  if (state === STATE.PLAYING && e.code === 'Space' && isButton(e.target)) e.preventDefault();
});

// Buttons: each wired once at startup (never per visit, so no duplicate handlers).
function onClick(id, cmd) {
  $(id).addEventListener('click', () => dispatch(cmd));
}
onClick('btn-play', CMD.PLAY);
onClick('btn-pause', CMD.PAUSE);
onClick('btn-resume', CMD.RESUME);
onClick('btn-restart', CMD.PLAY);
onClick('btn-pause-menu', CMD.MENU);
// Play Again honours the same short delay as Enter/Space: the button may have
// keyboard focus, and Enter/Space on a focused button bypasses the key handler.
$('btn-again').addEventListener('click', () => {
  if (canRestart(gameOverAge, CONFIG)) dispatch(CMD.PLAY);
});
onClick('btn-over-menu', CMD.MENU);

// Auto-pause when the tab or window loses focus, but only mid-run (SPEC §4).
function autoPause() {
  if (shouldAutoPause(state)) dispatch(CMD.PAUSE);
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});

// --- Resize -----------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.PIXEL_RATIO_MAX));
  renderer.setSize(w, h);
}
window.addEventListener('resize', onResize);

// --- Main loop (SPEC §7.1, ADR-0005) ---------------------------------------
let lastTime = performance.now();

function render(alpha, dt) {
  // Road: every segment placed from the one interpolated scroll value.
  const s = lerp(run.prevScroll, run.scroll, alpha);
  for (let i = 0; i < roadSegments.length; i++) {
    roadSegments[i].position.z = segmentZ(
      i, s, CONFIG.GROUND_SEGMENT_LENGTH, CONFIG.GROUND_SEGMENT_COUNT, CONFIG.GROUND_BACK_Z,
    );
  }

  // Player
  const p = run.player;
  const px = lerp(p.prevX, p.x, alpha);
  playerMesh.position.x = px;
  playerMesh.position.y = lerp(p.prevY, p.y, alpha);
  playerMesh.scale.y = playerHeight(p, CONFIG) / CONFIG.PLAYER_HEIGHT;

  // Obstacles: z from the same interpolated scroll as the road (no drift).
  obstacleMeshes[OB.LOW].count = 0;
  obstacleMeshes[OB.HIGH].count = 0;
  obstacleMeshes[OB.BLOCK].count = 0;
  const slots = run.spawner.slots;
  for (let i = 0; i < slots.length; i++) {
    const o = slots[i];
    if (!o.active) continue;
    const mesh = obstacleMeshes[o.type];
    scratchMatrix.makeTranslation(
      laneX(o.lane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT),
      obstacleCenterY[o.type],
      s - o.s,
    );
    mesh.setMatrixAt(mesh.count++, scratchMatrix);
  }
  obstacleMeshes[OB.LOW].instanceMatrix.needsUpdate = true;
  obstacleMeshes[OB.HIGH].instanceMatrix.needsUpdate = true;
  obstacleMeshes[OB.BLOCK].instanceMatrix.needsUpdate = true;

  // Camera: behind and above, partly following the player's lane.
  cameraX = damp(cameraX, px * CONFIG.CAMERA_FOLLOW_X, CONFIG.CAMERA_FOLLOW_RATE, dt);
  camera.position.x = cameraX;
  camera.lookAt(cameraX, CONFIG.CAMERA_LOOK_Y, CONFIG.CAMERA_LOOK_Z);

  renderer.render(scene, camera);
}

function loop(now) {
  const dt = clampDt((now - lastTime) / 1000, CONFIG.MAX_DT);
  lastTime = now;

  // Simulate only while PLAYING; every state keeps rendering (SPEC §4).
  // Paused/caught runs were frozen (prev == current), so any alpha draws the same frame.
  let alpha = 0;
  if (state === STATE.PLAYING) {
    const n = stepper.consume(dt);
    for (let i = 0; i < n && state === STATE.PLAYING; i++) simulate(stepper.step);
    alpha = state === STATE.PLAYING ? stepper.alpha() : 0;
    if (state === STATE.PLAYING) updateHud(); // allocation-free: only changed digits are touched
  } else if (state === STATE.GAMEOVER) {
    gameOverAge += dt;
  }
  render(alpha, dt);
}

showScreens(state);
menuBest.textContent = String(highScore);
renderer.setAnimationLoop(loop);

// --- Debug (dev only): ?debug exposes internals for smoke tests -------------
if (DEBUG) {
  window.__neon = {
    THREE, renderer, scene, camera, run, playerMesh, roadSegments, debug, CMD, STATE,
    getState: () => state,
    dispatch,
    getHighScore: () => highScore,
    getGameOverAge: () => gameOverAge,
    getDifficulty: () => difficultyAt(run.scroll, CONFIG),
    // Jump the speed ramp (e.g. 220 → max speed). Rows already planned were
    // spaced for the old speed, so restart the spawner from here to stay fair.
    setElapsed: (t) => {
      run.elapsed = t;
      resetSpawner(run.spawner, CONFIG, run.spawner.rng.seed, run.scroll);
    },
  };
}
