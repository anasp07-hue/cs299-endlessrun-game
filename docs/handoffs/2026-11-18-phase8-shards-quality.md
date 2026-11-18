# Handoff: Phase 8, data shards & quality setting (2026-11-18)

Phase 8 is **implemented, tested, smoke-tested, reviewed (medium code review, all 7 findings fixed), and committed**. The user picked only two items: **data shards** and the **quality setting**. Touch/swipe controls and the separate profiling pass were dropped (ADR-0016, SPEC §9).

## Done
- **`js/logic/shards.js`** (pure):
  - Lays lines of 3–5 shards in the open stretch between rows, read from a new **gap log** in `spawner.js` (`gapFrom/gapTo/gapPrevOpen/gapNextOpen`, a 16-entry ring, `openMask`).
  - Uses its own RNG stream (`shardSeed`), so the obstacle sequence is unchanged.
  - Provides the pickup box, collection, and a 48-slot pool.
- **`run.js`:** `shards` + `shardCount`, both reset in `resetRun`. `resetRun` also places the run-up line, so it's there on the first frame. Collection runs **after** the hit check and is skipped on the step you get caught. It works in god mode too. `shardScore()` in `difficulty.js` gives 25 × the multiplier per shard.
- **`settings.js`:** `quality` (`'high' | 'low'`), plus `toggleQuality` and `qualityProfile`. Older mute-only saves still load.
- **View:**
  - `game.js`: a shard `InstancedMesh` (glowBlue octahedron that spins and bobs), a HUD ◆ counter, the shard total on game over, and a pickup chime (`audio.shard(step)`, climbing in pitch along a line) with a spark puff.
  - Quality: `applyQuality()` sets the pixel ratio (via `onResize()`), dust, and the `sparks.enabled` switch.
  - `index.html` / `style.css`: the quality buttons on the menu and pause screens sit in a `.settings-row` next to the sound button.
- **ADR-0016** written. **SPEC** §2, §3.7, §4 (plus a new Settings subsection), §9 Phase 8 (scope and acceptance checked), and §10 Q4 (resolved) are updated.

## Tests
- `node --test 'tests/*.test.js'` → **246 pass, 0 fail**.
- 21 new tests are in `tests/shards-quality.test.js`. Over 5 seeds × 240 s, up to max speed, they check that:
  - no shard ever overlaps an obstacle,
  - shard lanes are never BLOCKed in the next row,
  - the obstacle sequence is identical with shards present,
  - the pool never drops a shard.
  - They also cover collection by running and by sliding, a jump missing a shard, exact scoring against a twin run, a full reset, and quality parse/save/profile.
- Changed existing tests (explained):
  - Two settings tests in `juice.test.js` compared against the exact object `{ muted }`. The schema gained `quality`, so the expected objects now include `quality: 'high'`. The mute checks are unchanged, plus a new check that an old mute-only save still loads.
  - `run.test.js`'s reset snapshot now also captures the shard RNG state. This makes the test stricter.
- **Browser** (headless Chrome over CDP on the real GPU, `serve.py`, `?debug&seed=4`; script `smoke8.mjs` in the session scratchpad), 13/13 checks passed:
  - Defaults are HIGH at 1.5 px. Shards are placed and drawn.
  - 6 shards were collected, and the HUD and effects counts matched.
  - Switching to LOW from pause gives 1 px, no dust, no sparks, and is saved. LOW persists across a reload, and switching back to HIGH from the menu works.
  - The game-over screen shows the shard count, and Play Again resets it.
  - Max speed ran at 60.1 fps on HIGH and 60.0 fps on LOW, with about 102 draw calls.
  - There were zero console errors or warnings.
- I looked at the screenshots: the shards read as cold-blue diamonds, distinct from the obstacle cues, and the menu layout is fine.

## Code review (medium) findings, all fixed
1. A shard touched on the same step as a fatal hit was scored. Collection now runs after the hit check. The test was confirmed to fail on the old order.
2. LOW quality hid the dust but still computed it every frame. `city.update` now skips hidden dust.
3. `applyQuality` duplicated the resize code. It now calls `onResize()`.
4. Spark gating was spread across call sites. There is now one `sparks.enabled` switch inside `particles.js`.
5. Inline tuning numbers moved to CONFIG: `SHARD_SPIN`, `SHARD_BOB`, `SHARD_STREAK_TIME`, and `SHARD_VISUAL_W/H`. A test checks that the drawn shard plus its bob stays inside the pickup box.
6. `shardLane` hard-coded 3 lanes. It now takes `cfg.LANE_COUNT`.
7. The run-up line popped into view on the first step. It is now placed in `resetRun`.

The browser smoke test was re-run after the fixes: 13/13 passed, 60 fps on HIGH and LOW, about 102 draw calls. One run without `--autoplay-policy=no-user-gesture-required` logged "AudioContext was not allowed to start". That is a harness artifact: the script's synthetic clicks aren't real user gestures. With the flag (as in the first run) there are zero warnings.

## Open problems / not done
- Touch controls and a cross-browser pass (SPEC §8 lists Chrome, Firefox, Safari, Edge) were not done, by the user's choice. Only Chrome was tested.
- Nobody has played it by hand. Tune `SHARD_RUN_CHANCE`, `SHARD_POINTS`, and the chime volume by feel.

## Next steps
1. The user plays and tunes the shard and quality numbers if wanted.
2. Phase 8 is the last build phase in SPEC §9, so v1 is complete after that.
