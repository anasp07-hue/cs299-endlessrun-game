// Neon Wasteland — browser entry point.
// Phase 1: endless recycled road, placeholder player box with lanes, jump,
// slide and fast-fall, and a chase camera. Game rules live in js/logic/
// (ADR-0001); the loop runs a fixed-step simulation with render
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
import { PALETTE } from './js/palette.js';

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

// --- Simulation state -------------------------------------------------------
const player = createPlayer(CONFIG);
const stepper = createFixedStepper(CONFIG.SIM_STEP, CONFIG.SIM_MAX_STEPS);
let speed = CONFIG.SPEED_START;
let scroll = 0; // total distance the world has moved (single shared offset)
let prevScroll = 0;
let cameraX = 0;

function simulate(h) {
  prevScroll = scroll;
  scroll += speed * h;
  stepPlayer(player, h, CONFIG);
}

// --- Input (keyboard) -------------------------------------------------------
function onKeyDown(e) {
  const action = actionForKeyEvent(e); // null for non-game keys and for Ctrl/Cmd/Alt shortcuts
  if (action === null) return;
  e.preventDefault(); // stop arrows/space from scrolling the page
  if (e.repeat) return; // holding a key must not spam moves
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
}

renderer.setAnimationLoop(loop);

// --- Debug (dev only): ?debug exposes internals for smoke tests -------------
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__neon = {
    THREE, renderer, scene, camera, player, playerMesh, roadSegments,
    getScroll: () => scroll,
    getSpeed: () => speed,
  };
}
