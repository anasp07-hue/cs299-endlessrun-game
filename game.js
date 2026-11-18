// Apocalypse Run — browser entry point.
// Phase 6: themed obstacles (js/obstacleModels.js, ADR-0014): fallen screens /
// striped barriers (LOW), hanging billboards / cable beams (HIGH), crashed
// hover-cars / broken pillars (BLOCK), each fitted to its hitbox.
// Phase 5: the dead city around the road (js/city.js, layout in
// js/logic/scenery.js, ADR-0013): sky gradient + matching fog, ruined
// buildings, broken screens, cables, wrecks, rubble, dust.
// Phase 4: the procedural Hacker and Agent rigs (js/characters.js, poses in
// js/logic/pose.js, ADR-0012) and the side-clip stumble: bounce back, the
// Agent closes in, a second stumble or a head-on hit plays a short catch beat
// before the game-over screen (ADR-0011). Phase 3 underneath: game states
// with HTML overlays, HUD, auto-pause, Play Again with a full reset, and a
// persistent high score (ADR-0008); the endless road, color-coded placeholder
// obstacles from a fair pattern spawner (ADR-0006/0007), and the speed ramp.
// Game rules live in js/logic/ (ADR-0001); the loop runs a fixed-step
// simulation with render interpolation (ADR-0005).

import * as THREE from './libs/three.module.js';
import { CONFIG } from './js/logic/config.js';
import { clampDt } from './js/logic/time.js';
import { createFixedStepper } from './js/logic/loop.js';
import { lerp, damp, easeOutQuad } from './js/logic/math.js';
import { segmentZ, laneX } from './js/logic/world.js';
import { actionForKeyEvent } from './js/logic/input.js';
import { queueLaneMove, requestJump, requestSlide, jumpVelocity } from './js/logic/player.js';
import { difficultyAt } from './js/logic/difficulty.js';
import { OB } from './js/logic/collision.js';
import { resetSpawner } from './js/logic/spawner.js';
import { createRun, resetRun, stepRun, freezeInterpolation, acceptsInput } from './js/logic/run.js';
import { chaserDelaySteps, catchProgress, agentInView } from './js/logic/chaser.js';
import { sampleTrail } from './js/logic/trail.js';
import {
  createPose, blendPose, advancePhase, standPose, hackerRun, hackerAir, hackerSlide,
  agentRun, agentAir, agentSlide, agentReach, hitWeight, hitOverlay,
} from './js/logic/pose.js';
import { createHacker, createAgent, applyPose } from './js/characters.js';
import { createCity, makeRoadTexture, applySkyFog } from './js/city.js';
import { buildObstacleModels, obstacleVariant, OBSTACLE_VARIANTS } from './js/obstacleModels.js';
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
const scene = new THREE.Scene(); // background + fog are set by the city (sky colour, ADR-0013)

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
// Follows the Hacker (x set in render): without it his near-black outfit
// vanishes against the night road (art-direction: "subtle rim light").
const runnerLight = new THREE.PointLight(
  PALETTE.glowPale, CONFIG.RUNNER_LIGHT_INTENSITY, CONFIG.RUNNER_LIGHT_RANGE, 2,
);
runnerLight.position.set(0, 2.6, 2.4);
scene.add(runnerLight);

// --- The dead city: sky, fog, recycled ruins, screens, cables, wrecks, dust ---
const city = createCity(scene, renderer, CONFIG);
let cityTime = 0; // view clock for flicker / glitch / dust: frozen only while paused

// --- Ground: recycled road segments (one shared geometry/material/texture) ---
const roadGeo = new THREE.PlaneGeometry(CONFIG.GROUND_WIDTH, CONFIG.GROUND_SEGMENT_LENGTH);
roadGeo.rotateX(-Math.PI / 2);
const roadMat = new THREE.MeshLambertMaterial({ map: makeRoadTexture(renderer, CONFIG) });
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

// --- Characters: the Hacker (player) and the Agent (chaser), feet at y = 0 ---
const hacker = createHacker();
scene.add(hacker.root);
const agent = createAgent();
agent.root.visible = false;
scene.add(agent.root);

// --- Obstacles: themed models (js/obstacleModels.js, ADR-0014), pooled -------
// Each type has OBSTACLE_VARIANTS looks; each look is a lit body plus an unlit
// glowing cue (LOW amber stripes, HIGH a white line at slide height, BLOCK red
// lights). One InstancedMesh per (type, variant, part): 12 draw calls, two
// shared materials. The models sit at (laneX, 0, z): they are built in place.
// Same sky-matched fog as the city, so tall obstacle parts fade into the sky alike (ADR-0013).
const obstacleBodyMat = applySkyFog(new THREE.MeshLambertMaterial({ vertexColors: true }), CONFIG, 'obstacle-body');
const obstacleGlowMat = applySkyFog(new THREE.MeshBasicMaterial({ vertexColors: true }), CONFIG, 'obstacle-glow');
const obstacleModels = buildObstacleModels(CONFIG);
const obstacleSets = []; // [type][variant] = { body, glow } InstancedMeshes
const obstacleMeshes = []; // the same meshes, flat, for per-frame resets
for (const t of [OB.LOW, OB.HIGH, OB.BLOCK]) {
  obstacleSets[t] = [];
  for (let v = 0; v < OBSTACLE_VARIANTS; v++) {
    const pair = {};
    for (const part of ['body', 'glow']) {
      const mesh = new THREE.InstancedMesh(
        obstacleModels[t][v][part], part === 'body' ? obstacleBodyMat : obstacleGlowMat, CONFIG.MAX_OBSTACLES,
      );
      mesh.count = 0;
      mesh.frustumCulled = false; // instances move every frame; the cached bounds would be stale
      scene.add(mesh);
      obstacleMeshes.push(mesh);
      pair[part] = mesh;
    }
    obstacleSets[t].push(pair);
  }
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
  // The catch beat is part of losing: no pausing out of it (key, button, or
  // blur), or Restart / Main Menu could skip the game-over screen.
  if (cmd === CMD.PAUSE && !acceptsInput(run)) return false;

  if (abandonsRun(from, cmd)) commitHighScore(run.score); // before the reset wipes it
  if (startsNewRun(from, cmd)) {
    syncHighScore();
    resetRun(run, CONFIG, nextSeed());
  }
  if (cmd === CMD.PAUSE) freezeInterpolation(run); // pause shows the latest frame exactly
  if (cmd === CMD.MENU) resetRun(run, CONFIG, nextSeed()); // menu shows a clean road
  if (cmd === CMD.CAUGHT) onRunEnded();
  if (startsNewRun(from, cmd) || cmd === CMD.MENU) resetCharacterView();
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
    const how = ['?', 'head-on', 'second stumble'][run.caughtBy];
    console.info(
      `[Apocalypse Run] CAUGHT (${how}) by a ${name} obstacle in lane ${o ? o.lane : '?'}. ` +
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
  const live = acceptsInput(run); // gameplay keys are ignored during the catch beat
  if (cmd === CMD.LEFT || cmd === CMD.RIGHT || cmd === CMD.JUMP || cmd === CMD.SLIDE) {
    if (!live) return;
  }
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

// --- Character animation (view only; poses from js/logic/pose.js) -------------
// Scratch poses and blend weights, allocated once. None of this is run state:
// it only decides how the characters look, never what happens.
const hackerPose = createPose();
const agentPose = createPose();
const tmpPose = createPose();
const trailSample = { x: 0, y: 0, slide: 0 };
const JUMP_V0 = jumpVelocity(CONFIG);
const anim = { hackerPhase: 0, agentPhase: 0.5, airW: 0, slideW: 0, agentAirW: 0, agentSlideW: 0 };

function resetCharacterView() {
  anim.hackerPhase = 0;
  anim.agentPhase = 0.5;
  anim.airW = 0;
  anim.slideW = 0;
  anim.agentAirW = 0;
  anim.agentSlideW = 0;
}

function updateCharacters(px, py, alpha, dt) {
  const p = run.player;
  const c = run.chaser;
  const caught = c.catching || run.caught;
  const live = state === STATE.PLAYING; // paused / game over: hold the last frame
  const rate = CONFIG.POSE_BLEND_RATE;

  // Hacker
  hacker.root.position.set(px, py, 0);
  if (state === STATE.MENU) {
    standPose(hackerPose);
  } else {
    const t = live && !caught ? dt : 0; // frozen in place during the catch beat
    anim.hackerPhase = advancePhase(anim.hackerPhase, run.speed, t, CONFIG);
    anim.airW = damp(anim.airW, p.grounded ? 0 : 1, rate, t);
    anim.slideW = damp(anim.slideW, p.sliding ? 1 : 0, rate, t);
    hackerRun(hackerPose, anim.hackerPhase);
    if (anim.airW > 0.001) blendPose(hackerPose, hackerAir(tmpPose, p.vy / JUMP_V0), anim.airW);
    if (anim.slideW > 0.001) blendPose(hackerPose, hackerSlide(tmpPose), anim.slideW);
    hitOverlay(hackerPose, hitWeight(c.hitAge, CONFIG, caught), c.stumbleDir);
  }
  applyPose(hacker, hackerPose);

  // Agent: gap units behind (toward the camera), running the Hacker's path
  // from gap/speed seconds ago, so he jumps, slides, and dodges what the
  // Hacker just did. Hidden while he's behind the camera.
  const gap = lerp(c.prevGap, c.gap, alpha);
  agent.root.visible = state !== STATE.MENU && agentInView(gap, CONFIG);
  if (!agent.root.visible) return;
  // Sample the path at the player's interpolated time (one step behind the newest sample, plus alpha).
  sampleTrail(run.trail, chaserDelaySteps(gap, run.speed, CONFIG) + (1 - alpha), trailSample);
  agent.root.position.set(trailSample.x, trailSample.y, gap);
  const t = live ? dt : 0; // he keeps running during the catch beat
  anim.agentPhase = advancePhase(anim.agentPhase, run.speed, t, CONFIG);
  anim.agentAirW = damp(anim.agentAirW, trailSample.y > CONFIG.AGENT_AIR_Y ? 1 : 0, rate, t);
  anim.agentSlideW = damp(anim.agentSlideW, trailSample.slide, rate, t);
  agentRun(agentPose, anim.agentPhase);
  if (anim.agentAirW > 0.001) blendPose(agentPose, agentAir(tmpPose), anim.agentAirW);
  if (anim.agentSlideW > 0.001) blendPose(agentPose, agentSlide(tmpPose), anim.agentSlideW);
  if (caught) {
    blendPose(agentPose, agentReach(tmpPose), easeOutQuad(catchProgress(c, CONFIG) / CONFIG.CATCH_REACH_AT));
  }
  applyPose(agent, agentPose);
}

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

  // Characters
  const p = run.player;
  const px = lerp(p.prevX, p.x, alpha);
  updateCharacters(px, lerp(p.prevY, p.y, alpha), alpha, dt);
  runnerLight.position.x = px;

  // Obstacles: z from the same interpolated scroll as the road (no drift).
  for (let i = 0; i < obstacleMeshes.length; i++) obstacleMeshes[i].count = 0;
  const slots = run.spawner.slots;
  for (let i = 0; i < slots.length; i++) {
    const o = slots[i];
    if (!o.active) continue;
    const set = obstacleSets[o.type][obstacleVariant(o.row, o.lane)];
    scratchMatrix.makeTranslation(laneX(o.lane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT), 0, s - o.s);
    set.body.setMatrixAt(set.body.count++, scratchMatrix);
    set.glow.setMatrixAt(set.glow.count++, scratchMatrix);
  }
  // Upload only the live instances (a mesh with none left needs no upload: count 0 draws nothing).
  for (let i = 0; i < obstacleMeshes.length; i++) {
    const m = obstacleMeshes[i];
    if (m.count === 0) continue;
    m.instanceMatrix.clearUpdateRanges();
    m.instanceMatrix.addUpdateRange(0, m.count * 16);
    m.instanceMatrix.needsUpdate = true;
  }

  // Camera: behind and above, partly following the player's lane.
  cameraX = damp(cameraX, px * CONFIG.CAMERA_FOLLOW_X, CONFIG.CAMERA_FOLLOW_RATE, dt);
  camera.position.x = cameraX;
  camera.lookAt(cameraX, CONFIG.CAMERA_LOOK_Y, CONFIG.CAMERA_LOOK_Z);

  // City: chunks from the same interpolated scroll as the road and obstacles.
  if (state !== STATE.PAUSED) cityTime += dt;
  city.update(s, cityTime, camera);

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
    THREE, renderer, scene, camera, run, hacker, agent, roadSegments, city, debug, CMD, STATE,
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
