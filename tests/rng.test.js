import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng, normalizeSeed } from '../js/logic/rng.js';

function take(rng, n) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(rng.next());
  return out;
}

test('same seed produces the same sequence', () => {
  assert.deepEqual(take(createRng(12345), 50), take(createRng(12345), 50));
});

test('different seeds produce different sequences', () => {
  assert.notDeepEqual(take(createRng(1), 20), take(createRng(2), 20));
});

test('known mulberry32 output for seed 0 (guards against accidental algorithm changes)', () => {
  const rng = createRng(0);
  // Reference values computed from the canonical mulberry32 implementation.
  assert.equal(rng.next(), 0.26642920868471265);
  assert.equal(rng.next(), 0.0003297457005828619);
  assert.equal(rng.next(), 0.2232720274478197);
});

test('next() stays in [0, 1) over many draws', () => {
  const rng = createRng(987654321);
  for (let i = 0; i < 100_000; i++) {
    const v = rng.next();
    assert.ok(v >= 0 && v < 1, `out of range: ${v}`);
  }
});

test('next() is roughly uniform (10 buckets, 100k draws, each within 5% of expected)', () => {
  const rng = createRng(42);
  const buckets = new Array(10).fill(0);
  const N = 100_000;
  for (let i = 0; i < N; i++) buckets[Math.floor(rng.next() * 10)]++;
  for (const count of buckets) {
    assert.ok(Math.abs(count - N / 10) < (N / 10) * 0.05, `bucket count ${count}`);
  }
});

test('int(n) returns integers in [0, n) and hits every value', () => {
  const rng = createRng(7);
  const seen = new Set();
  for (let i = 0; i < 10_000; i++) {
    const v = rng.int(3);
    assert.ok(Number.isInteger(v) && v >= 0 && v < 3, `bad int: ${v}`);
    seen.add(v);
  }
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
});

test('int(n) returns 0 for n <= 1 or invalid n', () => {
  const rng = createRng(7);
  for (const n of [1, 0, -5, NaN, undefined, Infinity, -Infinity]) assert.equal(rng.int(n), 0, `n=${n}`);
});

test('range(min, max) stays in [min, max)', () => {
  const rng = createRng(99);
  for (let i = 0; i < 10_000; i++) {
    const v = rng.range(-2.5, 2.5);
    assert.ok(v >= -2.5 && v < 2.5, `out of range: ${v}`);
  }
});

test('pick() returns an element of the array, undefined for empty', () => {
  const rng = createRng(3);
  const arr = ['LOW', 'HIGH', 'BLOCK'];
  for (let i = 0; i < 1000; i++) assert.ok(arr.includes(rng.pick(arr)));
  assert.equal(rng.pick([]), undefined);
});

test('reset() replays the sequence; reset(seed) switches seed', () => {
  const rng = createRng(555);
  const first = take(rng, 10);
  rng.reset();
  assert.deepEqual(take(rng, 10), first);
  rng.reset(556);
  assert.deepEqual(take(rng, 10), take(createRng(556), 10));
});

test('reset(newSeed) updates rng.seed, and a later reset() replays the new seed', () => {
  const rng = createRng(555);
  rng.reset(556);
  assert.equal(rng.seed, 556);
  const afterSwitch = take(rng, 10);
  rng.reset();
  assert.equal(rng.seed, 556);
  assert.deepEqual(take(rng, 10), afterSwitch);
  rng.reset(-1);
  assert.equal(rng.seed, 4294967295); // normalized like the constructor
});

test('getState() exposes the internal state and seed is normalized', () => {
  const rng = createRng(-1);
  assert.equal(rng.seed, 4294967295);
  assert.equal(rng.getState(), 4294967295);
  rng.next();
  assert.notEqual(rng.getState(), 4294967295);
});

test('normalizeSeed handles odd inputs', () => {
  assert.equal(normalizeSeed(0), 0);
  assert.equal(normalizeSeed(42.9), 42);
  assert.equal(normalizeSeed(-1), 4294967295);
  assert.equal(normalizeSeed(2 ** 32 + 5), 5);
  assert.equal(normalizeSeed('17'), 17);
  assert.equal(normalizeSeed(NaN), 0);
  assert.equal(normalizeSeed(Infinity), 0);
  assert.equal(normalizeSeed(undefined), 0);
  // Date.now()-sized seeds (used in normal play) are accepted.
  const s = normalizeSeed(1763400000000);
  assert.ok(Number.isInteger(s) && s >= 0 && s < 2 ** 32);
});
