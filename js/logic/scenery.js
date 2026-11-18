// The ruined-city set dressing: chunk recycling, deterministic chunk content,
// and the sky gradient (SPEC §5, ADR-0013). Pure: no DOM, no THREE.
//
// The city is cut into chunks CITY_CHUNK_LENGTH long along the track. Chunk
// k covers track positions [k·L, (k+1)·L). CITY_CHUNK_COUNT slots are reused:
// slot i always shows the chunk k ≡ i (mod N) that is currently in range, so
// a slot is regenerated exactly when it wraps from behind the camera to the
// far end. A chunk's content depends only on (seed, k), so restarting a run
// (scroll back to 0) rebuilds exactly the same street.
//
// Content is written into preallocated, fixed-capacity records, so
// regenerating a chunk never allocates. Local coordinates: x across the road
// (0 = road centre), y up, z from 0 (chunk start, nearest) to −L (far end).

import { mod, clamp } from './math.js';

export const MAX_BUILDINGS = 16; // both sides together
export const MAX_DEBRIS = 96; // broken tops, rubble by the walls, heaps and crates on the shoulders
export const MAX_SCREENS = 2;
export const MAX_WIRES = 2;
export const MAX_CARS = 5;
export const MAX_BARRIERS = 16;

export const DEBRIS_KIND = Object.freeze({ CONCRETE: 0, CRATE: 1 });

export const LAMP_STATE = Object.freeze({ DEAD: 0, ON: 1, FLICKER: 2 });
export const MAX_LAMPS = 4; // capacity per chunk record (lampsPerChunk(CONFIG) is 2)

export const SCREEN_KIND = Object.freeze({ DEAD: 0, FLICKER: 1, GLITCH: 2 });

// --- Chunk recycling ---------------------------------------------------------------

/** The chunk index slot `slot` should show at `scroll`. */
export function chunkForSlot(slot, scroll, cfg) {
  const k0 = Math.floor((scroll - cfg.CITY_BACK) / cfg.CITY_CHUNK_LENGTH);
  return k0 + mod(slot - k0, cfg.CITY_CHUNK_COUNT);
}

/** z of chunk k's origin (its near end) at `scroll`; its content spans z + [−L, 0]. */
export function chunkZ(k, scroll, cfg) {
  return scroll - k * cfg.CITY_CHUNK_LENGTH;
}

/** Seed for chunk k: a cheap integer hash, so neighbouring chunks look unrelated. */
export function chunkSeed(seed, k) {
  let h = (Math.imul(k | 0, 0x9e3779b1) ^ (seed >>> 0)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

// --- Chunk records -------------------------------------------------------------------

function box() {
  return { x: 0, y: 0, z: 0, w: 0, h: 0, d: 0, rx: 0, ry: 0, rz: 0, tone: 0, kind: 0, group: 0 };
}

export function createChunk() {
  const c = { k: NaN, buildings: [], debris: [], screens: [], wires: [], cars: [], lamps: [], barriers: [], nb: 0, nd: 0, ns: 0, nw: 0, nc: 0, nl: 0, nr: 0, ng: 0, fill: [0, 0] };
  for (let i = 0; i < MAX_BUILDINGS; i++) c.buildings.push({ side: 0, x: 0, z: 0, w: 0, h: 0, d: 0, inner: 0, tone: 0 });
  for (let i = 0; i < MAX_DEBRIS; i++) c.debris.push(box());
  for (let i = 0; i < MAX_SCREENS; i++) c.screens.push({ side: 0, x: 0, y: 0, z: 0, w: 0, h: 0, kind: 0 });
  for (let i = 0; i < MAX_WIRES; i++) c.wires.push({ z: 0, y: 0, sag: 0, ry: 0, variant: 0, glow: false });
  for (let i = 0; i < MAX_CARS; i++) c.cars.push({ x: 0, z: 0, ry: 0, tipped: false, side: 0 });
  for (let i = 0; i < MAX_BARRIERS; i++) c.barriers.push({ x: 0, z: 0, ry: 0, side: 0 });
  for (let i = 0; i < MAX_LAMPS; i++) c.lamps.push({ x: 0, z: 0, side: 0, state: 0, g: 0 });
  return c;
}

function addDebris(c, x, y, z, w, h, d, rx, ry, rz, tone, kind = DEBRIS_KIND.CONCRETE) {
  if (c.nd >= MAX_DEBRIS) return;
  const o = c.debris[c.nd++];
  o.x = x;
  o.y = y;
  o.z = z;
  o.w = w;
  o.h = h;
  o.d = d;
  o.rx = rx;
  o.ry = ry;
  o.rz = rz;
  o.tone = tone;
  o.kind = kind;
  o.group = c.ng; // pieces of one heap / crate stack / slab share a group (they may touch)
}

/** One side of the street: a row of buildings with the odd alley, broken tops, rubble at the base. */
function fillSide(c, side, rng, cfg) {
  const L = cfg.CITY_CHUNK_LENGTH;
  let z = 0;
  while (z > -L && c.nb < MAX_BUILDINGS) {
    if (rng.next() < cfg.BUILDING_ALLEY_CHANCE) z -= rng.range(cfg.BUILDING_ALLEY_MIN, cfg.BUILDING_ALLEY_MAX);
    let d = rng.range(cfg.BUILDING_DEPTH_MIN, cfg.BUILDING_DEPTH_MAX);
    if (z - d < -L) d = z + L; // fill to the chunk end exactly, so chunks tile
    if (d < cfg.BUILDING_DEPTH_MIN * 0.5) break;
    const b = c.buildings[c.nb++];
    b.side = side;
    b.inner = rng.range(cfg.BUILDING_SETBACK_MIN, cfg.BUILDING_SETBACK_MAX);
    b.w = rng.range(cfg.BUILDING_WIDTH_MIN, cfg.BUILDING_WIDTH_MAX);
    b.x = side * (b.inner + b.w / 2);
    b.d = d;
    b.z = z - d / 2;
    b.h = rng.range(cfg.BUILDING_HEIGHT_MIN, cfg.BUILDING_HEIGHT_MAX);
    b.tone = rng.next();

    // Broken top: a tilted slab or stump of floor left on the roof.
    if (rng.next() < cfg.BUILDING_BROKEN_CHANCE) {
      const w = b.w * rng.range(0.35, 0.75);
      const h = b.h * rng.range(0.06, 0.16);
      const dd = d * rng.range(0.35, 0.8);
      const dx = (b.w - w) * rng.range(-0.5, 0.5);
      const dz = (d - dd) * rng.range(-0.5, 0.5);
      c.ng++;
      addDebris(c, b.x + dx, b.h + h * 0.3, b.z + dz, w, h, dd, rng.range(-0.5, 0.5), rng.range(-0.3, 0.3), rng.range(-0.6, 0.6), b.tone);
    }
    z -= d;
  }
}

/**
 * Fill chunk record `c` with the content of chunk `k` for city `seed`. `rng`
 * is a createRng() instance reused for every chunk (it is reseeded here).
 */
export function generateChunk(c, k, seed, rng, cfg) {
  rng.reset(chunkSeed(seed, k));
  c.k = k;
  c.nb = 0;
  c.nd = 0;
  c.ns = 0;
  c.nw = 0;
  c.nc = 0;
  const L = cfg.CITY_CHUNK_LENGTH;
  c.nl = 0;
  c.ng = 0;

  // Streetlights: one every STREETLIGHT_SPACING along the street, alternating
  // sides (by global lamp index, so the rhythm carries across chunks). Most
  // still work; some are dead, a few flicker.
  const per = Math.min(lampsPerChunk(cfg), MAX_LAMPS);
  for (let i = 0; i < per; i++) {
    const lamp = c.lamps[c.nl++];
    lamp.g = k * per + i;
    lamp.side = mod(lamp.g, 2) === 0 ? -1 : 1;
    lamp.x = lamp.side * cfg.STREETLIGHT_X;
    lamp.z = -(i + 0.5) * cfg.STREETLIGHT_SPACING;
    const r = rng.next();
    lamp.state = r < cfg.STREETLIGHT_DEAD_CHANCE ? LAMP_STATE.DEAD : r < cfg.STREETLIGHT_DEAD_CHANCE + cfg.STREETLIGHT_FLICKER_CHANCE ? LAMP_STATE.FLICKER : LAMP_STATE.ON;
  }
  fillSide(c, -1, rng, cfg);
  fillSide(c, 1, rng, cfg);

  // Broken billboards on the road-facing walls of tall-enough buildings.
  for (let i = 0; i < c.nb && c.ns < MAX_SCREENS; i++) {
    const b = c.buildings[i];
    if (rng.next() >= cfg.SCREEN_CHANCE) continue;
    const w = Math.min(b.d * 0.8, rng.range(cfg.SCREEN_WIDTH_MIN, cfg.SCREEN_WIDTH_MAX));
    const h = w * rng.range(0.45, 0.6);
    const yMin = cfg.SCREEN_Y_MIN + h / 2;
    const yMax = b.h - 2 - h / 2;
    if (yMax < yMin || w < cfg.SCREEN_WIDTH_MIN * 0.6) continue;
    const s = c.screens[c.ns++];
    s.side = b.side;
    s.x = b.side * (b.inner - 0.06); // just proud of the wall, facing the road
    s.y = rng.range(yMin, yMax);
    s.z = b.z + (b.d - w) * rng.range(-0.4, 0.4);
    s.w = w;
    s.h = h;
    const r = rng.next();
    s.kind = r < cfg.SCREEN_DEAD_SHARE ? SCREEN_KIND.DEAD : r < cfg.SCREEN_DEAD_SHARE + cfg.SCREEN_FLICKER_SHARE ? SCREEN_KIND.FLICKER : SCREEN_KIND.GLITCH;
  }

  // Cables sagging across the street between two walls, always far above
  // anything you can reach and below both roofs (never over an alley).
  for (let i = 0; i < MAX_WIRES; i++) {
    if (rng.next() >= cfg.WIRE_CHANCE) continue;
    const variant = rng.int(cfg.WIRE_VARIANTS);
    const sag = wireSag(variant, cfg); // each variant is one shared tube geometry with its own sag
    const ry = rng.range(-0.25, 0.25);
    const glow = rng.next() < cfg.WIRE_GLOW_CHANCE;
    for (let attempt = 0; attempt < 3; attempt++) {
      const z = -L * (i + rng.range(0.15, 0.85)) / MAX_WIRES;
      // The cable is turned by ry, so each end meets its wall at a slightly different z.
      const zl = z + Math.tan(ry) * cfg.WIRE_ANCHOR_X;
      const zr = z - Math.tan(ry) * cfg.WIRE_ANCHOR_X;
      const top = Math.min(cfg.WIRE_MAX_Y, wallHeightAt(c, -1, zl) - cfg.WIRE_ROOF_GAP, wallHeightAt(c, 1, zr) - cfg.WIRE_ROOF_GAP);
      if (top < cfg.WIRE_MIN_Y + sag) continue; // an alley or a low roof on one side: try elsewhere
      const w = c.wires[c.nw++];
      w.variant = variant;
      w.sag = sag;
      w.y = rng.range(cfg.WIRE_MIN_Y + sag, top); // anchor height; lowest point = y − sag
      w.z = z;
      w.ry = ry;
      w.glow = glow;
      break;
    }
  }

  // The shoulders and sidewalks: wrecks, barrier runs, rubble heaps, crates.
  c.nc = 0;
  c.nr = 0;
  c.fill[0] = fillStreetSide(c, -1, rng, cfg);
  c.fill[1] = fillStreetSide(c, 1, rng, cfg);
  wallRubble(c, rng, cfg); // last: it keeps clear of everything placed above
  clearTail(c);
  return c;
}

/** Zero the unused capacity, so a chunk's record depends only on (seed, k). */
function clearTail(c) {
  for (let i = c.nb; i < MAX_BUILDINGS; i++) {
    const b = c.buildings[i];
    b.side = b.x = b.z = b.w = b.h = b.d = b.inner = b.tone = 0;
  }
  for (let i = c.nd; i < MAX_DEBRIS; i++) {
    const o = c.debris[i];
    o.x = o.y = o.z = o.w = o.h = o.d = o.rx = o.ry = o.rz = o.tone = o.kind = o.group = 0;
  }
  for (let i = c.ns; i < MAX_SCREENS; i++) {
    const o = c.screens[i];
    o.side = o.x = o.y = o.z = o.w = o.h = o.kind = 0;
  }
  for (let i = c.nw; i < MAX_WIRES; i++) {
    const o = c.wires[i];
    o.z = o.y = o.sag = o.ry = o.variant = 0;
    o.glow = false;
  }
  for (let i = c.nl; i < c.lamps.length; i++) {
    const o = c.lamps[i];
    o.x = o.z = o.side = o.state = o.g = 0;
  }
  for (let i = c.nr; i < MAX_BARRIERS; i++) {
    const o = c.barriers[i];
    o.x = o.z = o.ry = o.side = 0;
  }
  for (let i = c.nc; i < MAX_CARS; i++) {
    const o = c.cars[i];
    o.x = o.z = o.ry = o.side = 0;
    o.tipped = false;
  }
}

/** Sag of cable variant v: spread evenly from WIRE_SAG_MIN to WIRE_SAG_MAX. */
export function wireSag(v, cfg) {
  return cfg.WIRE_VARIANTS > 1
    ? cfg.WIRE_SAG_MIN + ((cfg.WIRE_SAG_MAX - cfg.WIRE_SAG_MIN) * v) / (cfg.WIRE_VARIANTS - 1)
    : cfg.WIRE_SAG_MIN;
}

/** Streetlights per chunk (STREETLIGHT_SPACING must divide CITY_CHUNK_LENGTH). */
export function lampsPerChunk(cfg) {
  return Math.round(cfg.CITY_CHUNK_LENGTH / cfg.STREETLIGHT_SPACING);
}

// --- Street clutter: one walk down each side, so nothing overlaps -----------------

/**
 * Walk down one side of the street placing clutter on the shoulder (between
 * the outer lane and the kerb) and the sidewalk. Each item takes its own
 * stretch of z, so items never overlap; every item stays ≥ PROP_LANE_MARGIN
 * outside the lanes, off the buildings, and clear of lamp posts.
 */
function fillStreetSide(c, side, rng, cfg) {
  const L = cfg.CITY_CHUNK_LENGTH;
  const wSum = cfg.PROP_EMPTY_W + cfg.PROP_CAR_W + cfg.PROP_BARRIER_W + cfg.PROP_HEAP_W + cfg.PROP_CRATE_W;
  let z = -cfg.CHUNK_SEAM_MARGIN - rng.range(0, 2);
  let filled = 0;
  while (z > -L + cfg.CHUNK_SEAM_MARGIN + 1) {
    let r = rng.next() * wSum;
    let used = 0;
    if ((r -= cfg.PROP_EMPTY_W) < 0) {
      z -= rng.range(1.5, 4); // a deliberate gap
      continue;
    }
    if ((r -= cfg.PROP_CAR_W) < 0) used = placeCar(c, side, z, rng, cfg);
    else if ((r -= cfg.PROP_BARRIER_W) < 0) used = placeBarriers(c, side, z, rng, cfg);
    else if ((r -= cfg.PROP_HEAP_W) < 0) used = placeHeap(c, side, z, rng, cfg);
    else used = placeCrates(c, side, z, rng, cfg);
    // Refused (beside a lamp post, wreck limit, chunk end)? Try the smaller items before giving up.
    if (used === 0) used = placeHeap(c, side, z, rng, cfg);
    if (used === 0) used = placeBarriers(c, side, z, rng, cfg);
    filled += used;
    z -= used > 0 ? used + rng.range(cfg.PROP_GAP_MIN, cfg.PROP_GAP_MAX) : 1;
  }
  return filled;
}

/** Rubble fallen from the walls onto the sidewalk: kept clear of lamp posts, wrecks, and barriers. */
function wallRubble(c, rng, cfg) {
  for (let bi = 0; bi < c.nb; bi++) {
    const b = c.buildings[bi];
    if (rng.next() >= cfg.RUBBLE_CHANCE) continue;
    const n = 1 + rng.int(3);
    for (let i = 0; i < n; i++) {
      const s = rng.range(cfg.RUBBLE_SIZE_MIN, cfg.RUBBLE_SIZE_MAX);
      const x = b.side * (b.inner - rng.range(0.3, cfg.RUBBLE_SPREAD));
      const h = s * rng.range(0.5, 0.9);
      const d = s * rng.range(0.7, 1.3);
      const r = Math.hypot(s, d, h) / 2;
      const zMin = -cfg.CITY_CHUNK_LENGTH + cfg.CHUNK_SEAM_MARGIN + r; // stay inside this chunk (seams)
      const zMax = -cfg.CHUNK_SEAM_MARGIN - r;
      const z = clamp(b.z + rng.range(-b.d / 2, b.d / 2), zMin, zMax);
      if (nearLamp(c, b.side, z, r + cfg.STREETLIGHT_CLEARANCE) || blockedByClutter(c, x, z, r, cfg)) continue;
      c.ng++;
      addDebris(c, x, s * 0.3, z, s, h, d, rng.range(-0.4, 0.4), rng.range(0, Math.PI), rng.range(-0.4, 0.4), rng.next());
    }
  }
}

/** Height of the building wall on `side` at local z, or 0 if there is none (an alley). */
export function wallHeightAt(c, side, z) {
  for (let i = 0; i < c.nb; i++) {
    const b = c.buildings[i];
    if (b.side === side && Math.abs(z - b.z) <= b.d / 2) return b.h;
  }
  return 0;
}

/** Far end of the usable stretch for street clutter (a margin before the next chunk). */
function seamEnd(cfg) {
  return -cfg.CITY_CHUNK_LENGTH + cfg.CHUNK_SEAM_MARGIN;
}

/**
 * True if a piece of radius r at (x, z) would touch a wreck (its reach
 * circle), a barrier, or any street-level piece already placed (heaps,
 * crates, rubble).
 */
export function blockedByClutter(c, x, z, r, cfg) {
  for (let i = 0; i < c.nd; i++) {
    const d = c.debris[i];
    if (d.y > cfg.STREET_LEVEL_Y) continue; // roof slabs
    if (Math.hypot(x - d.x, z - d.z) < r + Math.hypot(d.w, d.d) / 2) return true;
  }
  return blockedByVehicles(c, x, z, r, cfg);
}

/** True if a piece of radius r at (x, z) would touch a wreck (its reach circle) or a barrier. */
export function blockedByVehicles(c, x, z, r, cfg) {
  const reach = carReach(cfg);
  for (let i = 0; i < c.nc; i++) {
    const car = c.cars[i];
    if (Math.hypot(x - car.x, z - car.z) < reach + r) return true;
  }
  for (let i = 0; i < c.nr; i++) {
    const b = c.barriers[i];
    if (Math.abs(z - b.z) < cfg.BARRIER_LENGTH / 2 + r && Math.abs(x - b.x) < halfExtentX(cfg.BARRIER_WIDTH, cfg.BARRIER_LENGTH, b.ry) + r) return true;
  }
  return false;
}

/** A wreck parked or dumped on the shoulder. Returns the stretch of z used (0 = nothing placed). */
function placeCar(c, side, z, rng, cfg) {
  const reach = carReach(cfg);
  const len = 2 * reach;
  const cz = z - reach;
  if (c.nc >= MAX_CARS || cz - reach < seamEnd(cfg)) return 0;
  if (nearLamp(c, side, cz, reach + 0.3)) return 0; // its nose could swing into the post
  const car = c.cars[c.nc++];
  car.side = side;
  car.x = side * rng.range(cfg.CAR_X_MIN, cfg.CAR_X_MAX);
  car.z = cz;
  car.ry = rng.range(-0.5, 0.5) + (rng.next() < 0.3 ? Math.PI : 0);
  car.tipped = rng.next() < cfg.CAR_TIPPED_CHANCE;
  return len;
}

/** 1–3 concrete barriers end to end along the road, some knocked crooked. */
function placeBarriers(c, side, z, rng, cfg) {
  const n = 1 + rng.int(3);
  const step = cfg.BARRIER_LENGTH + 0.15;
  if (z - n * step < seamEnd(cfg)) return 0;
  const x0 = rng.range(cfg.BARRIER_X_MIN, cfg.BARRIER_X_MAX);
  let placed = 0;
  for (let i = 0; i < n && c.nr < MAX_BARRIERS; i++) {
    const b = c.barriers[c.nr++];
    b.side = side;
    b.x = side * (x0 + rng.range(-0.15, 0.15));
    b.z = z - (i + 0.5) * step;
    b.ry = rng.next() < 0.3 ? rng.range(-cfg.BARRIER_TILT, cfg.BARRIER_TILT) : rng.range(-0.05, 0.05);
    placed++;
  }
  return placed * step;
}

/** A heap of broken concrete. */
function placeHeap(c, side, z, rng, cfg) {
  const len = 2 * cfg.HEAP_SPREAD + 2 * cfg.HEAP_SIZE_MAX * 0.71;
  if (z - len < seamEnd(cfg) || c.nd + 6 > MAX_DEBRIS) return 0;
  const cx = side * rng.range(cfg.HEAP_X_MIN, cfg.HEAP_X_MAX);
  const cz = z - len / 2;
  if (nearLamp(c, side, cz, len / 2 + cfg.STREETLIGHT_CLEARANCE)) return 0;
  const n = 3 + rng.int(4);
  c.ng++;
  for (let i = 0; i < n; i++) {
    const s = rng.range(cfg.HEAP_SIZE_MIN, cfg.HEAP_SIZE_MAX);
    const h = s * rng.range(0.4, 0.8);
    addDebris(c, cx + rng.range(-cfg.HEAP_SPREAD, cfg.HEAP_SPREAD), h * 0.4, cz + rng.range(-cfg.HEAP_SPREAD, cfg.HEAP_SPREAD),
      s, h, s * rng.range(0.6, 1.1), rng.range(-0.35, 0.35), rng.range(0, Math.PI), rng.range(-0.35, 0.35), rng.next());
  }
  return len;
}

/** 1–3 rusted crates, sometimes one stacked on another; on the shoulder or the sidewalk. */
function placeCrates(c, side, z, rng, cfg) {
  const len = 2 * cfg.CRATE_SIZE_MAX * 0.71 + 0.4;
  const cz = z - len / 2;
  if (z - len < seamEnd(cfg) || c.nd + 3 > MAX_DEBRIS) return 0;
  const ax = rng.range(cfg.CRATE_X_MIN, cfg.CRATE_X_MAX);
  if (nearLamp(c, side, cz, len / 2 + cfg.STREETLIGHT_CLEARANCE)) return 0; // big crates reach the kerb
  const s = rng.range(cfg.CRATE_SIZE_MIN, cfg.CRATE_SIZE_MAX);
  const tone = rng.next();
  c.ng++;
  addDebris(c, side * ax, s / 2, cz, s, s, s, 0, rng.range(-0.6, 0.6), 0, tone, DEBRIS_KIND.CRATE);
  if (rng.next() < 0.4) {
    const s2 = s * rng.range(0.6, 0.9); // a smaller one stacked on top
    addDebris(c, side * ax, s + s2 / 2, cz, s2, s2, s2, 0, rng.range(-0.6, 0.6), 0, rng.next(), DEBRIS_KIND.CRATE);
  }
  return len;
}

/** How far a w × d footprint turned by ry reaches along x from its centre. */
export function halfExtentX(w, d, ry) {
  return Math.abs((w / 2) * Math.cos(ry)) + Math.abs((d / 2) * Math.sin(ry));
}

function nearLamp(c, side, z, clearance) {
  for (let i = 0; i < c.nl; i++) {
    const l = c.lamps[i];
    if (l.side === side && Math.abs(l.z - z) < clearance) return true;
  }
  return false;
}

/**
 * How strongly one of the few real lights should shine for a lamp at world z
 * (player at z = 0, ahead is −z). Full while the lamp is between
 * STREETLIGHT_FULL_AHEAD and the player, fading to 0 by STREETLIGHT_FADE_AHEAD
 * ahead and STREETLIGHT_FADE_BEHIND behind. The window is shorter than two
 * lamp spacings, so at most two lamps are ever lit for real and a light can
 * hop to the next lamp while it is at zero (no popping).
 */
export function lampWeight(z, cfg) {
  if (z <= -cfg.STREETLIGHT_FADE_AHEAD || z >= cfg.STREETLIGHT_FADE_BEHIND) return 0;
  if (z < -cfg.STREETLIGHT_FULL_AHEAD) {
    return smoothstep(-cfg.STREETLIGHT_FADE_AHEAD, -cfg.STREETLIGHT_FULL_AHEAD, z);
  }
  if (z > 0) return 1 - smoothstep(0, cfg.STREETLIGHT_FADE_BEHIND, z);
  return 1;
}

/** Brightness (0..1) of a lamp of `state` and global index g at view time t. */
export function lampBrightness(state, g, t) {
  if (state === LAMP_STATE.DEAD) return 0;
  if (state === LAMP_STATE.ON) return 1;
  const r = flickerValue(g, t, 9);
  return r < 0.25 ? 0.08 : r < 0.35 ? 0.5 : 1;
}

/**
 * A stuttering pseudo-random value in [0, 1) for light `seed` at time t,
 * changing `rate` times a second. Lamps and screens threshold it to flicker.
 */
export function flickerValue(seed, t, rate) {
  const h = Math.sin(Math.floor(t * rate + seed * 3.1) * 91.7 + seed * 7.3) * 43758.5453;
  return h - Math.floor(h);
}

/** Half the diagonal of a car's footprint: the most it can reach sideways at any rotation. */
export function carReach(cfg) {
  return Math.hypot(cfg.CAR_WIDTH / 2, cfg.CAR_LENGTH / 2);
}

// --- Sky ---------------------------------------------------------------------------------

/** '#rrggbb' → [r, g, b] in 0..1 (sRGB, as written). */
export function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function mix3(a, b, t) {
  const u = 1 - t; // (1 − t)·a + t·b is exact at both ends
  return [a[0] * u + b[0] * t, a[1] * u + b[1] * t, a[2] * u + b[2] * t];
}

/**
 * The two sky colours (sRGB): `horizon` (also the fog colour) is the night
 * haze lifted a little toward skyGlow; `zenith` is the haze darkened. Derived
 * from palette tokens, so the palette stays the single source of colour.
 */
export function skyColors(palette, cfg) {
  const haze = hexToRgb(palette.skyHaze);
  return {
    horizon: mix3(haze, hexToRgb(palette.skyGlow), cfg.SKY_HORIZON_GLOW),
    zenith: mix3(haze, [0, 0, 0], cfg.SKY_ZENITH_DARKEN),
  };
}

export function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

/**
 * Sky colour (sRGB) looking in a direction whose unit vector has height `y`
 * (sin of the elevation). Exactly the horizon/fog colour at and below the
 * horizon, darkening toward the top of the view. js/city.js has the GLSL twin
 * of this function (same constants, same formula) for the sky dome and the
 * fog on tall objects.
 */
export function skyColorAt(y, colors, cfg) {
  return mix3(colors.horizon, colors.zenith, smoothstep(cfg.SKY_FADE_START, cfg.SKY_FADE_END, y));
}

/** A GLSL float literal (always has a decimal point). */
export function glslFloat(n) {
  return Number.isInteger(n) ? n.toFixed(1) : String(n);
}

export function glslVec3(c) {
  return `vec3( ${glslFloat(c[0])}, ${glslFloat(c[1])}, ${glslFloat(c[2])} )`;
}

/**
 * GLSL source of skyColor(y): the twin of skyColorAt(), with the same
 * constants and formula, used by the sky dome and the sky-matched fog
 * (js/city.js). Output is sRGB: three.js mixes fog after colour conversion.
 */
export function skyGlsl(palette, cfg) {
  const { horizon, zenith } = skyColors(palette, cfg);
  return `
vec3 skyColor( float y ) {
  float t = smoothstep( ${glslFloat(cfg.SKY_FADE_START)}, ${glslFloat(cfg.SKY_FADE_END)}, y );
  return ${glslVec3(horizon)} * ( 1.0 - t ) + ${glslVec3(zenith)} * t;
}`;
}
