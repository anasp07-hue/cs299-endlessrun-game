# ADR-0009: Cold, eerie palette instead of neon cyan/magenta

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 3 (SPEC §9), during review
- **Changes:** the SPEC §5 mood and the art-direction skill's palette. ADR-0008 is unaffected.

## Context
After seeing the Phase 3 menus, the user asked to "lean away from cyan and magenta neon heavy" and to use "more cooler blue and just more chill/eerie colours". The original direction (SPEC §5, art-direction skill) was a dusk scene: an orange-brown haze sky, a warm sun, and saturated neon cyan `#19f0ff` and magenta `#ff2bd6` accents.

## Decision
- The whole look moves to a **cold night palette**, not just the UI:
  - Sky/fog `skyHaze` `#10171e`, horizon `skyGlow` `#33495a`.
  - A new `moonlight` `#a9bccf` replaces the warm `0xffd2a8` sun.
  - Cooler asphalt, lane lines, and concrete; a muted `rust`.
- `neonCyan` and `neonMagenta` are **removed** and replaced by:
  - `glowBlue` `#7fb6e6`: a soft blue; UI primary, visor, live screens.
  - `glowPale` `#c4d7e6`: pale moonlight; headings, accent readouts.
  - `duskViolet` `#6a5f92`: a faint eerie accent; glitch screens, subtle tints. Use sparingly.
- The **obstacle cues stay as they were**: `hazardAmber`, `sparkWhite`, `dangerRed`. They're gameplay signals (SPEC §3.4, the "one correct action" rule), and warm, bright cues stand out even better against a cold scene.
- UI: blue-black panels, hairline low-opacity borders, faint text glows, and a slow "breathe" on the NEW HIGH SCORE badge instead of a scale pulse.

## Alternatives considered
- **Change only the UI, keep the orange sky:** the warm sky would clash with a cold UI, and the user asked for cooler colors in general.
- **Keep the token names `neonCyan`/`neonMagenta` with new values:** less churn, but the names would lie about the colors.
- **Make the obstacles cool too:** they'd blend into the scene and hurt readability at speed.

## Consequences
- Phase 5 (fog, sky, buildings, screens) and Phase 6 (themed obstacles) build on this palette. Fog uses `skyHaze`.
- The palette test still requires every hex CSS custom property to be a `PALETTE` key.
- Easy to tune further. Changing the hex values in `js/palette.js` and `style.css` doesn't need a new ADR; going back to neon would.
