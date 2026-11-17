// Neon Wasteland — browser entry point.
// Phase 0 scaffold: renderer, scene, camera, a lit test cube, resize handling,
// and the main loop. Game rules live in js/logic/ (ADR-0001).

import * as THREE from './libs/three.module.js';
import { CONFIG } from './js/logic/config.js';
import { clampDt } from './js/logic/time.js';

// --- Renderer ---------------------------------------------------------------
const container = document.getElementById('game-container');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, CONFIG.PIXEL_RATIO_MAX));
renderer.setSize(window.innerWidth, window.innerHeight);
container.appendChild(renderer.domElement);

// --- Scene & camera ---------------------------------------------------------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120c0a);

const camera = new THREE.PerspectiveCamera(
  CONFIG.CAMERA_FOV,
  window.innerWidth / window.innerHeight,
  CONFIG.CAMERA_NEAR,
  CONFIG.CAMERA_FAR,
);
camera.position.set(CONFIG.CAMERA_X, CONFIG.CAMERA_Y, CONFIG.CAMERA_Z);
camera.lookAt(0, 0, 0);

// --- Lights -----------------------------------------------------------------
scene.add(new THREE.AmbientLight(0xffffff, CONFIG.AMBIENT_INTENSITY));
const sun = new THREE.DirectionalLight(0xffd2a8, CONFIG.SUN_INTENSITY);
sun.position.set(3, 5, 4);
scene.add(sun);

// --- Phase 0 test cube ------------------------------------------------------
const s = CONFIG.TEST_CUBE_SIZE;
const cube = new THREE.Mesh(
  new THREE.BoxGeometry(s, s, s),
  new THREE.MeshStandardMaterial({ color: 0x18e0ff, roughness: 0.4, metalness: 0.2 }),
);
scene.add(cube);

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

// --- Main loop (SPEC §7.1) --------------------------------------------------
let lastTime = performance.now();

function update(dt) {
  cube.rotation.x += CONFIG.TEST_CUBE_SPIN_X * dt;
  cube.rotation.y += CONFIG.TEST_CUBE_SPIN_Y * dt;
}

function loop(now) {
  const dt = clampDt((now - lastTime) / 1000, CONFIG.MAX_DT);
  lastTime = now;
  update(dt);
  renderer.render(scene, camera);
}

renderer.setAnimationLoop(loop);

// --- Debug (dev only): ?debug exposes internals for smoke tests -------------
if (new URLSearchParams(window.location.search).has('debug')) {
  window.__neon = { THREE, renderer, scene, camera, cube };
}
