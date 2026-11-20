# 0006: A power-up reaches the player every 30 s, on a fixed clock timed by arrival

- **Status:** Accepted. Supersedes the timing part of 0004; the rest of 0004 (placement in the gaps between rows, own RNG, never on a shard) still holds.
- **Date:** 2026-11-19
- **Round:** 4 (requirement R15 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** R15 ("spawn is random but rare"), where the user first chose "about every 45–60 s". After play-testing ("I can't find any power-ups"), they changed it to **every 30 seconds**,

**facing** what went wrong with 0004's timer. It drew a random 35–65 s and counted it from when a pickup was *placed*, but a pickup is placed about 160 units up the road, 5–13 s before the player reaches it. The first one therefore reached the player 46–74 s into a run, and most runs end sooner. A timer that waits for a gap with room also drifts later with every wait,

**we decided for** timing by **arrival** on a **fixed clock**. Pickups are scheduled to reach the player at `POWERUP_FIRST` = 30 s, then every `POWERUP_INTERVAL` = 30 s (30, 60, 90 s…). When the spawner logs a gap, `travelTime()` works out when the player will reach its centre from the speed ramp (a closed form, accurate to about 0.01 s in the tests). The first gap with room that is reached at or after the next slot gets the pickup, and the next slot is the one after that. The type and lane are still drawn from the power-up RNG, so the spawn stays random.

**and neglected**
- *keeping 0004's random interval and just shortening it* (e.g. 20–40 s from placement). Small change, but the placement lead time (5–13 s, depending on speed) would still blur "every 30 s" by up to 8 s, and the first would still arrive late;
- *placing a pickup the moment it's due, close to the player*. Exact timing, but it would pop into view a second or two ahead instead of coming out of the fog, and might land in a gap that doesn't exist yet;
- *counting the next 30 s from the actual arrival*. Simpler, but each wait for a gap with room (up to about 2.6 s) pushes every later pickup back, so after a few minutes they're well off a 30 s rhythm;
- *a random interval averaging 30 s*. It keeps more randomness in *when*, but the user asked for "every 30 seconds", and type and lane already make each one random.

**to achieve** a first power-up about 30 s into every run that lasts that long, one every 30 s after that with no drift, each still visible from far up the road (placed at least 3 s before it arrives, in practice about 11 s), and obstacles and shards unchanged,

**accepting that**
- each pickup arrives 0–3 s *after* its slot (0.5–1 s on average), never before, because it can only sit in a gap between rows that has room;
- power-ups are three times as frequent as in 0004, so "rare" now means "every 30 s", the user's call. One run in three gets a phase every 90 s on average;
- `chaser.test.js`'s deliberate side-clip runs now turn pickups off, because a phase pickup often passed the clip straight through. That test is about stumbles; phasing through a clip is tested in `round4-powerups.test.js`.

## Consequences
- `CONFIG.POWERUP_INTERVAL_MIN` / `_MAX` are replaced by `POWERUP_FIRST` and `POWERUP_INTERVAL`. `js/logic/powerups.js` has `travelTime()`.
- SPEC §1 (R15), §3.8 and §9 Round 4 (R15) are updated.
- `tests/round4-powerups.test.js` checks over 8 seeds × 400 s that pickup *k* reaches the player between 30*k* and 30*k* + 3 s, that every slot is filled, and that each pickup is placed at least 3 s before it arrives.
