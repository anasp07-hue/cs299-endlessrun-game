# ADR-0016: Data shards between rows; LOW/HIGH quality setting

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 8 (SPEC §9). This resolves SPEC §10 open question 4.

## Context
Phase 8 is "pick and choose". The user chose two items: **data-shard collectibles** and a **quality setting (low/high, toggling particles/shadows)**. Touch/swipe controls and the separate profiling pass were dropped from v1.

Collectibles must not undermine the spawner's fairness guarantees (ADR-0006, ADR-0007) or the "same seed, same run" determinism that the tests rely on. Per-frame code must not allocate (§7.3). The game has no shadows at all (§5: shadows off), so "toggle shadows" has nothing to act on.

## Decision
- **Placement in gaps, read from a spawner gap log.**
  - The spawner records each open stretch between consecutive rows in a 16-entry ring: from the previous row's last obstacle to the next row's first, plus bitmasks of the non-BLOCK lanes on each side. The run-up before the first row counts as a gap too.
  - `js/logic/shards.js` reads new entries after `updateSpawner`. With `SHARD_RUN_CHANCE` (0.5), it lays a line of 3–5 shards, 2.2 apart and centred in the gap, keeping `rowMargin + half a shard` clear of both rows. So a shard never overlaps an obstacle.
  - The lane is one that is open in both rows if possible, otherwise one open in the next row. Following a line never steers you into a BLOCK.
- **Own RNG stream.** Shards draw from `createRng(seed ^ 0x5eed5a)`, with a fixed two draws per gap. The obstacle sequence for any seed is identical with or without shards, and they never move or remove obstacles. Collecting them is optional, so fairness is unchanged.
- **Pickup and scoring.**
  - The pickup box is centred at y 0.85 (0.45–1.25), 1.0 wide and 0.8 deep. Standing and sliding boxes reach it, while jumping over it misses it: you trade a jump for points.
  - Each shard adds `25 × scoreMultiplier(distance)` to the score. The run counts `shardCount`, and `resetRun` resets it along with the shard pool, the gap cursor, and the shard RNG.
  - Shards live in a 48-slot pool. A line that doesn't fit is cut short and counted in `dropped` (it stays 0 in tests).
- **Look.** A tall octahedron in `glowBlue` (unlit, sky-fogged, one `InstancedMesh`, so 1 draw call) that spins and bobs inside its pickup box. Cold blue fits the city's surviving screens and can't be confused with the warm obstacle cues. On pickup it plays a glassy chime that climbs in pitch along a line, plus a small spark puff. The HUD shows a ◆ counter, and the game-over screen shows the total.
- **Quality setting.**
  - `settings.quality` is `'high' | 'low'`, saved in the existing `neonWasteland.settings` JSON. Invalid values fall back to `'high'`, and older saves without the key still load.
  - `qualityProfile()` (pure) maps the level to `{ pixelRatioMax, particles }`. HIGH is 1.5 px with dust and sparks. LOW is 1 px with no dust and no sparks.
  - Resolution replaces "shadows", because there are none to toggle. Spark crackle audio still plays on LOW, so sound doesn't depend on graphics.
  - The toggles are buttons on the menu and pause screens. There's no key for it, since it's a settings choice rather than something you switch mid-run.

## Alternatives considered
- **Shards from the spawner's RNG / placed inside rows.** Rejected: it changes every seed's obstacle sequence (breaking replayable seeds and pinned tests), and putting pickups next to obstacles invites "bait" lines that pull players into bad positions.
- **The shard module scanning spawned obstacle slots for gaps.** Rejected: rows spawn up to `SPAWN_AHEAD` before they're near and several spawn in one step at the start, so gaps would be missed or need guesswork. A small gap log in the spawner is exact and allocation-free.
- **Shards above LOW obstacles (reward the jump).** Deferred. It's a nice idea, but it puts a pickup at an obstacle's depth, which the "never overlaps an obstacle" invariant forbids. It could come later with its own rules.
- **Adding shadows just to toggle them.** Rejected: more GPU cost for no gameplay value, and against §5.

## Consequences
- SPEC §2, §3.7, §4 (HUD, menu, pause, game over, settings), §9 Phase 8, and §10 Q4 are updated.
- Shards add 1 draw call. The game measured about 102 draw calls at max speed, under the 150 budget.
- The spawner has a little more state (the gap log), covered by its reset-equals-fresh test.
- Touch controls and a formal cross-browser pass (§8 "Chrome, Firefox, Safari, Edge") remain undone for v1.
