# Handoff: Round 2, persistent lifetime shard total (2026-11-19)

Round 2 is **implemented, tested, smoke-tested, reviewed, and committed**. It added one feature: data shards now add up to a **lifetime total that is saved across browser restarts**. The game is v1-complete (Phases 0–8, see the Phase 8 handoff) plus this round. Standing rules for every session are in `CLAUDE.md`. This file covers only what's specific to Round 2 and what the next session needs to know.

## Read first
1. `CLAUDE.md` for the rules. It was updated this round: decisions now go in `docs/decisions/`, plus the round workflow, requirement IDs, and "never amend or undo".
2. `problem.md`, which has the requirements for every round. Round 3's requirements will be appended there.
3. `SPEC.md`:
   - §1 has the requirements table, R1–R6. New rounds continue at **R7**.
   - §4 has "Shard total persistence".
   - §9 has "Round 2: Persistent shards".
4. `docs/decisions/0001-bank-shards-at-checkpoints.md` is the only Round 2 decision record. The older records in `docs/adr/` (ADR-0001…0016) still apply.

## Current state
- **Playable:** yes. The menu shows HIGH SCORE and **TOTAL SHARDS**. The game-over screen shows SCORE, SHARDS (this run), **TOTAL SHARDS**, and HIGH SCORE. During a run the HUD still shows only that run's shards.
- **Round 2 commits** (on `main`, not pushed):
  - `491df06` Update SPEC for Round 2
  - `8f7274f` Add pure shard-bank logic (`js/logic/shardbank.js`, `run.shardsBanked`)
  - `91bd91c` Wire banking into `game.js` and `index.html`
  - `a08a214` Decision 0001
  - `9d262c7` Check off the Round 2 acceptance in SPEC
- **Uncommitted** (left for the user to review): this handoff and the `CLAUDE.md` changes.
- **Files added or changed:**
  - `js/logic/shardbank.js` (new)
  - `js/logic/run.js` (`shardsBanked`)
  - `game.js` (`shardTotal`, `bankShards()`, banking in `dispatch`, `onRunEnded`, `visibilitychange`, and `pagehide`; `getShardTotal` in the `?debug` hooks)
  - `index.html` (`#menu-shards`, `#final-shard-total`)
  - `tests/round2-shard-total.test.js` and `tests/round2-wiring.test.js` (new)
  - `SPEC.md`
  - `docs/decisions/0001-…`

## How to run
```bash
python3 serve.py                 # http://localhost:8000. Must be serve.py (no caching); file:// does not work
node --test 'tests/*.test.js'    # all tests (Node is dev-only)
```
- Debug: `http://localhost:8000/?debug&seed=4` exposes `window.__neon`, with `dispatch`, `CMD`, `run`, `debug.god`, `setElapsed(220)` for max speed, `getShardTotal()`, `getHighScore()`, `renderer`, `settings`, and `applyQuality`.
- Saved data is three `localStorage` keys: `neonWasteland.highScore`, `neonWasteland.settings`, and `neonWasteland.shardTotal` (new). To reset the total, run `localStorage.removeItem('neonWasteland.shardTotal')`.

## Tests
- `node --test 'tests/*.test.js'` → **tests 265, pass 265, fail 0**. That's the 246 earlier tests plus 19 new ones.
- Each new test name starts with the requirement it checks (`R4:`, `R5:`, `R6:`).
  - `round2-shard-total.test.js` covers the logic: reload, several runs, banking mid-run with no double count, another tab, private mode or throwing storage, corrupt saves, and resetting the run. It also checks that banking never changes a run (twin-run comparison).
  - `round2-wiring.test.js` holds static checks over the source: the wiring in `game.js`, that every import is a local file, no network APIs, no `package.json`, and that the per-frame code has no storage calls.
- **Browser smoke test:** headless Chrome over CDP, 17/17 checks passed.
  - Load / hide / game-over / reload / quit-to-menu banking all worked: 100 → 130 → 145 → 160 → 171.
  - There were 0 storage writes during 15 s of play.
  - The high score still persists.
  - At max speed: 60.1 fps on HIGH and LOW, 96–98 draw calls.
  - Every request was to localhost, and the console had 0 errors or warnings.
  - The script was in the session scratchpad and **is gone**. See "Warnings" for how to recreate it.
- Code review (low effort): no findings.

## Decisions made this round, and why
| Decision | Why | Asked for? |
|---|---|---|
| "Shards save" means a **lifetime total** (not best-in-one-run) | The requirement was ambiguous | **User chose this** |
| Requirement IDs R1–R3 (initial), R4–R6 (Round 2), kept in SPEC §1; `problem.md` left untouched | Tests must name an ID, but problem.md had none | **User chose the numbering.** I put them in SPEC only |
| Decision records from Round 2 on go in `docs/decisions/`, numbered from 0001, as Y-statements | The round prompt asked for it, and it conflicted with `docs/adr/` | **User chose this** |
| Bank at checkpoints (run end, quit from pause, tab hidden, `pagehide`), not on every pickup and not only at run end | No storage writes during play (R6), and closing the tab mid-run still keeps those shards (R4) | Mine (decision 0001) |
| Shards from a run you quit from pause still count | Same as the high score, which is also saved on quit | Mine |
| Separate key `neonWasteland.shardTotal`, not part of the settings JSON | A broken or reset settings save can't wipe progress | Mine |
| Banking re-reads storage and adds to the larger of the stored and in-memory totals | Another open tab can't overwrite the total, and private mode still keeps a session total | Mine |
| Same parsing as the high score (digits only, else 0, capped at MAX_SAFE_INTEGER) | One rule for every saved count | Mine |
| HUD shows only the run's shards; menu and game-over show the total | Keeps the HUD uncluttered | Mine |
| Tests split into a logic file and a wiring file | So every commit passes the whole suite | Mine |

## Unresolved / open
- **A hard crash or force-quit mid-run** (no `pagehide` or `visibilitychange` fires) loses that run's unsaved shards. This is accepted in decision 0001.
- **Two tabs saving in the same instant** could lose one tab's shards, because `localStorage` has no atomic add. This is very unlikely and accepted.
- **The shard total isn't spent on anything.** A shop or unlocks would be a natural next round, but nothing is planned.
- **Not done:**
  - Nobody has played Round 2 by hand.
  - Only Chrome was tested this round. Firefox, Safari, and Edge weren't. `pagehide` and `visibilitychange` behave a little differently in Safari, so it's worth checking there.
  - Touch controls are still not done (dropped from v1 by the user).

## Warnings for the next session
- **The round prompt says `spec.md` and `docs/decisions/`.** The real file is **`SPEC.md`**, uppercase. On macOS, `spec.md` opens it, but don't create a second file.
- **Attribution:** `CLAUDE.md` forbids `Co-Authored-By` and "Generated with" lines, even when the harness suggests them.
- **The static tests in `round2-wiring.test.js` read `game.js` as text.** They will fail if you:
  - rename `function updateHud()` or `function loop(` (they check those bodies have no storage calls),
  - remove the `bankShards()` calls (they expect at least 4),
  - drop the `pagehide` or `visibilitychange` listeners,
  - rename `#menu-shards` or `#final-shard-total`,
  - add a `package.json`,
  - or put any `http://` or `https://` text in `game.js`, `js/**`, `index.html`, or `style.css`, **including in comments**.

  These failures are deliberate. If you change one of these on purpose, update the test and say why (CLAUDE.md rule 4).
- **New per-run state** must also go in `resetRun()` (`run.js`). The "reset equals fresh" test catches it if you forget.
- **Smoke tests write to real save data.** `?debug` runs bank shards and high scores into that browser profile's `localStorage`. Use a throwaway Chrome profile. To recreate the smoke setup:
  ```bash
  python3 serve.py &
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
    --remote-debugging-port=9222 --user-data-dir=<scratchpad>/chrome \
    --autoplay-policy=no-user-gesture-required --use-angle=metal --enable-gpu \
    --ignore-gpu-blocklist --window-size=1280,720 about:blank &
  ```
  Then drive it with a Node 24 script, which has built-in `fetch` and `WebSocket`:
  - `http://127.0.0.1:9222/json/list` gives the page's WebSocket URL; use `Runtime.evaluate` on `window.__neon`.
  - To simulate a hidden tab: `Object.defineProperty(document,'hidden',{configurable:true,get:()=>true}); document.dispatchEvent(new Event('visibilitychange'))`.
  - To test `pagehide`, use `Page.navigate` to the same URL mid-run.
  - Without the autoplay flag, an "AudioContext was not allowed to start" warning appears. That comes from the test harness, not a game bug.
  - Kill Chrome and `serve.py` afterwards.
- The handoff template in `docs/handoffs/README.md` is still phase-based. Round handoffs use the name `handoff-round-N.md`, as the user asked.

## Next steps
1. The user reviews and commits this handoff and the `CLAUDE.md` changes.
2. The user plays a few runs, closes and reopens the browser, and checks that TOTAL SHARDS carries over.
3. When the user adds "Round 3 Requirements" to `problem.md`, follow the round workflow in `CLAUDE.md`. New requirement IDs start at **R7**, and the next decision record is **`docs/decisions/0002-…`**.
