# Handoff: Phase 4 kickoff, characters & chaser (2026-11-17)

Read this first when starting Phase 4. Phase 3 is **done, committed (`33f2293`), and pushed**. Its full write-up is `2026-11-17-phase3-states-gui-highscore.md`.

## Where things stand
- **Game:** *Apocalypse Run* (renamed from Neon Wasteland, ADR-0010). The `localStorage` keys keep the `neonWasteland.` prefix on purpose.
- **Look:** cold and eerie, not neon (ADR-0009):
  - Blue-black haze sky, pale `moonlight` key light.
  - `glowBlue` / `glowPale` / `duskViolet` accents.
  - Obstacle cues stay warm: LOW amber, HIGH white, BLOCK red.
  - **Use the new palette tokens.** `neonCyan` / `neonMagenta` no longer exist.
- **Playable loop:** menu → play → pause/resume (Esc/P, auto-pause on blur) → caught → Play Again / Main Menu, with no reloads. The high score persists.
- **Every hit currently ends the run immediately**, both head-on and side clip. That's what Phase 4 changes.
- **Tests:** `node --test 'tests/*.test.js'` → `ℹ tests 150 / ℹ pass 150 / ℹ fail 0`.
- **Working tree:** clean, and `main` matches `origin/main`.

## Phase 4 scope (SPEC §9; don't go beyond it)
1. Procedural **Hacker** (runner) and **Agent** (chaser) rigs with run, jump, slide, and stumble animations. They replace the placeholder box.
2. The **side-clip stumble**: bounce back to the previous lane, and the Agent closes in. A **second stumble within ~8 s means caught**.
3. **Acceptance:** characters replace the boxes, and stumbling visibly brings the Agent closer.

Not in Phase 4: buildings/fog/screens (Phase 5), themed obstacles (Phase 6), audio/camera shake (Phase 7).

## Load first
- `game-systems` skill: the head-on vs side-clip rule, chaser gap, stumble window, catch beat.
- `art-direction` skill: rig structure, Hacker and Agent looks, pose language, palette.

## What already exists to build on
- `js/logic/player.js`:
  - `restLane` is the last lane the player actually stood in. **The stumble must bounce back to `restLane`, not `fromLane`.** After a mid-move reversal, `fromLane` can be a lane the player never reached.
  - `moving`, `lane` (the target), `fromLane`, and `laneT` give you what you need to classify a hit.
- `js/logic/run.js`:
  - All per-run state lives here, and **`resetRun()` must reset anything new**: stumble timer, chaser gap, ignored-obstacle flags, catch-beat timer.
  - `tests/run.test.js` ("reset equals fresh") fails if something is forgotten. Extend `snapshot()` only if the new state isn't plain data.
  - `stepRun()` is where hit classification goes. Right now any hit sets `caught`.
- `js/logic/spawner.js`:
  - `findHit()` returns the **first** overlapping slot.
  - A side clip must make that obstacle non-colliding for the rest of its pass (e.g. a per-slot `ignored` flag cleared on spawn and reset), so it can't hit twice.
- `js/logic/state.js` / `game.js`:
  - `CMD.CAUGHT` is dispatched as soon as `run.caught` is set.
  - For the Agent's catch "beat", delay that dispatch by a short timer in `run.js`. The run stays PLAYING but frozen while the Agent closes the gap, then the game dispatches CAUGHT. Keep input ignored during the beat.
- `game.js` renders the player from `run.player` with interpolation (`prevX`/`prevY`). The placeholder `playerMesh` box is what gets replaced. Obstacles are 3 `InstancedMesh`es, and current draw calls are about 13.

## Suggested plan (in order, with tests after each stage, per CLAUDE.md rule 4)
1. **Logic first: `js/logic/chaser.js`** (pure).
   - Hit classification:
     - **Side clip:** the player was `moving` and the obstacle is in the lane being entered or crossed.
     - **Head-on:** otherwise.
   - Stumble timing: `STUMBLE_WINDOW` ~8 s, and a second stumble inside it means caught.
   - Chaser gap: normal ~12, drops to ~3 on a stumble, then recovers over the window.
   - Put new numbers in `CONFIG`.
   - Tests: classification cases (straight-on, mid-move into the target lane, a reversal mid-move), a double stumble within or outside the window, gap recovery being monotonic, and the reset-equals-fresh test still passing.
2. **Wire into `stepRun()`.**
   - A side clip sets `targetLane = restLane` via a new `player.js` helper (e.g. `bounceBack(p, cfg)`, which also clears the queue), marks the obstacle ignored, and starts the stumble.
   - A head-on hit (or a second stumble) starts the catch beat.
   - **Re-check fairness:** a bounce-back must never put the player into a dead end. Add a bot test that deliberately side-clips once, then must survive.
3. **Rigs (view only, in `game.js` or a new `js/characters.js`** if `game.js` is getting long; SPEC §2 note).
   - `THREE.Group`s with pivots: hips, torso, head, upper/lower arms and legs. About 1.8 units tall, feet at y = 0. Low-poly primitives with shared materials.
   - **Hacker:** near-black hoodie with the hood up (`#111114`-ish) and a thin emissive **`glowBlue`** visor. Leans forward, loose. Slide = leaning back and low; jump = knees tucked.
   - **Agent:** charcoal suit, white collar, thin tie, sunglasses, pale skin. Upright, stiff, piston-like arms.
   - Run-cycle frequency scales with `run.speed`. The hitbox stays as it is (logic), and the visuals match it.
   - **Readability on the cold scene:** a near-black Hacker on a blue-black sky may disappear. Plan a subtle rim/back light or a faint `glowPale` edge, and check with screenshots at start speed and max speed.
4. **Chaser presentation.** Place the Agent at `z = +chaserGap` (behind the player, toward the camera). Normally he's off-screen or far back; after a stumble he's close and visible. Watch the camera near plane and make sure he never blocks the view of the player.
5. Update SPEC (§3.6 numbers, the Phase 4 checkboxes, and §2 if new modules are added). Write an ADR if hit classification or the catch beat departs from SPEC. Run the `test-review` skill with an in-browser smoke test. Write the Phase 4 handoff, then stop for the user's review.

## Known carry-overs and risks
- `SLIDE_TIME` (0.7 s) feel: revisit once the slide animation exists.
- The pixel ratio is only re-read on resize (Phase 8).
- The menu shows a static road (an attract mode would be Phase 8 polish). Overlay buttons aren't auto-focused, by design for now (Phase 8 accessibility pass).
- The Chrome extension disconnected late in the last session. Headless Chrome over CDP worked as a fallback for screenshots and scripted checks: launch Chrome with `--headless=new --use-angle=swiftshader --remote-debugging-port=9333`, then drive it from a scratch Node script using the global `WebSocket`. `?debug` exposes `window.__neon` (`dispatch`, `run`, `debug.god`, `setElapsed`).
- Don't commit or push unless the user asks, and never add Claude attribution to commits (CLAUDE.md rule 1).
