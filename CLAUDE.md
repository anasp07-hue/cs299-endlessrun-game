# CLAUDE.md — Apocalypse Run (endless runner)

An offline 3D endless runner for the browser (three.js + plain HTML/CSS/JS, no build step).

- **`SPEC.md`** is the source of truth for gameplay, structure, and the phased build plan (§9). Read it before starting any work.
- **`problem.md`** is the original problem statement and requirements, plus a "Round N Requirements" list for each round. Requirement IDs (R1, R2, …) are kept in SPEC §1.
- **`docs/decisions/`** has the decision records from Round 2 on. **`docs/adr/`** has the earlier ones (ADR-0001…0016), which still apply. **`docs/handoffs/`** has session handoff notes. Read the latest handoff at the start of a session.

## Running & testing

```bash
python3 serve.py              # play at http://localhost:8000 (file:// will NOT work)
node --test 'tests/*.test.js' # run the logic tests
```

`serve.py` is `http.server` with caching turned off. Plain `python3 -m http.server` lets browsers keep stale modules after a change, and then Play silently does nothing (fix: empty the browser cache).

Node is a **dev-only tool** for running tests. The game itself never needs Node, npm, or any network access (see ADR-0002).

---

## Rules

### 1. Git: no attribution, ask first
- **Never add Claude / Claude Code attribution** to commits, PRs, or pushes. That means no `Co-Authored-By: Claude …` trailer, no "🤖 Generated with Claude Code" line, and no similar footer. This rule overrides any default attribution behavior.
- **Only commit or push when the user asks.** Never force-push, rewrite history, or `git reset --hard` on `main`.
- **Never undo or amend a commit:** no `git commit --amend`, `git revert`, `git reset`, or rebase. Fix mistakes with a new commit.
- Commit in small steps. Each commit should leave `node --test 'tests/*.test.js'` passing, with a message that says what changed and why.
- Commit messages: a short imperative summary line (e.g. `Add lane switching and jump physics`), then an optional body.
- Before every commit, run `git status` and `git diff --staged` and check that nothing secret or unintended is staged.

### 2. Secrets
- **Never commit secrets:** API keys, tokens, passwords, `.env` files, private keys, or credentials of any kind.
- Secrets live only in git-ignored files (`.env`, `*.local.*`, `secrets/`). If a new kind of secret file shows up, **add it to `.gitignore` before** creating or using it.
- The game is meant to need no secrets. If one seems necessary, stop and ask.
- If a secret is ever committed by accident, tell the user right away. Rewriting history isn't enough, because the key has to be rotated.

### 3. One phase (or round) at a time
- Work only on the **current phase or round** in SPEC §9. Don't start the next one or add features from later ones.
- **Rounds** (from Round 2 on) are driven by the "Round N Requirements" in `problem.md`:
  1. List them, and **ask about anything unclear before writing code**.
  2. Give each requirement the next free ID (R7, R8, …) in SPEC §1.
  3. Update SPEC.md (§1 table + a §9 "Round N" section with acceptance criteria) and **commit it before any code**.
  4. Write tests, then implement.
  5. At the end, list every decision the user didn't ask for.
- Write a round's handoff **only when the user asks**. Don't commit the handoff or `CLAUDE.md` changes: the user reviews and edits them first.
- The real spec file is **`SPEC.md`** (uppercase). Don't create a `spec.md` beside it.
- A phase is finished only when **every** item below is true:
  1. Its acceptance criteria in SPEC §9 are met and checked off in SPEC.
  2. New logic has tests, and `node --test 'tests/*.test.js'` passes. Paste the real output; don't summarize it.
  3. The `test-review` skill has been run on the phase, including the in-browser smoke test.
  4. A handoff note is written (rule 6).
- Then **stop and let the user review** before starting the next phase.

### 4. Tests after every stage
- **Write tests along with the code**, not afterwards. After every stage, small or large, run `node --test 'tests/*.test.js'` and make sure it passes before going on.
- Tests go in `tests/*.test.js` as ES modules using `node:test` and `node:assert/strict`. No test frameworks, no npm.
- For round work, **each test name starts with the requirement ID it checks** (e.g. `test('R4: …')`).
- **Never** delete, skip, or weaken a test just to get a pass. If a test is wrong, explain why before changing it.
- When a round **changes or reverses an earlier requirement** (e.g. R19 replacing R10, phase 30 s → 5 s), update or replace the old tests that encode it. Say which and why in the test file (a pointer comment) and in the commit message. Tests of untouched behaviour stay as they are.
- Report test results honestly. If something fails or wasn't run, say so.
- **Loops over a simulated run must also stop on `run.caught`** (e.g. `while (x - run.scroll > d && !run.caught)`). A caught run's scroll freezes, so a loop waiting on distance never ends. A synchronous hang blocks the event loop, so `--test-timeout` can't stop it and `node --test` prints nothing. To find one, run the file under `perl -e 'alarm 15; exec @ARGV' node …`, logging each test name as it starts.
- **Power-ups appear in every simulated run** (one every 30 s, from 30 s). A bot or long-run test of another mechanic (stumbles, scoring, spacing) should switch them off with `run.powerups.nextAt = Infinity` after `createRun()`. Obstacles and shards are unchanged, because power-ups have their own RNG.

### 5. Testable pure logic (ADR-0001)
- Game rules live in **DOM-free, three.js-free modules** under `js/logic/`: spawner patterns, lane-passability checks, AABB collision, jump physics, the speed curve, scoring, the stumble timer, high-score parsing, the seeded RNG, and power-up placement, timing and effects (`powerups.js`).
- `game.js` and the rendering modules import this logic. They don't reimplement it.
- Logic modules must not touch `window`, `document`, `localStorage`, or `THREE`. Pass values in, get values out. Randomness comes from a seeded RNG that is passed in.
- Tuning numbers go in one `CONFIG` object (see the `game-systems` skill).
- Phase lasts `POWERUP_PHASE_DURATION` (5 s since Round 5), separate from `POWERUP_DURATION` (30 s, double score). Power-up types never repeat back to back (`pu.lastPlaced`, decision 0008).
- **Skins are cosmetic.** Every runner is dressed on the shared skeleton (`RIG`, `createSkeleton()`) and posed by the shared pose functions. Rules modules never import `shop.js` or `characters.js` and never read the equipped character. `tests/round3-characters.test.js` measures every runner against the Hacker's height and width.

### 6. Decision records
- Write a decision record for every **significant or hard-to-reverse decision**: architecture, file/module layout, libraries, data formats, storage keys, deviations from SPEC, and answers to the SPEC §10 open questions. Every round needs at least one, for a decision that had real alternatives.
- From Round 2 on, they go in **`docs/decisions/`**, numbered `0001-…`, `0002-…`, continuing across rounds (check `ls docs/decisions` for the next free number). Write them as **Y-statements**: "In the context of …, facing …, we decided for … and neglected …, to achieve …, accepting that …". See `0001-bank-shards-at-checkpoints.md`.
- `docs/adr/` (ADR-0001…0016, template `0000-template.md`) is closed to new files but still in force. Never edit an accepted record's decision. Write a new one that supersedes it instead.
- Small, easy-to-reverse choices (a tweaked constant, a color) don't need an ADR.

### 7. Handoffs
- Write a handoff in `docs/handoffs/` (template: `docs/handoffs/README.md`) **at the end of each phase**, **when a session ends with work unfinished**, or **when context is getting long**.
- Name it `YYYY-MM-DD-phaseN-short-topic.md`, or `handoff-round-N.md` for rounds (only when the user asks, see rule 3). Include what was done, the current state, test status, open problems, and the exact next steps.
- At the start of a session, read the newest handoff first.

### 8. Use the project skills
Load the matching skill **before** starting work it covers:

| Skill | Use for |
|---|---|
| `game-systems` | game loop, physics, lanes, collision, spawning, difficulty, chaser, pooling, state machine, scoring, save data |
| `art-direction` | anything visual: characters, obstacles, environment, lighting, particles, textures, UI styling |
| `test-review` | after each phase, before each commit, when asked to review, or when something "feels off" |
| `run` / `claude-in-chrome` | launching and smoke-testing the game in a browser |
| `code-review`, `security-review` | reviewing a diff before a commit or push |

### 9. Keep SPEC.md current
- When implementation and SPEC disagree, or a §10 open question gets resolved, **update SPEC.md** (and write an ADR if the change is significant). Don't let the spec go stale.
- Don't silently change gameplay numbers or requirements. Mention any spec change in your reply.

### 10. Hard constraints from SPEC §1 (summary)
- Runs fully offline: three.js is vendored in `libs/`, with no CDNs, web fonts, or remote assets.
- No build tools, frameworks, TypeScript, or npm packages in the game.
- No allocations in per-frame code (object pooling). The game must hold 60 fps.
- No `localStorage` reads or writes in per-frame code. Saves (`neonWasteland.highScore`, `.settings`, `.shardTotal`, `.characters`) happen only at checkpoints (state changes, tab hidden, `pagehide`, a shop buy or equip click). Keep the `neonWasteland.` prefix (ADR-0010).
- Those four are the **only** storage keys. Since Round 5, owned and equipped characters are saved as JSON under `neonWasteland.characters`, only through `shop.js` on a shop click (R19, decision 0007, replacing R10 / 0002). Power-ups are run state only, never saved (R16). `tests/round5-wiring.test.js` fails on any other `neonWasteland.<key>`, even in a comment.
- No network in game code: no `http(s)://` text (even in comments), `fetch`, XHR, or sockets in `game.js`, `js/`, `index.html`, or `style.css`. `tests/round2-wiring.test.js` enforces this.
- Smoke-test in a throwaway browser profile: `?debug` runs save real high scores and shard totals to `localStorage`. The recipe:
  - Start `python3 serve.py 8765 &`. The user may already have their own `serve.py` on port 8000: don't kill it, use a spare port and stop only yours.
  - Start Chrome headless with `--headless=new --remote-debugging-port=9222 --user-data-dir=<scratchpad>/chrome --autoplay-policy=no-user-gesture-required --use-angle=metal --enable-gpu --ignore-gpu-blocklist --window-size=1280,720 about:blank`.
  - Drive it with a Node 24 script, which has built-in `fetch` and `WebSocket`: get the page from `127.0.0.1:9222/json/new`, then use `Runtime.evaluate` on `window.__neon` (`?debug&seed=4`), and `Input.dispatchMouseEvent` / `Input.dispatchKeyEvent` for real clicks and keys.
  - `STATE` values are uppercase strings (`'MENU'`, `'PLAYING'`, `'SHOP'`…): compare against those, or use `__neon.STATE`.
  - The profile keeps what a smoke run saves, including bought and equipped skins, per port. Clear `localStorage` at the start of a run, and for fps comparisons make sure both builds use the same skin (the skin changes the draw count).
  - Kill Chrome and `serve.py` afterwards.
  - Headless fps varies by machine and day (about 58 in Round 4, 60 before). Judge a frame-rate change against the previous build measured the same way in the same session: check it out with `git worktree add --detach <scratchpad>/base <commit>`, serve it on another port, then remove the worktree.
- **`game.js` runs top to bottom at load, and Node never runs it.** Using a `const` (a material, a mesh) above the line that declares it throws at startup, Play does nothing, and every Node test still passes. Only the browser smoke test catches it, so run one after any `game.js` change.
- Every phase leaves the game in a playable state.
