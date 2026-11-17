# ADR-0007: Chaotic but fair spawning (no dead ends, jitter, stagger, random rows)

- **Status:** Accepted. Supersedes the **spacing rule** of ADR-0006. The rest of ADR-0006 still stands: pattern strings, track coordinates, pool behavior, InstancedMesh rendering.
- **Date:** 2026-11-17
- **Phase:** 2 (SPEC §9), after the first playtest

## Context
In the first playtest, the user found the spawns too uniform and too sparse, with "big sections where nothing is there". They asked for something more chaotic and a little closer together, but always passable, and never three BLOCKs in a row.

ADR-0006 spaced every pair of rows at least `REACTION_TIME + JUMP_TIME` (1.25 s) apart, whether or not a jump was involved. Rows were flat lines placed on a fairly steady beat. That's safe, but it's too conservative to allow a denser or more irregular rhythm.

## Decision
- **No-dead-end rule.** For every open (non-BLOCK) lane `i` of a row, at least one open lane `j` of the next row must be reachable:
  `arriveS(next, j) − departS(prev, i, j) ≥ transitionTime(type_i, type_j, |i−j|) × v + rowMargin`.
  - `transitionTime`: `REACTION_TIME` (0.55 s) whenever a jump, slide, or lane change is needed. It's raised to `JUMP_TIME` (0.7 s) if the player just jumped and the next obstacle needs a jump or slide (they must land first). Each lane change adds `LANE_CHANGE_TIME` (0.12 s). Staying in an empty lane needs nothing.
  - `departS`: the obstacle in lane `i` if staying in that lane, or the whole previous row when changing lanes. `arriveS`: the obstacle in lane `j`, or the start of the row for an empty lane.
  - `rowMargin`: the deepest obstacle plus the player's depth, so obstacles are fully clear before and after.
  - `v`: the speed the player could have on reaching the row, refined until it settles and then padded slightly. If it doesn't settle, `SPEED_MAX` is used. This always errs on the generous side.

  Since every lane you can survive a row in has a way forward, you can never be trapped (by induction).
- **The skill's same-lane rule is kept as a hard limit:** a LOW followed by a LOW/HIGH in the same lane is never closer than a full jump.
- **Irregular rhythm:** the target gap is `lerp(ROW_TIME_EASY 1.35, ROW_TIME_HARD 0.95, difficulty) × (1 ± GAP_JITTER 0.3)`. The no-dead-end floor pushes it out when needed.
- **Staggered rows:** each obstacle in a row is offset in depth by up to `lerp(STAGGER_EASY 0.1, STAGGER_HARD 0.3) s × v`. Rows never overlap each other.
- **Random rows:** with probability `lerp(RANDOM_ROW_EASY 0.15, RANDOM_ROW_HARD 0.4)`, a row is generated lane by lane (weights `RANDOM_W_*`). Rows that are all BLOCK or empty are re-rolled. About 36% of rows end up random.
- **No idle lanes** (added after the second playtest note: "some lanes have long blank sections where you don't need to move at all"): a lane that was empty in a row must get an obstacle in the next row. Table patterns are filtered to those that fill the required lanes. Random rows force an obstacle in them. When 2+ lanes must be filled, a random row is used with probability `RANDOM_ROW_FORCED` (0.5), because early on only `LLL`/`HHH` fit. If no table pattern fits, a random row is always used. Spacing is still decided by the no-dead-end rule afterwards, so forcing obstacles can never make a row impossible.
- All randomness is drawn before the row is placed, so runs stay fully deterministic per seed.

## Alternatives considered
- **Just lowering the ADR-0006 floor:** this would sometimes create rows that can't be passed (for example a jump followed by a slide sooner than physics allows).
- **Requiring every lane of the next row to be reachable:** far too strict. It would forbid most interesting patterns.
- **Full multi-row path search (any path at all is enough):** allows traps, where the obvious lane is a dead end two rows later. Checking every lane one row ahead rules out traps and only needs a simple linear bound.
- **Using a lower `transitionTime` after LOW→HIGH (fast-fall makes about 0.15 s possible):** physically true, but it needs expert input. Kept at `JUMP_TIME` for now.

## Consequences
- Measured over 10 seeds (obstacles per second, before → after):
  - First 30 s: 0.87 → 1.15.
  - After 2 minutes: 1.75 → about 2.3.
  - Gaps now vary from about 0.5 to 1.8 s instead of following a steady beat.
- Evidence:
  - Tests check, on the obstacles that actually spawned, that there are no dead ends at the real arrival speed.
  - A planning bot and a greedy nearest-lane bot both survive 4-minute runs on 12 seeds. A bot that never slides is caught on every seed.
- **Code-review fix (before the first commit):** stagger meant an obstacle in the lane you leave, or a lane you cross, could arrive before the target lane's obstacle. The worst case found left 0.28 s to react instead of 0.55 s. The reach rule now uses the *first obstacle on the whole path* (`arrivePathS`, lanes i..j inclusive). The spawner and the checks share one formula (`reachNeed`). `transitionTime` also adds `actionLead`: the physics-derived ~0.08 s for a jump to clear a LOW. A bot that waits a full reaction time before changing lanes exposed that one. An independent checker (written separately from `canReach`) confirms at least 0.55 s of reaction everywhere over 20 seeds.
- A bug found while building this: the speed estimate never met its exact convergence test, so it fell back to max speed and made the early game too sparse. It now stops within 0.01 units/s and adds that as a cushion.
- The tuning knobs are all in CONFIG. If it feels too hard, raise `ROW_TIME_*` or lower `GAP_JITTER`/`RANDOM_ROW_*`. The fairness rule doesn't change.
