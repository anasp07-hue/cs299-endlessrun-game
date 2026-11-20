# 0003: Make the shop its own game state, and build every runner up front on one skeleton

- **Status:** Accepted
- **Date:** 2026-11-19
- **Round:** 3 (requirements R7, R8, R9 in SPEC §1)
- **Format:** Y-statement (see 0001).

## Decision (Y-statement)

**In the context of** adding a simple shop (R7) and two new playable characters, a silver Android and a green Alien (R8), which must move and collide exactly like the Hacker without breaking anything (R9),

**facing** three things. First, the menu maps `Enter`/`Space` to Play, so a shop drawn inside the menu would start runs by accident. Second, the equipped skin must never change mid-run. Third, per-frame code must not allocate (SPEC §7.3).

**we decided for**
- a new `SHOP` state in the pure state machine (`MENU -SHOP-> SHOP -MENU-> MENU`). `Esc`/`P` go back, and `Enter`/`Space` do nothing on their own. It can only be reached from the menu, so the skin is fixed for the whole run.
- building **all three runners at startup** with the existing `createSkeleton()` and `RIG`. Each gets its own dressing (`createAndroid()`, `createAlien()` in `js/characters.js`) and is posed by the same pose functions. Only the equipped one is visible, so switching is a visibility flip.

**and neglected**
- *a shop panel inside the MENU state*, which means one fewer state. But every menu key would need a "panel open?" check in `game.js`, and the rule that the shop isn't reachable mid-run couldn't be tested in the pure state module;
- *a shop button on the game-over or pause screens*, which is handy between runs, but lets the skin change while a run is still loaded (pause) and adds more transitions to test. Menu only keeps it simple, which is what R7 asks for;
- *building a runner when it's equipped (and disposing the old one)*, which uses slightly less memory. But it creates geometry and materials while the game is running, needs careful disposal, and can hitch;
- *new skeletons or proportions per character* (a taller alien, a bulkier robot), which look more distinct, but break "same hitbox" (R9) and the existing pose/height tests;
- *recolouring the Hacker's materials*, which is the cheapest option, but can't produce a robot or an alien silhouette (helmet, antenna, domed head, thin limbs).

**to achieve** a shop that can't start a run by accident, a skin that can't change mid-run, characters that are guaranteed to move identically (same pivots, same pose code; checked by measuring every pose in Node), and zero allocation when switching,

**accepting that**
- the state machine has a fifth state, and the Round 1 "exactly the legal transitions" test had to list two more;
- two extra rigs, about 25 small meshes, always sit in memory. Hidden ones cost no draw calls (101–104 at max speed, under the 150 budget);
- new characters can only be as different as the shared skeleton allows. The Hacker's hood sets the height the others must stay within.

## Consequences
- `js/logic/state.js` has `STATE.SHOP` and `CMD.SHOP`. `game.js` has `runners`, `showRunner()`, and `renderShop()`.
- `tests/round3-characters.test.js` builds all three rigs with the vendored three.js and checks the same pivots, the height and width in 15 poses, the colours, and that no rules module reads the skin.
