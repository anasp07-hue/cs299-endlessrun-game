# 0005: The bazooka hits the closest row that can still hurt you, and phase ends with a 1-second grace

- **Status:** Accepted
- **Date:** 2026-11-19
- **Round:** 4 (requirements R12, R13, R16 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** a bazooka with one shot that "destroys the next row of obstacles", fired with `F` (R12; the user chose a key over auto-fire), and a phase power-up that lets you pass through obstacles for 30 s (R13),

**facing** two edge cases that decide whether the power-ups feel fair. First, "the next row" is ambiguous while you are in the middle of a row (rows are staggered, so part of one may already be behind you). Second, while phasing you can run in a lane that is normally impossible, such as straight through a BLOCK. When phase stops, the spawner's no-dead-end guarantee (which assumes you came from an open lane) no longer holds, and you could be a few frames from a wall.

**we decided for**
- **Bazooka target:** the row of the closest live obstacle that hasn't fully passed the player (its far edge is still in front of the player's back edge), skipping obstacles already being passed through (ignored). The whole row goes, every lane. The shot is fired inside `stepRun()` **before the hit test**, so pressing `F` a split second before impact still saves you. With no row ahead, the shot is kept.
- **Phase end:** on the step phase runs out, every live obstacle starting less than `POWERUP_PHASE_GRACE` (1 s) of travel ahead, at the current speed, is marked as passed through, like obstacles touched during the phase. One second covers the worst case the spawner budgets for (0.55 s to react, plus two lane changes, plus jump lift-off).
- Both live in the pure modules (`fireBazooka`, `ghostAhead` in `js/logic/powerups.js`), so they're tested in Node.

**and neglected**
- *targeting the next row not yet reached* (strictly ahead of the player's front edge). It's simpler, but a shot fired as you hit a wall would skip that wall and blow up the row behind it. That's the moment you most want the bazooka.
- *auto-firing at the next row* (the other option offered for R12). The user chose the key.
- *a straight cut-off when phase ends*. It's the simplest, but it can end a run with no chance to react, which breaks the game's "every death is fair" rule (ADR-0006/0007).
- *a longer warning instead of a grace window* (a blinking HUD only). We kept the blink, for the last 3 s, but a warning alone can't help if you're inside a BLOCK's lane with a wall 0.3 s away.
- *keeping phase on until you're in an open lane*. It never strands you, but "lasts 30 seconds" becomes "lasts 30 seconds, sometimes longer", which is harder to read and to test.

**to achieve** a bazooka that does what a player expects at the last moment, a phase that never ends in a death you couldn't avoid, and exact rules that are tested in Node,

**accepting that**
- for up to 1 s after phase ends, a few obstacles are still passable. The HUD has already gone, so it's a small, silent bonus;
- a shot can destroy a row whose nearest obstacle you've half passed. Rows are staggered by at most 0.3 s, so this is the row you're in;
- destroyed obstacles are removed from the pool at once. The view covers that with a fireball, sparks (HIGH quality) and a camera shake, not a breaking animation.

## Consequences
- SPEC §3.8 describes both rules. `tests/round4-powerups.test.js` checks: the whole row and only that row; rows already passed skipped; firing just before contact saves you (a twin without the shot gets caught); no row ahead keeps the shot; the 1 s grace (an obstacle 0.6 s out is passed through, one 2.5 s out is solid).
