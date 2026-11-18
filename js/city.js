// The dead city around the road (SPEC §5, Phase 5, ADR-0013). View code:
// sky dome + fog, recycled chunks of ruined buildings (with a window shader),
// broken screens, sagging cables, wrecked hover-cars, rubble, drifting dust,
// and the cracked road texture. Layout comes from the pure js/logic/scenery.js;
// this file only turns those records into meshes.
//
// Performance (SPEC §7.3): everything is created once. Regenerating a chunk
// only rewrites instance matrices/colours; per frame we move 5 chunk groups,
// flicker a few shared materials, recompute dust positions, and redraw one
// small glitch canvas a few times a second.

import * as THREE from '../libs/three.module.js';
import { PALETTE } from './palette.js';
import { mergeColored, makeCarGeometry, makeBarrierGeometry, tube } from './geometry.js';
import { createRng } from './logic/rng.js';
import { laneX } from './logic/world.js';
import { mod } from './logic/math.js';
import {
  MAX_BUILDINGS, MAX_DEBRIS, MAX_SCREENS, MAX_WIRES, MAX_CARS, MAX_LAMPS, MAX_BARRIERS, SCREEN_KIND, LAMP_STATE, DEBRIS_KIND,
  lampWeight, lampBrightness, flickerValue,
  chunkForSlot, chunkZ, createChunk, generateChunk, wireSag, skyColors, skyGlsl, glslVec3,
} from './logic/scenery.js';

// --- Sky colour, shared by the dome and the fog on city objects ----------------------------
// skyGlsl() (js/logic/scenery.js) is the GLSL twin of skyColorAt(), checked by a test.

/**
 * Patch a built-in material so its fog fades to the sky colour in the view
 * direction instead of a single fog colour. Tall things then dissolve into the
 * sky gradient exactly, and nothing pops at the far plane.
 */
function injectSkyFog(shader, sky) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vSkyPos;')
    .replace(
      '#include <project_vertex>',
      `#include <project_vertex>
  {
    vec4 skyP = vec4( transformed, 1.0 );
    #ifdef USE_INSTANCING
      skyP = instanceMatrix * skyP;
    #endif
    vSkyPos = ( modelMatrix * skyP ).xyz;
  }`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nvarying vec3 vSkyPos;\n${sky}`)
    .replace(
      '#include <fog_fragment>',
      `#ifdef USE_FOG
    float skyFog = smoothstep( fogNear, fogFar, vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, skyColor( normalize( vSkyPos - cameraPosition ).y ), skyFog );
  #endif`,
    );
}

/** Additive glows (light pools, cones) fade to nothing with distance instead of toward the sky. */
function fadeFogged(material, key) {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <fog_fragment>',
      '#ifdef USE_FOG\n    gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );\n  #endif',
    );
  };
  material.customProgramCacheKey = () => `fadefog-${key}`;
  return material;
}

/**
 * Give a material from outside the city (e.g. the obstacles) the same
 * sky-matched fog as the city, so everything fades into the sky alike.
 */
export function applySkyFog(material, cfg, key) {
  return skyFogged(material, skyGlsl(PALETTE, cfg), key);
}

function skyFogged(material, sky, key) {
  material.onBeforeCompile = (shader) => injectSkyFog(shader, sky);
  material.customProgramCacheKey = () => `skyfog-${key}`;
  return material;
}

/**
 * Building facades: a grid of dark windows on the walls (in metres, so tall
 * and short buildings match), and a rare faintly lit one. Seeded per building
 * by its position in the chunk, so a building looks the same every time.
 */
function injectWindows(shader, glow) {
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFacade;\nvarying vec3 vFacadeN;\nvarying vec3 vSeed;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
  #ifdef USE_INSTANCING
    vec3 iScale = vec3( length( instanceMatrix[0].xyz ), length( instanceMatrix[1].xyz ), length( instanceMatrix[2].xyz ) );
    vFacade = position * iScale;
    vSeed = instanceMatrix[3].xyz;
  #else
    vFacade = position;
    vSeed = vec3( 0.0 );
  #endif
  vFacadeN = normal;`,
    );
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vFacade;\nvarying vec3 vFacadeN;\nvarying vec3 vSeed;')
    .replace(
      '#include <color_fragment>',
      `#include <color_fragment>
  float wall = 1.0 - step( 0.5, abs( vFacadeN.y ) );
  float wu = abs( vFacadeN.x ) > 0.5 ? vFacade.z : vFacade.x;
  vec2 cell = vec2( wu / 1.9, ( vFacade.y - 1.4 ) / 2.9 );
  vec2 fc = fract( cell );
  float win = wall * step( 0.0, cell.y ) * step( 0.24, fc.x ) * step( fc.x, 0.76 ) * step( 0.3, fc.y ) * step( fc.y, 0.78 );
  float wh = fract( sin( dot( floor( cell ) + vSeed.xz * 0.173, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 );
  diffuseColor.rgb *= 1.0 - 0.6 * win;
  float litWin = win * step( 0.982, wh );`,
    )
    .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>\n  totalEmissiveRadiance += litWin * ${glow} * ( 0.6 + 0.4 * fract( wh * 37.0 ) );`);
}

// --- Canvas textures -------------------------------------------------------------------

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function canvasTexture(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The road strip for one ground segment (GROUND_WIDTH × GROUND_SEGMENT_LENGTH):
 * cracked asphalt with oil stains and worn lane lines, a kerb, and sidewalk
 * slabs out to the buildings. Seeded, and tiles seamlessly along z.
 */
export function makeRoadTexture(renderer, cfg) {
  const W = 512;
  const H = 512;
  const cv = canvas(W, H);
  const ctx = cv.getContext('2d');
  const rng = createRng(1337);
  const px = W / cfg.GROUND_WIDTH;
  const xPx = (x) => W / 2 + x * px;
  const pz = H / cfg.GROUND_SEGMENT_LENGTH;
  const kerb = cfg.ROAD_ASPHALT_HALF;

  // Sidewalk slabs (whole canvas first; the asphalt is drawn over the middle).
  ctx.fillStyle = '#23282d';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#1a1e22';
  for (let z = 0; z < cfg.GROUND_SEGMENT_LENGTH; z += 2) ctx.fillRect(0, z * pz, W, 2); // joints, every 2 units
  for (const side of [-1, 1]) {
    const x = xPx(side * (kerb + (cfg.GROUND_WIDTH / 2 - kerb) / 2));
    ctx.fillRect(x - 1, 0, 2, H);
  }
  for (let i = 0; i < 260; i++) {
    const v = 30 + rng.int(14);
    ctx.fillStyle = `rgb(${v},${v + 3},${v + 6})`;
    const side = rng.next() < 0.5 ? -1 : 1;
    ctx.fillRect(xPx(side * rng.range(kerb + 0.3, cfg.GROUND_WIDTH / 2)), rng.int(H), 1 + rng.int(3), 1 + rng.int(3));
  }

  // Asphalt
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(xPx(-kerb), 0, xPx(kerb) - xPx(-kerb), H);
  for (let i = 0; i < 2600; i++) {
    const v = 20 + rng.int(24);
    ctx.fillStyle = `rgb(${v},${v},${v + 2})`;
    ctx.fillRect(xPx(rng.range(-kerb, kerb)), rng.int(H), 1 + rng.int(3), 1 + rng.int(3));
  }
  // Oil stains
  ctx.fillStyle = 'rgba(6,7,9,0.22)';
  for (let i = 0; i < 5; i++) {
    const x = xPx(rng.range(-kerb + 0.5, kerb - 0.5));
    const y = rng.range(0, H);
    const rx = rng.range(10, 26);
    const ry = rng.range(8, 22);
    const rot = rng.range(0, Math.PI);
    for (const off of [-H, 0, H]) { // drawn three times, like the cracks, so stains tile across seams
      ctx.beginPath();
      ctx.ellipse(x, y + off, rx, ry, rot, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  // Cracks: jagged polylines, drawn three times (−H, 0, +H) so they tile.
  ctx.strokeStyle = 'rgba(5,6,8,0.85)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = xPx(rng.range(-kerb, kerb));
    let y = rng.range(0, H);
    const pts = [x, y];
    const steps = 4 + rng.int(6);
    const dir = rng.range(0, Math.PI * 2);
    for (let s = 0; s < steps; s++) {
      x += Math.cos(dir + rng.range(-0.9, 0.9)) * rng.range(6, 18);
      y += Math.sin(dir + rng.range(-0.9, 0.9)) * rng.range(6, 18);
      pts.push(x, y);
    }
    for (const off of [-H, 0, H]) {
      ctx.beginPath();
      ctx.moveTo(pts[0], pts[1] + off);
      for (let p = 2; p < pts.length; p += 2) ctx.lineTo(pts[p], pts[p + 1] + off);
      ctx.stroke();
    }
  }
  // Kerb stones
  ctx.fillStyle = '#3a4148';
  for (const side of [-1, 1]) ctx.fillRect(xPx(side * kerb) - (side < 0 ? 5 : 0), 0, 5, H);

  // Worn lane lines: road edges and dashed dividers, with bites taken out.
  const half = cfg.LANE_WIDTH / 2;
  const lx = (i) => laneX(i, cfg.LANE_WIDTH, cfg.LANE_COUNT);
  ctx.fillStyle = PALETTE.laneLine;
  ctx.globalAlpha = 0.8;
  ctx.fillRect(xPx(lx(0) - half) - 2, 0, 4, H);
  ctx.fillRect(xPx(lx(cfg.LANE_COUNT - 1) + half) - 2, 0, 4, H);
  const dash = H / 4;
  for (let i = 0; i < cfg.LANE_COUNT - 1; i++) {
    const x = xPx(lx(i) + half);
    for (let y = 0; y < H; y += dash) ctx.fillRect(x - 2, y + dash * 0.25, 4, dash * 0.5);
  }
  ctx.globalAlpha = 1;
  ctx.fillStyle = PALETTE.asphalt;
  for (let i = 0; i < 40; i++) {
    const i0 = rng.int(cfg.LANE_COUNT + 1);
    const x = xPx(lx(Math.min(i0, cfg.LANE_COUNT - 1)) + (i0 === cfg.LANE_COUNT ? half : -half));
    ctx.fillRect(x - 3 + rng.range(-1, 1), rng.int(H), 3 + rng.int(4), 2 + rng.int(8));
  }

  const tex = canvasTexture(cv);
  tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  return tex;
}

/** Soft round light pool: bright middle fading to nothing at the rim. */
function poolTexture() {
  const cv = canvas(128, 128);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return canvasTexture(cv);
}

/**
 * A streetlight for the RIGHT kerb (post at x = 0, arm reaching toward −x
 * over the road); left-kerb lamps are the same mesh turned 180°.
 */
function makeLampPostGeometry(cfg) {
  const H = cfg.STREETLIGHT_HEIGHT;
  const A = cfg.STREETLIGHT_ARM;
  const post = new THREE.CylinderGeometry(0.08, 0.12, H, 6).translate(0, H / 2, 0);
  const arm = new THREE.BoxGeometry(A + 0.1, 0.08, 0.08).translate(-A / 2, H - 0.05, 0);
  const head = new THREE.BoxGeometry(0.75, 0.16, 0.34).translate(-A, H - 0.12, 0);
  const base = new THREE.BoxGeometry(0.34, 0.5, 0.34).translate(0, 0.25, 0);
  return mergeColored([[post, '#1d2125'], [arm, '#1d2125'], [head, '#24292e'], [base, '#191c20']]);
}

/** A faint cone of light under the lamp head, fading out toward the road. */
function makeLightConeGeometry(cfg) {
  const h = cfg.STREETLIGHT_HEIGHT - 0.2;
  const g = new THREE.ConeGeometry(cfg.STREETLIGHT_POOL_RADIUS * 0.38, h, 16, 1, true).translate(0, h / 2, 0);
  const pos = g.attributes.position;
  const col = [];
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) / h; // 1 at the lamp, 0 at the road
    col.push(k, k, k);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

export function softDotTexture() {
  const cv = canvas(32, 32);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  return canvasTexture(cv);
}

const GLYPHS = '01#/\\|<>=+*%$&@?!░▒▓█▌▐■□▪◆◇ΞΣΔΩ';

/** A dead screen: black glass, a spider-web crack, a dim corner of backlight bleed. */
function drawDeadScreen(ctx, w, h, rng) {
  ctx.fillStyle = '#05070a';
  ctx.fillRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.8, h * 0.2, 0, w * 0.8, h * 0.2, w * 0.5);
  g.addColorStop(0, 'rgba(60,80,100,0.35)');
  g.addColorStop(1, 'rgba(60,80,100,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = 'rgba(150,170,190,0.35)';
  ctx.lineWidth = 1;
  const cx = w * rng.range(0.3, 0.7);
  const cy = h * rng.range(0.3, 0.7);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2 + rng.range(-0.2, 0.2);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    let x = cx;
    let y = cy;
    for (let s = 0; s < 4; s++) {
      x += Math.cos(a + rng.range(-0.3, 0.3)) * rng.range(10, 30);
      y += Math.sin(a + rng.range(-0.3, 0.3)) * rng.range(10, 30);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

/** A leftover public message, half dead: what the flickering screens show. */
function drawMessageScreen(ctx, w, h, text, sub) {
  ctx.fillStyle = '#071018';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(127,182,230,0.12)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1); // scanlines
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = PALETTE.glowBlue;
  ctx.font = `bold ${Math.round(h * 0.3)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(text, w / 2, h * 0.42);
  ctx.fillStyle = PALETTE.glowPale;
  ctx.font = `${Math.round(h * 0.12)}px ui-monospace, Menlo, Consolas, monospace`;
  ctx.fillText(sub, w / 2, h * 0.74);
  ctx.fillStyle = '#05070a'; // a dead band of pixels
  ctx.fillRect(0, h * 0.55, w, h * 0.06);
}

/** One frame of signal noise: scanlines, torn colour bars, garbled glyph rows. Redrawn a few times a second. */
function drawGlitchScreen(ctx, w, h, rng, font) {
  ctx.fillStyle = '#060a10';
  ctx.fillRect(0, 0, w, h);
  ctx.font = font; // built once by the caller: no string building per redraw
  ctx.textBaseline = 'top';
  for (let row = 0; row < 8; row++) {
    if (rng.next() < 0.3) continue;
    ctx.fillStyle = rng.next() < 0.75 ? 'rgba(127,182,230,0.8)' : 'rgba(106,95,146,0.9)';
    const x = rng.range(-20, 20);
    for (let c = 0; c < 22; c++) {
      if (rng.next() < 0.2) continue;
      ctx.fillText(GLYPHS[rng.int(GLYPHS.length)], x + c * (w / 20), row * (h / 8));
    }
  }
  for (let i = 0; i < 4; i++) {
    ctx.fillStyle = rng.next() < 0.5 ? 'rgba(106,95,146,0.55)' : 'rgba(196,215,230,0.35)';
    ctx.fillRect(rng.range(-w * 0.2, w * 0.6), rng.range(0, h), rng.range(w * 0.2, w), rng.range(2, h * 0.12));
  }
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  for (let y = 0; y < h; y += 2) ctx.fillRect(0, y, w, 1);
}

// --- Geometry helpers ----------------------------------------------------------------------

/** A cable from x = −span to +span sagging `sag` at the middle, with a little sideways wander. */
function makeWireGeometry(span, sag, wander, cfg) {
  const pts = [];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    const u = 2 * t - 1;
    pts.push([-span + 2 * span * t, -sag * (1 - u * u), Math.sin(t * Math.PI) * wander]);
  }
  return tube(pts, cfg.WIRE_RADIUS, 28, 4);
}

// --- The city ----------------------------------------------------------------------------

export function createCity(scene, renderer, cfg) {
  const sky = skyGlsl(PALETTE, cfg);
  const { horizon } = skyColors(PALETTE, cfg);
  const horizonColor = new THREE.Color().setRGB(horizon[0], horizon[1], horizon[2], THREE.SRGBColorSpace);
  scene.background = horizonColor;
  scene.fog = new THREE.Fog(horizonColor, cfg.FOG_NEAR, cfg.FOG_FAR);

  // Sky dome: follows the camera; drawn first, behind everything.
  const domeMat = new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false });
  domeMat.onBeforeCompile = (shader) => {
    injectSkyFog(shader, sky);
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      'gl_FragColor.rgb = skyColor( normalize( vSkyPos - cameraPosition ).y );\n  #include <dithering_fragment>',
    );
  };
  domeMat.customProgramCacheKey = () => 'sky-dome';
  const dome = new THREE.Mesh(new THREE.SphereGeometry(cfg.CAMERA_FAR * 0.8, 24, 12), domeMat);
  dome.renderOrder = -1;
  dome.frustumCulled = false;
  scene.add(dome);

  // Shared materials
  const linear = (hex, k = 1) => new THREE.Color(hex).multiplyScalar(k); // working (linear) space
  const facadeMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const glow = linear(PALETTE.glowBlue, 0.2);
  facadeMat.onBeforeCompile = (shader) => {
    injectSkyFog(shader, sky);
    injectWindows(shader, glslVec3([glow.r, glow.g, glow.b]));
  };
  facadeMat.customProgramCacheKey = () => 'facade';
  const debrisMat = skyFogged(new THREE.MeshLambertMaterial({ color: '#ffffff' }), sky, 'debris');
  const carMat = skyFogged(new THREE.MeshLambertMaterial({ vertexColors: true }), sky, 'car');
  const carStripMat = skyFogged(new THREE.MeshBasicMaterial({ color: linear(PALETTE.duskViolet, 0.7) }), sky, 'strip');
  const wireMat = skyFogged(new THREE.MeshLambertMaterial({ color: '#0d0f12' }), sky, 'wire');
  const lampColor = new THREE.Color(PALETTE.glowPale);
  const lensMat = skyFogged(new THREE.MeshBasicMaterial({ color: '#ffffff' }), sky, 'lens');
  const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };
  const poolMat = fadeFogged(new THREE.MeshBasicMaterial({ map: poolTexture(), ...additive }), 'pool');
  const coneMat = fadeFogged(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, ...additive }), 'cone');
  const wireGlowMat = skyFogged(new THREE.MeshBasicMaterial({ color: linear(PALETTE.glowBlue, 0.45) }), sky, 'wireglow');

  // Screens: a few shared canvases → a few shared materials.
  const SW = 256;
  const SH = 128;
  const screenRng = createRng(4242);
  const deadCv = canvas(SW, SH);
  drawDeadScreen(deadCv.getContext('2d'), SW, SH, screenRng);
  const msgA = canvas(SW, SH);
  drawMessageScreen(msgA.getContext('2d'), SW, SH, 'STAY INSIDE', 'CURFEW IN EFFECT // ZONE 7');
  const msgB = canvas(SW, SH);
  drawMessageScreen(msgB.getContext('2d'), SW, SH, 'NO SIGNAL', 'CITYNET LINK LOST  ERR 0x00');
  const glitchCv = canvas(SW, SH);
  const glitchCtx = glitchCv.getContext('2d');
  const glitchFont = `${Math.round(SH / 9)}px ui-monospace, Menlo, Consolas, monospace`;
  drawGlitchScreen(glitchCtx, SW, SH, screenRng, glitchFont);
  const glitchTex = canvasTexture(glitchCv);
  const screenMat = (map, key, k = 1) =>
    skyFogged(new THREE.MeshBasicMaterial({ map: canvasTexture(map), color: new THREE.Color(k, k, k) }), sky, key);
  const deadMat = screenMat(deadCv, 'scr-dead');
  const flickerMats = [screenMat(msgA, 'scr-a', 0.8), screenMat(msgB, 'scr-b', 0.8)];
  const glitchMat = skyFogged(new THREE.MeshBasicMaterial({ map: glitchTex, color: new THREE.Color(0.85, 0.85, 0.85) }), sky, 'scr-glitch');

  // Shared geometries
  const unitBoxBase = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0); // buildings: base at y = 0
  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const screenGeo = new THREE.PlaneGeometry(1, 1);
  const carGeo = makeCarGeometry(cfg.CAR_WIDTH, cfg.CAR_LENGTH);
  const barrierGeo = makeBarrierGeometry(cfg.BARRIER_WIDTH, cfg.BARRIER_HEIGHT, cfg.BARRIER_LENGTH, '#4b535b');
  const stripGeo = new THREE.BoxGeometry(cfg.CAR_WIDTH + 0.04, 0.06, cfg.CAR_LENGTH * 0.7).translate(0, 0.58, 0.1);
  const postGeo = makeLampPostGeometry(cfg);
  const lensGeo = new THREE.BoxGeometry(0.62, 0.03, 0.26).translate(-cfg.STREETLIGHT_ARM, cfg.STREETLIGHT_HEIGHT - 0.215, 0);
  const R = cfg.STREETLIGHT_POOL_RADIUS;
  const poolGeo = new THREE.PlaneGeometry(2 * R, 2 * R * 1.25).rotateX(-Math.PI / 2).translate(-cfg.STREETLIGHT_ARM, 0.03, 0);
  const coneGeo = makeLightConeGeometry(cfg).translate(-cfg.STREETLIGHT_ARM, 0, 0);
  const wireGeos = [];
  for (let v = 0; v < cfg.WIRE_VARIANTS; v++) wireGeos.push(makeWireGeometry(cfg.WIRE_SPAN, wireSag(v, cfg), 0.4 + v * 0.3, cfg));

  // Chunk slots
  const slots = [];
  const instanced = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.count = 0;
    return m;
  };
  for (let i = 0; i < cfg.CITY_CHUNK_COUNT; i++) {
    const group = new THREE.Group();
    const slot = {
      group,
      k: NaN,
      chunk: createChunk(),
      facades: instanced(unitBoxBase, facadeMat, MAX_BUILDINGS),
      debris: instanced(unitBox, debrisMat, MAX_DEBRIS),
      cars: instanced(carGeo, carMat, MAX_CARS),
      strips: instanced(stripGeo, carStripMat, MAX_CARS),
      posts: instanced(postGeo, carMat, MAX_LAMPS),
      barriers: instanced(barrierGeo, carMat, MAX_BARRIERS),
      lenses: instanced(lensGeo, lensMat, MAX_LAMPS),
      pools: instanced(poolGeo, poolMat, MAX_LAMPS),
      cones: instanced(coneGeo, coneMat, MAX_LAMPS),
      flicker: false, // any flickering lamp in this chunk (their colours are refreshed per frame)
      screens: [],
      wires: [],
    };
    // Create the per-instance colour buffers now, so the shaders compile with them.
    slot.facades.setColorAt(0, new THREE.Color(1, 1, 1));
    slot.debris.setColorAt(0, new THREE.Color(1, 1, 1));
    for (const m of [slot.lenses, slot.pools, slot.cones]) m.setColorAt(0, new THREE.Color(1, 1, 1));
    slot.pools.renderOrder = 1; // glows after the opaque world
    slot.cones.renderOrder = 2;
    // Built once, iterated on every wrap:
    slot.instanced = [slot.facades, slot.debris, slot.cars, slot.strips, slot.barriers, slot.posts, slot.lenses, slot.pools, slot.cones];
    group.add(...slot.instanced);
    for (let s = 0; s < MAX_SCREENS; s++) {
      const m = new THREE.Mesh(screenGeo, deadMat);
      m.visible = false;
      slot.screens.push(m);
      group.add(m);
    }
    for (let w = 0; w < MAX_WIRES; w++) {
      const m = new THREE.Mesh(wireGeos[0], wireMat);
      m.visible = false;
      slot.wires.push(m);
      group.add(m);
    }
    scene.add(group);
    slots.push(slot);
  }

  // Scratch (no allocation per frame or per regeneration)
  const rng = createRng(0);
  const mat4 = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler(0, 0, 0, 'YXZ');
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const col = new THREE.Color();
  const darkC = new THREE.Color(PALETTE.concreteDark);
  const lightC = new THREE.Color(PALETTE.concreteLight);

  const rustC = new THREE.Color(PALETTE.rust);

  function tone(t, out) {
    return out.copy(darkC).lerp(lightC, t).multiplyScalar(0.75 + 0.35 * ((t * 7.31) % 1));
  }

  /** Crates: rust through to rust-stained dark grey. */
  function crateTone(t, out) {
    return out.copy(rustC).lerp(darkC, t * 0.7).multiplyScalar(0.8 + 0.3 * ((t * 5.17) % 1));
  }

  function place(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz) {
    pos.set(x, y, z);
    euler.set(rx, ry, rz);
    quat.setFromEuler(euler);
    scl.set(sx, sy, sz);
    mesh.setMatrixAt(i, mat4.compose(pos, quat, scl));
  }

  /** Lamp i of a slot at brightness b (0..1): lens, pool on the road, cone in the air. */
  function setLampColors(slot, i, b) {
    col.setScalar(0.07 + 0.93 * b); // a dead lens is dark glass, not black
    slot.lenses.setColorAt(i, col);
    col.copy(lampColor).multiplyScalar(cfg.STREETLIGHT_POOL_STRENGTH * b);
    slot.pools.setColorAt(i, col);
    col.copy(lampColor).multiplyScalar(cfg.STREETLIGHT_CONE_STRENGTH * b);
    slot.cones.setColorAt(i, col);
  }

  function regenerate(slot, k) {
    const c = generateChunk(slot.chunk, k, cfg.CITY_SEED, rng, cfg);
    slot.k = k;
    for (let i = 0; i < c.nb; i++) {
      const b = c.buildings[i];
      place(slot.facades, i, b.x, 0, b.z, 0, 0, 0, b.w, b.h, b.d);
      slot.facades.setColorAt(i, tone(b.tone, col));
    }
    slot.facades.count = c.nb;
    for (let i = 0; i < c.nd; i++) {
      const d = c.debris[i];
      place(slot.debris, i, d.x, d.y, d.z, d.rx, d.ry, d.rz, d.w, d.h, d.d);
      slot.debris.setColorAt(i, d.kind === DEBRIS_KIND.CRATE ? crateTone(d.tone, col) : tone(d.tone, col));
    }
    slot.debris.count = c.nd;
    for (let i = 0; i < c.nc; i++) {
      const car = c.cars[i];
      // Tipped with its roof toward the road. The roll is about the car's own long axis,
      // so a wreck turned round (ry ≈ π) needs the opposite roll to fall the same way.
      const roll = car.tipped ? car.side * 1.45 * (Math.cos(car.ry) >= 0 ? 1 : -1) : 0;
      const y = car.tipped ? cfg.CAR_WIDTH / 2 - 0.05 : 0;
      place(slot.cars, i, car.x, y, car.z, 0, car.ry, roll, 1, 1, 1);
      place(slot.strips, i, car.x, y, car.z, 0, car.ry, roll, 1, 1, 1);
    }
    slot.cars.count = c.nc;
    slot.strips.count = c.nc;
    for (let i = 0; i < c.nr; i++) {
      const b = c.barriers[i];
      place(slot.barriers, i, b.x, 0, b.z, 0, b.ry, 0, 1, 1, 1);
    }
    slot.barriers.count = c.nr;
    slot.flicker = false;
    for (let i = 0; i < c.nl; i++) {
      const l = c.lamps[i];
      const ry = l.side < 0 ? Math.PI : 0; // the mesh is built for the right kerb
      place(slot.posts, i, l.x, 0, l.z, 0, ry, 0, 1, 1, 1);
      place(slot.lenses, i, l.x, 0, l.z, 0, ry, 0, 1, 1, 1);
      place(slot.pools, i, l.x, 0, l.z, 0, ry, 0, 1, 1, 1);
      place(slot.cones, i, l.x, 0, l.z, 0, ry, 0, 1, 1, 1);
      if (l.state === LAMP_STATE.FLICKER) slot.flicker = true;
      setLampColors(slot, i, l.state === LAMP_STATE.DEAD ? 0 : 1);
    }
    slot.posts.count = slot.lenses.count = slot.pools.count = slot.cones.count = c.nl;
    for (let i = 0; i < MAX_SCREENS; i++) {
      const m = slot.screens[i];
      m.visible = i < c.ns;
      if (!m.visible) continue;
      const s = c.screens[i];
      m.position.set(s.x, s.y, s.z);
      m.rotation.set(0, s.side < 0 ? Math.PI / 2 : -Math.PI / 2, 0);
      m.scale.set(s.w, s.h, 1);
      m.material = s.kind === SCREEN_KIND.DEAD ? deadMat : s.kind === SCREEN_KIND.GLITCH ? glitchMat : flickerMats[i % 2];
    }
    for (let i = 0; i < MAX_WIRES; i++) {
      const m = slot.wires[i];
      m.visible = i < c.nw;
      if (!m.visible) continue;
      const w = c.wires[i];
      m.geometry = wireGeos[w.variant];
      m.material = w.glow ? wireGlowMat : wireMat;
      m.position.set(0, w.y, w.z);
      m.rotation.set(0, w.ry, 0);
    }
    for (let i = 0; i < slot.instanced.length; i++) {
      const m = slot.instanced[i];
      m.instanceMatrix.needsUpdate = true;
      if (m.instanceColor) m.instanceColor.needsUpdate = true;
      m.computeBoundingSphere(); // static within the chunk, so frustum culling stays correct
    }
  }

  // Dust: positions are a pure function of (scroll, time), so pause/reset need no special care.
  const DN = cfg.DUST_COUNT;
  const base = new Float32Array(DN * 3);
  const vel = new Float32Array(DN * 2);
  const drng = createRng(77);
  for (let i = 0; i < DN; i++) {
    base[i * 3] = drng.range(0, cfg.DUST_AREA_X);
    base[i * 3 + 1] = drng.range(0, cfg.DUST_AREA_Y);
    base[i * 3 + 2] = drng.range(0, cfg.DUST_AREA_Z);
    vel[i * 2] = drng.range(-1, 1) * cfg.DUST_DRIFT;
    vel[i * 2 + 1] = -drng.range(0.05, 0.3) * cfg.DUST_DRIFT;
  }
  const dustGeo = new THREE.BufferGeometry();
  const dustPos = new THREE.Float32BufferAttribute(new Float32Array(DN * 3), 3);
  dustGeo.setAttribute('position', dustPos);
  const dustMat = skyFogged(
    new THREE.PointsMaterial({
      color: PALETTE.glowPale, size: cfg.DUST_SIZE, map: softDotTexture(), transparent: true, opacity: 0.45, depthWrite: false,
    }),
    sky,
    'dust',
  );
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);
  const DUST_NEAR_Z = cfg.CAMERA_Z + 2;

  // The few real lights carried from lamp to lamp (always in the scene, so the
  // number of lights, and therefore every shader, never changes).
  const lamps = [];
  for (let i = 0; i < cfg.STREETLIGHT_LIGHTS; i++) {
    const light = new THREE.PointLight(lampColor, 0, cfg.STREETLIGHT_RANGE, 2);
    scene.add(light);
    lamps.push(light);
  }

  let glitchTime = 0;

  /**
   * Move the city to `scroll`, animate screens and dust. `time` is the view
   * clock (seconds, only advancing while the game is live); `camera` places
   * the sky dome.
   */
  function update(scroll, time, camera) {
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const k = chunkForSlot(i, scroll, cfg);
      if (k !== slot.k) regenerate(slot, k);
      slot.group.position.z = chunkZ(k, scroll, cfg);
    }
    dome.position.copy(camera.position);

    // Streetlights: flicker the stuttering ones, and hand the few real lights
    // to the lamps nearest the player (lampWeight fades each in and out, so
    // hopping to the next lamp happens at zero strength: no popping).
    let used = 0;
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const c = slot.chunk;
      for (let j = 0; j < c.nl; j++) {
        const l = c.lamps[j];
        if (l.state === LAMP_STATE.DEAD) continue;
        const b = lampBrightness(l.state, l.g, time);
        if (l.state === LAMP_STATE.FLICKER) setLampColors(slot, j, b);
        const z = slot.group.position.z + l.z;
        const w = lampWeight(z, cfg) * b;
        if (w <= 0 || used >= lamps.length) continue;
        const light = lamps[used++];
        light.position.set(l.side * (cfg.STREETLIGHT_X - cfg.STREETLIGHT_ARM), cfg.STREETLIGHT_HEIGHT - 0.3, z);
        light.intensity = cfg.STREETLIGHT_INTENSITY * w;
      }
      if (slot.flicker) {
        slot.lenses.instanceColor.needsUpdate = true;
        slot.pools.instanceColor.needsUpdate = true;
        slot.cones.instanceColor.needsUpdate = true;
      }
    }
    for (let i = used; i < lamps.length; i++) lamps[i].intensity = 0; // stay in the scene: no shader rebuilds

    // Flicker: each message screen stutters on its own pseudo-random rhythm.
    for (let i = 0; i < flickerMats.length; i++) {
      flickerMats[i].color.setScalar(flickerValue(100 + i, time, 11) > 0.22 ? 0.8 : 0.12);
    }
    if (time - glitchTime >= 1 / cfg.SCREEN_REDRAW_FPS) {
      glitchTime = time;
      drawGlitchScreen(glitchCtx, SW, SH, screenRng, glitchFont);
      glitchTex.needsUpdate = true;
    }

    const a = dustPos.array;
    const AX = cfg.DUST_AREA_X;
    const AY = cfg.DUST_AREA_Y;
    const AZ = cfg.DUST_AREA_Z;
    for (let i = 0; i < DN; i++) {
      a[i * 3] = mod(base[i * 3] + vel[i * 2] * time, AX) - AX / 2;
      a[i * 3 + 1] = 0.15 + mod(base[i * 3 + 1] + vel[i * 2 + 1] * time, AY);
      a[i * 3 + 2] = DUST_NEAR_Z - mod(DUST_NEAR_Z - base[i * 3 + 2] - scroll, AZ);
    }
    dustPos.needsUpdate = true;
  }

  return { update, dome, slots, dust, lamps, glitchTex };
}
