// Apocalypse Run — browser entry point.
// Round 2: a lifetime shard total (js/logic/shardbank.js) saved under
// neonWasteland.shardTotal, banked on run end, abandon, and page hide/close,
// and shown on the menu and game-over screens (docs/decisions/0001).
// Phase 8: data-shard collectibles (js/logic/shards.js: glowing diamonds laid
// between obstacle rows, bonus points, a HUD counter) and a LOW / HIGH quality
// setting (resolution + particles), saved with the other settings (ADR-0016).
// Phase 7: audio and juice (js/audio.js generates every sound in code;
// js/logic/juice.js + particles.js, ADR-0015): SFX, a generative music loop,
// mute (M / buttons, saved), camera shake, landing squash, sparks, and a
// screen flicker on near misses.
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
import { createRng } from './js/logic/rng.js';
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
import { createCity, makeRoadTexture, applySkyFog, softDotTexture } from './js/city.js';
import { createAudio } from './js/audio.js';
import { loadSettings, saveSettings, QUALITY, toggleQuality, qualityProfile } from './js/logic/settings.js';
import {
  createShake, resetShake, addTrauma, stepShake, shakeOffset, squashScale, landingStrength, nearMissFlash,
} from './js/logic/juice.js';
import { createSparks, clearSparks, emitSparks, stepSparks, sparkFade } from './js/logic/particles.js';
import { buildObstacleModels, obstacleVariant, OBSTACLE_VARIANTS } from './js/obstacleModels.js';
import {
  STATE, CMD, nextState, startsNewRun, commandFor, shouldAutoPause, canRestart, abandonsRun,
} from './js/logic/state.js';
import { loadHighScore, saveHighScore, finalScore, isNewHighScore } from './js/logic/highscore.js';
import { loadShardTotal, bankRunShards } from './js/logic/shardbank.js';
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

// --- Data shards (js/logic/shards.js, ADR-0016): one InstancedMesh -------------
// A tall glowing diamond in the UI's glowBlue: cold like the city's screens,
// and clearly not an obstacle cue (amber / white / red). Spins and bobs a
// little (inside its pickup box); unlit, with the same sky fog as the obstacles.
const shardGeo = new THREE.OctahedronGeometry(1, 0);
shardGeo.scale(CONFIG.SHARD_VISUAL_W, CONFIG.SHARD_VISUAL_H, CONFIG.SHARD_VISUAL_W);
const shardMesh = new THREE.InstancedMesh(
  shardGeo,
  applySkyFog(new THREE.MeshBasicMaterial({ color: PALETTE.glowBlue }), CONFIG, 'shard'),
  CONFIG.MAX_SHARDS,
);
shardMesh.count = 0;
shardMesh.frustumCulled = false;
scene.add(shardMesh);

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
const settings = loadSettings(storage); // { muted, quality }
let shardTotal = loadShardTotal(storage); // lifetime shards (Round 2, R4)

/**
 * Add this run's not-yet-banked shards to the lifetime total and save it.
 * Called only at checkpoints (run end, abandon, page hide/close), never per
 * frame; safe to call repeatedly (docs/decisions/0001).
 */
function bankShards() {
  shardTotal = bankRunShards(storage, shardTotal, run);
}

// --- UI elements --------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const screens = {
  [STATE.MENU]: $('menu'),
  [STATE.PAUSED]: $('pause'),
  [STATE.GAMEOVER]: $('gameover'),
};
const hud = $('hud');
const menuBest = $('menu-best');
const menuShards = $('menu-shards');
const finalShardTotalEl = $('final-shard-total');
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
const hudShards = createDigitDisplay($('hud-shards'), CONFIG.HUD_SHARD_DIGITS);
const finalShardsEl = $('final-shards');

let hudShownScore = -1;
let hudShownBest = -1;
let hudShownShards = -1;
function updateHud() {
  if (run.shardCount !== hudShownShards) {
    hudShards.update(run.shardCount);
    hudShownShards = run.shardCount;
  }
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

  if (abandonsRun(from, cmd)) {
    commitHighScore(run.score); // before the reset wipes it
    bankShards(); // an abandoned run's shards still count
  }
  if (startsNewRun(from, cmd)) {
    syncHighScore();
    resetRun(run, CONFIG, nextSeed());
  }
  if (cmd === CMD.PAUSE) freezeInterpolation(run); // pause shows the latest frame exactly
  if (cmd === CMD.MENU) resetRun(run, CONFIG, nextSeed()); // menu shows a clean road
  if (cmd === CMD.CAUGHT) onRunEnded();
  if (startsNewRun(from, cmd) || cmd === CMD.MENU) {
    resetCharacterView();
    resetFx();
  }
  if (to === STATE.PLAYING) stepper.reset(); // no time debt carried into the run or across a pause
  if (to === STATE.MENU) {
    syncHighScore();
    menuBest.textContent = String(highScore);
    bankShards(); // nothing new after the reset, but picks up shards other tabs banked
    menuShards.textContent = String(shardTotal);
  }

  state = to;
  audio.setDuck(MUSIC_DUCK[to]);
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
  finalShardsEl.textContent = String(run.shardCount);
  bankShards();
  finalShardTotalEl.textContent = String(shardTotal);
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
  else if (cmd === CMD.MUTE) toggleMute();
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
  $(id).addEventListener('click', () => {
    audio.click();
    dispatch(cmd);
  });
}
onClick('btn-play', CMD.PLAY);
onClick('btn-pause', CMD.PAUSE);
onClick('btn-resume', CMD.RESUME);
onClick('btn-restart', CMD.PLAY);
onClick('btn-pause-menu', CMD.MENU);
// Play Again honours the same short delay as Enter/Space: the button may have
// keyboard focus, and Enter/Space on a focused button bypasses the key handler.
$('btn-again').addEventListener('click', () => {
  if (!canRestart(gameOverAge, CONFIG)) return;
  audio.click();
  dispatch(CMD.PLAY);
});
for (const el of document.querySelectorAll('.js-mute')) {
  el.addEventListener('click', () => {
    toggleMute();
    audio.click();
  });
}
onClick('btn-over-menu', CMD.MENU);

// Auto-pause when the tab or window loses focus, but only mid-run (SPEC §4).
function autoPause() {
  if (shouldAutoPause(state)) dispatch(CMD.PAUSE);
}
window.addEventListener('blur', autoPause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    autoPause();
    bankShards(); // the tab may never come back (mobile/Safari may not fire pagehide)
  }
  audio.setHidden(document.hidden); // no music piling up in a background tab
});
// Closing or leaving the page mid-run keeps the shards collected so far (R4).
window.addEventListener('pagehide', () => bankShards());

// --- Audio (js/audio.js, ADR-0015) --------------------------------------------
// Created now, but silent until the first click or key press (browser autoplay rules).
const audio = createAudio(CONFIG);
audio.setMuted(settings.muted);
const MUSIC_DUCK = {
  [STATE.MENU]: 0.55,
  [STATE.PLAYING]: 1,
  [STATE.PAUSED]: 0.25,
  [STATE.GAMEOVER]: 0.4,
};
audio.setDuck(MUSIC_DUCK[STATE.MENU]);
function unlockAudio() {
  audio.unlock();
}
window.addEventListener('pointerdown', unlockAudio, true);
window.addEventListener('keydown', unlockAudio, true);

const muteButtons = document.querySelectorAll('.js-mute');
function showMute() {
  for (const el of muteButtons) {
    el.setAttribute('aria-pressed', String(settings.muted));
    if (el.classList.contains('btn')) el.textContent = settings.muted ? 'SOUND: OFF' : 'SOUND: ON';
  }
}
function toggleMute() {
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  saveSettings(storage, settings); // fails quietly without storage: the toggle still works this session
  showMute();
}
showMute();

// --- Juice: shake, squash, sparks, near-miss flicker (js/logic/juice.js) -------
// The run only counts events (jumps, landings, slides, stumbles, near misses,
// the catch); this compares the counts with what it last saw each frame and
// fires sound + effects. View state only: none of it affects the game.
const shake = createShake();
const shakeOut = { x: 0, y: 0, roll: 0 };
const squash = { y: 1, xz: 1 };
const sparks = createSparks(CONFIG.SPARK_MAX);
const sparkRng = createRng(99);
const fx = {
  jumps: 0, landings: 0, slides: 0, stumbles: 0, near: 0, catching: false, shards: 0, shardStreak: 0, shardAt: -99,
  landAge: 99, landStrength: 0, flashAge: 99, lastScroll: NaN, flashShown: -1,
};
const flashEl = $('flash');

// Spark particles: one Points draw call, colours fade per spark (additive, so black = invisible).
const sparkGeo = new THREE.BufferGeometry();
const sparkPos = new THREE.Float32BufferAttribute(new Float32Array(CONFIG.SPARK_MAX * 3), 3);
const sparkCol = new THREE.Float32BufferAttribute(new Float32Array(CONFIG.SPARK_MAX * 3), 3);
sparkGeo.setAttribute('position', sparkPos);
sparkGeo.setAttribute('color', sparkCol);
const sparkPoints = new THREE.Points(
  sparkGeo,
  new THREE.PointsMaterial({
    size: CONFIG.SPARK_SIZE, map: softDotTexture(), vertexColors: true, transparent: true,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }),
);
sparkPoints.frustumCulled = false;
scene.add(sparkPoints);
const sparkHot = new THREE.Color(PALETTE.sparkWhite);
const sparkCool = new THREE.Color(PALETTE.glowBlue);

function resetFx() {
  const p = run.player;
  fx.jumps = p.jumps;
  fx.landings = p.landings;
  fx.slides = p.slides;
  fx.stumbles = run.chaser.stumbles;
  fx.near = run.nearMisses;
  fx.shards = run.shardCount;
  fx.shardStreak = 0;
  fx.shardAt = -99;
  fx.catching = run.chaser.catching;
  fx.landAge = 99;
  fx.landStrength = 0;
  fx.flashAge = 99;
  fx.lastScroll = NaN;
  resetShake(shake);
  clearSparks(sparks);
}

/** Fire sounds and effects for anything that happened since the last frame. */
function updateFx(dt) {
  const p = run.player;
  const c = run.chaser;
  if (p.jumps !== fx.jumps) {
    fx.jumps = p.jumps;
    audio.jump();
  }
  if (p.landings !== fx.landings) {
    fx.landings = p.landings;
    const s = landingStrength(p.landSpeed, JUMP_V0);
    fx.landAge = 0;
    fx.landStrength = s;
    audio.land(s);
    addTrauma(shake, CONFIG.TRAUMA_LAND * s * s);
  }
  if (p.slides !== fx.slides) {
    fx.slides = p.slides;
    audio.slide();
  }
  if (c.stumbles !== fx.stumbles) {
    fx.stumbles = c.stumbles;
    audio.stumble(c.stumbleDir);
    addTrauma(shake, CONFIG.TRAUMA_STUMBLE);
    // Sparks off the side that hit, flying the way the bounce goes.
    spark(p.x - c.stumbleDir * 0.45, 1.0, 0, 26, 6, 0.55, c.stumbleDir);
  }
  if (c.catching !== fx.catching) {
    fx.catching = c.catching;
    if (c.catching) {
      audio.caught();
      addTrauma(shake, CONFIG.TRAUMA_CATCH);
      spark(p.x, 1.1, 0, 34, 7, 0.6, 0);
    }
  }
  if (run.nearMisses !== fx.near) {
    fx.near = run.nearMisses;
    fx.flashAge = 0;
    const lx = laneX(run.nearMissLane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT);
    audio.nearMiss(Math.max(-0.8, Math.min(0.8, (lx - p.x) / CONFIG.LANE_WIDTH)));
    addTrauma(shake, CONFIG.TRAUMA_NEAR_MISS);
  }
  if (run.shardCount !== fx.shards) {
    // A line of shards picked up in quick succession climbs in pitch.
    fx.shardStreak = run.elapsed - fx.shardAt < CONFIG.SHARD_STREAK_TIME ? fx.shardStreak + 1 : 0;
    fx.shardAt = run.elapsed;
    fx.shards = run.shardCount;
    audio.shard(fx.shardStreak);
    spark(p.x, CONFIG.SHARD_Y, 0, 6, 3, 0.4, 0);
  }
  // Effects age (and the world-attached sparks move) only while the run is live.
  if (state === STATE.PLAYING) {
    fx.landAge += dt;
    fx.flashAge += dt;
    stepShake(shake, dt, CONFIG);
  }
  audio.setIntensity((run.speed - CONFIG.SPEED_START) / (CONFIG.SPEED_MAX - CONFIG.SPEED_START));
}

/** Ambient sparks dripping from the live cables of HIGH obstacles ahead; a shower when you slide under. */
function emitAmbientSparks(s, dt) {
  const slots = run.spawner.slots;
  const p = run.player;
  for (let i = 0; i < slots.length; i++) {
    const o = slots[i];
    if (!o.active || o.type !== OB.HIGH) continue;
    const z = s - o.s;
    if (z < -CONFIG.SPARK_AMBIENT_RANGE || z > 3) continue;
    const under = Math.abs(z) < 1.2 && o.lane === p.lane && p.sliding;
    const rate = CONFIG.SPARK_AMBIENT_RATE * (under ? 5 : 1);
    if (sparkRng.next() < rate * dt) {
      const x = laneX(o.lane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT) + sparkRng.range(-0.9, 0.9);
      spark(x, CONFIG.HIGH_BOTTOM, z, under ? 4 : 1 + sparkRng.int(2), 2.2, 0.1, 0); // crackle still plays on LOW quality
      if (z > -12) audio.crackle();
    }
  }
}

/** Per-frame effect rendering: sparks, the landing squash, the near-miss flicker. */
function renderFx(s, dt) {
  const live = state === STATE.PLAYING;
  const delta = Number.isNaN(fx.lastScroll) ? 0 : s - fx.lastScroll;
  fx.lastScroll = s;
  if (live) {
    emitAmbientSparks(s, dt);
    stepSparks(sparks, dt, delta, CONFIG); // no-op on LOW quality (sparks.enabled)
  }
  if (sparks.enabled) uploadSparks();

  squashScale(fx.landAge, fx.landStrength, CONFIG, squash);
  hacker.root.scale.set(squash.xz, squash.y, squash.xz);

  const o = nearMissFlash(fx.flashAge, CONFIG);
  if (o !== fx.flashShown) {
    flashEl.style.opacity = o === 0 ? '0' : String(o); // only touched when it changes
    fx.flashShown = o;
  }
}

function uploadSparks() {
  const a = sparkPos.array;
  const col = sparkCol.array;
  for (let i = 0; i < sparks.max; i++) {
    const f = sparkFade(sparks, i);
    a[i * 3] = sparks.x[i];
    a[i * 3 + 1] = sparks.y[i];
    a[i * 3 + 2] = sparks.z[i];
    // Hot white-yellow when fresh, cooling to soft blue, then gone.
    col[i * 3] = f * (sparkCool.r + (sparkHot.r - sparkCool.r) * f);
    col[i * 3 + 1] = f * (sparkCool.g + (sparkHot.g - sparkCool.g) * f);
    col[i * 3 + 2] = f * (sparkCool.b + (sparkHot.b - sparkCool.b) * f);
  }
  sparkPos.needsUpdate = true;
  sparkCol.needsUpdate = true;
}

// --- Quality setting (Phase 8, ADR-0016) ------------------------------------------
// LOW: at most 1 render pixel per CSS pixel, no dust, no sparks. Gameplay and
// sound are identical at both levels. Saved with the other settings.
let pixelRatioMax = CONFIG.PIXEL_RATIO_MAX;

/** Emit sparks (a no-op on LOW quality: the pool itself is switched off). */
function spark(x, y, z, n, speed, up, dirX) {
  emitSparks(sparks, x, y, z, n, speed, up, dirX, sparkRng, CONFIG);
}

const qualityButtons = document.querySelectorAll('.js-quality');
function applyQuality() {
  const prof = qualityProfile(settings.quality, CONFIG);
  pixelRatioMax = prof.pixelRatioMax;
  onResize(); // applies the new pixel-ratio cap
  sparks.enabled = prof.particles;
  city.dust.visible = prof.particles; // city.update skips hidden dust
  sparkPoints.visible = prof.particles;
  if (!prof.particles) clearSparks(sparks);
  const label = settings.quality === QUALITY.LOW ? 'QUALITY: LOW' : 'QUALITY: HIGH';
  for (const el of qualityButtons) el.textContent = label;
}
for (const el of qualityButtons) {
  el.addEventListener('click', () => {
    settings.quality = toggleQuality(settings.quality);
    saveSettings(storage, settings); // fails quietly without storage: still applies this session
    applyQuality();
    audio.click();
  });
}
applyQuality();

// --- Resize -----------------------------------------------------------------
function onResize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, pixelRatioMax));
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

  // Data shards: same interpolated scroll; spin and bob on the view clock.
  let ns = 0;
  const shardSlots = run.shards.slots;
  for (let i = 0; i < shardSlots.length; i++) {
    const o = shardSlots[i];
    if (!o.active) continue;
    scratchMatrix.makeRotationY(cityTime * CONFIG.SHARD_SPIN + o.s * 0.9);
    scratchMatrix.setPosition(
      laneX(o.lane, CONFIG.LANE_WIDTH, CONFIG.LANE_COUNT),
      CONFIG.SHARD_Y + Math.sin(cityTime * 3 + o.s) * CONFIG.SHARD_BOB,
      s - o.s,
    );
    shardMesh.setMatrixAt(ns++, scratchMatrix);
  }
  shardMesh.count = ns;
  if (ns > 0) {
    shardMesh.instanceMatrix.clearUpdateRanges();
    shardMesh.instanceMatrix.addUpdateRange(0, ns * 16);
    shardMesh.instanceMatrix.needsUpdate = true;
  }

  // Camera: behind and above, partly following the player's lane.
  cameraX = damp(cameraX, px * CONFIG.CAMERA_FOLLOW_X, CONFIG.CAMERA_FOLLOW_RATE, dt);
  shakeOffset(shake, CONFIG, shakeOut);
  camera.position.x = cameraX + shakeOut.x;
  camera.position.y = CONFIG.CAMERA_Y + shakeOut.y;
  camera.lookAt(cameraX, CONFIG.CAMERA_LOOK_Y, CONFIG.CAMERA_LOOK_Z);
  if (shakeOut.roll !== 0) camera.rotateZ(shakeOut.roll);

  // City: chunks from the same interpolated scroll as the road and obstacles.
  if (state !== STATE.PAUSED) cityTime += dt;
  city.update(s, cityTime, camera);
  renderFx(s, dt);

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
  updateFx(dt);
  render(alpha, dt);
}

showScreens(state);
menuBest.textContent = String(highScore);
menuShards.textContent = String(shardTotal);
renderer.setAnimationLoop(loop);

// --- Debug (dev only): ?debug exposes internals for smoke tests -------------
if (DEBUG) {
  window.__neon = {
    THREE, renderer, scene, camera, run, hacker, agent, roadSegments, city, debug, CMD, STATE,
    audio, settings, shake, sparks, fx, shardMesh, applyQuality,
    getState: () => state,
    dispatch,
    getHighScore: () => highScore,
    getShardTotal: () => shardTotal,
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
