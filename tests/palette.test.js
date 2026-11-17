import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PALETTE } from '../js/palette.js';

const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');

/** camelCase palette key -> --kebab-case CSS custom property. */
const cssVar = (key) => '--' + key.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());

test('every PALETTE value is a 6-digit hex color', () => {
  for (const [key, value] of Object.entries(PALETTE)) {
    assert.match(value, /^#[0-9a-f]{6}$/, key);
  }
});

test('CSS custom properties in style.css match PALETTE (no drift between page and scene)', () => {
  const declared = [...css.matchAll(/(--[a-z-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)];
  assert.ok(declared.length > 0, 'no palette custom properties found in style.css');
  const byVar = Object.fromEntries(Object.keys(PALETTE).map((k) => [cssVar(k), PALETTE[k]]));
  for (const [, name, value] of declared) {
    assert.ok(name in byVar, `${name} is not a PALETTE key`);
    assert.equal(value.toLowerCase(), byVar[name], name);
  }
});

test('the page background uses the scene background color (--sky-haze)', () => {
  assert.match(css, /background:\s*var\(--sky-haze\)/);
});
