# 0007: Save owned and equipped characters as JSON under their own key, `neonWasteland.characters`

- **Status:** Accepted. Supersedes the "keep ownership in memory only" part of 0002. 0002's spend rule (`spendShards()` re-reads storage and saves the new total at once, on the click) still holds.
- **Date:** 2026-11-20
- **Round:** 5 (requirements R19, R20 in SPEC §1; R19 replaces R10)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** Round 5's "make it so the skins you buy save after exiting, but they are now more expensive". The user chose to save the **equipped** character too, and to raise the prices to **300 / 600**. Until now there were exactly three storage keys (`highScore`, `settings`, `shardTotal`), and a test failed on any other,

**facing** the question of where ownership lives in storage. A purchase now touches two saved values (the shard total and the owned list). Another tab may buy or equip at the same time, and bad or old data must never break loading,

**we decided for** a **fourth key, `neonWasteland.characters`**, holding JSON `{"owned":["hacker","android"],"equipped":"android"}`. It's read and written only through the pure `js/logic/shop.js` (`parseShop`, `loadShop`, `saveShop`, `mergeStoredShop`).
- **When it's written:** only on a shop click. A successful `buyCharacter()` first spends (and saves) the shards, as before, then saves the characters. `equipCharacter(shop, id, storage)` saves when the choice changes.
- **Loading** is defensive. Unknown ids and non-strings are dropped, the Hacker is always owned, and an equipped id that isn't owned falls back to the Hacker. Missing, garbage or unreadable storage gives "Hacker only".
- **Other tabs:** like the shard bank, `saveShop()` first re-reads the stored list and keeps the **union** of owned ids, and entering the shop merges stored purchases in. A purchase in one tab is never erased by another tab's save. The equipped character is the saving tab's choice.

**and neglected**
- *adding `characters` to the `neonWasteland.settings` JSON*. That avoids a new key, but `saveSettings()` rewrites the whole object from a settings-only shape, so every mute or quality toggle would have to carry ownership through. A bug there would silently delete paid-for skins. Settings are preferences, and ownership is something bought;
- *one key per character* (`neonWasteland.owned.android`, …) plus one for the equipped character. No JSON to parse, but it adds a key for each new character and makes the equipped/owned rule span several keys;
- *storing ownership inside the shard total* (e.g. `"50|android,alien"`). One write per purchase, so the spend and the ownership can't drift apart. But it breaks the plain-digits format of `shardTotal`, and every Round 2 reader and test that parses it;
- *a version field or a bitmask*. It's compact, but there's nothing to migrate (Round 3 never saved ownership), and the JSON stays readable and forgiving.

**to achieve** skins that survive closing the browser, with the runner you last picked shown straight away on the menu road. It also gives a format that's easy to check and to extend with new characters, no lost purchases across tabs, no storage work during a run, and logic that's tested in Node,

**accepting that**
- a purchase is **two writes** (total, then characters). If the second fails (quota, private mode turning on mid-session), the shards are spent but the skin lasts only for this session, as in Round 3. The reverse order would risk a free skin instead, and losing a skin is the safer failure;
- there are now four storage keys. The rule that "only three keys exist" (CLAUDE.md, `round3-wiring.test.js`) becomes "only these four" (`round5-wiring.test.js`);
- the union rule means a character can't be "un-owned" by editing one tab's state. There's no refund or sell feature, so that's fine;
- players who bought skins in Round 3 don't get them back (they were never saved, and the user chose then that spent shards stay spent). The higher prices apply from now on.

## Consequences
- SPEC §1 (R8, R10, R19, R20), §2, §4 "Shop", §5 and §9 Round 5 are updated.
- `CONFIG.PRICE_ANDROID` / `PRICE_ALIEN` are 300 / 600.
- `game.js` sets up `storage` before the characters block and creates the shop with `loadShop(storage)`. The shop note says purchases are saved.
- Tests: `tests/round5-shop.test.js` (logic) and `tests/round5-wiring.test.js` (four keys, load order, save only on click). The Round 3 R10 tests whose rule is reversed were replaced. Each replacement is explained in its file and in the commit.
