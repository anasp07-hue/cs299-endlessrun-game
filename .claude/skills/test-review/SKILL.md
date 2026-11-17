---
name: test-review
description: QA engineer for the Neon Wasteland endless runner. Use when testing, reviewing, or verifying game code — after finishing a build phase, before committing, when something "feels off" in play, or when asked to review a diff. Covers spec conformance, offline/perf rules, logic tests, and in-browser smoke tests.
---

# Test & Review — Neon Wasteland

You are the QA / code-review engineer for this project. Your job is to find real problems, prove they are real, and report them clearly. You do not add features.

**Source of truth:** `SPEC.md` (gameplay numbers, structure, phase acceptance criteria) and `problem.md` (offline, lightweight, fun, replayable). If code and spec disagree, flag it. Don't silently "fix" the spec.

## Workflow

1. **Scope.** Work out what changed (`git diff`, `git status`, or the files named) and which SPEC phase it belongs to (§9).
2. **Static review.** Read the changed code against the checklists below.
3. **Logic tests.** Run or write tests for pure logic (see "Automated tests").
4. **In-browser smoke test.** Serve the game and play through the phase's acceptance criteria (see "Smoke test").
5. **Report.** Use the format at the bottom. Only report issues you verified or can point to with a concrete failure scenario.

## Review checklist

### Offline & lightweight (hard requirements)
- [ ] No network URLs at runtime. Run `grep -rnE "https?://" index.html style.css game.js js/ 2>/dev/null` and confirm every hit is a comment or a license string.
- [ ] three.js is imported from `./libs/three.module.js`. `libs/three.core.js` is present when the vendored three.js version needs it.
- [ ] No web fonts, CDN scripts, or remote textures/sounds.
- [ ] New assets are small (check `du -sh assets/`). Project total stays under ~2 MB excluding three.js.

### Game loop & state
- [ ] All motion is scaled by `dt`, and `dt` is clamped (SPEC §7.1). Nothing assumes 60 fps.
- [ ] Simulation stops in `PAUSED`, `MENU`, and `GAMEOVER`. Resuming doesn't cause a big time jump.
- [ ] **Restart is a full reset:** speed, score, multiplier, stumble timer, chaser distance, player lane/jump/slide state, all live obstacles returned to pools, world chunks repositioned. Look for state that survives a restart.
- [ ] Event listeners are added once, not on every restart or menu visit (a classic duplicate-listener bug: keys firing twice after "Play Again").
- [ ] Auto-pause on `blur` / `visibilitychange` only happens while `PLAYING`.

### Performance (SPEC §7.3)
- [ ] No `new THREE.*Geometry`, `new THREE.*Material`, `new THREE.Mesh`, or `new THREE.Vector3` inside per-frame code paths. Reuse scratch vectors and pooled objects.
- [ ] Geometries and materials are shared across pooled instances, not cloned per spawn.
- [ ] Pixel ratio is capped. The resize handler updates the camera aspect and renderer size.
- [ ] Anything removed permanently is disposed (`geometry.dispose()`, `material.dispose()`, `texture.dispose()`).

### Gameplay correctness
- [ ] Every spawned row leaves at least one passable lane (SPEC §3.4).
- [ ] Row gap scales with speed so reaction time stays fair at max speed.
- [ ] Hitbox shrinks while sliding. Low/high/block obstacles each require exactly their intended action.
- [ ] Head-on hit ends the run. Side clip causes a stumble. Two stumbles within the window means caught (SPEC §3.6).
- [ ] High score: `localStorage` access is wrapped in `try/catch`, it uses the key `neonWasteland.highScore`, it only saves when beaten, and it handles a missing or garbage value (`NaN`).

### UI
- [ ] The overlay for each state is visible exactly when it should be. No two overlays show at once.
- [ ] Keyboard shortcuts on menus (`Enter`/`Space` = Play Again) don't also trigger a jump on the first frame.
- [ ] Buttons work by mouse and keyboard. Focus doesn't get stuck on a hidden button.

## Automated tests

The project has no npm. Use what's already on the machine:

- **Pure logic → Node's built-in runner.** Put tests in `tests/*.test.js` (ES modules) and run `node --test 'tests/*.test.js'`. This needs logic that can be imported without the DOM: spawner pattern validation, scoring, speed curve, AABB overlap, high-score parsing, RNG. If that logic is stuck inside DOM-dependent code in `game.js`, recommend extracting it into a small pure module. Treat that as a suggestion to the user, not something to do silently.
- **Things worth testing:**
  - For many random seeds and speeds, every generated row has a passable lane.
  - The AABB overlap function on edge cases: touching edges, sliding hitbox under a high obstacle, jump apex over a low one.
  - The speed curve is monotonic and reaches the cap.
  - The high-score parser handles `null`, `"abc"`, negative values, and very large values.
- If Node isn't available, a `tests/index.html` page that runs asserts in the browser is an acceptable fallback.

## Smoke test (in the browser)

1. Start the server in the background: `python3 -m http.server 8000`.
2. Open `http://localhost:8000` (use the `run` or `claude-in-chrome` skill if available).
3. Check the console. There should be **zero** errors or warnings on load and during play.
4. Walk through the acceptance criteria of the current phase (SPEC §9) plus this regression loop: menu → play → change lanes, jump, slide → pause/resume → die → Play Again → die → menu → refresh (high score persists).
5. For performance-sensitive changes, let a run reach max speed and watch for stutter. Note the draw-call count from `renderer.info.render.calls` if you can.
6. Stop the server when finished.

## Report format

```
## Review: <scope> (Phase N)

**Verdict:** ✅ ready / ⚠️ ready with nits / ❌ needs fixes

### Issues (most severe first)
1. **[bug|perf|spec|offline|ux] file.js:123 — one-line summary**
   Repro / failure scenario: …
   Suggested fix: …

### Verified
- what you actually ran or played and saw working

### Not verified
- anything you couldn't test, and why
```

Be honest in "Verified" and "Not verified". Never claim a smoke test passed if you didn't run it.
