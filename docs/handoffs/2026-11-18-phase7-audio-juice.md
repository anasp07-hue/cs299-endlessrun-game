# Handoff: Phase 7, audio & juice (2026-11-18)

Phase 7 is **implemented, tested, and reviewed, but not yet committed**. The pre-commit `code-review` (low effort, run sparingly at the user's request) found no issues. The tests were re-run afterwards: 225 pass, 0 fail.

## Done
- **`js/audio.js`:** all SFX plus a generative music loop, made in code with Web Audio (zero files). It's silent until the first click or key, ducks per state, and suspends when the tab is hidden.
- **Mute:** `M` in any state, plus buttons on the menu, pause screen, and HUD (a CSS speaker icon). Saved by `js/logic/settings.js` under `neonWasteland.settings`.
- **Event counters:**
  - The player counts `jumps`, `landings` (plus `landSpeed`), and `slides`.
  - The run counts `nearMisses` (plus type and lane) via `trackNearMisses` in `spawner.js`, which adds `nearGap` / `nearDone` to the slots.
  - `game.js` `updateFx` compares the counters each frame and fires sound and effects.
- **Juice:**
  - `js/logic/juice.js`: shake trauma, landing squash, near-miss flash.
  - `js/logic/particles.js`: a 160-spark pool.
  - `game.js`: `renderFx` / `emitAmbientSparks`, plus the `#flash` overlay in `index.html` / `style.css`.
- **ADR-0015:** written. **SPEC:** §2, §3.3, §4, §6, the Phase 7 acceptance, and §10 Q3 (resolved) are updated.

## Tests
- `node --test 'tests/*.test.js'` → **225 pass, 0 fail** (11 new in `tests/juice.test.js`). Near-miss detection is checked against an independently measured clearance.
- Two test expectations were adjusted, both explained:
  - The landing-speed tolerance is now one step of gravity.
  - The shake returns clean zeros at rest; that was a logic fix for `-0`.
- One logic fix came from an existing test: `MUTE` in an unknown state now returns `NONE`.
- **Browser (headless Chrome, real GPU, `serve.py`):**
  - Audio unlocks only on input, mute persists across a reload, and every counter is seen by the effects.
  - Squash 0.884, stumble shake and sparks, and the flash fades by 0.4 s.
  - Effects freeze on pause and reset on the menu. The regression loop and real-key play pass.
  - No console errors. Max speed 60.5 fps, 91 draw calls.

## Next steps
1. The user listens and plays. Tune volumes (`MUSIC_VOLUME`, `SFX_VOLUME`), `NEAR_MISS_FLASH_PEAK`, and `SPARK_SIZE` by ear and eye.
2. ~~Run the pre-commit `code-review`~~: done, no findings.
3. Commit (no Claude attribution), suggested as `Add Phase 7: procedural audio, mute, shake, squash, sparks, near-miss flicker`, then push if asked.
4. Then Phase 8.
