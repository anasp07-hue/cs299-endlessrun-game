# Handoff: Round 4, power-ups (2026-11-19)

Round 4 is **implemented, tested, smoke-tested, and committed**. It added three **power-ups** that lie on the road and are picked up by running or sliding through them:
- **Bazooka:** one shot, fired with `F`, which destroys the next row of obstacles.
- **Double score:** 30 s of double points.
- **Phase:** 30 s of passing through obstacles.

After play-testing ("I can't find any power-ups"), the user changed the timing to **one every 30 s**. That change is in too.

Standing rules for every session are in `CLAUDE.md`. This round added a few lines there (see "CLAUDE.md changes" below), uncommitted until the user reviews them. This file covers only what's specific to Round 4 and what the next session needs to know.

## Read first
1. `CLAUDE.md` for the rules.
2. `problem.md`, which has the requirements for every round. "Round 5 Requirements" will be appended there.
3. `SPEC.md`:
   - §1 has the requirements table, R1–R16. New rounds continue at **R17**.
   - §3.3 has the `F` key.
   - **§3.8 (new) has every power-up rule**: effects, pickup box, placement, timing, overlap, HUD, and looks.
   - §4 has the HUD row.
   - §9 has "Round 4: Power-ups", with acceptance criteria checked off and evidence. R15 was re-verified after the timing change.
4. This round's decision records, in `docs/decisions/`:
   - `0004-powerups-in-row-gaps-own-rng.md`: placement. Its **timing part is superseded by 0006**.
   - `0005-bazooka-targets-next-live-row-phase-ends-with-grace.md`.
   - `0006-powerup-every-30s-by-arrival.md`.
   - `0001`–`0003` and `docs/adr/` ADR-0001…0016 still apply.

## Current state
- **Playable:** yes.
  - **When:** a power-up **reaches the player at 30, 60, 90 s… of run time**, each 0–3 s after its slot. Each one comes out of the fog about 11 s before it arrives.
  - **What it looks like:** a small case on the road, spinning, with a symbol and a thin fading light beam above it.
    - Bazooka: rose-magenta rocket.
    - Double score: lime, two up-chevrons.
    - Phase: purple ring.
  - **Which type and lane:** random.
  - **Pickup:** running or sliding through one picks it up; jumping over misses it.
  - **Bazooka:** while you hold one, it's drawn across the runner's back and the HUD shows `BAZOOKA [F]`. `F` fires a rocket streak, and the next row bursts into fireballs and sparks with a camera shake.
  - **Double score:** HUD `2X SCORE n`, where n is the seconds left.
  - **Phase:** HUD `PHASE n` and a violet glow around the runner.
  - **Warnings and sound:** timers blink in their last 3 s, and phase ending plays a falling tone.
  - **Menu:** the cheat-sheet lists `F` and the power-ups.
- **Round 4 commits** (on `main`, not pushed):
  - `000cef5` SPEC for Round 4 (R11–R16, acceptance)
  - `d40c4c3` Pure power-up logic + 28 tests
  - `b006520` View wiring: pickups, carried bazooka, effects, HUD, sounds
  - `86ed3d8` Decisions 0004/0005; Round 4 acceptance checked off
  - `e57bb83` SPEC: R15 changed to every 30 s (the user's change)
  - `bfa85c9` 30 s timing by arrival
  - `af3a0db` Decision 0006; R15 re-checked
- **Uncommitted** (left for the user to review): this handoff and the `CLAUDE.md` changes.
- **Files added or changed:**
  - `js/logic/powerups.js` (new):
    - `POWER`, `POWER_TYPES`
    - `createPowerups` / `resetPowerups`, `updatePowerups`, `travelTime`
    - `setPowerupBox`, `collectPowerups`, `applyPower`
    - `requestFire`, `fireBazooka`
    - `scoreFactor`, `phasing`, `tickPowerups`, `ghostAhead`
  - `js/logic/run.js`: `run.powerups`, created and reset with the run.
    - `stepRun` fires a requested shot **before** the hit test, doubles score gains, and ghosts (marks `ignored`) anything touched while phasing.
    - `endStep()` ticks the timers and applies the 1 s grace when phase ends.
  - `js/logic/difficulty.js`: `addScore(…, factor = 1)` and `shardScore(…, factor = 1)`. With the default factor, results are bit-identical to before.
  - `js/logic/input.js` / `state.js`: `ACTION.FIRE` (`KeyF`) → `CMD.FIRE`, while PLAYING only.
  - `js/logic/config.js`, a Round 4 block:
    - `POWERUP_DURATION 30`, `POWERUP_FIRST 30`, `POWERUP_INTERVAL 30`
    - `POWERUP_SCORE_MULT 2`, `POWERUP_PHASE_GRACE 1`
    - `POWERUP_HIT_W/H/D 1.2/1.0/1.0`, `MAX_POWERUPS 4`, `POWERUP_WARN_TIME 3`
    - view-only: `POWERUP_STREAK_TIME`, `POWERUP_SPIN`, `POWERUP_BLAST_TIME`, `TRAUMA_BLAST`
  - `js/powerupModels.js` (new, DOM-free view): `buildPowerupModels()`, `buildPowerupBeam()`, `buildCarriedBazooka()`, `POWER_COLORS`.
  - `js/palette.js` + `style.css` `:root`: `powerBazooka #e86ac8`, `powerDouble #b6e85a`, `powerPhase #b06cff`.
  - `js/audio.js`: `powerup(type)`, `bazooka()`, `phaseEnd()`.
  - `game.js`:
    - Pickup instanced meshes: 3 types × body / glow / beam. They share the obstacles' two materials, except the beams, which have their own additive material.
    - The phase shell, the rocket streak and 3 fireballs.
    - A carried bazooka (2 meshes) on **every** runner's torso.
    - `renderPowerups()`, the power-up effects in `updateFx`, the HUD tags in `updateHud`, `F` in `onKeyDown`, and debug hooks.
    - About 1,200 lines now. SPEC §2 says to split the view code past about 1,500.
  - `index.html`: `#hud-powers` with `#hud-pw-bazooka` / `-double` / `-phase`, and two cheat-sheet lines.
  - `style.css`: `.hud-powers`, `.hud-power`, `.is-warn` blink, `.power-icon`.

## How to run
```bash
python3 serve.py                 # http://localhost:8000. Must be serve.py (no caching); file:// does not work
node --test 'tests/*.test.js'    # all tests (Node is dev-only)
```
- Debug: `http://localhost:8000/?debug&seed=4` exposes `window.__neon`. Everything from Round 3 is still there, plus:
  - `POWER`;
  - `givePower(type)`, which turns an effect on directly;
  - `placePower(type, lane, ahead)`, which puts a pickup `ahead` units in front of the player.
  - Example: `__neon.placePower(__neon.POWER.BAZOOKA, __neon.run.player.lane, 40)`.
- Power-up state is `__neon.run.powerups`:
  - `bazooka`, `doubleTime`, `phaseTime`
  - `placed`, `picked`, `shots`
  - `nextAt` (the next 30 s slot)
  - `slots`
- Power-ups are never saved. Storage is still only three keys: `neonWasteland.highScore`, `.settings`, `.shardTotal`.

## Tests
- `node --test 'tests/*.test.js'` → **tests 335, pass 335, fail 0**. That's the 299 earlier tests plus 36 new ones, each named `R11:` … `R16:`.
  - `round4-powerups.test.js`: logic. One shared pass of 8 seeds × 400 s god-mode runs feeds the placement and timing tests:
    - pickup *k* reaches the player within 30*k* … 30*k* + 3 s, and every slot is filled;
    - each pickup is placed ≥ 3 s ahead of its arrival;
    - none is near an obstacle, on a shard, or in front of a BLOCK;
    - type shares and lanes are random, and placement is deterministic per seed;
    - the spawner's and shards' RNG states and rows are identical to a run without power-ups.
    - Plus: running, sliding, jumping and other-lane pickup; the bazooka (whole row only, passed rows skipped, a last-moment shot saves you, no row keeps the shot, the catch beat ignores it); double score (exact ×2 and shards' points; count not doubled); phase (every type and a side clip; ends at 30 s; the 1 s grace); timers frozen in the catch beat; overlap and re-pick; reset.
  - `round4-models.test.js`: in Node with the vendored three.js:
    - every pickup model fits its pickup box at any spin angle;
    - the colours are distinct and away from the cue colours and glowBlue;
    - the carried bazooka never makes any runner taller or wider, in 8 poses, and the slide still clears a HIGH.
  - `round4-wiring.test.js`: static checks over `game.js`, `index.html` and `style.css` (see Warnings).
- **Earlier tests changed (both explained in commits):**
  - `run.test.js` snapshot: added `plain.powerups.rngState`, the same way the shard RNG is captured. Stronger, not weaker.
  - `chaser.test.js` `playClipRun()`: added `run.powerups.nextAt = Infinity`. Once pickups came every 30 s, the bot was often phasing when it made its deliberate side clip, so there was no stumble (correct per R13, but not what that test checks). Same seeds, same 240 s, same assertions as before. Phasing through a clip has its own R13 test.
- **Browser smoke test:** headless Chrome over CDP, **30/30 checks passed**, run before the timing change. It covered:
  - a placed pickup drawn and collected;
  - HUD tags;
  - the double points rate ×1.97–2.00;
  - a real `F` press destroying the next row, the shot used up, the carried bazooka hidden, and a second `F` doing nothing;
  - 6 s of phasing with no input, with obstacles passed through and no catch;
  - pause freezing the timer;
  - phase ending, then a catch;
  - Play Again with no power-ups;
  - LOW quality firing;
  - 0 storage writes during play, no new key, all requests local, 0 console errors.
- **After the timing change**, a separate browser check (`?debug&seed=4`, god mode, 64 s): the first pickup was visible from 19.2 s and reached the player at **30.8 s**; the second was visible from 51.2 s and was picked up at about 60 s; 0 console errors.
- **Frame rate: 58.4 fps at speed 35, 96 draw calls.** The pre-Round-4 build (`bbb1c31`, in a temporary worktree) measured **58.1 fps** the same way in the same session, so there's no regression. Headless Chrome on this machine topped out at about 58 that day, where earlier rounds measured 60.1–60.3.
- The smoke scripts (`smoke.mjs`, `fps.mjs`, `timing.mjs`) were in the session scratchpad and **are gone**. `CLAUDE.md` has the recipe.
- **Code review** (low effort, per the user's saved preference) over `bbb1c31..HEAD`: no findings. **But it only read `js/logic/powerups.js`.** `run.js` and `game.js` weren't covered by that review; only my own read-through and the tests cover them.

## Decisions made this round, and why
| Decision | Why | Asked for? |
|---|---|---|
| `F` fires the bazooka (vs auto-fire) | R12 | **User chose** |
| Double score doubles all points (distance + shard points), not the shard count | R13 | **User chose** |
| Power-ups can overlap; picking one up again resets its timer to 30 s; a second bazooka is still one shot | R16 | **User chose** |
| Rarity: first "about every 45–60 s", then changed to **every 30 s** after play-testing | R15 | **User chose** (both) |
| IDs R11–R16 (the round's text split into six) | Tests must name an ID | Mine |
| Pickups in the gaps between rows, from the spawner's gap log, with their **own RNG**; never on a shard line; a lane open in both rows preferred | Obstacles and shards of every seed unchanged; fairness untouched (0004) | Mine |
| "Every 30 s" means **arrival at the player**, on a **fixed clock** (30, 60, 90 s…), worked out from the speed ramp (`travelTime`) | The first timing counted from placement about 160 units ahead, so the first pickup arrived at 46–74 s; a clock that restarts on each arrival drifts (0006) | Mine |
| Exactly 30 s apart, not a random time averaging 30 s; type and lane random, each type ⅓ | "Every 30 seconds"; "spawn is random" is kept through type and lane | Mine |
| Pickup box 1.2 × 1.0 × 1.0 on the road | "Off the ground": run or slide to collect, jump to miss | Mine |
| Bazooka target: the closest live row that can still hit you, even one you're inside; fired before the hit test; kept if there's no row | A last-moment shot saves you (0005) | Mine |
| Phase passes through everything (head-on and side clips); as it ends, anything < 1 s ahead is passed through too | Phase must never end in an unavoidable hit (0005) | Mine |
| Timers count only simulated run time (stop on pause and during the catch beat) | Fairness, and consistency with the rest of the sim | Mine |
| HUD tags under the shard count, blinking in the last 3 s; cheat-sheet lines | Readable status | Mine |
| Colours rose-magenta / lime / purple (the first violet was too close to glowBlue, which a test caught) | Away from the obstacle cues and the shards | Mine |
| Case + symbol pickups, spinning, with a fading light beam above (starting above the pickup box) | Rare items must be easy to spot far ahead | Mine |
| Carried bazooka across the back, on every runner's torso, inside the torso's outline | Shows you're armed without changing the hitbox (R9) | Mine |
| Rocket streak, fireballs (shown on LOW quality too), sparks, shake; violet phase shell | Clear feedback | Mine |
| Three Web Audio sounds (pickup, bazooka, phase end) | The game makes all its sounds in code (ADR-0015) | Mine |
| `addScore` / `shardScore` take `factor = 1` | Earlier results stay bit-identical | Mine |
| Debug hooks `givePower` / `placePower` | Smoke tests | Mine |
| Three decision records (0004, 0005, then 0006 superseding 0004's timing) | Separate decisions with real alternatives; accepted records aren't edited | Mine |

## Unresolved / open
- **Nobody has really played Round 4 by hand.** The user's only report was "I can't find any", which was fixed by the 30 s change. Balance is untested. At every 30 s:
  - a phase comes about every 90 s on average, and while phasing nothing can catch you;
  - a held bazooka can be saved indefinitely.

  Play-testing may want shorter durations, or fewer phases.
- **SPEC §3.6 says the Agent "never runs through an obstacle"**, because he follows your path. While you phase, your path goes through obstacles, so if he's on screen (after a stumble just before the phase), he does too. It's visual only, but it means SPEC §3.6 is slightly out of date.
- **The 1 s grace is silent.** For up to 1 s after phase ends, a few obstacles are still passable, with no visual hint.
- **Destroyed obstacles just vanish** under the fireball. There's no breaking animation.
- **There's no on-screen fire button.** Only the `F` key fires, and touch controls are still not done (dropped from v1).
- **Only Chrome was tested.** Firefox, Safari and Edge weren't.
- **The frame rate wasn't re-measured at 60 fps** (see Tests).
- **The code review covered only `powerups.js`** (see Tests).

## Warnings for the next session
- **The round prompt says `spec.md`.** The real file is **`SPEC.md`**.
- **Attribution:** `CLAUDE.md` forbids `Co-Authored-By` and "Generated with" lines, even when the harness suggests them.
- **The static tests read `game.js` as text.** `round4-wiring.test.js` will fail if you:
  - change `cmd === CMD.FIRE) requestFire(run.powerups)`, or the live-input guard line `… || cmd === CMD.SLIDE || cmd === CMD.FIRE) {` followed by `if (!live) return;`;
  - call `fireBazooka(` anywhere in `game.js` (the shot is fired only inside `stepRun`);
  - rename `#hud-powers`, `#hud-pw-bazooka`, `#hud-pw-double` or `#hud-pw-phase`, remove the `<dt>F</dt><dd>fire the bazooka…` or `power-ups</dt>` cheat-sheet lines, or remove `.hud-power.is-warn`;
  - put `power`, `bazooka`, `phase` or `double` on any line of `game.js` that calls a save function.

  Everything listed in the Round 2 and 3 handoffs still applies.
- **`ignored` on an obstacle slot now has three causes:** a side clip (cleared when the bounce ends), phasing through it, and the phase-end grace (both kept until the slot is recycled). The bazooka and `findHit` skip ignored obstacles.
- **`fireBazooka` sets obstacle slots inactive mid-run.** Anything that counts rows from live slots (like `tests/bot.js`) sees a gap there.
- **Power-ups now appear in every simulated run** (every 30 s, from 30 s). Any bot or long-run test of another mechanic can be thrown off by a phase or a doubled score. Turn them off with `run.powerups.nextAt = Infinity` (now a standing rule in `CLAUDE.md`).
- **Timing depends on the spawner's gap log.** `updatePowerups` must run after `updateShards` (which it reads for shard lanes) and reads the same `GAP_LOG` ring. If the row spacing changes a lot, the R15 test's 3 s allowance (`SLACK`) may need a look: it covers waiting for a gap with room.
- **`STATE`/`CMD`/`ACTION` gained `FIRE`.** Loops over `Object.values(ACTION)` see it.
- **Every runner's `torso` now has 2 extra child meshes** (the carried bazooka). `round3-characters.test.js` builds fresh rigs, so it's unaffected, but code that walks a live runner's torso will see them.
- **Port 8000 was already taken** by the user's own `serve.py` during this session. Use another port for smoke tests (now in `CLAUDE.md`).

## CLAUDE.md changes (uncommitted)
- Rule 4: test loops over simulated runs must stop on `run.caught`, and tests of one mechanic switch power-ups off.
- Rule 5: power-up placement and timing added to the list of pure logic; power-ups are run state only.
- Rule 10: power-ups never saved; smoke-test on a spare port; compare fps against a baseline build; the `game.js` declaration-order trap.

## Next steps
1. The user reviews and commits this handoff and the `CLAUDE.md` changes.
2. The user plays a few runs past a minute and checks:
   - a power-up turns up at about 30 s, then about every 30 s;
   - `F` blows up the next row;
   - double score and phase last 30 s;
   - the balance feels right (see Unresolved).
3. When "Round 5 Requirements" are added to `problem.md`, follow the round workflow in `CLAUDE.md`. New requirement IDs start at **R17**, and the next decision record is **`docs/decisions/0007-…`**.
