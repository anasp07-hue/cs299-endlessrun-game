# Handoff: Round 3, character shop (2026-11-19)

Round 3 is **implemented, tested, smoke-tested, reviewed, and committed**. It added a **shop** on the main menu, where the lifetime shard total (from Round 2) buys two new runners: the **Android** (silver robot, 100 shards) and the **Alien** (green alien, 200 shards). Bought characters last only until the page is reloaded or closed, but the shards spent on them stay spent. Standing rules for every session are in `CLAUDE.md`. This file covers only what's specific to Round 3 and what the next session needs to know.

## Read first
1. `CLAUDE.md` for the rules. This round added a few lines (see "CLAUDE.md changes" below). They're uncommitted until the user reviews them.
2. `problem.md`, which has the requirements for every round. The "Round 4 Requirements" will be appended there.
3. `SPEC.md`:
   - §1 has the requirements table, R1–R10. New rounds continue at **R11**.
   - §4 has the state diagram (now with SHOP), the Shop screen row, and the "Shop" rules.
   - §5 "Characters" describes all three runners.
   - §9 has "Round 3: Character shop", with acceptance criteria checked off and evidence.
4. `docs/decisions/0002-session-only-ownership-saved-spend.md` and `0003-shop-state-and-prebuilt-rigs.md` are this round's decision records. `0001` (Round 2) and `docs/adr/` ADR-0001…0016 still apply.

## Current state
- **Playable:** yes.
  - The menu has a **SHOP** button below PLAY. The shop screen shows the shard total, one card per character (HACKER / ANDROID / ALIEN), a note that purchases last until the game is closed, and BACK.
  - Each card has a button: `BUY <price>` (disabled and greyed out when you can't afford it), `EQUIP`, or `EQUIPPED`.
  - The equipped runner stands on the road to the right of the panel as a preview.
  - Esc / P / BACK return to the menu. Enter and Space do nothing in the shop unless a button has focus.
- **Round 3 commits** (on `main`, not pushed):
  - `cbf5e5a` Update SPEC for Round 3 (R7–R10, acceptance criteria)
  - `3dc7faa` Add the pure shop logic: `js/logic/shop.js`, `spendShards()`, `STATE.SHOP`/`CMD.SHOP`, and prices in `CONFIG`
  - `d4aa7c2` Add the Android and Alien rigs (`js/characters.js`)
  - `fe7948c` *(the user's commit)*: Round 3 requirements in `problem.md`
  - `fbb7c3c` Wire the shop and runners into `game.js`, `index.html`, and `style.css`
  - `7a47ced` Decision records 0002 and 0003
  - `c234d60` Check off the Round 3 acceptance in SPEC
- **Uncommitted** (left for the user to review): this handoff and the `CLAUDE.md` changes.
- **Files added or changed:**
  - `js/logic/shop.js` (new): `CHARACTER`, `CHARACTER_IDS`, `CHARACTER_INFO`, `characterPrice`, `createShop`, `owns`, `canBuy`, `buyCharacter`, `equipCharacter`
  - `js/logic/shardbank.js`: `spendShards(storage, total, price)` → `{ ok, total }`
  - `js/logic/state.js`: the SHOP state and command
  - `js/logic/config.js`: `PRICE_ANDROID: 100`, `PRICE_ALIEN: 200`
  - `js/characters.js`: `createAndroid`, `createAlien`, `RUNNER_BUILDERS`; `dressLimbs` takes an optional `legW`
  - `game.js`:
    - `shop`, `runners`, `runner`, `showRunner()`, the shop card building, `onShopButton()`, and `renderShop()`
    - `hacker` / `hackerPose` were renamed to `runner` / `runnerPose`
    - The `?debug` hooks expose `runners`, `shop`, and `getRunner()` instead of `hacker`
  - `index.html` (`#btn-shop`, `#shop`), `style.css` (`.screen-shop`, `.shop-*`, `.btn:disabled`)
  - Tests: `tests/round3-shop.test.js`, `tests/round3-characters.test.js`, `tests/round3-wiring.test.js` (new); `tests/state-highscore.test.js` (2 lines added)
  - `SPEC.md`, `docs/decisions/0002-…`, `0003-…`

## How to run
```bash
python3 serve.py                 # http://localhost:8000. Must be serve.py (no caching); file:// does not work
node --test 'tests/*.test.js'    # all tests (Node is dev-only)
```
- Debug: `http://localhost:8000/?debug&seed=4` exposes `window.__neon`:
  - `dispatch`, `CMD`, `getState()`, and `run`
  - `debug.god`, and `setElapsed(220)` for max speed
  - `getShardTotal()` and `getHighScore()`
  - `shop` (`{ owned, equipped }`), `runners` (`{ hacker, android, alien }`), and `getRunner()`
  - `renderer`, `settings`, and `applyQuality`
- To test the shop without grinding, set `localStorage.setItem('neonWasteland.shardTotal', '500')` and reload, or set it while on the menu and then open the shop (entering the shop re-reads storage).
- Saved data is still only three keys: `neonWasteland.highScore`, `.settings`, and `.shardTotal`. Ownership is never saved.

## Tests
- `node --test 'tests/*.test.js'` → **tests 299, pass 299, fail 0**. That's the 265 earlier tests plus 34 new ones. Each new test name starts with `R7:` … `R10:`.
  - `round3-shop.test.js` covers the logic: buying, an exact balance, one shard short, no double purchase, equip only if owned, re-reading storage when another tab has a higher total, never going negative or accepting a bad price, private mode or throwing storage, banking on top of a spend, the SHOP transitions and keys, the prices, and a "reload" giving Hacker only while the spend stays.
  - `round3-characters.test.js` builds all three rigs **in Node with the vendored three.js** and checks:
    - every runner has the same pivots, at the same places;
    - in 15 poses, each runner's top stays within +0.03 / −0.05 of the Hacker's, it never sinks further into the road, and it's no wider;
    - standing covers the hitbox, and sliding stays under a HIGH;
    - the Android is mostly silver and the Alien mostly muted green, with no obstacle cue colours;
    - no rules module imports or reads the skin.
  - `round3-wiring.test.js` holds static checks over `game.js` and `index.html` (see Warnings).
- **One earlier test changed:** `the SPEC §4 transitions are exactly the legal ones` gained `MENU -SHOP-> SHOP` and `SHOP -MENU-> MENU`. Nothing else changed.
- **Browser smoke test:** headless Chrome over CDP, 32/32 checks passed. It covered:
  - Shop flows: 150 → buy the Android → 50; another tab's 260 picked up; buy the Alien → 60; re-equipping is free; a locked card does nothing; Space doesn't start a run; Esc and Back work.
  - A run as the Android: lanes, jump, slide, pause, catch, and Play Again.
  - 0 storage writes during play.
  - At speed 35: 60.2 fps / 104 draw calls (Android) and 60.3 fps / 101 (Alien).
  - Reload: Hacker only, total still 60, no new key, high score kept.
  - Every request went to localhost, and the console had 0 errors or warnings.
- **Two smoke checks were weaker than they look:**
  - The Android run that got caught had collected 0 shards, so "shards bank on top of a spent total" was only really proved in Node.
  - The after-reload total check only asserted `>=`.
- The smoke script (`smoke.mjs`) was in the session scratchpad and **is gone**. See Warnings for how to recreate it.
- Code review (low effort) over `910d1df..HEAD`: no findings.

## Decisions made this round, and why
| Decision | Why | Asked for? |
|---|---|---|
| "Skins don't save" means ownership and the equipped character reset on reload, **but the spent shards stay spent** | R10 was ambiguous (three readings were offered) | **User chose this** |
| Android 100, Alien 200 | A typical run collects about 20–60 shards | **User chose this** |
| IDs R7–R10; the names ANDROID / ALIEN; ids `hacker`/`android`/`alien`; the one-line card descriptions | Tests must name an ID; the shop needs labels | Mine |
| Ownership in a plain in-memory object, created on every load; no `sessionStorage` (it survives a reload) | R10 | Mine (decision 0002) |
| The spend is saved **at once** on the click, through `spendShards()`, which re-reads storage and spends from the larger total, like banking | If the spend waited for a checkpoint, a reload would refund it, and the max rule would undo it | Mine (decision 0002) |
| The shop is its own `SHOP` state, reached **only from the menu** | The menu's Enter/Space would start runs from inside a menu panel; the skin can never change mid-run | Mine (decision 0003) |
| All three runners built at startup; only the equipped one is visible | Switching allocates nothing; hidden rigs cost no draw calls | Mine (decision 0003) |
| The new runners use the Hacker's exact skeleton and poses; only the dressing differs | R9: the same movement and hitbox are then guaranteed | Mine (decision 0003) |
| The character designs: Android with shoulder pads, a blue eye band, an antenna, a back vent glow; Alien with a domed head, slanted black eyes, a dark vest, a green back glow line | Readable from behind at speed, and away from the obstacle cue colours | Mine |
| No separate hand boxes on the new rigs; the antenna and dome lowered | Hands dipped about 0.1 into the road when sliding; keeps them within the Hacker's height | Mine |
| One-click buying, no confirm step; a note in the shop that purchases don't survive closing the game | "Simple shop"; the spend can't be undone, so the player is warned | Mine |
| Equipping an owned character is free and lasts through Play Again for the session | Natural shop behaviour | Mine |
| Shop panel on the left on wide screens; locked cards greyed out with a disabled button; the purchase plays the high shard chime | The equipped runner is visible as a preview | Mine |
| Back from the shop doesn't regenerate the road | Avoids a visible pop of the city layout | Mine |
| Prices in `CONFIG` (`PRICE_ANDROID`, `PRICE_ALIEN`) | CLAUDE.md rule 5: tuning numbers live in CONFIG | Mine |
| Two decision records (0002, 0003) | Two separate decisions, each with real alternatives | Mine |

## Unresolved / open
- **Players lose characters they paid for when they close the game.** That's what R10 asks for, as the user read it. If play-testing shows it feels bad, a future round could revisit it (e.g. save ownership), which would supersede decision 0002.
- There's **no confirm step** on Buy. A misclick spends shards for good (until the next reload you still own the character, though).
- **Two tabs spending or banking in the same instant** could lose one write. This is accepted in decisions 0001 and 0002.
- **The shop is only reachable from the main menu**, not from pause or game over.
- **Not done:**
  - Nobody has played Round 3 by hand.
  - Only Chrome was tested. Firefox, Safari, and Edge weren't.
  - The narrow-screen layout (under 820 px, where the panel centres and covers the preview) was not checked in a browser.
  - Touch controls are still not done (dropped from v1).

## Warnings for the next session
- **The round prompt says `spec.md`.** The real file is **`SPEC.md`**, uppercase. Don't create a second file.
- **Attribution:** `CLAUDE.md` forbids `Co-Authored-By` and "Generated with" lines, even when the harness suggests them.
- **The static tests read `game.js` as text.** `round3-wiring.test.js` (and `round2-wiring.test.js`) will fail if you:
  - rename `function dispatch(`, `simulate(`, `showRunner(`, `updateCharacters(`, `render(`, `renderFx(`, `updateHud(`, or `loop(`;
  - change the exact calls `stepRun(run, h, CONFIG, debug.god)`, `applyPose(runner, runnerPose)`, `buyCharacter(shop, id, storage, shardTotal, CONFIG)`, `equipCharacter(shop, id)`, `onClick('btn-shop', CMD.SHOP)`, or `onClick('btn-shop-back', CMD.MENU)`;
  - change the guard `cmd === CMD.MENU && from !== STATE.SHOP) resetRun`;
  - change `const shop = createShop();`;
  - rename the ids `#btn-shop`, `#shop`, `#shop-shards`, `#shop-list`, or `#btn-shop-back`, or remove the "close the game" note;
  - write **any `neonWasteland.<key>` other than `highScore`, `settings`, or `shardTotal`** anywhere in game code, **including comments**, or mention `sessionStorage`, `indexedDB`, `document.cookie`, or `caches.open`;
  - and everything listed in the Round 2 handoff still applies (no `http(s)://` text, at least 4 `bankShards()` calls, and so on).

  These failures are deliberate. If a change is intended, update the test and say why (CLAUDE.md rule 4).
- **Adding a new runner:**
  - Add its id to `CHARACTER`/`CHARACTER_IDS`/`CHARACTER_INFO` and a price in `characterPrice()` + `CONFIG` (`shop.js`).
  - Add a builder on `createSkeleton()` to `RUNNER_BUILDERS` (`characters.js`).
  - `round3-characters.test.js` then measures it automatically. It must stay within the Hacker's height (+0.03) and width, and not dip into the road. Hands and tall headgear are the usual offenders.
  - Several existing tests pin the catalogue to exactly three characters (`deepEqual` on `CHARACTER_IDS`, prices 100/200); adding one means updating those deliberately.
- **`rules` modules must never import `shop.js` or `characters.js`**, or read `equipped` / `CHARACTER` (a test checks this). Keep skins cosmetic.
- **`STATE` now has five values.** Any code or test that loops over `Object.values(STATE)` sees SHOP. In `game.js`, the "menu-like" checks (stand pose, Agent hidden) treat MENU and SHOP alike (`atMenu` in `updateCharacters`).
- **Smoke tests write to real save data.** Use a throwaway Chrome profile. The recipe is now in `CLAUDE.md`. Useful CDP tricks:
  - Use `Input.dispatchMouseEvent` at a button's `getBoundingClientRect()` centre for real clicks, and `Input.dispatchKeyEvent` for keys.
  - Wrap `Storage.prototype.setItem` to count writes during play.
  - `setElapsed(220)` restarts the spawner, so a run caught right after it may have 0 shards. Collect some shards first if you need to check banking.

## Next steps
1. The user reviews and commits this handoff and the `CLAUDE.md` changes.
2. The user plays a few runs as each character, buys something, closes and reopens the browser, and checks that the shop is back to Hacker-only while TOTAL SHARDS keeps the deduction.
3. When "Round 4 Requirements" are added to `problem.md`, follow the round workflow in `CLAUDE.md`. New requirement IDs start at **R11**, and the next decision record is **`docs/decisions/0004-…`**.
