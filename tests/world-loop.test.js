import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { segmentZ, laneX } from '../js/logic/world.js';
import { createFixedStepper } from '../js/logic/loop.js';
import { clamp, lerp, easeOutQuad, mod, damp } from '../js/logic/math.js';
import { actionForKey, actionForKeyEvent, ACTION } from '../js/logic/input.js';

const L = CONFIG.GROUND_SEGMENT_LENGTH;
const N = CONFIG.GROUND_SEGMENT_COUNT;
const BACK = CONFIG.GROUND_BACK_Z;

function zs(scroll) {
  const out = [];
  for (let i = 0; i < N; i++) out.push(segmentZ(i, scroll, L, N, BACK));
  return out.sort((a, b) => a - b);
}

// --- Ground segments ---------------------------------------------------------------

test('ground segments always tile one gap-free strip, at any scroll distance', () => {
  for (const scroll of [0, 0.001, 7.3, L, L * N, 12345.678, 1e6 + 0.5]) {
    const z = zs(scroll);
    for (let i = 1; i < N; i++) {
      assert.ok(Math.abs(z[i] - z[i - 1] - L) < 1e-6, `gap at scroll ${scroll}: ${z[i] - z[i - 1]}`);
    }
    // Near edge stays in (BACK, BACK + L]; the strip is exactly N * L long.
    const near = z[N - 1] + L / 2;
    const far = z[0] - L / 2;
    assert.ok(near > BACK - 1e-6 && near <= BACK + L + 1e-6, `scroll ${scroll}: near edge ${near}`);
    assert.ok(Math.abs(near - far - L * N) < 1e-6, `scroll ${scroll}: strip length ${near - far}`);
  }
});

test('the ground strip always covers from behind the camera to past the far plane', () => {
  for (let scroll = 0; scroll < 500; scroll += 0.37) {
    const z = zs(scroll);
    const nearEdge = z[N - 1] + L / 2;
    const farEdge = z[0] - L / 2;
    assert.ok(nearEdge >= CONFIG.CAMERA_Z, `road starts in front of the camera at scroll ${scroll}`);
    assert.ok(farEdge <= CONFIG.CAMERA_Z - CONFIG.CAMERA_FAR, `road ends before the far plane at scroll ${scroll}`);
  }
});

test('scrolling moves every segment toward +Z by exactly the scroll amount (unless it wraps)', () => {
  const d = 0.25;
  for (let i = 0; i < N; i++) {
    const a = segmentZ(i, 100, L, N, BACK);
    const b = segmentZ(i, 100 + d, L, N, BACK);
    const moved = b - a;
    const wrapped = Math.abs(moved - (d - L * N)) < 1e-9;
    assert.ok(Math.abs(moved - d) < 1e-9 || wrapped, `segment ${i} moved ${moved}`);
  }
});

test('a segment wraps to the far end once its far edge passes BACK', () => {
  // At scroll 0, segment 1 spans [BACK - L, BACK]. It must not wrap until it
  // has fully passed BACK, then it must jump to the far end.
  assert.equal(segmentZ(1, 0, L, N, BACK), BACK - L / 2);
  assert.equal(segmentZ(1, L - 0.01, L, N, BACK), BACK + L / 2 - 0.01);
  const after = segmentZ(1, L + 0.01, L, N, BACK);
  assert.ok(after < BACK - L * (N - 1), `expected wrap to far end, got ${after}`);
});

test('laneX puts 3 lanes at -2.5 / 0 / +2.5 (SPEC §3.2)', () => {
  assert.equal(laneX(0, 2.5, 3), -2.5);
  assert.equal(laneX(1, 2.5, 3), 0);
  assert.equal(laneX(2, 2.5, 3), 2.5);
});

// --- Fixed-step loop ---------------------------------------------------------------

test('fixed stepper: 60 fps frames give exactly 2 steps of 1/120 each', () => {
  const s = createFixedStepper(1 / 120);
  for (let i = 0; i < 600; i++) assert.equal(s.consume(1 / 60), 2, `frame ${i}`);
});

test('fixed stepper: total simulated time tracks real time at uneven frame rates', () => {
  const s = createFixedStepper(1 / 120);
  let real = 0;
  let steps = 0;
  const frames = [1 / 144, 1 / 75, 1 / 30, 1 / 60, 0.013, 0.021];
  for (let i = 0; i < 3000; i++) {
    const dt = frames[i % frames.length];
    real += dt;
    steps += s.consume(dt);
    const sim = steps / 120;
    assert.ok(real - sim >= -1e-9 && real - sim < 1 / 120 + 1e-9, `drift ${real - sim}`);
  }
});

test('fixed stepper: alpha is the leftover fraction, always in [0, 1)', () => {
  const s = createFixedStepper(0.01);
  s.consume(0.025);
  assert.ok(Math.abs(s.alpha() - 0.5) < 1e-9);
  for (let i = 0; i < 1000; i++) {
    s.consume(0.0037);
    assert.ok(s.alpha() >= 0 && s.alpha() < 1);
  }
});

test('fixed stepper: caps steps per frame and drops the backlog', () => {
  const s = createFixedStepper(1 / 120, 8);
  assert.equal(s.consume(1), 8);
  assert.equal(s.alpha(), 0);
  assert.equal(s.consume(1 / 120), 1);
});

test('fixed stepper: ignores bad dt, reset clears leftovers, rejects bad step', () => {
  const s = createFixedStepper(0.01);
  for (const dt of [NaN, -1, Infinity, undefined]) assert.equal(s.consume(dt), 0);
  s.consume(0.005);
  s.reset();
  assert.equal(s.alpha(), 0);
  for (const step of [0, -1, NaN, undefined]) assert.throws(() => createFixedStepper(step), TypeError);
});

test('MAX_DT frames never hit SIM_MAX_STEPS (no time dropped in normal play)', () => {
  assert.ok(CONFIG.MAX_DT / CONFIG.SIM_STEP < CONFIG.SIM_MAX_STEPS);
  const s = createFixedStepper(CONFIG.SIM_STEP, CONFIG.SIM_MAX_STEPS);
  let steps = 0;
  for (let i = 0; i < 100; i++) {
    const n = s.consume(CONFIG.MAX_DT);
    assert.ok(n < CONFIG.SIM_MAX_STEPS, `hit the cap: ${n}`);
    steps += n;
  }
  assert.ok(Math.abs(steps * CONFIG.SIM_STEP - 100 * CONFIG.MAX_DT) < CONFIG.SIM_STEP);
});

test('the static floor covers the view at the far plane, even on a 32:9 window', () => {
  const halfFov = (CONFIG.CAMERA_FOV / 2) * (Math.PI / 180);
  const halfWidthAtFar = CONFIG.CAMERA_FAR * Math.tan(halfFov) * (32 / 9);
  assert.ok(CONFIG.FLOOR_SIZE / 2 > halfWidthAtFar + CONFIG.LANE_WIDTH, `${CONFIG.FLOOR_SIZE / 2} vs ${halfWidthAtFar}`);
  assert.ok(CONFIG.FLOOR_SIZE > CONFIG.CAMERA_FAR + CONFIG.GROUND_BACK_Z, 'floor must reach the far plane');
});

// --- Math helpers --------------------------------------------------------------------

test('clamp / lerp / mod basics', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(clamp(-5, 0, 1), 0);
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(lerp(2, 4, 0.5), 3);
  assert.equal(mod(-1, 5), 4);
  assert.equal(mod(7, 5), 2);
  assert.equal(mod(0, 5), 0);
});

test('easeOutQuad maps 0→0, 1→1, is monotonic, and clamps outside [0, 1]', () => {
  assert.equal(easeOutQuad(0), 0);
  assert.equal(easeOutQuad(1), 1);
  assert.equal(easeOutQuad(-1), 0);
  assert.equal(easeOutQuad(2), 1);
  let last = -1;
  for (let t = 0; t <= 1; t += 0.01) {
    const v = easeOutQuad(t);
    assert.ok(v >= last);
    last = v;
  }
  assert.ok(easeOutQuad(0.5) > 0.5, 'ease-out is ahead of linear at the midpoint');
});

test('damp is frame-rate independent: one 1/30 step ≈ two 1/60 steps', () => {
  const one = damp(0, 10, 8, 1 / 30);
  const two = damp(damp(0, 10, 8, 1 / 60), 10, 8, 1 / 60);
  assert.ok(Math.abs(one - two) < 1e-9);
  assert.equal(damp(3, 10, 8, 0), 3);
  assert.equal(damp(3, 10, 8, NaN), 3);
  assert.ok(damp(0, 10, 8, 100) <= 10);
});

// --- Input mapping ---------------------------------------------------------------------

test('keys map to the SPEC §3.3 actions', () => {
  assert.equal(actionForKey('ArrowLeft'), ACTION.LEFT);
  assert.equal(actionForKey('KeyA'), ACTION.LEFT);
  assert.equal(actionForKey('ArrowRight'), ACTION.RIGHT);
  assert.equal(actionForKey('KeyD'), ACTION.RIGHT);
  assert.equal(actionForKey('ArrowUp'), ACTION.JUMP);
  assert.equal(actionForKey('KeyW'), ACTION.JUMP);
  assert.equal(actionForKey('Space'), ACTION.JUMP);
  assert.equal(actionForKey('ArrowDown'), ACTION.SLIDE);
  assert.equal(actionForKey('KeyS'), ACTION.SLIDE);
});

test('Esc / P pause and Enter confirms (SPEC §3.3, §4; added in Phase 3)', () => {
  assert.equal(actionForKey('Escape'), ACTION.PAUSE);
  assert.equal(actionForKey('KeyP'), ACTION.PAUSE);
  assert.equal(actionForKey('Enter'), ACTION.CONFIRM);
  assert.equal(actionForKey('NumpadEnter'), ACTION.CONFIRM);
  // Cmd/Ctrl+P is the browser's print shortcut: leave it alone.
  assert.equal(actionForKeyEvent({ code: 'KeyP', metaKey: true }), null);
  assert.equal(actionForKeyEvent({ code: 'KeyP', ctrlKey: true }), null);
});

test('Ctrl / Cmd / Alt + game key is left to the browser; Shift is allowed', () => {
  for (const mod of ['ctrlKey', 'metaKey', 'altKey']) {
    for (const code of ['ArrowLeft', 'KeyD', 'KeyS', 'Space']) {
      assert.equal(actionForKeyEvent({ code, [mod]: true }), null, `${mod}+${code}`);
    }
  }
  assert.equal(actionForKeyEvent({ code: 'ArrowLeft', shiftKey: true }), ACTION.LEFT);
  assert.equal(actionForKeyEvent({ code: 'ArrowUp' }), ACTION.JUMP);
  assert.equal(actionForKeyEvent({ code: 'KeyQ' }), null);
});

test('non-game keys map to null (including prototype names)', () => {
  // Enter and Escape left this list in Phase 3: they are now CONFIRM and PAUSE.
  for (const code of ['KeyQ', 'Tab', 'Backspace', '', 'toString', '__proto__', undefined]) {
    assert.equal(actionForKey(code), null, `code ${code}`);
  }
});
