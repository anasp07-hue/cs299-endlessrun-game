# Handoff: Phase 0, scaffold (2026-11-17)

## Done this session
- Vendored **three.js r186.1** into `libs/` (`three.module.js`, `three.core.js`, `three.LICENSE`). The tarball SHA-1 was checked against the npm registry first (ADR-0003).
- `index.html`: canvas container `#game-container`, four empty overlay divs (`#hud`, `#menu`, `#pause`, `#gameover`, all `hidden`), and an empty `data:` favicon so the console stays free of 404s.
- `style.css`: reset, full-screen canvas, overlay layer (`#ui` with `pointer-events: none`; overlays opt back in). System fonts only.
- `game.js`: WebGLRenderer (pixel ratio capped at 1.5), scene, camera (far = 150), ambient + directional light, a spinning test cube, resize handler, and a `setAnimationLoop` loop with a clamped `dt`. `?debug` exposes `window.__neon = { THREE, renderer, scene, camera, cube }`.
- `js/logic/config.js`: frozen `CONFIG` (MAX_DT, PIXEL_RATIO_MAX, CAMERA_*, light intensities, TEST_CUBE_*).
- `js/logic/rng.js`: `createRng(seed)` (mulberry32) with `next/range/int/pick/reset/getState`, plus `normalizeSeed`. Its methods don't allocate.
- `js/logic/time.js`: `clampDt(dt, max)`, which turns NaN, negative, or infinite deltas into 0 and throws if `max` is invalid.
- **Code review (`code-review` skill) before the first commit** found 10 items. Fixed 8: `rng.reset(newSeed)` now updates `rng.seed`; `rng.int` guards against Infinity; `clampDt` throws on an invalid `max`; the CONFIG test checks only numeric values, so later arrays and strings won't force it to be weakened; magic numbers moved from `game.js` into CONFIG; `#hud` has `pointer-events: none` so it won't block canvas/touch input in Phase 3; ADR-0004 also names ADR-0001; the request count in this handoff is corrected. Deferred 2 (see Open problems).
- `assets/{models,textures,sounds}/.gitkeep`.
- **Test command fixed:** `node --test tests/` fails on Node 24 because a directory argument is treated as a file. Everything now uses `node --test 'tests/*.test.js'` (ADR-0004). CLAUDE.md, SPEC.md, the handoff template, and the `test-review` and `game-systems` skills were updated.

## Current state
- Playable? There's no gameplay yet, as planned for Phase 0. `python3 -m http.server 8000` → http://localhost:8000 shows a cyan cube spinning on a dark background.
- Files touched: `index.html`, `style.css`, `game.js`, `js/logic/{config,rng,time}.js`, `tests/{rng,config-time}.test.js`, `libs/*`, `assets/*/.gitkeep`, `docs/adr/0003-*.md`, `docs/adr/0004-*.md`, `SPEC.md`, `CLAUDE.md`, `docs/handoffs/README.md`, `.claude/skills/{test-review,game-systems}/SKILL.md`.
- Nothing has been committed.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 20 / ℹ pass 20 / ℹ fail 0`
- Smoke test (test-review skill): **done, in headless Chrome** (the Claude-in-Chrome extension wasn't connected). It ran with `--host-resolver-rules="MAP * ~NOTFOUND, EXCLUDE localhost"`, so every non-localhost host failed to resolve.
  - Screenshots at virtual t=0.5 s and t=2 s show the lit cube in two different orientations, so it renders and spins.
  - Page console: 0 messages. Capture was confirmed working with a probe page that logged a warning and an error.
  - Server log: 7 requests per page load, all local, all 200 (`/`, `style.css`, `game.js`, `libs/three.module.js`, `libs/three.core.js`, `js/logic/config.js`, `js/logic/time.js`).
  - Static checks: there are no `http(s)://` URLs in game code, game code (excluding libs) is 24 KB, `assets/` is 0 B, and `libs/` is 2.0 MB.

## Decisions made
- ADRs written: **0003** (vendor three.js r186.1, unminified), **0004** (the test command is now a glob, which requires Node 21+).
- SPEC.md changes: the §2 tree lists the new logic files, the three.js version, and the license file. The test command was updated. The Phase 0 acceptance items are checkboxes and are checked, with a note on how the offline check was done. *(The pre-existing uncommitted edit to the Agent's suit color in §5 is the user's change and was left as-is.)*

## Open problems / known bugs
- **Verified by the user:** the cube still spins with wifi physically off.
- **Not verified:** window resizing in an interactive browser (the handler was reviewed by reading the code only); Firefox, Safari, and Edge.
- Deferred from code review: (a) the background color `#120c0a` appears in both `style.css` and `game.js` (keep them in sync during the Phase 5 art pass); (b) the pixel ratio is only re-read on `resize`, so moving the window to a display with a different DPI may not update it (Phase 8 polish).
- `Object.freeze` on CONFIG is shallow. If nested objects/arrays are added, freeze them too.
- The loop does a single variable step per frame. The game-systems skill recommends a fixed-timestep accumulator (1/120). Add it in Phase 1, when there's physics to step.

## Next steps (in order)
1. The user reviews Phase 0 and commits it if happy.
2. Phase 1 (SPEC §9): recycled ground segments, a placeholder player box in 3 lanes, lane switching (queued, about 0.12 s lerp), jump/slide/fast-fall, and a chase camera. Load the `game-systems` skill first. Put jump physics, lane logic, and the fixed-step accumulator in `js/logic/` with tests.
