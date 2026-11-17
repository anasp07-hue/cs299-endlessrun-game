# ADR-0005: Fixed-timestep simulation with render interpolation

- **Status:** Accepted
- **Date:** 2026-11-17
- **Phase:** 1 (applies to all later phases)

## Context
SPEC §7.1 sketched a variable-step loop: `update(dt)` once per frame with `dt` clamped to 1/20. With a variable step, jump arcs, lane-change timing, spawning, and (from Phase 2) collisions depend on the display's frame rate. At 35 units/s, a 1/20 s frame moves obstacles 1.75 units in one step, which is enough to tunnel through a thin obstacle. The `game-systems` skill recommends a fixed step.

## Decision
- The simulation advances in **fixed steps of `CONFIG.SIM_STEP` = 1/120 s**. `createFixedStepper` (`js/logic/loop.js`) collects the clamped frame time and returns how many steps to run this frame, capped at 8 per frame. If the cap is hit, the leftover time is dropped so the loop can't fall into a "spiral of death".
- **Rendering interpolates** between the last two simulation states using `stepper.alpha()`. The player keeps `prevX/prevY`, and the world keeps `prevScroll`. This keeps motion smooth on 60, 75, 120, and 144 Hz displays, even when a frame runs an uneven number of steps.
- The jump uses exact constant-acceleration integration (velocity Verlet), so the apex and airtime match `JUMP_HEIGHT` and `JUMP_TIME` at any step size (tested at 60/120/240 Hz).
- `MAX_DT` (1/20) still clamps the frame time before it reaches the stepper.
- The camera's follow smoothing runs per rendered frame with frame-rate-independent `damp()`. It's purely cosmetic, so it doesn't need fixed steps.

## Alternatives considered
- **Variable step (SPEC §7.1 as written):** simpler, but the physics depends on the frame rate and collisions can tunnel at high speed.
- **Fixed step without interpolation:** visible judder whenever the display rate isn't a multiple of 120 Hz (e.g. 144 Hz alternates between 1 and 2 steps per frame).
- **1/60 step:** half the CPU cost, but moves 0.58 units per step at max speed, versus 0.29 at 1/120. The extra cost is negligible for this game's simulation.

## Consequences
- Physics and (later) collisions are deterministic for a given input sequence and seed, which makes them testable.
- Every piece of simulated state that is rendered needs a `prev` copy for interpolation. New moving things (obstacles in Phase 2, the chaser in Phase 4) must follow the same pattern.
- When the game resumes from pause (Phase 3), call `stepper.reset()` so no stale leftover time is simulated.
- SPEC §7.1 is updated to describe this loop.
