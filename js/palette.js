// Color palette (art-direction skill). Pure data: DOM-free so tests can import it.
// UI colors are mirrored as CSS custom properties in style.css; a test keeps
// the two in sync.
//
// Mood (2026-11-17, user direction): cold and eerie rather than neon-heavy.
// Desaturated night blues and greys, a soft blue glow, pale moonlight accents.
// The three obstacle cues (amber / white / red) stay warm and bright on
// purpose: they are gameplay signals and must pop against the cold scene.

export const PALETTE = Object.freeze({
  skyHaze: '#10171e', // background / fog: cold blue-black night haze (must match so the horizon blends)
  skyGlow: '#33495a', // horizon gradient, hemisphere sky light
  moonlight: '#a9bccf', // the key light: a pale, cold moon instead of a warm sun
  asphalt: '#17191c', // road
  laneLine: '#4a5560', // faded lane markings
  concreteDark: '#262c32',
  concreteLight: '#3f474f',
  rust: '#5b3f33', // muted, the one desaturated warm tone for metal debris
  glowBlue: '#7fb6e6', // live screens, hacker visor, UI primary (soft, not neon)
  glowPale: '#c4d7e6', // pale moonlight: UI accent, secondary readouts
  duskViolet: '#6a5f92', // faint eerie accent: glitch screens, subtle UI tint (use sparingly)
  hazardAmber: '#ffb020', // LOW obstacle cue
  sparkWhite: '#fff4c2', // HIGH obstacle cue
  dangerRed: '#ff3344', // BLOCK obstacle cue, "CAUGHT"
});
