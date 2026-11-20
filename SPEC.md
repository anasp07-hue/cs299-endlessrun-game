# SPEC — Apocalypse Run (endless runner)

A lightweight 3D endless runner that runs fully offline in the browser. Built with **three.js** for 3D and plain **HTML / CSS / JavaScript** for everything else. No build step, no frameworks, no network access at runtime.

See `problem.md` for the motivation: something fun to play when you have no wifi (e.g. on a plane).

---

## 1. Goals & Constraints

| Goal | What it means in practice |
|---|---|
| **Offline-first** | Every file lives in the repo: three.js is copied into `libs/`, no CDNs, no web fonts, no remote assets. |
| **Lightweight** | Total download (excluding three.js) under ~2 MB. Runs at 60 fps on a laptop with integrated graphics. |
| **Fun** | Responsive controls, speed that keeps rising, a mix of obstacles, a chaser that adds tension. |
| **Replayable** | Persistent high score, instant "Play Again", score readout during the run. |
| **Simple to work on** | Built one phase at a time (section 9). Every phase leaves the game in a playable state. |

### Requirements (from `problem.md`)
IDs added in Round 2 so tests can name the requirement they check. `problem.md` itself is left as written.

| ID | Round | Requirement | Where it's met |
|---|---|---|---|
| **R1** | 1 | Runs completely offline; lightweight; all logic runs locally in the browser of any modern computer | §1 Offline-first / Lightweight, §7.3 |
| **R2** | 1 | Actually fun and enjoyable | §3, §5 |
| **R3** | 1 | Has things that make you want to keep playing, like a high score | §3.7, §4 High score persistence |
| **R4** | 2 | Shards are saved after closing the game, the way the high score is: a **lifetime shard total** kept across runs and browser restarts | §3.7, §4 Shard total persistence |
| **R5** | 2 | The game still runs completely offline with no build step | §1, §2, §6 |
| **R6** | 2 | Nothing else breaks, and runs are still smooth (60 fps, no per-frame allocations or storage writes) | §7.3, §9 Round 2 |
| **R7** | 3 | A simple shop where you buy characters with the saved (lifetime) shards | §3.7, §4 Shop, §9 Round 3 |
| **R8** | 3 | Two new characters: a silver robot/android (**Android**, 100 shards) and a green alien (**Alien**, 200 shards) | §5 Characters, §9 Round 3 |
| **R9** | 3 | Every character has the same movement and hitbox as the Hacker, and nothing else breaks | §3.6, §5 Characters, §9 Round 3 |
| **R10** | 3 | Skins don't save: bought characters (and the equipped one) last only until the page is reloaded or closed. The shards spent on them stay spent (user's answer, 2026-11-19) | §4 Shop, §9 Round 3 |
| **R11** | 4 | Three power-ups: a **bazooka** that destroys obstacles, **double score**, and **phase** (pass through obstacles) | §3.8, §9 Round 4 |
| **R12** | 4 | The bazooka has one shot, which destroys the next row of obstacles. The player fires it with a key, **F** (user's answer, 2026-11-19) | §3.3, §3.8, §9 Round 4 |
| **R13** | 4 | Double score and phase each last 30 seconds. Double score doubles all points (distance and shard points), not the shard count (user's answer, 2026-11-19) | §3.8, §9 Round 4 |
| **R14** | 4 | Power-ups are picked up off the ground | §3.8, §9 Round 4 |
| **R15** | 4 | Where power-ups spawn is random, and they're rare: on average about one every 50 s (user's answer: "about every 45–60 s", 2026-11-19) | §3.8, §9 Round 4 |
| **R16** | 4 | Nothing breaks, and every power-up does what it's supposed to. Different power-ups can be active at once; picking one up again resets its timer to 30 s (user's answer, 2026-11-19) | §3.8, §7.3, §9 Round 4 |

### Non-goals
- Multiplayer, accounts, online leaderboards
- Build tools (Vite, webpack), TypeScript, npm packages
- Detailed or realistic models. A low-poly, stylized look is the target.

---

## 2. Project Structure

```
endless-runner/
├── index.html          # Canvas container + all UI overlays (menus, HUD)
├── style.css           # UI styling (HUD, menus, pause, game over)
├── game.js             # Entry point: game loop, state, input, world, UI wiring
├── serve.py            # Dev server: http.server with caching off (python3 serve.py)
├── js/
│   ├── logic/          # Pure, DOM-free game rules (spawner, collision, physics, scoring, RNG…) — see ADR-0001
│   │   ├── config.js   # The single frozen CONFIG object of tuning values
│   │   ├── rng.js      # Seeded RNG (mulberry32)
│   │   ├── time.js     # Frame-delta clamping
│   │   ├── loop.js     # Fixed-timestep accumulator (ADR-0005)
│   │   ├── math.js     # clamp / lerp / ease / mod / damp
│   │   ├── world.js    # Ground-segment recycling, lane x positions
│   │   ├── player.js   # Lanes, jump, slide, fast-fall rules
│   │   ├── input.js    # Key → action mapping
│   │   ├── difficulty.js # Speed curve, difficulty, score multiplier
│   │   ├── collision.js # AABB boxes, player/obstacle hitboxes
│   │   ├── spawner.js  # Pattern table, fair row spacing, obstacle pool (ADR-0006)
│   │   ├── chaser.js   # Hit classification, stumble window, chaser gap, catch beat (ADR-0011)
│   │   ├── trail.js    # Ring buffer of the player's recent path, which the Agent follows (ADR-0011)
│   │   ├── pose.js     # Rig dimensions + character poses as plain joint angles (ADR-0012)
│   │   ├── scenery.js  # City chunk recycling + deterministic layout, sky colour (ADR-0013)
│   │   ├── run.js      # One run's state, its full reset, and the fixed step (ADR-0008)
│   │   ├── state.js    # MENU/PLAYING/PAUSED/GAMEOVER transitions, key → command per state
│   │   ├── highscore.js # High-score parsing and load/save through an injected storage
│   │   ├── settings.js # Settings (mute, quality) parsing and load/save under neonWasteland.settings (ADR-0015, ADR-0016)
│   │   ├── shards.js   # Data-shard placement between rows, pickup, pool (ADR-0016)
│   │   ├── shardbank.js # Lifetime shard total: parsing, load/save, banking a run's shards, spending (Round 2–3, docs/decisions/0001, 0002)
│   │   ├── shop.js     # Character catalogue, prices, session-only ownership, buy/equip (Round 3, docs/decisions/0002)
│   │   ├── powerups.js # Power-up pickups (placement, pickup), the bazooka shot, double-score and phase timers (Round 4, docs/decisions/0004)
│   │   ├── juice.js    # Camera-shake trauma, landing squash, near-miss flash (ADR-0015)
│   │   ├── particles.js # Pooled spark particles (ADR-0015)
│   │   └── hud.js      # Allocation-free digit writer for the HUD
│   ├── characters.js   # View: Hacker, Android, Alien and Agent THREE.Group rigs, applyPose (ADR-0012, Round 3)
│   ├── audio.js        # View: all SFX + a generative music loop, made with Web Audio in code (ADR-0015)
│   ├── city.js         # View: sky dome + fog, ruined buildings, screens, cables, wrecks, dust, road texture (ADR-0013)
│   ├── obstacleModels.js # View (DOM-free): themed LOW/HIGH/BLOCK models fitted to their hitboxes (ADR-0014)
│   ├── powerupModels.js # View (DOM-free): the three power-up pickups and the carried bazooka (Round 4)
│   ├── geometry.js     # View (DOM-free): shared builders (coloured merges, hover-car, barrier, tubes)
│   └── palette.js      # Color palette (mirrored as CSS vars in style.css)
├── tests/              # node --test 'tests/*.test.js'  (Node built-in runner, dev-only — see ADR-0002, ADR-0004)
├── docs/
│   ├── adr/            # Architecture Decision Records (Phases 0–8: ADR-0001…0016)
│   ├── decisions/      # Decision records from Round 2 on, as Y-statements (0001…)
│   └── handoffs/       # Session/phase handoff notes
├── CLAUDE.md           # Working rules for Claude Code
├── .gitignore          # Includes secrets (.env, keys) — never commit them
├── libs/
│   ├── three.module.js # Vendored three.js r186.1 (ES module build) — see ADR-0003
│   ├── three.core.js   # Required by three.module.js in r171+ (vendor both)
│   └── three.LICENSE   # three.js MIT license
└── assets/
    ├── models/         # Optional .glb models (not used at first, see §6)
    ├── textures/       # Small PNGs (screen glitch frames, ground decals)
    └── sounds/         # Small .ogg/.mp3 SFX + one music loop
```

**Note on modules:** Game *rules* live in pure modules under `js/logic/` from the start, so they can be tested in Node (ADR-0001). If the browser-side `game.js` grows past about 1,500 lines, split its view code into ES modules too (for example `js/player.js`, `js/world.js`, `js/ui.js`).

### Running locally (important)
Browsers block ES-module imports over `file://`, so double-clicking `index.html` **will not work**. Serve the folder with the included dev server instead. It uses only the Python standard library and works with no internet connection:

```bash
python3 serve.py          # then open http://localhost:8000
python3 serve.py 8080     # another port; add --lan to reach it from other devices
```

`serve.py` is `python3 -m http.server` with caching turned off (`Cache-Control: no-store`). Plain `http.server` sends no cache headers, so browsers can keep using an old copy of a module after it changes. A new `game.js` then imports something the stale module doesn't have, the script fails, and Play does nothing. Any static server still works, but after code changes you'd have to empty the browser cache.

### Running tests
```bash
node --test 'tests/*.test.js'
```
Node is used only as a dev tool for tests. The game itself never needs Node or npm (ADR-0002).

(The VS Code "Live Server" extension works too.)

---

## 3. Core Gameplay

### 3.1 Premise
A hacker in black is fleeing through the ruins of a futuristic city. A government agent in a suit is chasing him. Run as far as you can without getting caught.

### 3.2 Lanes & movement
- **3 lanes** (left / center / right), about 2.5 units apart.
- The player stays at a fixed Z position. **The world scrolls toward the player.** This avoids floating-point drift on long runs and makes object recycling simple.
- Lane changes are animated with a short ease-out (0.12 s per lane). They can be queued: pressing left twice quickly moves two lanes (up to 2 queued moves). Pressing the opposite direction mid-move turns straight back, and pressing opposite to a queued move cancels it. Moves off the road edge are ignored.

### 3.3 Actions
| Action | Keys | Behavior |
|---|---|---|
| Move left / right | `←` `→` / `A` `D` | Switch lanes |
| Jump | `↑` / `W` / `Space` | Parabolic jump (0.7 s airtime, 2.2 apex). No double jump. A jump pressed up to 0.1 s before landing fires on landing. Jumping cancels a slide. |
| Slide / duck | `↓` / `S` | Lower the hitbox (1.8 → 0.8) for 0.7 s. If pressed in the air, fast-fall (25 units/s down) into a slide. In the air, the latest of jump/slide wins. |
| Fire bazooka | `F` | Fire the held bazooka (Round 4, §3.8). Does nothing if you don't hold one. |
| Pause | `Esc` / `P` | Toggle pause |
| Sound | `M` | Toggle sound on/off in any state (saved) |
| (Later) Touch | Swipe up/down/left/right | Same as keys, for phones and tablets |

### 3.4 Obstacle types
Each obstacle has exactly one correct answer, like a classic runner:

| Type | Correct action | Themed examples |
|---|---|---|
| **Low** | Jump over | Fallen screen panel, concrete barrier, toppled street-light |
| **High** | Slide under | Hanging bundle of sparking wires, sagging billboard frame, broken overpass beam |
| **Full block** | Change lanes | Abandoned hover-car, collapsed pillar, rubble pile |

Spawn rules:
- Obstacles come in **rows** spaced along the track. A row never blocks all 3 lanes with full blocks. At least one lane is always passable. Obstacles in a row are slightly **staggered** in depth (up to 0.1–0.3 s apart, more at higher difficulty), so rows don't read as flat walls.
- Patterns come from a small hand-made list (e.g. "car-left + wires-center", "barrier across all 3 lanes") plus random single obstacles. Some rows (15% at the start, up to 40% at full difficulty) are instead generated **randomly lane by lane**, never all BLOCK and never empty (ADR-0007).
- Minimum gap between rows scales with speed, so reaction time stays fair. Spacing is set in **seconds** at the speed the player will have when they reach the row (ADR-0007):
  - The target gap eases from 1.35 s (easy) to 0.95 s (hard), randomly ±30% so the rhythm isn't uniform.
  - **No dead ends:** from every open lane of a row, at least one lane of the next row must be reachable in time, and you must be past *every* obstacle on the way (in your own lane, lanes you cross, and the target lane, which matters because rows are staggered). That needs 0.55 s of reaction for any jump, slide, or lane change, plus about 0.08 s for a jump to lift you above a LOW; a full jump (0.7 s) if you just jumped and the next obstacle needs a jump or slide; and +0.12 s per lane change.
  - A LOW followed by a LOW or HIGH in the same lane is never closer than a full jump.
- **No idle lanes:** a lane can be empty for at most one row at a time. Any lane that was empty in a row gets an obstacle (LOW, HIGH, or BLOCK) in the next row, so you never sit in a lane with nothing to do for two rows (ADR-0007).
- Patterns are written as 3-letter strings, one letter per lane: `L` LOW, `H` HIGH, `B` BLOCK, `.` empty (e.g. `B.B`, `LBH`). Each has a minimum difficulty and a weight.
- Looks (Phase 6, ADR-0014), two variants per type, each with a single cue colour: **LOW**, a fallen screen on rubble or a barrier laid across the lane, with amber/black hazard stripes. **HIGH**, a hanging billboard frame or a broken beam with sparking cables, with a glowing white line exactly at the slide height and nothing below it. **BLOCK**, a hover-car crashed tail-first or a broken pillar, with bold red lights and bands. Set dressing never uses the cue colours.
- Obstacle sizes (hitbox = visual): all 2.0 wide (lanes are 2.5, so a neighbouring lane never clips). LOW: 0.9 tall. HIGH: from 1.1 up to 2.5, above the 2.2 jump apex, so it can only be slid under. BLOCK: 2.6 tall.

### 3.5 Speed & difficulty
- Start speed 12 units/s. It increases by 0.11 units/s every second, up to a cap of 35 units/s (reached after about 3.5 minutes).
- Rows get denser and use harder patterns as distance increases. Difficulty goes from 0 to 1 over the first 1,500 units (about 1:30 into a run). Some multi-obstacle rows (`B.B`, `LLL`, `HHH`, `L.L`, `H.H`) appear from the start.

### 3.6 Collision & the chaser
- Collisions are box-vs-box (AABB) tests using simple hitboxes, not mesh geometry. The player's hitbox gets shorter while sliding.
- **Head-on hit** (running into an obstacle): the agent catches you and the run ends.
- **Side clip** (bumping an obstacle while changing lanes): you **stumble**. You get bounced back to your previous lane and the agent closes in. A second stumble within 8 s means you get caught.
- The agent is shown running behind the player. Normally he stays slightly off-screen or far back. After a stumble he is close and visible, then slowly drops back.

Exact rules (ADR-0011):
- **Classification:** a hit is a side clip if you are mid lane change and the obstacle is *not* in the lane you last stood in. Anything else is head-on, including an obstacle in the lane you're leaving (dodging too late).
- **Bounce:** you head back to the last lane you stood in (not a lane you only started toward), and queued moves are dropped. Lane input is ignored until you get there; jump and slide still work. The clipped obstacle can't hit you again while you bounce off it (after that it's solid again).
- **Chaser gap:** normally 12 units back, behind the camera, so off-screen. On a stumble he lunges in at 30 units/s to 3.8 units, just below the Hacker on screen. He then eases back, reaching 12 exactly when the 8 s window ends, so his distance shows how long you're still in danger.
- **Catch beat:** a head-on hit or a second stumble freezes the world for 0.6 s while the agent closes in and grabs (input and pause ignored), then the game-over screen appears.
- **The agent runs your path:** he follows the exact line you ran a moment ago (your recorded lane position, height, and slides, delayed by gap ÷ speed), so he jumps, slides, and dodges what you did and never runs through an obstacle.

### 3.7 Scoring
- Score = distance traveled, multiplied by a slowly rising multiplier.
- **Data shards** (Phase 8, ADR-0016): glowing blue diamonds in short lines (3–5, 2.2 apart) in the open stretch between two obstacle rows. About half the gaps get a line, in a lane that isn't BLOCKed in the next row (preferably one open in both rows). Each shard is worth **25 × the current multiplier**. They sit at waist height (y 0.45–1.25): running or sliding through collects them, jumping over misses them. They are always optional: they never overlap an obstacle (each is kept a full row margin clear) and use their own seeded RNG, so the obstacle sequence and its fairness are unchanged. The HUD and the game-over screen show the shard count.
- **Lifetime shard total** (Round 2, R4): every shard collected is added to a saved total that survives closing the browser, the same way the high score does. The menu shows the total; the game-over screen shows this run's shards and the new total. The total doesn't change the score. Since Round 3 it is spent in the **shop** (§4) to buy characters.

### 3.8 Power-ups (Round 4, R11–R16; docs/decisions/0004)
Three power-ups lie on the road now and then. They last only for the current run: nothing about them is saved, and every new run starts with none.

| Power-up | Effect |
|---|---|
| **Bazooka** | You carry **one shot**. Press `F` to fire it: it destroys every obstacle in the **next row**, the closest row that can still hit you (one you're passing through counts, so it can save you at the last moment). If no row is ahead, the shot is kept. Picking up another while holding one changes nothing: you still hold one shot. |
| **Double score** | For **30 s**, every point you earn counts double: distance points and shard points. The number of shards (and the lifetime total) is not doubled. |
| **Phase** | For **30 s**, obstacles can't hit you: you run straight through them (no head-on catch, no stumble). When it runs out, every obstacle less than **1 s** ahead (at the current speed) is also passed through, so a phase never ends with an unavoidable hit. |

- **Picked up off the ground (R14):** each power-up is a small glowing case standing on the road in one lane (pickup box 1.2 wide, 1.0 tall, 1.0 deep, from the road up). Running or sliding through it picks it up; jumping over it misses it.
- **Placement (R15):** like shards, a power-up goes in the open stretch between two rows, centred and a full row margin clear of both, in a lane that's open in both rows if possible (otherwise one open in the next row), never on a shard line. The first is placed after a random 35–65 s of running, and each one after that a random 35–65 s after the last (about one every 50 s on average). The type is picked at random, each equally likely. Power-ups use **their own seeded RNG**, so the obstacles and shards of every seed are unchanged.
- **Together (R16):** different power-ups can be active at once. Picking up double score or phase while it's already active resets its timer to 30 s. Timers count only simulated run time: they stop while paused and during the catch beat.
- **HUD:** a row under the score shows each active power-up: `BAZOOKA [F]`, `2X 27`, `PHASE 12` (seconds left). A timer blinks in its last 3 s.
- **Looks:** the cases avoid the obstacle cue colours (amber / white / red) and the shards' blue: the bazooka is magenta, double score is lime, phase is violet. A thin, fading beam of the same colour rises above each pickup, so a rare one is easy to spot far ahead (it starts above the pickup box and can't be touched). Firing draws a short rocket streak to the row and blows each obstacle apart in sparks. While phasing, the runner has a faint violet glow. A held bazooka is drawn on the runner's shoulder.

---

## 4. Game States & GUI

```
 SHOP ◀──Shop── MENU ──Play──▶ PLAYING ◀──Resume── PAUSED
   └──Back/Esc/P──▶ ▲            │  ──Esc/P/blur──▶
                    │            ▼
                    └──Menu── GAME OVER ──Play Again──▶ PLAYING
```

All UI is HTML/CSS layered on top of the canvas (not drawn in three.js). It uses a quiet, cold terminal style (blue-black panels, soft blue and pale moonlight text, faint glows) that matches the theme.

| Screen | Contents |
|---|---|
| **Main menu** | Title, **Play** button (also `Enter`/`Space`), **Shop** button, current high score, lifetime shard total, controls cheat-sheet, **Sound on/off** toggle (also `M`), **Quality high/low** toggle |
| **Shop** (Round 3) | Shard total, one card per character (name, short description, price or OWNED / EQUIPPED, a Buy or Equip button), a note that bought characters last until the game is closed, **Back** (also `Esc`/`P`). The equipped character stands on the road behind the panel. |
| **HUD** (while playing) | Score (top-left) with the shard count under it and the active power-ups under that (Round 4, §3.8), high score (top-right; tracks the live score once you beat it), sound and pause buttons |
| **Pause** | Dimmed overlay, **Resume** (also `Esc`/`P`/`Enter`), **Restart**, **Main Menu**, **Sound on/off**, **Quality high/low**. The game also auto-pauses when the tab or window loses focus, but only mid-run. |
| **Game over** | "CAUGHT" heading, final score, shards collected this run, lifetime shard total, high score, a "NEW HIGH SCORE!" badge when earned, **Play Again** (also `Enter`/`Space`, after a 0.6 s delay so a mashed jump can't skip the screen), **Main Menu** |

While paused, the game loop keeps rendering but stops simulating. The paused frame is frozen exactly, and leftover step time is dropped on resume, so nothing jumps. The key that starts or restarts a run never also counts as a jump. Every Play / Play Again / Restart / Main Menu runs one full `resetRun()` (ADR-0008).

### High score persistence
- Stored in `localStorage` under the key `neonWasteland.highScore`, as a whole number. Saved only when strictly beaten. Missing or garbage values read as 0.
- Every `localStorage` read/write is wrapped in `try/catch`. If storage is unavailable (private mode), the game still works and just doesn't keep the score.

### Shard total persistence (Round 2, R4)
- Stored in `localStorage` under the key `neonWasteland.shardTotal`, as a whole number, using the same parsing rules as the high score (plain digits only; missing or garbage values read as 0; capped at `Number.MAX_SAFE_INTEGER`).
- A run's shards are **banked** (added to the total and written) at a few checkpoints, never per frame: when the run ends (caught), when it's abandoned from the pause screen (Restart / Main Menu), and when the page is hidden or closed mid-run, so closing the tab doesn't lose them. The run remembers how many of its shards are already banked, so no shard is ever counted twice.
- Banking re-reads the stored total first and adds to the larger of it and the in-memory total, so a second tab's shards aren't overwritten, and a session without storage still keeps its total in memory.
- Same `try/catch` rule as the high score: without storage the game works and the total lasts for the session only.

### Shop (Round 3, R7–R10; docs/decisions/0002, 0003)
- Characters: **Hacker** (free, owned from the start, equipped by default), **Android** (100 shards), **Alien** (200 shards). Prices live in `CONFIG`.
- **Buy:** only from the shop, only if the lifetime total covers the price. Buying spends the price from the total, saves the new total at once (a click, never per frame), and equips the character. Like banking, spending re-reads the stored total first and spends from the larger of it and the in-memory total, so another tab's shards aren't lost. The total never goes below 0. A character can't be bought twice.
- **Equip:** any owned character, with one click. It is used from the next run on (the shop is only reachable from the menu, so never mid-run).
- **Not saved (R10):** which characters you own and which one is equipped live only in memory. Reloading or closing the page goes back to "Hacker only, Hacker equipped". The shards spent are **not** refunded: the saved total keeps the deduction. No new `localStorage` key is added.
- The skin is cosmetic only (R9): movement, jump, slide, the hitbox and the run simulation never read it.

### Settings
- Saved as JSON under `neonWasteland.settings`: `{ "muted": bool, "quality": "high" | "low" }`. Unknown or invalid values fall back to the defaults (sound on, quality high), and a Phase 7 save without `quality` still loads.
- **Quality** (Phase 8, ADR-0016): HIGH renders at up to 1.5 pixels per CSS pixel with dust and sparks. LOW renders at 1 pixel per CSS pixel with no dust or sparks. The game has no shadows (§5), so resolution stands in for the "shadows" part of the original Phase 8 idea. Gameplay and sound are the same at both levels.

---

## 5. Art Direction: Futuristic City, Now a Wasteland

**Mood:** a dead city at night, cold and eerie rather than neon-heavy (ADR-0009). The sky is a blue-black haze under pale moonlight. Fog hides the distance. A few screens still give off a soft, cold blue glow, with the odd faint violet glitch. Dust drifts through the air. Only the obstacle cues (amber / white / red) are bright and warm, so they stand out.

| Element | Description | Technique (lightweight) |
|---|---|---|
| **Road** | Cracked asphalt strip with faded lane lines | Tiled ground segments recycled ahead of the player; canvas-generated texture |
| **Ruined buildings** | Tall boxes along both sides, some with broken tops or gaps | Low-poly boxes with variation, recycled in chunks; `InstancedMesh` where possible |
| **Giant screens** | Broken billboards on buildings, some dead, some flickering glitch art | Planes with emissive `CanvasTexture`, redrawn a few times per second |
| **Hanging wires** | Cables sagging between buildings and over the road | `TubeGeometry` along a curve; some become "slide under" obstacles |
| **Abandoned cars** | Futuristic hover-cars on the ground, shattered, some tipped over | Low-poly box/wedge compositions with a dim emissive strip |
| **Atmosphere** | Fog, floating dust, occasional sparks from wires | `scene.fog` plus a sky-gradient dome; city materials fog toward the sky colour so ruins dissolve into it (ADR-0013). One `Points` particle system. Sparks come in Phase 7. |
| **Lighting** | Dim cool ambient + a pale directional "moon" + a few dim, cool accent lights; streetlights along the sidewalks (some dead, some flickering) | At most 1 shadow-casting light (or none). Use emissive materials instead of many real lights. Streetlights are emissive heads, painted light pools, and faint cones; only 2 real lights are handed between the lamps nearest the player (ADR-0013). |

### Characters

The player runs as one of three characters (Round 3, R8). All three are built on the same skeleton (`RIG` in `pose.js`) and use the same poses, so they move identically and fill the same hitbox (R9). Only the dressing differs.

**Runner: "the Hacker"**
- All black: hoodie with the hood up, black pants, black shoes. A small glowing visor or screen glow on the face is the only bright accent, so he stays readable against the dark scene.
- Built from primitives (capsules/boxes) as a `THREE.Group` with separate limb pivots.
- The camera sees his back, so his glowing accents are a visor that peeks out past the hood and a backpack LED strip. A dim cold light follows him so his outline stays readable (ADR-0012).
- Animations done in code: run cycle (swing limbs with a sine wave), jump pose, slide pose (body tilted back, low), stumble.

**Runner: "the Android"** (shop, 100 shards)
- Brushed silver plating over dark graphite joints: a boxy chest plate, shoulder pads, a squared helmet head with a thin glowing eye band, a short antenna, and a back vent with a soft glow strip (what the camera sees). Cold and metallic; the silver keeps him readable against the night.
- Like the Hacker, neither new runner has separate hand boxes: they would dip into the road in the slide pose.

**Runner: "the Alien"** (shop, 200 shards)
- Muted green skin, a large domed head (wider than tall, never taller than the Hacker's hood), big black slanted eyes, thin green arms and legs, a dark grey-green vest, and a faint green glow line down the back.
- Green is not an obstacle cue colour and stays desaturated, so the cues (amber / white / red) still own the brightest, warmest colours.

**Chaser: "the Agent"**
- Black suit, white shirt, thin black tie, sunglasses, short hair.
- Same rig approach as the Hacker, with a stiffer, more mechanical run cycle (upright, piston arms locked at 90°). Drawn 5% bigger than the Hacker.

---

## 6. Asset Strategy

**Default: procedural.** Everything at first is built in code from three.js primitives and `CanvasTexture`s. That means no extra downloads, nothing to break offline, and the art is quick to change.

**Later, if wanted:** swap characters or props for small `.glb` files in `assets/models/` (each under ~300 KB, low-poly). This requires vendoring `GLTFLoader.js` into `libs/`. Any `.glb` must be self-made or properly licensed (e.g. CC0), with credit recorded in a `CREDITS.md`.

**Sound:** short SFX (jump, landing, slide, stumble, caught, near miss, button click, spark crackle) and one generative music loop, all **generated with the Web Audio API in code: zero audio files** (ADR-0015, resolving §10 Q3).

Audio starts only after the first user click or key press (browser autoplay rules). The mute setting is saved in `localStorage` under `neonWasteland.settings` as JSON.

---

## 7. Technical Design

### 7.1 Main loop
Fixed-timestep simulation with render interpolation (ADR-0005):
```
renderer.setAnimationLoop(loop)
  dt = clampDt(frameDelta, 1/20)          // clamp so a tab switch can't cause a huge step
  n  = stepper.consume(dt)                // whole 1/120 s steps owed (max 8 per frame)
  if state === PLAYING: repeat n times: simulate(1/120)
  render(stepper.alpha())                 // blend prev → current state for smooth motion
```

### 7.2 Main pieces inside `game.js`
- **Game**: owns state (`MENU | PLAYING | PAUSED | GAMEOVER`), score, speed, and the reset logic.
- **Input**: keyboard (later touch). Converts raw events into actions.
- **Player**: mesh rig, lane/jump/slide state machine, hitbox, animation.
- **Chaser**: mesh rig, distance-behind value, catch logic.
- **World**: ground segments, side buildings, set dressing. Chunks are recycled once they pass behind the camera.
- **ObstacleSpawner**: pattern list, object pools for each obstacle type, spawning and despawning.
- **UI**: shows/hides overlays, updates the HUD, handles high score.
- **Audio**: SFX and music, mute.

### 7.3 Performance rules
- **Object pooling.** Never create new meshes during play. Reuse obstacles and chunks.
- Share geometries and materials. Use `InstancedMesh` for repeated buildings and debris.
- `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5))`.
- Aim for fewer than ~150 draw calls. Fog hides the far clipping plane, so the camera's `far` can stay short (about 150).
- Handle window resize (update the camera aspect and renderer size).

---

## 8. Definition of "Done" for v1
*(All met as of 2026-11-18: phases 0–8 verified in Chrome; the user confirmed the cross-browser check, play-testing and tuning.)*
- [x] Runs offline from a local static server in current Chrome, Firefox, Safari, and Edge
- [x] 3 obstacle types, each with one clear correct action
- [x] Hacker runner and Agent chaser with visible run animations
- [x] Wasteland city with broken screens, hanging wires, abandoned cars
- [x] Menu, HUD, pause, and game over/play-again screens all work
- [x] High score persists across browser restarts
- [x] Steady 60 fps on a typical laptop

---

## 9. Build Plan (iterative)

Each phase is roughly one prompt or session. Every phase ends with something you can run and test. **A phase is not done until** its acceptance criteria are met, new logic has passing tests (`node --test 'tests/*.test.js'`), the `test-review` skill has been run, and a handoff note is written in `docs/handoffs/` (see `CLAUDE.md`). **Gameplay comes before art.** A fun game with gray boxes is easy to make pretty later. A pretty game that isn't fun is hard to fix.

### Phase 0: Scaffold
- Create the folder structure. Vendor `three.module.js` (+ `three.core.js`) into `libs/`.
- `index.html` with canvas container and empty overlay divs. `style.css` reset. `game.js` with renderer, scene, camera, a lit test cube, resize handling, and the game loop.
- Create `js/logic/` (with `config.js` and a seeded `rng.js`), `tests/` with a first passing test, and `docs/`.
- **Acceptance:**
  - [x] `python3 -m http.server` shows a spinning cube with wifi **turned off** *(verified 2026-11-17: manually by the user with wifi off, and in headless Chrome with all non-localhost DNS blocked)*
  - [x] `node --test 'tests/*.test.js'` passes

### Phase 1: Core running
- Scrolling ground segments (recycled). Placeholder player box in 3 lanes.
- Lane switching, jump, slide/duck (with fast-fall), and a camera behind and above the player.
- **Acceptance:**
  - [x] You can move, jump, and slide on an endless road that never runs out *(verified 2026-11-17 in Chrome with real key presses; see handoff)*

### Phase 2: Obstacles, collision, difficulty
- Placeholder low/high/block obstacles (color-coded boxes), pattern spawner with pooling.
- AABB collision with slide-aware hitbox. Head-on hit = game over (Phase 2: console log + freeze; Phase 3: the game-over screen). Until Phase 4 adds the stumble, side clips also end the run.
- Speed ramp, distance score.
- **Acceptance:** *(verified 2026-11-17; see the Phase 2 handoff)*
  - [x] You can play a full run (until caught; refresh to restart until Phase 3)
  - [x] Every obstacle row is passable (a test bot that waits a full reaction time before changing lanes survives 4-minute runs on 12 seeds; an independent check confirms every open lane leaves the full reaction time over 20 seeds)
  - [x] The game gets harder over time (speed ramp, denser rows, harder patterns)

### Phase 3: Game states, GUI, high score
- Menu, HUD, pause (including auto-pause on blur), game over with Play Again. Full reset logic.
- `localStorage` high score with "NEW HIGH SCORE!" badge.
- The menu's mute toggle is deferred to Phase 7, when there is audio to mute (ADR-0008).
- **Acceptance:** *(verified 2026-11-17 in Chrome; see the Phase 3 handoff)*
  - [x] Menu → play → pause/resume → die → play again loop works with no page reload
  - [x] High score survives a refresh

### Phase 4: Characters & chaser
- Procedural Hacker and Agent rigs with run, jump, slide, and stumble animations.
- Side-clip stumble mechanic. The Agent closes in and catches you on a second stumble.
- **Acceptance:** *(verified 2026-11-18 in headless Chrome; see the Phase 4 handoff)*
  - [x] Characters replace the boxes (Hacker and Agent rigs with run, jump, slide, and stumble/caught animations)
  - [x] Stumbling visibly brings the Agent closer (gap 12 → 3.8 on screen; a second stumble within 8 s, or a head-on hit, plays the catch beat and ends the run)

### Phase 5: Wasteland environment
- Ruined buildings, flickering broken screens, sagging wires overhead, abandoned hover-cars as set dressing.
- Fog, haze sky color, dust particles, lighting pass.
- **Acceptance:** *(verified 2026-11-18 in headless Chrome on the Apple M3 Pro GPU; see the Phase 5 handoff)*
  - [x] The scene reads clearly as "dead futuristic city": ruined buildings with dark windows (a few faintly lit), broken roof slabs, flickering/glitching/dead screens, cables sagging overhead, rusted hover-car wrecks, concrete barriers, crates, and rubble heaps filling the shoulders and sidewalks (never the lanes), streetlights (some dead or flickering) casting pools of light, a cracked road with sidewalks, fog fading into a haze sky, drifting dust
  - [x] Stays at 60 fps: ~60.3 fps at max speed, 91 draw calls (budget 150), ~8.5k triangles

### Phase 6: Themed obstacles
- Replace placeholder obstacles: low → fallen screens/barriers; high → hanging sparking wires/beams; block → wrecked hover-cars/pillars.
- Make sure each type is visually distinct at speed (silhouette and color cue).
- **Acceptance:** *(verified 2026-11-18 in headless Chrome on the Apple M3 Pro GPU; see the Phase 6 handoff)*
  - [x] A new player can tell at a glance which action each obstacle needs: LOW = low and wide with amber/black stripes; HIGH = hanging frame or beam with a glowing white line at slide height and empty space beneath; BLOCK = tall and solid with red lights/bands. Checked at start and max speed; the final judgement with a real new player is the user's.

### Phase 7: Audio & juice
- SFX and music (Web Audio or small files), mute toggle saved to storage.
- Camera shake on stumble, landing squash, sparks, screen-flicker on near-miss.
- **Acceptance:** *(verified 2026-11-18 in headless Chrome on the Apple M3 Pro GPU; see the Phase 7 handoff)*
  - [x] SFX for jump, landing, slide, stumble, caught, near miss, clicks, sparks, plus a music loop that follows speed; silent until the first input
  - [x] Mute via `M` and buttons on the menu, pause, and HUD; saved and restored across reloads
  - [x] Camera shake (stumble, catch, hard landing, near miss), landing squash, sparks (stumble, catch, live HIGH cables), near-miss screen flicker; all freeze on pause and reset with the run
  - [x] Still 60 fps at max speed (≈60.5 fps, 91 draw calls)

### Phase 8: Polish & extras (pick and choose)
Scope chosen by the user (2026-11-18): **data shards and the quality setting only** (ADR-0016).
- ~~Touch/swipe controls for tablets.~~ Not in v1 (dropped by the user).
- Data-shard collectibles.
- Settings (quality low/high, which toggles particles and resolution; the game has no shadows).
- ~~Performance profiling pass and final browser testing against §8.~~ Not done as a separate pass (dropped by the user). The usual per-phase smoke and fps check still ran.
- **Acceptance:** *(verified 2026-11-18 in headless Chrome on the Apple M3 Pro GPU; see the Phase 8 handoff)*
  - [x] Shards appear in lines between rows, never on an obstacle, and never change the obstacle sequence; running or sliding through collects them, jumping over misses them; each is worth 25 × the multiplier; the HUD and game-over screen show the count, and it resets with the run
  - [x] Quality LOW/HIGH from the menu and pause screens: LOW drops resolution to 1 pixel per CSS pixel and turns off dust and sparks; saved and restored across reloads
  - [x] Still 60 fps at max speed at both quality levels (60.1 HIGH / 60.0 LOW, about 102 draw calls)

### Round 2: Persistent shards
Requirements R4–R6 (§1). Decision record: `docs/decisions/0001-bank-shards-at-checkpoints.md`.
- Pure `js/logic/shardbank.js`: parse/load/save the total under `neonWasteland.shardTotal`, and `bankRunShards()` which banks only a run's not-yet-banked shards.
- `run.shardsBanked` tracks what has been banked; `resetRun()` resets it.
- `game.js` banks on catch, on abandon from pause, and on `pagehide` / tab hidden; the menu and game-over screens show the total.
- **Acceptance:** *(verified 2026-11-19: `node --test` 265/265; headless Chrome over CDP on `serve.py`, `?debug&seed=4`, 17/17 smoke checks)*
  - [x] R4: shards collected in a run are added to a lifetime total that survives a reload / browser restart; the menu and game-over screens show it; no shard is counted twice; garbage or missing storage reads as 0 and the game still runs without storage *(browser: 100 pre-saved → +30 banked on tab hide → 145 at game over → +15 kept through a mid-run reload → +11 on pause → Main Menu)*
  - [x] R5: still runs from `python3 serve.py` with no network, no build step, and no new files outside the repo *(every browser request was to localhost; tests walk the module graph and scan for network APIs)*
  - [x] R6: all earlier tests still pass; the run simulation (scores, shards, obstacle sequence) is unchanged; no storage writes during play except on hide/close; still 60 fps at max speed *(246 earlier tests pass; 0 `setItem` calls during 15 s of play; 60.1 fps at speed 35 on HIGH and LOW, 96–98 draw calls; zero console errors/warnings)*

### Round 3: Character shop
Requirements R7–R10 (§1). Decision records: `docs/decisions/0002-session-only-ownership-saved-spend.md`, `docs/decisions/0003-shop-state-and-prebuilt-rigs.md`.
- Pure `js/logic/shop.js`: the character catalogue (ids `hacker`, `android`, `alien`; prices from `CONFIG`), a session-only shop state (`owned`, `equipped`), `buyCharacter()` and `equipCharacter()`.
- `js/logic/shardbank.js`: `spendShards()`, which re-reads the stored total, refuses if it can't cover the price, and saves the new total.
- `js/logic/state.js`: a `SHOP` state (`MENU -SHOP-> SHOP`, `SHOP -MENU-> MENU`; `Esc`/`P` go back; `Enter`/`Space` do nothing on their own).
- `js/characters.js`: `createAndroid()` and `createAlien()` on the same skeleton as the Hacker. `game.js` builds all three runners at startup and shows only the equipped one.
- **Acceptance:** *(verified 2026-11-19: `node --test` 299/299; headless Chrome over CDP on `serve.py`, `?debug&seed=4`, 32/32 smoke checks; code review (low): no findings)*
  - [x] R7: the menu has a Shop button; the shop lists all three characters with their price or status; buying with enough shards spends exactly the price, updates the shown total and equips the character; buying without enough shards does nothing; an owned character can't be bought again; Back / `Esc` returns to the menu *(browser: 150 → Android → 50; locked Alien click did nothing; another tab's 260 picked up on re-entering; Alien → 60; re-equip free; Space in the shop doesn't start a run; Esc and Back return)*
  - [x] R8: the Android (silver robot) and Alien (green alien) can be bought, equipped and played; each reads clearly against the night scene at start and max speed *(screenshots in the shop, at start speed and at speed 35)*
  - [x] R9: every character is built on the same rig, stands about 1.8 tall and slides under the 0.8 slide height like the Hacker, and fits the same hitbox; the run simulation never reads the skin; every earlier test still passes; still 60 fps at max speed with each character *(Node: same pivots; top within +0.03/−0.05 of the Hacker, no wider, in 15 poses; browser: lanes, jump, slide, pause, catch, Play Again as the Android; 60.2 fps / 104 draw calls (Android), 60.3 fps / 101 (Alien) at speed 35; 0 storage writes during play; 0 console errors or warnings; every request to localhost)*
  - [x] R10: after a reload only the Hacker is owned and equipped, and the shard total still has the spend deducted; no new `localStorage` key exists; the shop writes nothing during play *(browser: reload → Hacker only, Android back on sale, total still 60, keys unchanged, high score kept)*

### Round 4: Power-ups
Requirements R11–R16 (§1). Decision record: `docs/decisions/0004-…` (written during the round). Rules in §3.8.
- Pure `js/logic/powerups.js`: the `POWER` types, pickup placement from the spawner's gap log with its own seeded RNG, pickup collection, the bazooka shot (`fireBazooka`), and the double-score and phase timers. All of it lives in the run and is cleared by `resetRun()`.
- `js/logic/run.js`: `stepRun()` fires a requested shot, ticks the timers, doubles score gains while double score is on, and skips hits while phasing (plus the 1 s grace when phase ends).
- `js/logic/input.js` / `state.js`: `F` → `ACTION.FIRE` → `CMD.FIRE`, only while PLAYING.
- `js/powerupModels.js` (view, DOM-free) and `game.js`: the pickup cases, the carried bazooka, the rocket streak and explosion, the phase glow, sounds, and the HUD row.
- **Acceptance:**
  - [ ] R11/R14: all three power-ups appear on the road in a lane between rows, never on an obstacle or a shard; running or sliding through one picks it up, jumping over misses it
  - [ ] R12: with a bazooka held, `F` destroys every obstacle in the next row (including one you're passing through) and uses up the shot; `F` without one does nothing; with no row ahead the shot is kept
  - [ ] R13: double score doubles distance and shard points (not the shard count) for 30 s; phase lets you run through any obstacle (no catch, no stumble) for 30 s, and nothing within 1 s ahead can hit you as it ends; both stop while paused
  - [ ] R15: placement is random (seeded) and rare: the first after 35–65 s, then 35–65 s apart (about one every 50 s); each type about a third of the time; the obstacle and shard sequences of every seed are unchanged
  - [ ] R16: power-ups can overlap; picking up an active timed one resets it to 30 s; a new run starts with none; every earlier test still passes; no per-frame allocations or storage writes; no new storage key; still 60 fps at max speed

---

## 10. Open Questions (decide as we go)
1. **Game title:** ~~"Neon Wasteland" is a working name.~~ **Resolved: "Apocalypse Run"** (ADR-0010). The `localStorage` keys keep the old `neonWasteland.` prefix so saved high scores aren't lost.
2. **Split `game.js` into modules** once it gets big, or keep a single file? *(Partly answered: logic is modular from the start, per ADR-0001. View code still to be decided.)*
3. **Audio:** ~~generated in code (zero files) vs. CC0 sound files?~~ **Resolved: generated in code with Web Audio** (ADR-0015).
4. **Collectibles:** ~~include data shards in v1, or keep pure distance scoring?~~ **Resolved: data shards are in v1**, as optional bonus points that never touch obstacle fairness (ADR-0016).
