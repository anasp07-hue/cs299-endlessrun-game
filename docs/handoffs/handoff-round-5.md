# Handoff: Round 5, balance and saved skins (2026-11-21)

Round 5 is **implemented, tested, smoke-tested, and committed**. It changed four things:
- **Phase** lasts **5 s** instead of 30 s. Double score stays 30 s, and the 1 s grace at the end of phase stays.
- **No repeated power-up:** a pickup is never the same type as the one placed before it. This holds whether or not that one was picked up.
- **Saved skins:** bought characters **and the equipped one** survive a reload or browser restart. This replaces Round 3's R10, "skins don't save".
- **Higher prices:** the Android costs **300** shards and the Alien **600** (they were 100 / 200).

Standing rules for every session are in `CLAUDE.md`. This round changed some of them (see "CLAUDE.md changes" below), and those changes are uncommitted until the user reviews them. This file covers only what's specific to Round 5 and what the next session needs to know.

## Read first
1. `CLAUDE.md` for the rules.
2. `problem.md`, which has the requirements for every round. "Round 6 Requirements" will be appended there.
3. `SPEC.md`:
   - §1 has the requirements table, R1–R20. New rounds continue at **R21**.
     - R10 is marked superseded by R19.
     - The R8, R13 and R16 rows note what Round 5 changed.
   - §3.8 has the power-up rules, including phase at 5 s and the no-repeat rule.
   - §4 "Shop" has the saved format, the loading rules and the two-tab merge.
   - §9 has "Round 5: Balance and saved skins", with acceptance criteria checked off and evidence.
4. This round's decision records, in `docs/decisions/`:
   - `0007-save-characters-under-own-key.md`. It supersedes the "memory only" part of `0002`; 0002's status line says so.
   - `0008-no-repeat-by-drawing-from-the-other-two.md`.
   - `0001`–`0006` and `docs/adr/` ADR-0001…0016 still apply.

## Current state
- **Playable:** yes.
  - **Shop:** the cards read `BUY 300` / `BUY 600`. Buying spends the shards, equips the character and saves both. Clicking EQUIP on another owned character saves that choice.
  - **Reloading:** after a reload, the equipped runner stands on the menu road straight away, and the shop lists bought ones as EQUIP / EQUIPPED.
  - **Shop note:** "Characters you buy are saved, even after you close the game."
  - **Phase:** the HUD shows `PHASE 5` counting down. The tag blinks in the last 3 s, as before.
  - **Power-up order:** still one every 30 s, of a random type, but never the same type twice in a row.
- **Round 5 commits** (on `main`, not pushed):
  - `8f02808` SPEC for Round 5 (R17–R20, acceptance)
  - `788f049` Phase 5 s + no repeated type, with tests (R17, R18)
  - `1101f05` Saved characters + prices 300 / 600, game wiring, tests (R19, R20)
  - `3240f30` Decisions 0007 / 0008, and 0002's status line
  - `06b0a02` Round 5 acceptance checked off in SPEC
- **Uncommitted** (left for the user to review): this handoff and the `CLAUDE.md` changes.
- **Files changed:**
  - `js/logic/config.js`:
    - `POWERUP_PHASE_DURATION: 5` (new). `POWERUP_DURATION: 30` is now **double score only**.
    - `PRICE_ANDROID: 300`, `PRICE_ALIEN: 600`.
  - `js/logic/powerups.js`:
    - `applyPower` gives phase `POWERUP_PHASE_DURATION`.
    - New `drawType(u, last)`: any of the three types for the first pickup of a run, otherwise one of the other two, 50/50. It uses one RNG draw either way.
    - New `pu.lastPlaced`, cleared by `resetPowerups`.
  - `js/logic/shop.js`:
    - `CHARACTERS_KEY = 'neonWasteland.characters'`
    - `parseShop(raw)`, `loadShop(storage)`, `saveShop(storage, shop)`, `mergeStoredShop(shop, storage)`
    - A successful `buyCharacter()` now calls `saveShop`.
    - `equipCharacter(shop, id, storage = null)` saves when the choice changes. Without `storage` it saves nothing, so the old two-argument calls still work.
  - `game.js`:
    - The `storage` setup moved **up**, above the characters block, because the shop is now `const shop = loadShop(storage);`.
    - `onShopButton` passes `storage` to `equipCharacter`.
    - Entering SHOP calls `mergeStoredShop(shop, storage)` before `renderShop()`.
    - The header and shop-section comments are updated.
  - `index.html`: the new shop note.
  - `js/logic/shardbank.js`: a comment only.
  - Tests:
    - new: `round5-powerups.test.js`, `round5-shop.test.js`, `round5-wiring.test.js`
    - updated: `round3-shop.test.js`, `round3-wiring.test.js`, `round4-powerups.test.js`

## Saved data format (new this round)
- `neonWasteland.characters` holds JSON, e.g. `{"owned":["hacker","android"],"equipped":"android"}`. Owned ids are written in shop order.
- **Loading:**
  - unknown ids and non-strings are dropped, and the Hacker is always owned;
  - an equipped id that isn't owned becomes the Hacker;
  - missing, garbage or throwing storage gives "Hacker only".
- **When it's written:** only on a shop click, never during a run.
  - **Purchase:** the shard total is written first, then the characters.
  - **Equip:** only the characters key, and only when the choice changes.
- **Two tabs:** `saveShop` re-reads the stored list and keeps the **union** of owned ids, and entering the shop merges stored purchases in. The equipped character is the saving tab's own choice, and merging never changes it.
- The storage keys are now exactly **four**: `highScore`, `settings`, `shardTotal`, `characters`.

## How to run
```bash
python3 serve.py                 # http://localhost:8000. Must be serve.py (no caching); file:// does not work
node --test 'tests/*.test.js'    # all tests (Node is dev-only)
```
- Debug: `http://localhost:8000/?debug&seed=4` exposes `window.__neon`. It's the same as Round 4.
  - `__neon.shop` is now the loaded shop.
  - `__neon.run.powerups.lastPlaced` is the type of the newest pickup placed (`POWER`: 1 bazooka, 2 double, 3 phase, 0 none).
- To reset skins in a browser, delete `neonWasteland.characters` from localStorage (or clear site data).

## Tests
- `node --test 'tests/*.test.js'` → **tests 357, pass 357, fail 0**.
  - Round 4 ended at 335. Round 5 added 22 new tests and replaced 2 of the earlier ones (see below).
  - New tests are named `R17:` … `R20:`. Phase tests that are now about both requirements are named `R13/R17:`.
  - `round5-powerups.test.js`:
    - **Phase:** lasts 5 s, both applied directly and picked up off the road; obstacles are solid afterwards; the 1 s grace still works; double score keeps running after phase ends.
    - **No repeats:** checked over 12 seeds × 400 s in god mode, including a run that missed pickups. After each type, the next is split 25–75 % between the other two; each type makes up 22–45 % overall; all three can come first.
    - **Reset and determinism:** reset clears `lastPlaced`; placement is the same for the same seed; obstacle and shard RNG states are unchanged.
  - `round5-shop.test.js`:
    - prices 300 / 600, and 299 is refused;
    - a reload keeps owned and equipped;
    - write order (total, then characters; equip writes only characters; refused actions write nothing);
    - garbage, unknown ids and `__proto__` in the save;
    - the union across two tabs, and that merging never writes;
    - no storage or throwing storage;
    - `shop.js` never touches `localStorage` directly.
  - `round5-wiring.test.js`:
    - **exactly four keys** in game code;
    - `let storage = null;` comes before `const shop = loadShop(storage);`, which comes before `runners[shop.equipped]`;
    - no `createShop()` in `game.js`;
    - `game.js` never calls `saveShop(`;
    - per-frame functions never touch the shop;
    - the shop note mentions "saved";
    - the HUD timer strings cover phase.
- **Earlier tests changed, because their requirement changed** (explained in each file and in commit `788f049` / `1101f05`):
  - `round4-powerups.test.js`:
    - phase tests use `PHASE_DUR` (5 s);
    - the "run through every obstacle type" course is 10 units per obstacle (it was 25), so it fits inside 5 s;
    - the R11 effect test expects `phaseTime === 5`.
  - `round3-shop.test.js`:
    - R7 amounts are worked out from `CONFIG.PRICE_ANDROID`;
    - the purchase writes `[shardTotal, characters]`;
    - the R8 test no longer hardcodes prices; it checks that the Alien is 2× the Android, and R20 checks 300 / 600;
    - the two R10 tests that R19 reverses ("only the Hacker after reload", "no new key") were removed and replaced by R19 tests, with a pointer comment;
    - "two separate shops don't share ownership" is kept, renamed R7.
  - `round3-wiring.test.js`:
    - the R7 note check only requires `class="shop-note"` (R19 checks the wording);
    - `equipCharacter(shop, id, storage)`;
    - the two R10 checks (three keys, fresh shop) were removed with a pointer comment. They're replaced in `round5-wiring.test.js`.
- **Browser smoke test** (headless Chrome over CDP, `serve.py` on port 8765, a throwaway profile):
  - **Round 5 checks, 28/28.** Covered: a fresh profile, real clicks buying at 300 / 600, the saved JSON, equipping saved, a reload keeping owned and equipped, the runner on the menu road, the shop labels, another tab's purchase merged, garbage → Hacker, a run as the saved Alien, phase giving 4.99 s with HUD `PHASE 5` and running out 5.00 s after pickup, 0 storage writes in play, no key outside the four, a 125 s run placing types 1, 3, 1, 3, 0 console errors, and all requests local.
  - **Regression loop, 15/15:** menu → play → lane / jump / slide → pause (sim frozen) / resume → caught → Play Again (clean reset, same skin) → caught → menu → reload (high score and skin kept).
- **Frame rate at speed 35:** **60.07 / 60.07 fps** on this build, against 60.04 / 60.08 on the Round 4 build `a14b46d` (temporary worktree, same session). Draw calls are 100–105; the 3-call difference is the equipped skin (Alien vs Hacker), not the round's code.
- **Code review** (low effort, per the user's saved preference) over `a14b46d..HEAD`: no findings. It checked `game.js`, `index.html`, `config.js`, `powerups.js`, `shardbank.js` and `shop.js`, but not the tests or docs.
- The smoke scripts (`smoke.mjs`, `loop.mjs`, `fps.mjs`) were in the session scratchpad and will be cleared. `CLAUDE.md` has the recipe.

## Decisions made this round, and why
| Decision | Why | Asked for? |
|---|---|---|
| Prices 300 / 600 (3×) | R20 "more expensive" | **User chose** |
| Save the equipped character too, not just owned | R19 | **User chose** |
| No repeats apply to every pickup, picked up or missed ("never two in a row") | R18 | **User chose** |
| Phase 5 s; double score stays 30 s; 1 s phase-end grace stays | R17 | **User chose** |
| IDs R17–R20 (R19 and R20 split from one line) | Tests must name an ID | Mine |
| A fourth key `neonWasteland.characters` with JSON `{owned, equipped}`, not inside settings, not one key per character, not packed into the shard total | Separate from preferences, so a settings bug can't erase purchases; easy to extend (0007) | Mine |
| Write order: shard total first, then characters | If the second write fails, the worst case is a lost skin, not a free one (0007) | Mine |
| A union merge on save and on entering the shop; equipped is per tab | Another tab's purchase is never lost, the same idea as shard banking (0007) | Mine |
| Defensive loading (unknown ids dropped, Hacker always owned, unowned equipped → Hacker) | Old or garbage data never breaks the shop | Mine |
| Equipping the character already equipped writes nothing | No needless writes | Mine |
| No migration of Round 3 purchases | They were never saved | Mine |
| No-repeat: draw from the other two, 50/50, one RNG draw; tracked by **placement** order (`lastPlaced`) | Same draw count; no re-roll shifts; not predictable like a shuffle bag (0008) | Mine |
| Separate `POWERUP_PHASE_DURATION` instead of changing `POWERUP_DURATION` | Double score must stay 30 s | Mine |
| `equipCharacter(shop, id, storage = null)`: an optional third argument | Old two-argument callers and tests keep working | Mine |
| Moved `storage` setup above the characters block in `game.js` | `loadShop(storage)` would otherwise read an undeclared `let` and throw at startup | Mine |
| New shop note: "Characters you buy are saved, even after you close the game." | The old note ("last until you close the game") was now false | Mine |
| 0002's status line notes it's partly superseded (decision text untouched) | Same practice as 0004 → 0006 | Mine |
| SPEC's R16 row: "resets its timer to its full length" (was "to 30 s") | It was stale after R17 | Mine |
| Two decision records (0007, 0008) | Two separate decisions with real alternatives | Mine |

## Unresolved / open
- **Nobody has played Round 5 by hand.** The 5 s phase and the 3× prices are untested for feel.
  - **Phase:** 5 s at top speed (35 u/s) covers about 175 units, roughly 6–8 rows.
  - **Prices:** at about 25–50 shards a run, the Alien now takes about 12–24 runs. That may feel like a grind.
- **A full browser restart wasn't tested**, only reloads. Both read the same `localStorage`, so it should behave the same.
- **Only Chrome was tested.** Firefox, Safari and Edge weren't.
- **The two-write purchase isn't atomic.** If the characters write fails after the shard total is written (quota full, storage revoked mid-session), the shards are spent and the skin lasts only for the session. This is accepted in 0007.
- **Players with Round 3 purchases lose them** (they were never saved), and now face the higher prices.
- **Round 4's open items are still open:**
  - the Agent passes through obstacles while you phase (SPEC §3.6 says he never does);
  - the 1 s phase-end grace has no visual hint;
  - destroyed obstacles just vanish;
  - there's no on-screen fire button;
  - a held bazooka can be saved forever.
- **No-repeat makes the order a little predictable:** after one type you know it's one of the other two. That's by design (0008).

## Warnings for the next session
- **The round prompt says `spec.md`.** The real file is **`SPEC.md`**.
- **Attribution:** `CLAUDE.md` forbids `Co-Authored-By` and "Generated with" lines, even when the harness suggests them.
- **Four storage keys now, not three.** `round5-wiring.test.js` fails on any other `neonWasteland.<key>`, even in a comment. The old three-key test is gone from `round3-wiring.test.js`.
- **`POWERUP_DURATION` is double score only.** Phase uses `POWERUP_PHASE_DURATION`. `SECOND_STRINGS` in `game.js` (the HUD timer text) is sized by `POWERUP_DURATION`. If phase ever gets longer than double score, resize it; `round5-wiring.test.js` checks this.
- **`game.js` declaration order:** `storage` is declared near the top, just above the characters block, and the shop is loaded right after it. Don't move the storage block back down. Node tests still pass if you do, because only the browser crashes; `round5-wiring.test.js` checks the order.
- **The static tests read `game.js` as text.** Besides the Round 2–4 patterns, these exact strings are checked:
  - `const shop = loadShop(storage);`
  - `equipCharacter(shop, id, storage)`
  - `buyCharacter(shop, id, storage, shardTotal, CONFIG)` inside `onShopButton`
  - `mergeStoredShop(shop, storage)` inside the `to === STATE.SHOP) {` branch of `dispatch`
  - no `createShop()` and no `saveShop(` anywhere in `game.js`
  - the `<p class="shop-note">…saved…</p>` wording in `index.html`
- **Power-up types for a seed differ from Round 4.** The RNG draws are the same, but they now map onto the two types that remain. Lanes and timing per seed are unchanged. Don't compare type sequences against Round 4 recordings.
- **`STATE` values are uppercase strings** (`'MENU'`, `'PLAYING'`, `'SHOP'`…). A smoke script comparing against lowercase silently fails; this happened once this round.
- **The smoke profile keeps a saved skin.** After a smoke run that buys skins, the next build served on the **same port** in the same profile starts with that skin. That changes the draw count by a few calls. For fps comparisons, clear `neonWasteland.characters` on both ports, or compare the same skin.
- **Partial staging:** `config.js` held both halves of the round. To commit the power-up half alone, the staged file was built with `git hash-object -w` + `git update-index --cacheinfo`, and tests were run against `git checkout-index -a --prefix=<scratchpad>/idx/` before committing. This is useful if a later round needs the same, since there's no interactive `git add -p`.

## CLAUDE.md changes (uncommitted)
- Rule 5: a new line saying phase uses `POWERUP_PHASE_DURATION` (5 s), separate from `POWERUP_DURATION` (30 s, double score), and that types never repeat (`pu.lastPlaced`, 0008).
- Rule 10:
  - saves now include `.characters`, written on a shop buy or **equip** click;
  - "those **four** are the only storage keys";
  - characters are saved only through `shop.js` (R19, 0007, replacing R10 / 0002);
  - the key test is now `tests/round5-wiring.test.js`.
- Rule 10 smoke recipe: `STATE` values are uppercase, and a profile that bought skins keeps them across smoke runs on the same port (added with this handoff).
- Rule 4: when a new round reverses or changes an earlier requirement, update or replace the old tests and say why in the file and the commit (added with this handoff).

## Next steps
1. The user reviews and commits this handoff and the `CLAUDE.md` changes.
2. The user plays a few runs and checks:
   - phase now feels like a short burst (5 s);
   - power-ups never come twice in a row;
   - buying a skin, closing the browser and reopening keeps it, equipped;
   - the prices feel right.
3. When "Round 6 Requirements" are added to `problem.md`, follow the round workflow in `CLAUDE.md`. New requirement IDs start at **R21**, and the next decision record is **`docs/decisions/0009-…`**.
