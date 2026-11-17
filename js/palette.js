// Color palette (art-direction skill). Pure data: DOM-free so tests can import it.
// UI colors are mirrored as CSS custom properties in style.css; a test keeps
// the two in sync.

export const PALETTE = Object.freeze({
  skyHaze: '#3a2418', // background / fog (must match so the horizon blends)
  skyGlow: '#8a4a22', // horizon gradient, sun tint
  asphalt: '#1c1b1d', // road
  laneLine: '#6b6250', // faded lane markings
  concreteDark: '#3b3836',
  concreteLight: '#55504a',
  rust: '#6e3b22',
  neonCyan: '#19f0ff',
  neonMagenta: '#ff2bd6',
  hazardAmber: '#ffb020',
  sparkWhite: '#fff4c2',
  dangerRed: '#ff3344',
});
