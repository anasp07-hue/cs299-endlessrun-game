# ADR-0006: Obstacle patterns as strings, time-based fair spacing, fixed-size pool

- **Status:** Accepted. The spacing rule is superseded by ADR-0007; everything else here still stands.
- **Date:** 2026-11-17
- **Phase:** 2 (SPEC §9)

## Context
SPEC §3.4 asks for rows built from a hand-made pattern list plus random singles. At least one lane must always be passable, and the minimum gap between rows must scale with speed so reaction time stays fair. SPEC §7.3 forbids allocations during play. The `game-systems` skill lists three fairness invariants that must be testable.

## Decision
- **Pattern format:** 3-character strings, read left to right as lanes: `L` = LOW (jump), `H` = HIGH (slide), `B` = BLOCK (dodge), `.` = empty. For example `'B.B'` or `'LBH'`. Each pattern has a `minDifficulty` (0–1) and a `weight`. The table lives in `js/logic/spawner.js`. Singles are ordinary entries at difficulty 0, so more complex patterns take over as more of them unlock.
- **Spacing is decided in seconds, not units:**
  - `rowTime = max(lerp(ROW_TIME_EASY, ROW_TIME_HARD, difficulty), REACTION_TIME + JUMP_TIME + shift × LANE_CHANGE_TIME)`.
  - `shift` is the fewest lane moves between an open lane of the previous row and an open lane of the next.
  - Starting values: `ROW_TIME_EASY` 1.6 s and `ROW_TIME_HARD` 1.3 s (EASY was 2.2 s before the first playtest found the early game too sparse). These are tuning constants in CONFIG; the floor is the actual decision.
  - The gap in units is `arrivalSpeed × rowTime + maxObstacleDepth`. `arrivalSpeed` is estimated for when the player *reaches* the new row. Because speed only rises, that estimate errs on the generous side.
  - This one rule covers all three skill invariants:
    1. An open lane in every row: enforced by the pattern table and tested.
    2. Reaction time scales with speed.
    3. A LOW followed by a HIGH in the same lane is never closer than a full jump.
- **Track coordinates:** every obstacle stores `s`, its distance along the track. Its z is `scroll − s`, so obstacles share the road's single scroll value and the render interpolation from ADR-0005, and never drift apart.
- **Pool:** `MAX_OBSTACLES` = 48 slots, allocated once. If a row doesn't fit, the whole row is **skipped** and counted in `spawner.dropped`. Skipping a row can only make the run easier, so it stays fair and never crashes. Tests show at most about a dozen obstacles are ever live, so this shouldn't happen in practice.
- **Rendering:** one `THREE.InstancedMesh` per obstacle type (3 draw calls in total), refilled each frame from the slots with a scratch matrix.
- **Phase 2 rule:** *any* hit ends the run (console message + freeze). The side-clip stumble from SPEC §3.6 arrives in Phase 4. `player.restLane` and `player.fromLane` are already tracked for it.

## Alternatives considered
- **Patterns as arrays of type constants:** harder to read and review than `'BHB'`.
- **Spacing in fixed distance that scales with speed:** this is what SPEC literally says. It would need a separate tuning value at every speed, and it doesn't capture the extra time a lane change needs.
- **Re-rolling patterns that break an invariant:** not needed, because spacing adapts to whatever pattern was picked. Every pattern is valid by construction, and the table is checked by tests.
- **Growing the pool when it's full:** would allocate during play and would need the InstancedMeshes to be rebuilt. Skipping a row is simpler and always fair.

## Consequences
- Fairness is testable end to end. A test bot plays 4-minute runs (past max speed and max difficulty) on 10 seeds using the real player, spawner, and collision code, and never gets hit. Bots that never slide, or that react too late, do get hit.
- Adding a pattern is a one-line change, and the table tests check it automatically.
- Phase 4 must replace "any hit ends the run" with head-on vs side-clip handling.
