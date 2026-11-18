# Handoff: Phase 4, characters & chaser (2026-11-18)

Phase 4 is **done but not committed**. Waiting for the user's review (CLAUDE.md rule 3). Don't start Phase 5 until the user says so.

## Done this session
- **Stumble rules (pure, `js/logic/chaser.js`, ADR-0011):**
  - Side clip vs head-on: it's a side clip if you're `moving` and the obstacle isn't in `restLane`.
  - `bounceBack()` in `player.js` returns you to `restLane`, drops queued moves, and locks lane input until you arrive (`bouncing`).
  - Each spawner slot has an `ignored` flag, so one obstacle can't hit twice.
  - The stumble window is 8 s.
  - Chaser gap: 12 → 3.8 (a lunge at 30 u/s), then eases back to 12 by the end of the window.
  - A head-on hit or a second stumble plays a 0.6 s catch beat (world frozen, input ignored via `acceptsInput(run)`) before `run.caught`. `run.caughtBy` records the cause.
- **Agent path (pure, `js/logic/trail.js`):** `run.trail` records the player's x/y/sliding every step. The Agent is drawn at the sample from `gap / speed` seconds ago, so he jumps, slides, and dodges what the Hacker did and never runs through obstacles.
- **Rigs:**
  - `js/logic/pose.js` (pure) holds the `RIG` dimensions, pose builders for both characters, blending, the speed-scaled run cycle, the hit/stumble overlay, and side-view FK used by the tests.
  - `js/characters.js` (view) builds the `THREE.Group` skeletons and the boxes, and holds `applyPose`.
  - The Hacker has a hood, a visor whose tips show from behind, and a backpack LED. The Agent has a suit, white collar, tie, sunglasses, hair, and pale hands, at 1.05× scale.
  - A dim cold `PointLight` follows the Hacker for readability (ADR-0012).
- **`game.js`:**
  - The placeholder box is gone.
  - `updateCharacters()` does the per-frame pose wiring (view-only state in `anim`, reset by `resetCharacterView()` on Play/Menu).
  - Gameplay keys are ignored during the catch beat, and the debug log now names the catch cause.
  - `window.__neon` exposes `hacker` and `agent` instead of `playerMesh`.
- **Tests:**
  - New `tests/chaser.test.js` (19 tests) and `tests/pose-trail.test.js` (13 tests).
  - A Phase 4 reset test was added to `run.test.js`.
  - The survival bot moved from `spawner.test.js` into the shared helper `tests/bot.js` (not a `*.test.js` file). It's the same code; `spawner.test.js` imports it.
- **New `CONFIG` keys:**
  - Stumble and chaser: `STUMBLE_WINDOW`, `CHASER_GAP_NORMAL`, `CHASER_GAP_STUMBLE`, `CHASER_CLOSE_SPEED`, `CHASER_CATCH_GAP`, `CATCH_TIME`, `TRAIL_STEPS`.
  - Animation: `RUN_CYCLE_BASE`, `RUN_CYCLE_PER_SPEED`, `STUMBLE_ANIM_TIME`, `POSE_BLEND_RATE`.
  - Lighting: `RUNNER_LIGHT_INTENSITY`, `RUNNER_LIGHT_RANGE`.

## Current state
- **Playable:** menu → play → stumble (bounce, Agent appears close behind and drifts back) → a second stumble or head-on hit → catch beat → CAUGHT → Play Again / Menu.
- **Files touched:**
  - Changed: `CLAUDE.md`, `.claude/skills/{test-review,art-direction}/SKILL.md`, `game.js`, `js/logic/{config,player,run,spawner}.js`, `tests/{run,spawner}.test.js`, `SPEC.md`.
  - New: `serve.py`, `js/logic/{chaser,trail,pose}.js`, `js/characters.js`, `tests/{chaser.test.js,pose-trail.test.js,bot.js}`, `docs/adr/0011-…`, `docs/adr/0012-…`, this handoff.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 183 / ℹ pass 183 / ℹ fail 0` (was 150).
- Key fairness test: a bot deliberately side-clips a BLOCK once (with its own lane clear), gets bounced back, and survives full 4-minute runs on 18 seeds. Clips range from about 25 s to past 200 s (max speed).
- Smoke test (test-review skill), run in **headless Chrome over CDP**, because the Chrome extension wasn't connected:
  - Zero console errors or warnings in the full regression loop (menu → play → lanes/jump/slide → pause/resume → die → Play Again → die → Main Menu → refresh: the high score of 59 persisted).
  - Two real side clips via key events: the first stumbled (gap 12 → 3.81 in about 0.25 s, bounced back to x = 0). The second, 3.2 s later, played the catch beat, then "CAUGHT (second stumble)".
  - A head-on hit gives "CAUGHT (head-on)". Pause during the stumble window freezes the gap and timer exactly.
  - Max speed: 41 draw calls, 452 triangles, 60.8 fps even on CPU-only SwiftShader.
  - Screenshots looked at: run, slide, jump, stumble close-up, catch beat, game over, and max speed.

## Decisions made
- **ADR-0011:** stumble classification, bounce, the chaser gap curve, the catch beat (a deviation from "run ends immediately"), and the Agent following the player's path.
- **ADR-0012:** the `pose.js` / `characters.js` split, the rig look, and the runner light.
- **SPEC.md:**
  - §2 lists the new modules.
  - §3.6 has the exact rules and numbers.
  - §5 has notes for both characters.
  - The §9 Phase 4 checkboxes are ticked.

## Open problems / known bugs
- **Hacker readability is "OK", not great.** He reads as a dark figure with a lit hood/shoulders, the LED strip, and visor tips. In headless SwiftShader he's still quite dark at rest. Worth checking by eye on a real GPU. The Phase 5 lighting pass may want a stronger rim, or to rebalance the runner light.
- **The camera sees both characters from behind**, so the Agent's sunglasses and tie (front details) are never visible in play. He's identified by the white collar, the hair, and the pale hands. Possible later polish: a brief camera turn on the catch beat.
- **The Agent's reach pose isn't visible from behind.** The catch reads through his position, with the Hacker thrown back.
- A bounce can still lead into an obstacle in your rest lane if you dodged out of trouble into a side clip. That's by design (ADR-0011).
- Carry-overs:
  - Revisit the `SLIDE_TIME` feel now that the slide animation exists. It looked fine in screenshots; not judged in hand play.
  - Pixel ratio on monitor change (Phase 8).
  - Menu attract mode (Phase 8).
- The Chrome extension was disconnected again. The CDP fallback driver used this session was a scratch file (not in the repo): Chrome is launched with `--headless=new --use-angle=swiftshader --enable-unsafe-swiftshader --remote-debugging-port=9333 --user-data-dir=<scratch>`.

## After review: dev server (2026-11-18)
- The user reported that Play did nothing in normal Safari and Chrome windows, while it worked in a private window. The cause was cached Phase 3 modules: plain `http.server` sends no cache headers, so the new `game.js` imported `acceptsInput` from a stale `run.js`. That's a SyntaxError, so the whole script failed. Reproduced it exactly by serving the old `run.js` alongside the new `game.js`.
- Added `serve.py` (standard library only, `Cache-Control: no-store`, localhost by default, with `--lan` to reach it from other devices). CLAUDE.md, SPEC §2, the test-review skill, and the art-direction skill now say `python3 serve.py`.

## Pre-commit code review (2026-11-18)
- **Fixed:**
  - Pausing (Esc/P, the pause button, or blur) during the catch beat could lead to Restart / Main Menu and skip the game-over screen. Pausing is now ignored during the beat; checked in the browser.
  - `ignored` is now scoped to the bounce (`run.clipSlot`), so a clipped obstacle can't become walk-through if sizes change.
  - Catch progress and "Agent in view" are now pure helpers in `chaser.js`, used by `game.js`.
  - The magic numbers are now in `CONFIG` (`AGENT_AIR_Y`, `CATCH_REACH_AT`).
  - `spawner.test.js` `playRun` has an accurate comment: it's deliberately stricter than `stepRun`.
- **Not changed:**
  - A bounce into trouble in your own lane is by design (ADR-0011).
  - `fromLane` during a bounce only matters if the input lock is ever removed.
  - The runner light's cost is within the skill's 2–3 small lights budget; measured 60 fps.
- Tests: 185 / 185 pass.

## Next steps (in order)
1. The user reviews and plays Phase 4. In particular, judge Hacker readability, the stumble feel, the 0.6 s catch beat, and the 3.8 stumble gap on a real screen.
2. If approved: commit (no Claude attribution, per CLAUDE.md rule 1). A suggested message: `Add Phase 4: Hacker and Agent rigs, side-clip stumble, chaser and catch beat`.
3. Then Phase 5 (wasteland environment), loading the `art-direction` skill. Keep the runner light in mind during the lighting pass.
