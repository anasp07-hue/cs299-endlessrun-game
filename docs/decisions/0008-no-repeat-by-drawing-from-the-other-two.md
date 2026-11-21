# 0008: No repeated power-up: draw the next type from the other two, by placement order

- **Status:** Accepted. Adds to 0004 and 0006 (placement and timing are unchanged).
- **Date:** 2026-11-20
- **Round:** 5 (requirement R18 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** Round 5's "if you pick up a power-up the next spawn won't be the same one". The user chose the stronger reading, **"never two in a row"**: it applies whether or not the earlier pickup was collected. Each pickup's type was a uniform draw from the power-up RNG (0004),

**facing** a choice of how to rule out a repeat while keeping the spawn random, deterministic per seed, and fair to every type. It also has to leave the obstacle and shard RNG streams untouched,

**we decided for** remembering the **last placed** type (`pu.lastPlaced`, cleared by `resetRun()`) and drawing the next type from **the other two, 50/50**, in a single RNG draw (`drawType(u, last)`). The first pickup of a run is any of the three. Because pickups reach the player in the order they're placed, "last placed" is also "the one before it on the road", picked up or not.

**and neglected**
- *re-rolling until the type differs*. Same distribution, but it uses a variable number of draws, so every later lane and type of a seed shifts whenever a repeat is rolled, and it's harder to reason about;
- *a shuffled bag of the three types* (each type once per three pickups). It's fairer over a short run, but the end of one bag and the start of the next can still repeat unless that's patched, and it makes the sequence predictable (after two you know the third);
- *keying it to the last type **picked up*** (the literal wording). The user chose "never two in a row" instead. Picking up and missing should feel the same, and a missed pickup followed by the same type looks like a repeat to the player;
- *weighting away from phase* (the overpowered one). That's out of scope: R17 rebalanced phase by shortening it to 5 s.

**to achieve** no back-to-back repeats on any seed, with each type still about a third of all pickups (the no-repeat chain's long-run share is uniform), placement still deterministic per seed, and obstacles and shards unchanged (power-ups keep their own RNG, and the stream keeps one draw per type),

**accepting that**
- the sequence is a little less random: after a bazooka you know the next one is double score or phase;
- the type sequence of a seed differs from Round 4's (same RNG draws, now mapped onto two types), so a recorded Round 4 seed doesn't replay the same power-ups. Lanes and timing are unchanged;
- with only three types, every pickup after the first has just two possibilities.

## Consequences
- `js/logic/powerups.js` has `drawType()` and `pu.lastPlaced`. SPEC §3.8 and §9 Round 5 are updated.
- Tests: `tests/round5-powerups.test.js`. No repeats on 12 seeds × 400 s, including missed pickups; about 50/50 after each type; each type about ⅓ overall; every type can come first; reset clears it; obstacles and shards are unchanged.
