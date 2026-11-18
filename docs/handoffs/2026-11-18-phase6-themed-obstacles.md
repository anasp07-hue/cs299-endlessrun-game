# Handoff: Phase 6, themed obstacles (2026-11-18)

Phase 6 is **done but not committed**. Waiting for the user's review (CLAUDE.md rule 3). Don't start Phase 7 until the user says so.

## Done this session
- **`js/obstacleModels.js` (DOM-free view, ADR-0014):** 2 looks per type. Each look is a lit vertex-coloured body plus an unlit glow part in that type's cue colour.
  - **LOW:** a fallen screen on a rubble bed, or a concrete barrier laid across the lane. Both carry amber/black slanted hazard stripes (top and front).
  - **HIGH:** a hanging billboard frame (dead screen, last blue flicker), or a broken I-beam with a sparking cable bundle. Both have a `sparkWhite` line exactly at the slide height (1.1), thin cables rising into the dark above, and nothing below 1.1.
  - **BLOCK:** a hover-car crashed tail-first (roof and cockpit toward you), or a broken concrete pillar. Bold `dangerRed` light bar, strips, bands, and beacon.
  - LOW and BLOCK are fitted to the hitbox by a measured transform; HIGH is built in hitbox coordinates.
  - `obstacleVariant(row, lane)` is a deterministic hash, so the spawner's RNG is untouched.
- **`js/geometry.js`:** shared DOM-free builders (`mergeColored`, `carParts` / `makeCarGeometry`, `barrierShapeGeometry` / `makeBarrierGeometry`, `tube`, `box`), moved out of `js/city.js`.
- **`game.js`:** 12 instanced meshes (type × variant × body/glow) and two shared materials replace the 3 placeholder boxes. The per-frame loop only writes matrices.
- **Readability tuning from screenshots:**
  - BLOCK's red cues made bolder (they were small accents on a dark body).
  - The HIGH slide line thickened.
  - The crashed car flipped so you see its roof and cockpit, not its underside.
- **SPEC:** §2 lists the new modules, §3.4 describes the looks, and the Phase 6 box is ticked.

## Pre-commit code review (2026-11-18)
- **Fixed:**
  - **Fog:** obstacle materials now use the city's sky-matched fog (`applySkyFog`), so tall parts fade into the sky like the city.
  - **Shared faces (z-fighting):** removed between body and glow in 4 places (HIGH billboard beam and posts, cable-beam flanges, LOW screen glass vs. stripe lip), using an `INSET` of 0.012. A new test checks that HIGH bodies never share the slide line's faces.
  - **Variant count:** `OBSTACLE_VARIANTS` is now derived from the builder lists and asserted, so it can't drift.
  - **Uploads:** only live instances are uploaded each frame (`addUpdateRange`), not all 12 × 64 slots.
  - **Duplicate code:** the city's cables reuse `tube()`.
  - **Stripes:** the barrier's foot stripes now stay within its vertical foot.
- **Not changed:** "bodies are dark at range". The glow cues carry the signal at distance, as the screenshots show.
- Tests: 214 / 214. Browser re-checked: showcase, max speed 60.4 fps / 88 draw calls, regression loop, real-key play, no console errors.

## Current state
- Playable: the full loop works, and obstacles are themed at all speeds.
- **Files touched:**
  - New: `js/obstacleModels.js`, `js/geometry.js`, `tests/obstacles.test.js`, `docs/adr/0014-themed-obstacle-models.md`, this handoff.
  - Changed: `game.js`, `js/city.js` (imports the moved builders, exports `applySkyFog`), `SPEC.md`.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 214 / ℹ pass 214 / ℹ fail 0` (was 205).
- New tests (7) measure the real geometry with three.js in Node:
  - **Inside and filling the hitbox:** ≥ 95% width, ≥ 85% depth, full height.
  - **LOW:** never above 0.9.
  - **HIGH:** nothing below 1.1, and its glow line spans the lane exactly at 1.1.
  - **BLOCK:** reaches 2.6, buried at most 0.4.
  - **Cue colours:** each type uses only its own, and no body uses any.
  - **Variants:** deterministic and evenly used.
- **Two tests failed against real model gaps, and both were fixed in the models:**
  - The cable-beam HIGH was 0.42 deep against a 0.6-deep hitbox.
  - Its cables stopped at 2.39 instead of 2.5.
- **One test change, explained:** the "solid part" measure now counts triangles that reach into the height range, clipped to it. That way the crashed car's nose going into the road counts as visible solid. The "slide line exactly at 1.1" check was strengthened to use the unclipped glow geometry, so the change didn't make it trivial.
- **Smoke test** (test-review skill), headless Chrome over CDP on the real GPU via `serve.py`:
  - A showcase frame of all six looks.
  - Play at start speed (a B.B row of red-banded pillars) and at max speed (an LLL row of striped LOWs).
  - The regression loop: pause freezes, the street is identical after the menu, and real-key play ends with a head-on catch.
  - Zero console errors or warnings.
  - Max speed: 60.3 fps, 88 draw calls, about 10k triangles.

## Decisions made
- **ADR-0014:** model and variant approach, fit-to-hitbox, cue-colour rules, and DOM-free view modules may be imported by Node tests.
- Hitboxes were deliberately **not** changed to suit the looks; spawner fairness depends on them.

## Open problems / known bugs
- "A new player can tell at a glance" was judged from screenshots. The real test is the user, or someone new, playing it.
- The crashed car still reads partly as a rust slab at distance; its red cues carry the meaning. A third BLOCK look (e.g. a stacked barricade) could add variety.
- Glow parts are static. Phase 7 can add sparks or flicker to HIGH cables and BLOCK beacons.

## Next steps (in order)
1. The user reviews and plays Phase 6 (`python3 serve.py`).
2. If approved: commit (no Claude attribution). Suggested message: `Add Phase 6: themed obstacles fitted to their hitboxes`.
3. Then Phase 7 (audio & juice), loading the `game-systems` and `art-direction` skills first.
