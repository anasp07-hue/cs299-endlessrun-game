# 0002: Keep bought characters in memory only, but save the shards spent on them at once

- **Status:** Accepted
- **Date:** 2026-11-19
- **Round:** 3 (requirements R7, R10 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** a shop that spends the saved lifetime shard total on characters (R7), where R10 says "skins don't save" and the user chose that bought characters reset when the page is reloaded or closed **while the shards spent stay spent**,

**facing** the need for a purchase to stick for the rest of the session but leave nothing behind after a reload, without the spend being undone by a reload or by Round 2's banking (which re-reads storage and keeps the larger total),

**we decided for** holding ownership and the equipped character in a plain in-memory object (`createShop()` in the pure `js/logic/shop.js`), created fresh on every page load and never passed to any save function. Each purchase is spent through a new `spendShards()` in `js/logic/shardbank.js`, which works like banking: it re-reads the stored total, spends from the larger of it and the in-memory total, refuses if that can't cover the price, and **writes the new total right away**, on the click.

**and neglected**
- *saving ownership under a new key and clearing it on load*, which writes data only to throw it away, and leaves a stale key behind if a load fails before the clear;
- *`sessionStorage`*, which is session-scoped but **survives a reload** in the same tab, so a bought skin would come back after a reload, which R10 rules out;
- *deferring the spend to the next bank checkpoint* (run end, pause, hide), which keeps all writes in one place. But a reload in between would save the old total, giving the shards back, and the "max of stored and in-memory" rule would undo the spend by itself;
- *not saving the spend at all* (shards refunded on reload), which is the other reading of R10. The user didn't choose it.

**to achieve** exactly the behaviour the user asked for (after a reload: Hacker only, total still reduced), a spend that can't be undone by a reload or by another tab's banking, no new storage key, no storage work during play, and logic that is tested in Node,

**accepting that**
- players lose characters they paid for when they close the game. The shop says so ("Characters you buy last until you close the game. Spent shards stay spent.");
- there's one more synchronous `localStorage` write, on a shop click. That's never during a run;
- two tabs spending at the same instant could, like banking, lose one write. That's very unlikely and accepted in 0001.

## Consequences
- SPEC §1 (R7–R10), §2, §3.7, §4 ("Shop", state diagram, screens) and §9 Round 3 are updated.
- `tests/round3-shop.test.js` checks that a fresh shop owns only the Hacker, that the spend survives a "reload", and that only `neonWasteland.shardTotal` is ever written. `tests/round3-wiring.test.js` checks that game code has no other storage key, and no `sessionStorage`, IndexedDB, or cookies.
