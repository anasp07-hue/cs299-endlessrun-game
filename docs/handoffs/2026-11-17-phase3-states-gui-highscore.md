# Handoff: Phase 3, game states, GUI, high score (2026-11-17)

## Done this session
- **Pushed Phases 0–2 to GitHub** first (they were committed locally but never pushed).
- **New pure logic modules** (ADR-0008):
  - `js/logic/state.js`: the transition table (`nextState`), `startsNewRun`, `commandFor(state, action, gameOverAge, cfg)` (what a key means per state), and `shouldAutoPause`.
  - `js/logic/run.js`: one run object (`createRun`), a full `resetRun(run, cfg, seed)`, the fixed step `stepRun(run, h, cfg, god)` (moved out of `game.js`), and `freezeInterpolation`.
  - `js/logic/highscore.js`: `HIGH_SCORE_KEY`, `parseHighScore`, `finalScore`, `isNewHighScore`, and `loadHighScore`/`saveHighScore` that take an injected storage (or `null`).
  - `js/logic/hud.js`: `writeDigits` and `DIGIT_STRINGS` for an allocation-free HUD.
- `js/logic/input.js`: added `PAUSE` (Esc, P) and `CONFIRM` (Enter, NumpadEnter). Cmd/Ctrl+P still goes to the browser.
- `js/logic/config.js`: `GAMEOVER_INPUT_DELAY` 0.6 s and `HUD_DIGITS` 9.
- **`index.html` / `style.css`:**
  - Main menu: title, Play, high score, controls cheat-sheet, and an Enter/Space hint.
  - HUD: SCORE at top-left, BEST at top-right, and a pause button.
  - Pause screen: Resume, Restart, Main Menu.
  - Game-over screen: CAUGHT, score, high score, a pulsing NEW HIGH SCORE! badge, Play Again, Main Menu.
  - Styled neon-on-dark with a system monospace font only (art-direction skill), and `prefers-reduced-motion` turns off the badge pulse.
  - The temporary `#dev-readout` is gone.
- **`game.js`:**
  - A single `dispatch(cmd)` handles every state change and its side effects: reset, freeze, save the high score, show the right overlays, release focus.
  - Auto-pauses on window `blur` and `visibilitychange` (hidden), only while PLAYING.
  - Simulates only while PLAYING and renders in every state.
  - The HUD updates every frame, and only digits that changed are touched.
  - The CAUGHT console log now only appears under `?debug`.
  - `__neon` debug hooks now expose `run`, `dispatch`, `getState`, `getHighScore`, `getGameOverAge`, and `setElapsed`.

## Review round 1 (user): "lean away from cyan and magenta neon … cooler blue … chill/eerie colours"
- **ADR-0009.** The whole palette went cold: a blue-black haze sky, a pale `moonlight` key light instead of the warm sun, and cooler asphalt, lane lines, and concrete.
- `neonCyan`/`neonMagenta` were removed and replaced by `glowBlue` `#7fb6e6`, `glowPale` `#c4d7e6`, and `duskViolet` `#6a5f92`.
- The obstacle cues (amber / white / red) were kept for readability.
- UI restyled: blue-black panels, hairline borders, faint glows, and a slow "breathe" on the badge.
- SPEC §4/§5 and the art-direction skill (palette table, mood, lighting, UI style) are updated to match.
- Checked with headless Chrome screenshots of the menu, the in-game view (god mode, seed 4), and the game-over screen. Obstacles still pop clearly against the cold scene. (The Chrome extension had disconnected, so these were captured over CDP from a scratch script.)
- Tests: `ℹ tests 147 / ℹ pass 147 / ℹ fail 0`.

## Review round 2 (user): "also change name to Apocolypse Run"
- Renamed to **Apocalypse Run** (standard spelling; the user was told and can ask for the other spelling). See ADR-0010, which resolves SPEC §10 question 1.
- Updated: the page title, the menu heading (APOCALYPSE / RUN, with the font size clamped so it fits narrow screens), the `game.js` header and debug log prefix, the SPEC and CLAUDE.md titles, and the 3 project skills.
- **Kept the `neonWasteland.highScore` storage key** (commented in `highscore.js`), so saved scores survive.

## Code review before commit (`code-review medium`): 8 findings, 5 fixed, 3 skipped with reasons
1. **Fixed:** with two tabs open, a lower score could overwrite a higher one. `syncHighScore()` now re-reads storage before comparing, on run start, on entering the menu, and in `commitHighScore()`.
2. **Fixed:** BEST tracked the live score, but Pause → Restart or Main Menu dropped it. Abandoning a run now commits its score (`abandonsRun()` in `state.js`).
3. **Fixed:** Enter/Space on a focused Play Again button skipped the 0.6 s delay. The button now checks `canRestart()`, the same gate the keys use.
4. **Skipped:** Menu → Play resets the run twice. Harmless and cheap, and the menu needs a clean road.
5. **Fixed:** `parseHighScore` accepted `1e9`, `0x1F`, … and now only accepts plain digits. **Test changed** (explained to the user): `'1e3'` → 1000 was my own lenient assertion from this phase. It moved to a new "other number syntax is garbage" test.
6. **Fixed:** the HUD now only redraws SCORE and BEST when their values change.
7. **Skipped:** `startsNewRun` repeats `nextState`. It's tested and harmless.
8. **Skipped:** auto-focusing overlay buttons would make Space resume from pause, which goes against the "no accidental resume" rule. Noted as Phase 8 polish.
- Tests: `ℹ tests 150 / ℹ pass 150 / ℹ fail 0`.
- Checked in headless Chrome over CDP:
  - Restart from pause saved the 501 the HUD showed.
  - Another tab's 9000 survived a 300-point run, with no false badge.
  - Play Again clicked at 0 s was ignored; clicked after 0.7 s it restarted.
  - No console errors, warnings, or exceptions.

## Current state
- Playable? Yes, with the full loop and no reloads: menu → play → pause/resume → caught → Play Again → … → Main Menu. The high score persists.
- Files touched:
  - New: `js/logic/{state,run,highscore,hud}.js`, `tests/{state-highscore,run}.test.js`, `docs/adr/0008-game-states-run-reset-high-score.md`.
  - Changed: `game.js`, `index.html`, `style.css`, `js/logic/{config,input}.js`, `js/palette.js`, `tests/world-loop.test.js`, `SPEC.md`, `.claude/skills/art-direction/SKILL.md`.
  - Also new: `docs/adr/0009-cold-eerie-palette.md`, `docs/adr/0010-game-title-apocalypse-run.md`. Also changed: `CLAUDE.md`, `js/logic/highscore.js` (comment), and the game-systems/test-review skills (title).
- Committed and pushed at the end of this session (see git log).

## Tests
- `node --test 'tests/*.test.js'` → `ℹ tests 147 / ℹ pass 147 / ℹ fail 0` (was 118).
- **Changed an existing test** (explained to the user first, per rule 4): `world-loop.test.js` listed `Enter`/`Escape` as non-game keys. Phase 3 binds them, so they moved to a new test that asserts PAUSE/CONFIRM. `Tab`/`Backspace` took their place in the null list, and Cmd/Ctrl+P is asserted to stay with the browser.
- New tests cover:
  - The exact set of legal transitions, with illegal ones ignored.
  - Per-state key commands: movement only while PLAYING; the key that starts a run is PLAY, never JUMP; Space doesn't resume; the game-over restart delay.
  - Auto-pause only while PLAYING.
  - High-score parsing (null, '', 'abc', '12abc', NaN, ±Infinity, negatives, decimals, 1e300 capped) and the "strictly beaten" rule.
  - Load/save round-trip, with missing or throwing storage never crashing.
  - `writeDigits` matching `String(Math.floor(n))` over a sweep, with overflow and junk handled.
  - **Reset after a caught run is deep-equal to a fresh run** (3 seeds), and a reset run replays identically to a fresh one.
  - A caught run doesn't move; god mode never ends a run; pause (not stepping) changes nothing.
- The palette test caught `--text: #e8f6ff` (a hex custom property that isn't in PALETTE). Fixed in the CSS by using `rgb()`; the test wasn't changed.
- **Smoke test (test-review skill): done in real Chrome** at `?debug&seed=1`:
  - The menu shows on load.
  - A real Space press started the run with the player grounded (`vy` 0, no jump buffered), and the HUD was visible.
  - Caught at 6.1 s by a BLOCK: the CAUGHT screen and NEW HIGH SCORE! badge showed, the score was 75, and the run froze.
  - A real Enter press → Play Again: elapsed 0.21 s, same seed, the game-over screen hidden, BEST 75.
  - A real ArrowLeft press moved one lane. A real Esc press paused; the simulation didn't advance over 1.5 s, prev == current, and the HUD stayed visible behind the dim.
  - A real P press resumed, and the simulation advanced 0.50 s in 0.5 s.
  - A synthetic window blur paused the run. A second blur and a blur on the menu did nothing.
  - Resume, Restart (elapsed 0, score 0), and Main Menu (clean road, 0 live obstacles, high score 75 shown, only the menu visible) all work.
  - A real click on PLAY and on the HUD pause button worked, and focus went back to the page body.
  - The game-over delay works: Enter at 0 s is ignored, and Enter at 0.7 s → PLAYING.
  - After 4 restarts, one ArrowLeft press moved exactly one lane, so there are no duplicate listeners.
  - Real Tab, Tab, Enter on game over → MENU (not Play Again).
  - **After a refresh, the menu showed the saved high score (128).**
  - Without `?debug`, `__neon` isn't exposed.
  - The console had no errors or warnings.
  - At max speed (35 units/s): median frame 8.3 ms, worst 9.4 ms (~120 fps), 13 draw calls, 0 rows dropped.
- Not verified in the browser: private-mode or throwing `localStorage` (covered by unit tests with a throwing storage), and Firefox, Safari, and Edge.

## Decisions made
- ADR written: **0008** (pure state machine plus `dispatch`, a single run object with `resetRun` guarded by the reset-equals-fresh test, pause by freezing interpolation, injected storage, a digit-node HUD, and the mute toggle deferred to Phase 7).
- SPEC.md changes:
  - §2 tree lists the 4 new modules.
  - §4 table: keyboard shortcuts per screen, the 0.6 s Play Again delay, BEST tracking live, auto-pause only mid-run, and the mute toggle marked for Phase 7.
  - §4 adds the reset/freeze note and that the high score is saved only when strictly beaten.
  - The Phase 2 note mentions the Phase 3 game-over screen.
  - Phase 3 acceptance is checked off.
- New tuning numbers: `GAMEOVER_INPUT_DELAY` 0.6 s (a new, small UX value) and `HUD_DIGITS` 9.

## Open problems / known bugs
- The run ends instantly on a hit. Phase 4 adds the Agent's catch "beat" (delay dispatching `CMD.CAUGHT`) and the side-clip stumble, and **must add the stumble timer and chaser gap to `resetRun()`**. The reset test will flag them if it's forgotten.
- The menu shows a static road behind it. An "attract mode" scroll would be polish (Phase 8).
- No mute toggle yet (Phase 7).
- Carried over: `SLIDE_TIME` feel to revisit with the Phase 4 animation; the pixel ratio is only re-read on resize (Phase 8).

## Next steps (in order)
1. The user plays and reviews Phase 3, then the code review and commit.
2. Phase 4 (SPEC §9): Hacker and Agent rigs, the side-clip stumble, the chaser closing in, and caught on a second stumble within ~8 s. Load `game-systems` and `art-direction` first.
