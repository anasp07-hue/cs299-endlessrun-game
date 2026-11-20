# 0001: Bank shards into a lifetime total at checkpoints, not on every pickup

- **Status:** Accepted
- **Date:** 2026-11-19
- **Round:** 2 (requirements R4, R5, R6 in SPEC §1)
- **Format:** Y-statement. Earlier decisions (Rounds 0–1, Phases 0–8) are in `docs/adr/` (ADR-0001 to ADR-0016). Round 2 decisions start here, numbered from 0001.

## Decision (Y-statement)

**In the context of** making data shards persist after the game is closed, the way the high score does (R4), where the user chose to keep a **lifetime total** of every shard collected,

**facing** the need to keep shards collected right up to the moment a tab is closed, while runs stay smooth with no storage work in the per-frame path (R6) and the game stays offline with no build step (R5),

**we decided for** a separate `localStorage` key, `neonWasteland.shardTotal`, holding a whole number. A run's shards are *banked* only at checkpoints: when the run ends, when it's abandoned from the pause screen, and when the page is hidden (`visibilitychange`) or closed (`pagehide`). The run tracks `shardsBanked`, so banking more than once never double counts. Each bank re-reads the stored total and adds to the larger of it and the in-memory total. The rules live in the pure module `js/logic/shardbank.js`.

**and neglected**
- *writing the total on every pickup*, which is the simplest way never to lose a shard, but puts a synchronous `localStorage` write in the fixed simulation step (up to several per second at max speed). That breaks the "nothing per frame touches storage" rule and risks frame hitches on slow disks.
- *banking only when the run ends*, which matches how the high score is saved, but loses every shard from a run that's still going when the tab or browser is closed. That's exactly the "after closing" case R4 asks about.
- *storing the total inside the `neonWasteland.settings` JSON*, which would mean one fewer key, but mixes progress with preferences. A corrupt or reset settings blob would also wipe the shard total, and settings parsing would need to know about it.
- *storing "best shards in one run" instead of a total*, which is closer to a literal "like the high score". The user asked for the lifetime total.

**to achieve** no lost shards in any normal way of leaving the game, zero storage work during play, a total that can't be counted twice, a save that another open tab can't overwrite, and logic that is tested in Node without a browser,

**accepting that**
- a hard crash or force-quit of the browser mid-run (with no `pagehide` or `visibilitychange`) loses that run's unbanked shards;
- `game.js` has two more event hooks (`pagehide`, and banking inside the existing `visibilitychange` handler);
- two tabs banking in the exact same moment could still lose one tab's shards, because `localStorage` has no atomic add. That's very unlikely for a single-player offline game.

## Consequences
- SPEC §1 (R1–R6), §2, §3.7, §4 (screens and "Shard total persistence"), and §9 Round 2 are updated.
- The menu shows **TOTAL SHARDS**. The game-over screen shows this run's **SHARDS** and the new **TOTAL SHARDS**.
- The total isn't spent on anything yet. A future shop or unlocks could read it from the same key.
