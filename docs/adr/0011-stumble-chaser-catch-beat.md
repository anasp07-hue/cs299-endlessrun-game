# ADR-0011: Side-clip stumble, chaser gap, and the catch beat

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 4 (SPEC §9)

## Context
SPEC §3.6 says a head-on hit ends the run, while a side clip (bumping an obstacle while changing lanes) makes you stumble back to your previous lane and brings the Agent closer. A second stumble within about 8 s means you're caught. Several details weren't pinned down:
- the exact rule that tells a side clip from a head-on hit,
- what "previous lane" means after a mid-move reversal,
- how the Agent's distance behaves,
- whether "ends immediately" leaves room for the Agent to visibly catch you,
- how a bounced player avoids hitting the same obstacle twice, and
- how the Agent, running behind the player, avoids running through obstacles the player just passed.

## Decision
All of the rules below live in pure modules: `js/logic/chaser.js`, `js/logic/trail.js`, `player.bounceBack()`, and `stepRun()`. Numbers are in `CONFIG`.

1. **Classification.** A hit is a **side clip** when `player.moving` is true and the obstacle's lane is not `player.restLane`, the last lane the player actually stood in. Everything else is **head-on**. That includes an obstacle in the lane being left (dodging too late) and running back into your own lane after a reversal.
2. **Bounce.** A side clip calls `bounceBack()`. It clears queued moves and starts a normal lane move from the current x back to `restLane`. Lane input is ignored until the player gets there (`player.bouncing`), so they can't steer back through the obstacle. Jump and slide still work.
3. **Hit once.** The clipped obstacle gets `slot.ignored = true` while the player bounces off it. The flag is cleared as soon as the bounce ends (`run.clipSlot`), and on spawn and reset, so steering back into it later is a real hit, never a walk-through. `findHit` skips ignored slots. After a side clip, `stepRun` looks again in the same step, because the player box can overlap a second obstacle at the same moment, and a head-on hit there still counts.
4. **Stumble window.** `STUMBLE_WINDOW = 8` s, a countdown. Stumbling while it is still running means caught. Stumbling after it has expired starts a fresh window.
5. **Chaser gap.**
   - Normal: `CHASER_GAP_NORMAL = 12` units behind the player, which puts him behind the camera (`CAMERA_Z = 6.5`), so he's off-screen.
   - On a stumble he lunges in at `CHASER_CLOSE_SPEED = 30` u/s toward `CHASER_GAP_STUMBLE = 3.8`. At that distance he shows just below the Hacker in view. Closer than that, he covered the Hacker's feet in screenshots.
   - He then eases back as `STUMBLE + (NORMAL − STUMBLE)·r²`, where r is the fraction of the window elapsed. He reaches NORMAL exactly when the window ends, so his distance doubles as the "still in danger" signal.
6. **Catch beat.**
   - A head-on hit or a second stumble starts a `CATCH_TIME = 0.6` s beat. The run stays PLAYING but the world freezes: no scroll, no score, no player movement, and gameplay input is ignored (`acceptsInput(run)`). Pausing is ignored too (key, button, or blur), so Restart / Main Menu can't skip the game-over screen.
   - Meanwhile the Agent closes to `CHASER_CATCH_GAP = 1.1`.
   - Only then is `run.caught` set, and `game.js` dispatches CAUGHT as before. `run.caughtBy` records HEAD_ON or SECOND_STUMBLE.
7. **The Agent follows the player's path.**
   - `stepRun` records the player's x, y, and sliding flag every step into a ring buffer (`run.trail`, `TRAIL_STEPS = 256`, about 2.1 s).
   - The Agent is drawn at the path sample from `gap / speed` seconds ago. So he jumps, slides, and dodges whatever the player just did, and never runs through an obstacle that has passed the player. A test replays a bot run and checks this against every BLOCK.

All of this per-run state (chaser, trail, `ignored` flags, `caughtBy`) is reset by `resetRun()` and covered by the "reset equals fresh" tests.

## Alternatives considered
- **Side clip = any hit while moving.** Rejected. Dodging a BLOCK too late would count as a stumble even though you hit it face-first, and bouncing "back" would put you into it.
- **Bounce to `fromLane`.** Rejected. After a mid-move reversal, `fromLane` can be a lane you never reached (noted in the Phase 1 handoff).
- **End the run instantly on a catch (SPEC wording).** Rejected in favour of a 0.6 s beat. Without it, the Agent never visibly catches you on a head-on hit, because he's off-screen until the game-over screen. The run still ends with no further player agency, and the delay is shorter than the existing 0.6 s Play Again guard.
- **The Agent runs a straight line in the player's lane.** Rejected. Obstacles that just passed the player would visibly pass through him.
- **The Agent has his own obstacle avoidance.** Rejected as unneeded complexity. Following the player's path is exact and nearly free.

## Consequences
- SPEC §3.6 is updated with these rules and numbers. "Run ends immediately" now means "after the short catch beat".
- A bounce can still lead into an obstacle in the rest lane if the player was already in trouble there (e.g. dodging a BLOCK into the side of a LOW). That's the player's mistake, not a dead end the game created. A bot test checks the guarantee that matters: one deliberate clip, made while your own lane is clear, followed by a full 4-minute survival on 18 seeds (clips from about 25 s up to max speed).
- Phase 7 can hang camera shake and SFX on `chaser.hitAge` / `stumbleDir` without changing the rules.
