# ADR-0008: Game state machine, single run object with full reset, and high-score storage

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 3 (SPEC §9)

## Context
Phase 3 adds the MENU / PLAYING / PAUSED / GAMEOVER flow (SPEC §4), Play Again with no page reload, and a persistent high score. The classic bugs here are state that survives a restart, duplicate event listeners after "Play Again", the key that starts a run also making the player jump, and storage that throws in private mode. CLAUDE.md rule 5 says game rules must live in pure, testable modules.

## Decision
1. **Pure state machine (`js/logic/state.js`).** A transition table (`nextState(state, cmd)`) lists the only legal moves; anything else returns `null` and is ignored. `commandFor(state, action, gameOverAge, cfg)` decides what a key means in each state. A key that starts a run maps to `PLAY` only, never `JUMP` as well. On game over, Enter/Space only restart after `GAMEOVER_INPUT_DELAY` (0.6 s), so a jump mashed at the moment of the catch can't skip the game-over screen. `game.js` has a single `dispatch(cmd)` that applies the transition and its side effects.
2. **One run object, one reset (`js/logic/run.js`).** All per-run simulation state (elapsed, speed, scroll, score, caught, player, spawner, scratch boxes) lives in one object created once per session. `resetRun(run, cfg, seed)` restores all of it, and `stepRun()` is the fixed step that `game.js` used to inline. A test checks that a reset after a full run is deep-equal to a freshly created run, so any new per-run state (Phase 4's stumble timer and chaser gap) must be added to `resetRun()` or the test fails.
3. **Pause = freeze interpolation.** On pause (and on catch), `freezeInterpolation()` sets the previous-step values equal to the current ones. The frozen frame then renders identically at any alpha, and resuming (with `stepper.reset()`) can't jump.
4. **High score (`js/logic/highscore.js`).** Key `neonWasteland.highScore`, stored as a whole number. `loadHighScore(storage)` / `saveHighScore(storage, v)` take a Storage-like object (or `null`) instead of touching `localStorage`, so every path, including a throwing or missing storage, is tested in Node. `game.js` reads `window.localStorage` inside `try/catch`. The score is saved only when strictly beaten. The HUD's BEST readout tracks the live score once you pass it.
5. **Allocation-free HUD.** Each score readout is a fixed set of text nodes, one per digit (`HUD_DIGITS` = 9). `writeDigits()` fills an int array, and a node's text changes only when its digit changes, using preallocated `'0'`–`'9'` strings. The HUD updates every frame with no string building.
6. **UI is HTML/CSS overlays** (SPEC §4). Buttons and listeners are wired once at startup. Focus is released on every state change. A button the player tabbed to handles its own Enter/Space outside PLAYING, so Tab → Main Menu → Enter goes to the menu.
7. **Mute toggle deferred to Phase 7.** SPEC §4 lists it on the menu, but there's no audio until Phase 7. A toggle that does nothing would be misleading, so it ships with the audio.

## Alternatives considered
- **State flags in `game.js` (`paused`, `caught`, …):** easy to get into impossible combinations, and not testable in Node.
- **Recreate the run objects on restart:** allocates on every restart and makes it easy to keep a stale reference (e.g. debug hooks pointing at the old spawner).
- **`textContent = String(score)` throttled to 10 Hz (the Phase 2 readout):** allocates a string 10×/s and makes the score update in visible steps.
- **Pause by skipping render interpolation:** leaves a sub-step (up to ~0.3 units at max speed) of backward jump when resuming.

## Consequences
- Restart bugs are caught by `tests/run.test.js` rather than by play-testing.
- Phase 4 must add the stumble and chaser state to `run.js`/`resetRun()`, and the catch "beat" can be added as a delay before `CMD.CAUGHT` is dispatched.
- Phase 7 adds the mute toggle to the menu, stored under `neonWasteland.settings`.
