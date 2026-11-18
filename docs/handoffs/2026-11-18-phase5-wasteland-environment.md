# Handoff: Phase 5, wasteland environment (2026-11-18)

Phase 5 is **done but not committed**. Waiting for the user's review (CLAUDE.md rule 3). Don't start Phase 6 until the user says so.

## Done this session
- **`js/logic/scenery.js` (pure, ADR-0013):**
  - City chunk recycling: 5 slots × 40 units, slot i shows the chunk k ≡ i (mod 5) that is in range.
  - Deterministic chunk content from `(CITY_SEED, k)` in preallocated records: buildings both sides with alleys, broken roof slabs, sidewalk rubble, up to 2 screens (dead / flicker / glitch), up to 2 cables, and up to 2 hover-car wrecks (some tipped).
  - The sky colour function `skyColorAt()` and its GLSL twin `skyGlsl()`.
- **`js/city.js` (view):**
  - Sky dome gradient, with `scene.fog` set to the horizon colour.
  - City materials patched so fog fades to the sky colour in the view direction, so there's no far-plane pop.
  - A facade window shader (dark window grid in metres, about 2% faintly lit `glowBlue`).
  - Shared screen canvases: dead, two flickering messages, and a glitch redrawn at 6 fps.
  - Tube cables, a merged vertex-coloured hover-car geometry with a `duskViolet` strip, 320 dust motes, and the new road texture (cracks, faint oil stains, worn lines, kerb, sidewalk slabs).
- **`game.js`:**
  - Creates the city and moves `makeRoadTexture` into `city.js`.
  - `city.update(scroll, cityTime, camera)` runs each render. `cityTime` stops only while PAUSED.
  - `window.__neon.city` is exposed under `?debug`.
- **`CONFIG`:**
  - The city/fog/sky/dust block.
  - `GROUND_WIDTH` 10 → 26 (asphalt to ±7.6, sidewalk to ±13), plus new `ROAD_ASPHALT_HALF`.
- **`SPEC.md`:** §2 lists `scenery.js` and `city.js`, the §5 atmosphere row is updated, and the Phase 5 boxes are ticked.

## Added after the first review: streetlights and brightness (user request)
- The user found the scene too dark and the Hacker hard to see.
- **Added streetlights:** a lamp post every 20 units alternating sides, with a lamp head over the shoulder, a soft light pool on the road, and a faint light cone. About 18% are dead and 14% flicker.
- **Real light on the Hacker:** 2 real `PointLight`s are handed between the lamps nearest the player with a smooth weight, so he is actually lit as he runs under them, with no popping and no shader rebuilds (shader count steady at 20).
- **Brighter scene:** hemisphere 1.4 → 1.9, moon 1.6 → 2.0, runner light 14 → 22, and the Hacker's hoodie/pants lifted to charcoal-black.
- Checked between lamps (the darkest case) and at max speed: the Hacker reads clearly as a figure in both.
- Max speed: 60.4 fps, 80 draw calls, about 3.9k triangles.
- New tests (4): lamp rhythm and alternation across chunks; wrecks and rubble clear of posts; `lampWeight` continuous and never more than 2 lamps wanting a light at any scroll; flicker/dead/on brightness.

## Added after the second review: filled shoulders and sidewalks (user request)
- The user found the non-playable outer strips too empty.
- **New clutter, from one walk down each side** (so nothing overlaps): up to 5 wrecks per chunk; runs of concrete jersey barriers along the road (`makeBarrierGeometry`); rubble heaps; rusted crates, sometimes stacked. Wall rubble is now placed last and avoids wrecks, barriers, and posts.
- **Tested rules:** ≥ 0.25 outside the lanes (with a conservative 3D reach for tilted pieces), nothing overlapping a wreck or barrier, clear of lamp posts and buildings, and ≥ 40% of every side filled (> 60% on average).
- The old "rubble ≥ 1 unit off the lanes" rule became ≥ `PROP_LANE_MARGIN` (0.25), the same as the wrecks, because filling the shoulders is the point. `CAR_CHANCE` was removed (wrecks come from the walk now).
- Max speed: 60.3 fps, 91 draw calls, about 8.5k triangles. Shader count unchanged at 20.

## Pre-commit code review (2026-11-18)
- **Fixed:**
  - **Wall rubble overlapping heaps and crates:** debris now carries a `group`, pieces of different groups never overlap, and wall rubble avoids all street-level pieces.
  - **Clutter crossing chunk seams:** `CHUNK_SEAM_MARGIN` keeps clutter 0.5 from each chunk end.
  - **Oil stains cut at segment seams:** now drawn wrapped, like the cracks.
  - **Bare floor in front of set-back buildings:** `GROUND_WIDTH` 19 → 26, so the sidewalk reaches the deepest setback (13).
  - **Turned-round tipped wrecks falling away from the road:** the roll now follows the facing.
  - **Cables floating over alleys or above short roofs:** cables now need a wall on both sides and anchor at least 1 below both roofs.
  - **The glitch font string built on every redraw:** now built once.
  - **The duplicated flicker hash:** now one shared, tested `flickerValue()`.
  - **Dead code:** removed an unreachable branch and the debug-only glitch counter.
- **Measured, not changed:** a restart rebuilding all 5 chunks takes 0.3 ms of CPU (median), and the worst frame across 3 restarts was 16.8 ms. No hitch.
- Tests: 205 / 205 pass. New tests cover cross-group overlap, seams, cables between walls, `flickerValue`, and the sidewalk reaching the setback.

## Current state
- Playable, with the full loop unchanged. The street is the same every run, including after Play Again and Main Menu.
- **Files touched:**
  - New: `js/logic/scenery.js`, `js/city.js`, `tests/scenery.test.js`, `docs/adr/0013-city-chunks-sky-fog.md`, this handoff.
  - Changed: `game.js`, `js/logic/config.js`, `js/characters.js` (Hacker colours), `SPEC.md`.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 205 / ℹ pass 205 / ℹ fail 0` (was 185 before Phase 5).
- New tests check:
  - **Chunk coverage:** every scroll is covered from 20 behind to at least 140 from the camera, so content always appears already fully fogged. Each slot wraps once per lap.
  - **Determinism:** the same chunk always generates the same content, and regenerating reuses the existing records (no allocation).
  - **Buildings:** they never overlap and never reach the sidewalk.
  - **Off the lanes:** wrecks stay at least 0.25 outside the lanes at any rotation, rubble stays off the road, and cables stay at 7 or higher. All three appear in practice.
  - **Sky:** it's monotonic and equals the fog colour at the horizon, and the GLSL twin matches the JS within 1e-12.
- Smoke test (test-review skill), in headless Chrome over CDP on the real GPU (Apple M3 Pro, Metal) via `serve.py`, because the extension wasn't connected:
  - Zero console errors or warnings, including no shader compile errors.
  - Regression loop: play → lanes/jump/slide → pause (dust and glitch frozen exactly) → resume → die → Main Menu. The rebuilt street was identical to the first menu.
  - Max speed: 60.6 fps, 55 draw calls, about 3.1k triangles.
  - Screenshots checked: the menu, start speed, max speed, and zoomed crops of a wreck and a glitch screen.
- Static review: no network URLs, no listeners added, and no allocations in the per-frame/per-wrap paths. One per-wrap array allocation was found and removed.

## Decisions made
- **ADR-0013:** deterministic chunk recycling, the sky-matched fog via shader patch, the facade window shader, and the wider ground with sidewalks.
- **Deviation from the art-direction skill's default:** the fog colour is `skyHaze` lifted 30% toward `skyGlow`, not raw `skyHaze`. It's still identical to the sky at the horizon, which is the skill's actual requirement.

## Open problems / known bugs
- **Judge on a real screen:** the overall brightness and mood (now with streetlights), the strength of the light cones (`STREETLIGHT_CONE_STRENGTH`) and pools (`STREETLIGHT_POOL_STRENGTH`), how faint the lit windows are, and how noticeable the oil stains and cracks are. These are easy constant tweaks in `city.js` / `CONFIG`.
- Dust motes very close to the camera render as soft blobs. Reads as dust; reduce `DUST_SIZE` if it bothers you.
- Cable ends at alleys can hang in the air between buildings. Minor.
- **Phase 6 note:** BLOCK hover-cars should reuse `makeCarGeometry` (`js/city.js`) and add the red cue. The set dressing never uses the red/amber/white cues.
- Sparks near cables are deliberately left for Phase 7.

## Next steps (in order)
1. The user reviews and plays Phase 5. Restart `python3 serve.py` if the old server is still running.
2. If approved: commit (no Claude attribution). A suggested message: `Add Phase 5: ruined city, sky-matched fog, screens, cables, wrecks, dust`.
3. Then Phase 6 (themed obstacles), loading the `art-direction` skill first.
