# CLAUDE.md — Apocalypse Run (endless runner)

An offline 3D endless runner for the browser (three.js + plain HTML/CSS/JS, no build step).

- **`SPEC.md`** is the source of truth for gameplay, structure, and the phased build plan (§9). Read it before starting any work.
- **`problem.md`** is the original problem statement and requirements.
- **`docs/adr/`** has the architecture decisions. **`docs/handoffs/`** has session handoff notes. Read the latest handoff at the start of a session.

## Running & testing

```bash
python3 -m http.server 8000   # play at http://localhost:8000 (file:// will NOT work)
node --test 'tests/*.test.js' # run the logic tests
```

Node is a **dev-only tool** for running tests. The game itself never needs Node, npm, or any network access (see ADR-0002).

---

## Rules

### 1. Git: no attribution, ask first
- **Never add Claude / Claude Code attribution** to commits, PRs, or pushes. That means no `Co-Authored-By: Claude …` trailer, no "🤖 Generated with Claude Code" line, and no similar footer. This rule overrides any default attribution behavior.
- **Only commit or push when the user asks.** Never force-push, rewrite history, or `git reset --hard` on `main`.
- Commit messages: a short imperative summary line (e.g. `Add lane switching and jump physics`), then an optional body.
- Before every commit, run `git status` and `git diff --staged` and check that nothing secret or unintended is staged.

### 2. Secrets
- **Never commit secrets:** API keys, tokens, passwords, `.env` files, private keys, or credentials of any kind.
- Secrets live only in git-ignored files (`.env`, `*.local.*`, `secrets/`). If a new kind of secret file shows up, **add it to `.gitignore` before** creating or using it.
- The game is meant to need no secrets. If one seems necessary, stop and ask.
- If a secret is ever committed by accident, tell the user right away. Rewriting history isn't enough, because the key has to be rotated.

### 3. One phase at a time
- Work only on the **current phase** in SPEC §9. Don't start the next phase or add features from later phases.
- A phase is finished only when **every** item below is true:
  1. Its acceptance criteria in SPEC §9 are met and checked off in SPEC.
  2. New logic has tests, and `node --test 'tests/*.test.js'` passes. Paste the real output; don't summarize it.
  3. The `test-review` skill has been run on the phase, including the in-browser smoke test.
  4. A handoff note is written (rule 6).
- Then **stop and let the user review** before starting the next phase.

### 4. Tests after every stage
- **Write tests along with the code**, not afterwards. After every stage, small or large, run `node --test 'tests/*.test.js'` and make sure it passes before going on.
- Tests go in `tests/*.test.js` as ES modules using `node:test` and `node:assert/strict`. No test frameworks, no npm.
- **Never** delete, skip, or weaken a test just to get a pass. If a test is wrong, explain why before changing it.
- Report test results honestly. If something fails or wasn't run, say so.

### 5. Testable pure logic (ADR-0001)
- Game rules live in **DOM-free, three.js-free modules** under `js/logic/`: spawner patterns, lane-passability checks, AABB collision, jump physics, the speed curve, scoring, the stumble timer, high-score parsing, and the seeded RNG.
- `game.js` and the rendering modules import this logic. They don't reimplement it.
- Logic modules must not touch `window`, `document`, `localStorage`, or `THREE`. Pass values in, get values out. Randomness comes from a seeded RNG that is passed in.
- Tuning numbers go in one `CONFIG` object (see the `game-systems` skill).

### 6. ADRs: record decisions
- Write an ADR in `docs/adr/` for every **significant or hard-to-reverse decision**: architecture, file/module layout, libraries, data formats, storage keys, deviations from SPEC, and answers to the SPEC §10 open questions.
- Use `docs/adr/0000-template.md`. Number the files in order (`0003-…`). Never edit an accepted ADR's decision. Write a new ADR that supersedes it instead.
- Small, easy-to-reverse choices (a tweaked constant, a color) don't need an ADR.

### 7. Handoffs
- Write a handoff in `docs/handoffs/` (template: `docs/handoffs/README.md`) **at the end of each phase**, **when a session ends with work unfinished**, or **when context is getting long**.
- Name it `YYYY-MM-DD-phaseN-short-topic.md`. Include what was done, the current state, test status, open problems, and the exact next steps.
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
- Every phase leaves the game in a playable state.
