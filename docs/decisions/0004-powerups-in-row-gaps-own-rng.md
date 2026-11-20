# 0004: Place power-ups in the gaps between rows, on a random timer, with their own RNG

- **Status:** Accepted
- **Date:** 2026-11-19
- **Round:** 4 (requirements R11, R14, R15, R16 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** adding three power-ups (bazooka, double score, phase) that are picked up off the ground (R14), where they spawn is random but rare (R15; the user chose "about every 45–60 s"), and nothing else may break (R16),

**facing** two kinds of risk. First, the obstacle spawner's fairness rules (ADR-0006/0007: no dead ends, reaction time, no idle lanes) are carefully tuned and tested per seed. Second, "rare" has to mean the same thing at 12 units/s and at 35 units/s.

**we decided for** a pure module, `js/logic/powerups.js`, that works like the data shards (ADR-0016):
- It reads the spawner's **gap log** and puts a pickup in the open stretch between two rows: centred, a full row margin clear of both, in a lane open in both rows if there is one (otherwise open in the next row), and never on that gap's shard line.
- **Timing is in run seconds.** The next pickup becomes due a uniformly random 35–65 s after the last one (or the start of the run), about one every 50 s. The first suitable gap after that gets it, and its type is picked at random, each equally likely.
- It draws from its **own seeded RNG** (`powerSeed(seed)`), so every seed's obstacle rows and shard lines are exactly what they were before Round 4.
- All of it is **run state**, cleared by `resetRun()`. Nothing is saved.

**and neglected**
- *making a power-up a cell type in the spawner's patterns* (e.g. `P` in `L.P`). It sits exactly in a row and is simple to draw, but it changes the pattern table, the RNG stream, and the fairness proofs for every seed. A pickup standing in a lane also competes with that lane's obstacle answer: you can't jump a LOW and grab a pickup at the same spot.
- *a fixed chance per row* (e.g. 2%), which is the simplest to write. But rows come faster as speed rises, so pickups would be about three times as common late in a run as early. The spacing is also memoryless: two in a row, or none for three minutes.
- *a distance-based interval*. It's stable per seed, but the same problem as above: at max speed a distance interval passes three times faster.
- *sharing the shard RNG*. One fewer stream, but every shard line after the first pickup would move, so Round 2/3 shard expectations for a seed would silently change.
- *floating pickups at shard height*, which are easier to collect. The user asked for them on the ground (R14), so jumping over one misses it, like shards.

**to achieve** pickups that are rare at every speed, random but reproducible per seed (tests and `?seed=`), never on or next to an obstacle or a shard, and that can't change the obstacle sequence or its fairness,

**accepting that**
- a due pickup waits for a gap long enough to hold it, so the real spacing is 35 s to a little over 65 s;
- the module copies the shards' gap-log reading pattern, so the two must stay in step if the gap log changes;
- elapsed time is measured when a gap is *planned* (up to `SPAWN_AHEAD` units out), not when the player reaches it, so the time a player sees between pickups varies by a few seconds.

## Consequences
- SPEC §1 (R11–R16), §2, §3.3, §3.8, §4 (HUD) and §9 Round 4 are updated.
- `tests/round4-powerups.test.js` runs 8 seeds × 400 s and checks: the spacing (35–65 s, mean 44–58), the type shares, every lane used, never near an obstacle or on a shard, never in front of a BLOCK, determinism per seed, and that the spawner's and the shards' RNG states and rows match a run without power-ups.
