// Neon Wasteland — browser entry point.
// Phase 2: endless road, placeholder player box (lanes, jump, slide,
// fast-fall), color-coded placeholder obstacles from a fair pattern spawner
// (ADR-0006), AABB collision, speed ramp, and distance score. A hit freezes
// the run (temporary until Phase 3's game-over screen). Game rules live in
// js/logic/ (ADR-0001); the loop runs a fixed-step simulation with render
// interpolation (ADR-0005).

import * as THREE from './libs/three.module.js';
import { CONFIG } from './js/logic/config.js';
import { clampDt } from './js/logic/time.js';
import { createFixedStepper } from './js/logic/loop.js';
import { lerp, damp } from './js/logic/math.js';
import { segmentZ, laneX } from './js/logic/world.js';
import { createRng } from './js/logic/rng.js';
import { ACTION, actionForKeyEvent } from './js/logic/input.js';
import {
  createPlayer,
  queueLaneMove,
  requestJump,
  requestSlide,
  stepPlayer,
  playerHeight,
} from './js/logic/player.js';
import { speedAt, addScore, difficultyAt } from './js/logic/difficulty.js';
import { OB, createBox, setPlayerBox, obstacleBottom, obstacleTop, obstacleDepth } from './js/logic/collision.js';
import { createSpawner, resetSpawner, updateSpawner, findHit } from './js/logic/spawner.js';
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
const sun = new THREE.DirectionalLight(0xffd2a8, CONFIG.SUN_INTENSITY);
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
  new THREE.MeshLambertMaterial({ color: PALETTE.neonCyan, emissive: PALETTE.neonCyan, emissiveIntensity: 0.25 }),
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

// --- Simulation state -------------------------------------------------------
// ?seed=N replays a run exactly (dev aid); normal play seeds from the clock.
const seedParam = Number.parseInt(params.get('seed'), 10);
const seed = Number.isFinite(seedParam) ? seedParam : Date.now();
const player = createPlayer(CONFIG);
const spawner = createSpawner(CONFIG, seed);
const stepper = createFixedStepper(CONFIG.SIM_STEP, CONFIG.SIM_MAX_STEPS);
const playerBox = createBox();
const scratchBox = createBox();
let elapsed = 0; // seconds of simulated run time (drives the speed ramp)
let speed = CONFIG.SPEED_START;
let scroll = 0; // total distance the world has moved (single shared offset)
let prevScroll = 0;
let score = 0;
let caught = false; // Phase 2: a hit freezes the run until the page is reloaded
let cameraX = 0;
const debug = { god: false }; // ?debug only: god mode ignores hits

function simulate(h) {
  if (caught) return;
  elapsed += h;
  speed = speedAt(elapsed, CONFIG);
  prevScroll = scroll;
  scroll += speed * h;
  score = addScore(score, speed, h, scroll, CONFIG);
  stepPlayer(player, h, CONFIG);
  updateSpawner(spawner, scroll, speed, elapsed, CONFIG);

  // Collision every fixed step, so nothing tunnels at max speed.
  setPlayerBox(playerBox, player, CONFIG);
  const hit = findHit(spawner, playerBox, scroll, CONFIG, scratchBox);
  if (hit >= 0 && !debug.god) onCaught(spawner.slots[hit]);
}

function onCaught(obstacle) {
  caught = true;
  // Freeze exactly on this frame: with prev == current, interpolation can't wobble.
  prevScroll = scroll;
  player.prevX = player.x;
  player.prevY = player.y;
  const name = ['', 'LOW', 'HIGH', 'BLOCK'][obstacle.type];
  console.info(
    `[Neon Wasteland] CAUGHT by a ${name} obstacle in lane ${obstacle.lane}. ` +
      `Score ${Math.floor(score)}, distance ${Math.floor(scroll)}, ${elapsed.toFixed(1)} s, seed ${seed}. ` +
      'Refresh to run again (Play Again comes in Phase 3).',
  );
  updateReadout();
}

// --- Temporary readout (Phase 2 only; Phase 3 replaces it with the real HUD) ---
const readout = document.getElementById('dev-readout');
let readoutTimer = 0;
// Note: builds a small string ~10×/s (throttled). Phase 3's real HUD should
// avoid even that (e.g. preallocated digit strings), per the no-allocation rule.
function updateReadout() {
  readout.textContent = caught
    ? `CAUGHT — score ${Math.floor(score)} — refresh to run again`
    : `score ${Math.floor(score)}   speed ${speed.toFixed(1)}`;
}

// --- Input (keyboard) -------------------------------------------------------
function onKeyDown(e) {
  const action = actionForKeyEvent(e); // null for non-game keys and for Ctrl/Cmd/Alt shortcuts
  if (action === null) return;
  e.preventDefault(); // stop arrows/space from scrolling the page
  if (e.repeat || caught) return; // holding a key must not spam moves; no input once caught
  if (action === ACTION.LEFT) queueLaneMove(player, -1, CONFIG);
  else if (action === ACTION.RIGHT) queueLaneMove(player, 1, CONFIG);
  else if (action === ACTION.JUMP) requestJump(player, CONFIG);
  else if (action === ACTION.SLIDE) requestSlide(player, CONFIG);
}
window.addEventListener('keydown', onKeyDown);

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
  const s = lerp(prevScroll, scroll, alpha);
  for (let i = 0; i < roadSegments.length; i++) {
    roadSegments[i].position.z = segmentZ(
      i, s, CONFIG.GROUND_SEGMENT_LENGTH, CONFIG.GROUND_SEGMENT_COUNT, CONFIG.GROUND_BACK_Z,
    );
  }

  // Player
  const px = lerp(player.prevX, player.x, alpha);
  playerMesh.position.x = px;
  playerMesh.position.y = lerp(player.prevY, player.y, alpha);
  playerMesh.scale.y = playerHeight(player, CONFIG) / CONFIG.PLAYER_HEIGHT;

  // Obstacles: z from the same interpolated scroll as the road (no drift).
  obstacleMeshes[OB.LOW].count = 0;
  obstacleMeshes[OB.HIGH].count = 0;
  obstacleMeshes[OB.BLOCK].count = 0;
  for (let i = 0; i < spawner.slots.length; i++) {
    const o = spawner.slots[i];
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
  const n = stepper.consume(dt);
  for (let i = 0; i < n; i++) simulate(stepper.step);
  render(stepper.alpha(), dt);

  // Text updates allocate strings, so throttle them to 10 Hz.
  readoutTimer -= dt;
  if (readoutTimer <= 0 && !caught) {
    updateReadout();
    readoutTimer = 0.1;
  }
}

renderer.setAnimationLoop(loop);

// --- Debug (dev only): ?debug exposes internals for smoke tests -------------
if (DEBUG) {
  window.__neon = {
    THREE, renderer, scene, camera, player, playerMesh, roadSegments, spawner, debug, seed,
    getScroll: () => scroll,
    getSpeed: () => speed,
    getScore: () => score,
    getElapsed: () => elapsed,
    isCaught: () => caught,
    getDifficulty: () => difficultyAt(scroll, CONFIG),
    // Jump the speed ramp (e.g. 220 → max speed). Rows already planned were
    // spaced for the old speed, so restart the spawner from here to stay fair.
    setElapsed: (t) => {
      elapsed = t;
      resetSpawner(spawner, CONFIG, spawner.rng.seed, scroll);
    },
  };
}
