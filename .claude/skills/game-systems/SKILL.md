---
name: game-systems
description: Physics and backend/systems engineer for the Apocalypse Run endless runner. Use when working on the game loop, movement and jump physics, lane switching, collision detection, obstacle spawning and fairness, difficulty/speed curves, chaser logic, object pooling, game state machine, scoring, or save data (high score, settings).
---

# Game Systems & Physics — Apocalypse Run

You are the physics / systems engineer. There's no server. "Backend" here means everything under the visuals: simulation, rules, state, and persistence. Your systems must be **deterministic enough to test, fair to the player, and allocation-free per frame**.

**Source of truth:** `SPEC.md` §3 (gameplay), §4 (states, high score), §7 (technical design). The numbers below are starting values. Tune them, but keep them as named constants in one `CONFIG` object so they're easy to change.

## Coordinate system
- +Y is up. The player runs toward **−Z**. The player stays at `z = 0`, and the world moves toward **+Z** at `speed`.
- Lane X positions: `[-LANE_W, 0, +LANE_W]` with `LANE_W = 2.5`.
- Spawn obstacles about 120 units ahead (inside the fog). Despawn them once `z > camera.z + 5`.

## Game loop
- Clamp `dt` at `1/20` (SPEC §7.1).
- Run the simulation with a **fixed timestep** (e.g. `1/120`) and an accumulator. This keeps jumps, collisions, and spawning consistent no matter the frame rate. Collision checks happen every substep so nothing tunnels through obstacles at 35 units/s.
- Only simulate while `state === 'PLAYING'`. Render in every state.

## Player physics

**Lanes:** keep `targetLane` and an input queue of at most 2 moves. Interpolate `x` toward the target over about 0.12 s, using exponential smoothing or a fixed-duration ease. Don't use instant snapping.

**Jump:** derive physics from design values instead of guessing:
```
JUMP_HEIGHT = 2.2, JUMP_TIME = 0.7   // total airtime
g  = 8 * JUMP_HEIGHT / JUMP_TIME²    // ≈ 35.9
v0 = 4 * JUMP_HEIGHT / JUMP_TIME     // ≈ 12.6
vy -= g * dt; y += vy * dt; land when y <= 0
```
- Jumping while sliding cancels the slide. No double jump.
- **Fast-fall:** pressing slide in the air sets `vy = -FASTFALL_V` (about 25), then starts a slide on landing.
- **Input buffering:** a jump pressed up to about 0.1 s before landing still fires on landing. This makes the controls feel responsive.

**Slide:** lasts about 0.7 s. The hitbox height drops from about 1.8 to about 0.8.

## Collision
- Use AABBs only, built from plain numbers (no `Box3` allocation per frame). Store `{minX, maxX, minY, maxY, minZ, maxZ}` per pooled obstacle and update it when the obstacle moves.
- Make the player's hitbox about 15% smaller than the visual mesh. Near-misses should feel lucky, not unfair.
- Obstacle hitboxes by type, relative to the obstacle's origin:
  - **LOW:** height about 0.9. Clearable at jump apex with margin.
  - **HIGH:** spans y ≈ 1.1 → 3.0. Slide height (0.8) passes under it, standing height (1.8) hits it.
  - **BLOCK:** height about 2.5 or more. Can't be jumped.
- **Head-on vs. side clip** (SPEC §3.6): if the player was changing lanes when the overlap happened, and the obstacle is in the target lane (not the lane the player is leaving), it's a **side clip**. Otherwise it's **head-on**. For a side clip, set `targetLane = previousLane`, start a stumble, and make the obstacle non-colliding for this pass so it can't hit twice.

## Chaser
- Keep `chaserGap`, a distance behind the player. Normal value is about 12 (off-screen or far back). After a stumble it drops to about 3, then recovers toward normal over the stumble window (about 8 s).
- Track `lastStumbleTime`. A stumble while `now - lastStumbleTime < STUMBLE_WINDOW` means **caught** and the run ends.
- Head-on hit: snap the chaser to the player, play a short catch beat, then switch to `GAMEOVER`.

## Spawning & fairness
- Use a **seeded RNG** (e.g. mulberry32) owned by the spawner. Seed it from the time in normal play, and with a fixed seed in tests.
- Rows come from a pattern table. Each lane is `null | 'LOW' | 'HIGH' | 'BLOCK'`, and each pattern has a `minDifficulty` before it can appear.
- **Fairness invariants** (must be testable):
  1. Every row has at least one lane that isn't BLOCK.
  2. Minimum gap between rows: `gap ≥ speed * REACTION_TIME + LANE_CHANGE_DIST_BUFFER`, with `REACTION_TIME ≈ 0.55 s`. If a row needs a lane change, the previous row must leave room to make it.
  3. Never require two actions faster than the jump or slide duration allows. A HIGH can't be placed right after a LOW in the same lane closer than `speed * JUMP_TIME`.
- If a pattern would break an invariant, re-roll it. Don't patch obstacles after they've spawned.

## Difficulty
```
speed = min(SPEED_MAX, SPEED_START + SPEED_ACCEL * t)   // 12 → 35, reaching max around 3–4 min
difficulty = clamp(distance / 2000, 0, 1)                // gates patterns and density
```
Score: `score += speed * dt * multiplier`, where `multiplier = 1 + floor(distance / 500) * 0.1`. Display the score with `Math.floor`.

## Pooling & world recycling
- Pool each obstacle type and each world chunk type. Fill the pools at startup. If a pool runs dry, grow it (and warn in dev), never crash.
- Recycle ground chunks by moving the trailing one to the front. This includes distance accumulation, so chunks never drift apart. Advance positions by `speed * dt` with one shared offset rather than separate per-object floats that build up error.
- Keep zero allocations in the update path: use module-level scratch objects and plain arrays, and avoid `forEach` closures in hot loops.

## State machine
```
MENU → PLAYING ⇄ PAUSED → GAMEOVER → PLAYING | MENU
```
- Make transitions go through one `setState(next)` function that handles enter/exit side effects (show/hide overlays, start/stop audio, reset clock).
- A single `resetRun()` sets **every** piece of run state back to its initial value. When you add new state, add it to `resetRun()` too.
- Input is turned into actions per state. Gameplay keys are ignored outside `PLAYING`. Eat the key that started or restarted a run so it doesn't also jump.

## Persistence
```js
const KEY = 'neonWasteland.highScore';
function loadHigh() { try { const v = Number(localStorage.getItem(KEY)); return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0; } catch { return 0; } }
function saveHigh(v) { try { localStorage.setItem(KEY, String(Math.floor(v))); } catch {} }
```
Settings (mute, and later quality) use the same pattern under `neonWasteland.settings` as JSON, merged over the defaults. (The `neonWasteland.` key prefix predates the rename to Apocalypse Run and is kept on purpose, so saves survive; ADR-0010.)

## Testability
Keep the core rules (RNG, pattern validation, AABB overlap, speed/score curves, high-score parsing) as **pure functions with no DOM or three.js access**, so `node --test 'tests/*.test.js'` can import them. See the `test-review` skill. If they live in `game.js` alongside DOM code, propose extracting them into a small module (e.g. `js/rules.js`) to the user.

## Debug aids (dev only)
A `?debug` URL flag that shows hitbox wireframes, current speed/difficulty/seed, and the pool sizes. It should cost nothing when the flag is off.
