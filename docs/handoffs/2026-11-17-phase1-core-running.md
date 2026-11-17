# Handoff: Phase 1, core running (2026-11-17)

## Done this session
- **Fixed-timestep loop** (ADR-0005): `js/logic/loop.js` `createFixedStepper(1/120)`, capped at 8 steps per frame. Rendering interpolates between the last two simulation states with `alpha()`.
- **Player rules** (`js/logic/player.js`): a plain state object, mutated in place with no allocations.
  - Lanes: 0.12 s ease-out per lane, up to 2 queued moves, reversing mid-move turns straight back, pressing opposite to a queued move cancels it, and moves off the road edge are ignored. `fromLane` tracks the lane being left, which Phase 4 needs for side clips.
  - Jump: physics derived from `JUMP_HEIGHT` 2.2 and `JUMP_TIME` 0.7, integrated with velocity Verlet so the arc is exact at any step size. No double jump. A 0.1 s jump buffer before landing. Jumping cancels a slide.
  - Slide: 0.7 s, hitbox height 1.8 → 0.8. Pressed in the air, it fast-falls at 25 units/s and slides on landing. In the air, the latest of jump/slide wins.
  - `resetPlayer()` resets every field. Phase 3's `resetRun()` should call it.
- **Ground** (`js/logic/world.js` `segmentZ`): 10 segments × 20 units, all positioned from one shared `scroll` value, so they never drift apart. A segment wraps only once its far edge passes `GROUND_BACK_Z` (15), so the near edge of the road is always behind the camera.
- **Input** (`js/logic/input.js`): `KeyboardEvent.code` → action. In `game.js`, auto-repeat is ignored, and `preventDefault` is called only for game keys.
- **`game.js`**: the Phase 0 test cube was removed. The scene now has the road (a single shared canvas texture with asphalt speckle, edge lines and dashed lane dividers), a static floor beyond the road, the player as a cyan placeholder box with feet at y = 0 that is scaled down while sliding, a hemisphere light plus a sun, and a camera behind and above that follows 55% of the player's x with frame-rate-independent `damp()`. Speed is a constant `SPEED_START` = 12 (the ramp is Phase 2).
- **Palette** (`js/palette.js`) from the art-direction skill. `style.css` mirrors the UI colors as CSS custom properties, and `tests/palette.test.js` keeps them in sync. This resolves the duplicated-background nit deferred from the Phase 0 code review.

## Current state
- Playable? Yes, as a movement sandbox. Serve with `python3 -m http.server 8000` and open http://localhost:8000. ←/→ (A/D) change lanes, ↑/W/Space jumps, ↓/S slides or fast-falls. There are no obstacles and no way to lose yet (Phase 2).
- Files touched: `game.js`, `style.css`, `js/palette.js`, `js/logic/{config,loop,math,world,player,input}.js`, `tests/{player,world-loop,palette}.test.js`, `docs/adr/0005-fixed-timestep-loop.md`, `SPEC.md`.
- Not committed yet.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 68 / ℹ pass 68 / ℹ fail 0` (after the code-review fixes)
  - Includes a seeded fuzz test: 10 seeds × 20 s of random input, checking the invariants (lane in range, x within the road, resting x exactly on a lane, y ≥ 0, apex ≤ 2.2, never sliding in the air).
  - During development the tests caught a real bug: the first `segmentZ` formula let the road's near edge come in front of the camera (to z ≈ −5), which would have left a visible gap behind the player.
- Smoke test (test-review skill): **done in real Chrome** via Claude-in-Chrome, with real key presses.
  - Left → lane 0, x = −2.5. A quick Right-Right → lane 2, x = 2.5. A jump reached y = 1.42 at 0.3 s, and a mid-air screenshot shows the box clearly in the air.
  - Slide: scale.y = 0.444 (0.8 / 1.8), then back to 1 after it ends.
  - Fast-fall from y = 1.8: vy = −25, landed at 0.27 s instead of 0.7 s, and went straight into a slide.
  - Holding Left (1 press + 4 auto-repeats) moves exactly one lane. `preventDefault` applies to Space but not to non-game keys.
  - Scroll rate: 12.10 units in 1.01 s at 121 fps (expected 12.06).
  - After 77 units of scrolling: 10 segments, all exactly 20 apart, near edge z = 31.8, far edge z = −168.2.
  - Resize to 800×719: aspect 1.113 matches, and the canvas is 1200×1078 (pixel ratio capped at 1.5 on a 2× screen).
  - Draw calls: 11. Console: 0 messages from page load onward.
- Static checks: no URLs, no allocations in `render`/`loop`/`simulate`/`onKeyDown`, no DOM or THREE use in `js/logic/`, and 2 listeners, each added once.

## Code review (`code-review` skill, before commit)
Found 9 items:
- **Fixed (7):**
  1. Ctrl/Cmd/Alt + a game key was swallowed. Browser shortcuts such as Cmd+← (Back) now pass through. The rule lives in the pure `actionForKeyEvent()` and is tested.
  2. The road texture's lane dividers were hard-coded for 3 lanes. They're now placed with `laneX()`.
  3. The lane queue was fixed at 2 slots, so `LANE_QUEUE_MAX` had no effect above 2. The queue is now sized from config, shifted in order, and tested with 3 slots.
  4. The 400-unit floor showed bare sky at the edges of 32:9 windows. It's now `CONFIG.FLOOR_SIZE` = 1200, with a test against the far-plane width.
  5. After a mid-move reversal, `fromLane` can be a lane the player never reached. Added `restLane` (the last lane actually reached), which Phase 4's stumble should bounce to. Tested, and added to the fuzz invariants.
  6. The 8-steps-per-frame cap was hidden in a default argument. It's now `CONFIG.SIM_MAX_STEPS`.
  7. Config comments claimed fog already existed. Corrected.
- **Deferred to Phase 2 (1):** `PLAYER_WIDTH/HEIGHT` drive the placeholder mesh. Collision must use a hitbox about 15% smaller than these (game-systems skill). The config comment now says so.
- **Skipped (1):** `jumpGravity()` is recomputed each airborne step. It's a few multiplications of constants, so caching it isn't worth the extra state.
- After the fixes, a re-check in Chrome showed the new code loaded, Left → lane 0 with restLane 0, Cmd+→ and Alt+→ ignored and not `preventDefault`ed, lane dividers aligned, 10 draw calls, and 0 console messages.

## Decisions made
- ADRs written: **0005** (fixed-timestep simulation at 1/120 with render interpolation).
- SPEC.md changes:
  - §2 tree lists the new modules.
  - §3.2 adds the lane-queue details (reversing and cancelling).
  - §3.3 controls table adds exact numbers, the jump buffer, no double jump, and "latest request wins" in the air.
  - §7.1 loop pseudo-code is replaced with the fixed-step version.
  - Phase 1 acceptance is checked off.
  - No gameplay numbers changed. The values already in SPEC and the skill were used as written.

## Open problems / known bugs
- There's no fog yet (Phase 5), so the floor ends at the camera far plane with a hard horizon line. That's expected for gray-box.
- The player is a box, so the jump and slide only read as position and scale changes. Characters come in Phase 4.
- **User feedback:** getting back up from a slide feels a bit slow. `SLIDE_TIME` is still 0.7 (SPEC value). The user will judge it again once the Phase 4 slide/stand-up animation exists. Revisit then, and update SPEC §3.3 if the value changes. A HIGH obstacle must still be clearable at max speed.
- Deferred from the Phase 0 code review: the pixel ratio is only re-read on `resize` (Phase 8).
- During the smoke test, an old `http.server` from earlier in the session was still holding port 8000 and then exited partway through. That caused one blank-page load. It was an environment issue, not a game bug. Use a fresh server.

## Next steps (in order)
1. The user reviews Phase 1 (plays it) and commits.
2. Phase 2 (SPEC §9): color-coded LOW/HIGH/BLOCK placeholder obstacles with pooling, a pattern spawner (seeded RNG, fairness invariants from the game-systems skill), AABB collision using `playerHeight()`, head-on hit = game over (console log + freeze for now), speed ramp 12 → 35, and a distance score.
   - Obstacles need `prevZ`, or should be placed from the shared scroll, for interpolation (ADR-0005).
   - Run collision checks every fixed step.
