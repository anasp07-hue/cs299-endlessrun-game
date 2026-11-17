# Handoff: Phase 2, obstacles, collision, difficulty (2026-11-17)

## Done this session
- **Spawner** (`js/logic/spawner.js`, ADR-0006):
  - 32 patterns written as strings (`'B.B'`, `'LBH'`, …), tiered by `minDifficulty` (0 / 0.15 / 0.35 / 0.55) and chosen by weight with the seeded RNG.
  - Row spacing is worked out in seconds at the speed the player will have on arrival, and never drops below reaction (0.55 s) + full jump (0.7 s) + 0.12 s per lane change needed.
  - Fixed pool of 48 slots. If it's full, the row is skipped and counted in `spawner.dropped`; it never crashes.
- **Collision** (`js/logic/collision.js`):
  - Plain-number AABBs, with no allocation per step. Touching faces don't count as a hit.
  - The player hitbox is `HITBOX_SCALE` 0.85 × the visual size, with the feet kept at y, and is shorter while sliding.
  - Collisions are checked on every 1/120 s step.
- **Difficulty & score** (`js/logic/difficulty.js`):
  - Speed 12 → 35 at 0.11 units/s², hitting the cap at about 209 s.
  - Difficulty goes 0 → 1 over 1,500 units (about 1:30 into a run).
  - Multiplier is ×1.0, plus 0.1 every 500 units. Score = speed × dt × multiplier.
- **game.js**:
  - One `InstancedMesh` per obstacle type (3 draw calls), colored LOW = hazard amber, HIGH = spark white, BLOCK = danger red, and positioned from the shared interpolated scroll.
  - A hit freezes the run (prev = current, so nothing wobbles), ignores further input, and logs `[Neon Wasteland] CAUGHT …` with the score and seed.
  - A temporary score/speed readout in `#hud`, updated at 10 Hz.
  - Dev aids:
    - `?seed=N` replays a run exactly.
    - Under `?debug`, `__neon.debug.god = true` turns off game over.
    - Under `?debug`, `__neon.setElapsed(220)` jumps to max speed.
- **Tuning change:** `HIGH_TOP` is 2.5 instead of the skill's suggested 3.0. At 3.0 the HIGH box looked like a wall rather than a bar to slide under. 2.5 still sits above the 2.2 jump apex, and a test pins that.

## Playtest feedback (user)
- "Big sections where nothing is there." Measured over 10 seeds, the first 30 s had 0.53 obstacles/s and about 32 units of empty road between rows.
- Tuned: `ROW_TIME_EASY` 2.2 → 1.6 s; `B.B`/`LLL`/`HHH` unlocked from the start, plus new `L.L` and `H.H`; tiers unlock sooner (0.15 / 0.35 / 0.55); `DIFFICULTY_DISTANCE` 2000 → 1500.
- Result: 0–30 s now has 0.87 obstacles/s (+64%) and 30–60 s has 1.31 (+56%). From 2 minutes on it's unchanged, at about 1.75 obstacles/s.
- From 2 minutes on, spacing sits at the fairness floor (reaction 0.55 s + jump 0.7 s ≈ 1.3 s between rows). That's about 45 units of road at 35 units/s. Making it denser would mean refining the floor per action pair (e.g. after a slide, the next row only needs reaction time). That's a design change: ask the user first if late-game spacing feels empty.

## Playtest feedback round 2 (user): "too uniform … more chaotic but still possible … slightly shorter"
- Planned with the `game-systems` skill, then implemented. ADR-0007 supersedes ADR-0006's spacing rule.
  - **No-dead-end fairness:** from every open lane, some lane of the next row is reachable. The time needed depends on the actual actions involved (reaction 0.55 s; 0.7 s only after a jump when the next obstacle needs a jump or slide; +0.12 s per lane), instead of a fixed 1.25 s floor between all rows.
  - **Gap jitter ±30%.** Base gap is now 1.35 → 0.95 s (it was 1.6 → 1.3).
  - **Rows staggered** in depth by 0.1–0.3 s.
  - **Random lane-by-lane rows**, 15% → 40% of rows. Never all BLOCK, never empty.
- Measured over 10 seeds:
  - Obstacles per second: 1.15 in the first 30 s (was 0.87), about 2.3 after 2 minutes (was 1.75).
  - Gaps range from about 0.5 to 1.8 s.
  - 36% of rows are random.
- Bug found and fixed along the way: the arrival-speed estimate never met its exact convergence test and fell back to `SPEED_MAX`, which made early rows about 3.3 s apart. It now stops within 0.01 units/s and adds that as a cushion.
- Tests rewritten for the new rules (explained to the user per rule 4):
  - The old "rows ≥ 1.25 s apart" check is replaced by a "no dead ends" check on the obstacles that actually spawned, at the real arrival speed.
  - Kept unchanged: "never 3 BLOCKs" and "LOW then LOW/HIGH in the same lane ≥ a full jump".
  - New tests: rows never overlap; the rhythm varies (coefficient of variation > 0.15); more than 25% of rows are staggered; random rows appear and include combinations not in the table; late rows average under 1.25 s apart.
  - The bot now picks lanes it can actually reach (`canReach`) and handles staggered obstacles.
  - Manual check (not committed): a greedy nearest-lane bot also survives 12/12 seeds, so the obvious lane never led into a trap. A bot that never slides is caught 12/12.
- **Round 3 (user): "one lane can't be open with no obstacles for more than one traversal across a row".** Implemented as **no idle lanes**: a lane that was empty in row k must have an obstacle in row k+1 (`emptyLaneMask`, `fillsLanes`, `pickPattern(…, mustFill)`, `randomRow(…, mustFill)`). With 2+ lanes forced, a random row is used 50% of the time (`RANDOM_ROW_FORCED`) so `LLL`/`HHH` don't dominate early. That brought them from 28% down to 24% of early rows, and early distinct layouts went from 37 to 44.
  - Tested over 12 seeds × 260 s: no lane is ever empty two rows in a row. The bot still survives 12/12. New unit tests cover the required-lane filtering in `pickPattern` and `randomRow`.
  - Density now: 1.36 obstacles/s in the first 30 s (2.1 per row), about 2.47 after 2 minutes (2.44 per row).
  - In-browser check: not repeated for this round, since it's a logic-only change (`game.js` untouched) and Node imports the same module the browser loads. Play-test it.
- **Code review before commit** found 10 items. All were verified, and 10 were fixed or addressed:
  1. **(Serious)** Staggered obstacles in the lane you leave or a lane you cross could cut the reaction window to 0.28 s (reproduced). The reach rule is now path-aware (`arrivePathS`) and shared with the checks via `reachNeed`. A bot that waits `REACTION_TIME` before changing lanes then exposed a second gap: the jump's ~0.08 s to clear a LOW wasn't budgeted. It's now included (`actionLead`, from `jumpClearTime`). An independent checker confirms ≥ 0.55 s of reaction over 20 seeds × 240 s.
  2. Rows popped into view at 120 units, inside the 150 far plane. `SPAWN_AHEAD` is now 160, with a test. That pushed peak live obstacles to 26, so `MAX_OBSTACLES` went 48 → 64 to keep 2× headroom; the test was kept as is.
  3. `LANES = 3` was hard-coded while CONFIG has `LANE_COUNT`. `createSpawner` now throws for anything other than 3 lanes, with a test.
  4. `setElapsed()` debug left rows planned for the old speed. It now restarts the spawner from the current position (`resetSpawner(…, startS)`), verified in Chrome.
  5. The reach formula was duplicated in `minAnchor` and `canReach`. Both now share `reachNeed`.
  6. The readout's dead `force` parameter is removed. The readout still builds a small string at 10 Hz, which is documented. **Phase 3's HUD should avoid even that** (e.g. preallocated digit strings).
  7. The ±10 collision cull is now derived from `rowMargin`. `SPEED_EPS` and `MAX_REROLLS` are named module constants (numeric tolerances, not gameplay tuning).
  8. Misplaced JSDoc fixed.
  9. Dead `hasLast` removed. `randomRows` is now only counted for rows that actually spawned (tested).
  10. SPEC said 10 seeds while the test runs 12. Fixed.
  - Density after the fixes: about 1.36 obstacles/s in the first 30 s and about 2.43 after 2 minutes. Gaps range 0.60–1.83 s.

## Current state
- Playable? Yes, a full run until you get caught. Refresh the page to play again (Phase 3 adds Play Again and the real HUD).
- Files touched:
  - New: `js/logic/{spawner,collision,difficulty}.js`, `tests/{spawner,collision-difficulty}.test.js`, `docs/adr/0006-obstacle-spawner-fairness.md`.
  - Changed: `js/logic/config.js`, `game.js`, `index.html` (`#dev-readout`), `style.css`, `SPEC.md`.
- Not committed yet.

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 107 / ℹ pass 107 / ℹ fail 0` (after the chaos rework); `ℹ tests 111 / ℹ pass 111 / ℹ fail 0` after the no-idle-lanes rule; **`ℹ tests 118 / ℹ pass 118 / ℹ fail 0` after the code-review fixes (final)**
- The key tests:
  - **Bot fairness test:** a perfect-reaction bot plays 4-minute runs (past max speed and max difficulty) on 10 seeds with the real player, spawner and collision code, and is never caught.
  - **Sabotage check** (a one-off script, not committed): a bot that never slides, or reacts at 0.05 s instead of centering its action, gets caught at 9–23 s. So the bot test is a real check.
  - **Timing test:** over 12 seeds × 260 s, consecutive rows are always at least the required number of seconds apart.
  - Every obstacle needs exactly its one action: LOW needs a jump, HIGH a slide (it can't be jumped), BLOCK a dodge.
  - No tunnelling at max speed.
  - At most a dozen or so obstacles are ever live, against 48 slots.
- Smoke test (test-review skill): **done in real Chrome.**
  - `?seed=1` with no input: rows spawned and the score counted up. The player was caught at 9.53 s by a HIGH obstacle in the center lane, matching the Node simulation for the same seed (9.5 s).
  - After the hit, time and scroll stayed frozen, the readout showed `CAUGHT — score 119 — refresh to run again`, and keys were ignored.
  - `console.info` was called exactly once. The console tool showed the message twice in one read, but a counter proved that was a tool artifact.
  - At max speed (god mode, `setElapsed(220)`): 35 units/s, 120 fps, worst frame 9.4 ms, 12 draw calls, 0 rows dropped. LOW (amber) and BLOCK (red) are easy to tell apart.
- Static checks: no URLs; no allocations in `render`/`loop`/`simulate`/`onKeyDown` or in the hot logic functions; logic modules are pure; 2 listeners, each added once.

## Decisions made
- ADRs written: **0006** (string patterns, spacing in seconds, fixed pool that skips a row when full, InstancedMesh rendering, every hit ends the run until Phase 4).
- SPEC.md changes:
  - §2 tree lists the new modules.
  - §3.4 adds the spacing rule, pattern notation and obstacle sizes.
  - §3.5 adds the exact speed and difficulty numbers.
  - The Phase 2 note says side clips also end the run until Phase 4.
  - Phase 2 acceptance is checked off.
  - Numbers that went from "about" to exact: start speed 12, accel 0.11, cap 35. These are the existing SPEC and skill values.

## Open problems / known bugs
- There's no restart without a refresh. That's expected; Phase 3 adds the state machine and `resetRun()`. `resetPlayer()` and `resetSpawner()` already exist for it. Remember to also reset `elapsed`, `speed`, `scroll`, `prevScroll`, `score`, `caught`, `cameraX` and the stepper (`stepper.reset()`), and to pick a new seed.
- The temporary `#dev-readout` should be replaced by the Phase 3 HUD (score top-left, high score top-right, pause button).
- HIGH obstacles are pale boxes floating at head height. They read as "duck", but the themed wires/beams come in Phase 6.
- Carried over: `SLIDE_TIME` feel to revisit with the Phase 4 animation; pixel ratio is only re-read on resize (Phase 8).

## Next steps (in order)
1. The user plays Phase 2 and reviews it, then the code review and commit.
2. Phase 3 (SPEC §9):
   - Menu, real HUD, pause (Esc/P, plus auto-pause on blur only while PLAYING, and `stepper.reset()` on resume), and a game-over screen with Play Again (also Enter/Space, without that key causing a jump).
   - A single `setState()` and a full `resetRun()`.
   - `localStorage` high score (`neonWasteland.highScore`, wrapped in try/catch, saved only when beaten, with pure parsing in `js/logic/`) and the "NEW HIGH SCORE!" badge.
   - Load the `game-systems` and `art-direction` skills first.
