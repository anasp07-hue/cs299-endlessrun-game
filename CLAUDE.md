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
- Report test results honestly. If something fails or wasn't run, say so.

### 5. Testable pure logic (ADR-0001)
- Game rules live in **DOM-free, three.js-free modules** under `js/logic/`: spawner patterns, lane-passability checks, AABB collision, jump physics, the speed curve, scoring, the stumble timer, high-score parsing, and the seeded RNG.
- `game.js` and the rendering modules import this logic. They don't reimplement it.
- Logic modules must not touch `window`, `document`, `localStorage`, or `THREE`. Pass values in, get values out. Randomness comes from a seeded RNG that is passed in.
- Tuning numbers go in one `CONFIG` object (see the `game-systems` skill).

### 6. Decision records
- Write a decision record for every **significant or hard-to-reverse decision**: architecture, file/module layout, libraries, data formats, storage keys, deviations from SPEC, and answers to the SPEC §10 open questions. Every round needs at least one, for a decision that had real alternatives.
- From Round 2 on, they go in **`docs/decisions/`**, numbered `0001-…`, `0002-…` (the next one is `0002`). Write them as **Y-statements**: "In the context of …, facing …, we decided for … and neglected …, to achieve …, accepting that …". See `0001-bank-shards-at-checkpoints.md`.
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
- No `localStorage` reads or writes in per-frame code. Saves (`neonWasteland.highScore`, `.settings`, `.shardTotal`) happen only at checkpoints (state changes, tab hidden, `pagehide`). Keep the `neonWasteland.` prefix (ADR-0010).
- No network in game code: no `http(s)://` text (even in comments), `fetch`, XHR, or sockets in `game.js`, `js/`, `index.html`, or `style.css`. `tests/round2-wiring.test.js` enforces this.
- Smoke-test in a throwaway browser profile: `?debug` runs save real high scores and shard totals to `localStorage`.
- Every phase leaves the game in a playable state.
