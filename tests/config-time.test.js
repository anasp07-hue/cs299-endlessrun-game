import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONFIG } from '../js/logic/config.js';
import { clampDt } from '../js/logic/time.js';

test('CONFIG is frozen so tuning values cannot be mutated at runtime', () => {
  assert.ok(Object.isFrozen(CONFIG));
  assert.throws(() => {
    'use strict';
    CONFIG.MAX_DT = 1;
  }, TypeError);
});

test('CONFIG matches SPEC §7 values', () => {
  assert.equal(CONFIG.MAX_DT, 1 / 20); // §7.1
  assert.equal(CONFIG.PIXEL_RATIO_MAX, 1.5); // §7.3
  assert.equal(CONFIG.CAMERA_FAR, 150); // §7.3
});

test('every numeric CONFIG value is finite (no NaN/Infinity from bad arithmetic)', () => {
  for (const [key, value] of Object.entries(CONFIG)) {
    if (typeof value === 'number') assert.ok(Number.isFinite(value), `${key} is not finite`);
  }
});

test('clampDt passes normal frame times through unchanged', () => {
  assert.equal(clampDt(1 / 60, CONFIG.MAX_DT), 1 / 60);
  assert.equal(clampDt(1 / 144, CONFIG.MAX_DT), 1 / 144);
  assert.equal(clampDt(CONFIG.MAX_DT, CONFIG.MAX_DT), CONFIG.MAX_DT);
});

test('clampDt caps long frames (tab switch) at MAX_DT', () => {
  assert.equal(clampDt(0.5, CONFIG.MAX_DT), CONFIG.MAX_DT);
  assert.equal(clampDt(30, CONFIG.MAX_DT), CONFIG.MAX_DT);
});

test('clampDt throws on an invalid max (e.g. a mistyped CONFIG key)', () => {
  for (const max of [undefined, NaN, 0, -1, Infinity]) {
    assert.throws(() => clampDt(0.5, max), TypeError, `max=${max}`);
  }
});

test('clampDt turns zero, negative, and non-finite deltas into 0', () => {
  for (const dt of [0, -0.016, NaN, Infinity, -Infinity, undefined]) {
    assert.equal(clampDt(dt, CONFIG.MAX_DT), 0, `dt=${dt}`);
  }
});
