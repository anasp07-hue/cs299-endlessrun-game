# SPEC — Neon Wasteland Endless Runner

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
│   │   └── spawner.js  # Pattern table, fair row spacing, obstacle pool (ADR-0006)
│   └── palette.js      # Color palette (mirrored as CSS vars in style.css)
├── tests/              # node --test 'tests/*.test.js'  (Node built-in runner, dev-only — see ADR-0002, ADR-0004)
├── docs/
│   ├── adr/            # Architecture Decision Records
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
Browsers block ES-module imports over `file://`, so double-clicking `index.html` **will not work**. Serve the folder with any static server instead. This still works with no internet connection:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

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
| Pause | `Esc` / `P` | Toggle pause |
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
- Obstacle sizes (hitbox = visual): all 2.0 wide (lanes are 2.5, so a neighbouring lane never clips). LOW: 0.9 tall. HIGH: from 1.1 up to 2.5, above the 2.2 jump apex, so it can only be slid under. BLOCK: 2.6 tall.

### 3.5 Speed & difficulty
- Start speed 12 units/s. It increases by 0.11 units/s every second, up to a cap of 35 units/s (reached after about 3.5 minutes).
- Rows get denser and use harder patterns as distance increases. Difficulty goes from 0 to 1 over the first 1,500 units (about 1:30 into a run). Some multi-obstacle rows (`B.B`, `LLL`, `HHH`, `L.L`, `H.H`) appear from the start.

### 3.6 Collision & the chaser
- Collisions are box-vs-box (AABB) tests using simple hitboxes, not mesh geometry. The player's hitbox gets shorter while sliding.
- **Head-on hit** (running into an obstacle): the agent catches you and the run ends immediately.
- **Side clip** (bumping an obstacle while changing lanes): you **stumble**. You get bounced back to your previous lane and the agent closes in. A second stumble within about 8 s means you get caught.
- The agent is shown running behind the player. Normally he stays slightly off-screen or far back. After a stumble he is close and visible, then slowly drops back.

### 3.7 Scoring
- Score = distance traveled, multiplied by a slowly rising multiplier.
- *(Optional, Phase 8)* Collectible "data shards" floating in lanes give bonus points.

---

## 4. Game States & GUI

```
 MENU ──Play──▶ PLAYING ◀──Resume── PAUSED
                  │  ──Esc/P/blur──▶
                  ▼
              GAME OVER ──Play Again──▶ PLAYING
                  └──Menu──▶ MENU
```

All UI is HTML/CSS layered on top of the canvas (not drawn in three.js). It uses a neon-on-dark cyberpunk style that matches the theme.

| Screen | Contents |
|---|---|
| **Main menu** | Title, **Play** button, current high score, controls cheat-sheet, mute toggle |
| **HUD** (while playing) | Score (top-left), high score (top-right), pause button |
| **Pause** | Dimmed overlay, **Resume**, **Restart**, **Main Menu**. The game also auto-pauses when the tab loses focus. |
| **Game over** | "CAUGHT" heading, final score, high score, a "NEW HIGH SCORE!" badge when earned, **Play Again** (also `Enter`/`Space`), **Main Menu** |

While paused, the game loop keeps rendering but stops simulating, and delta-time is reset on resume so nothing jumps.

### High score persistence
- Stored in `localStorage` under the key `neonWasteland.highScore`.
- Every `localStorage` read/write is wrapped in `try/catch`. If storage is unavailable (private mode), the game still works and just doesn't keep the score.

---

## 5. Art Direction: Futuristic City, Now a Wasteland

**Mood:** a dead neon metropolis. The sky is a dark orange-brown haze. Fog hides the distance. A few screens still flicker in cyan and magenta. Dust drifts through the air.

| Element | Description | Technique (lightweight) |
|---|---|---|
| **Road** | Cracked asphalt strip with faded lane lines | Tiled ground segments recycled ahead of the player; canvas-generated texture |
| **Ruined buildings** | Tall boxes along both sides, some with broken tops or gaps | Low-poly boxes with variation, recycled in chunks; `InstancedMesh` where possible |
| **Giant screens** | Broken billboards on buildings, some dead, some flickering glitch art | Planes with emissive `CanvasTexture`, redrawn a few times per second |
| **Hanging wires** | Cables sagging between buildings and over the road | `TubeGeometry` along a curve; some become "slide under" obstacles |
| **Abandoned cars** | Futuristic hover-cars on the ground, shattered, some tipped over | Low-poly box/wedge compositions with a dim emissive strip |
| **Atmosphere** | Fog, floating dust, occasional sparks from wires | `scene.fog`, one `Points` particle system |
| **Lighting** | Dim ambient + a hazy directional "sun" + a few colored accent lights | At most 1 shadow-casting light (or none). Use emissive materials instead of many real lights. |

### Characters

**Runner: "the Hacker"**
- All black: hoodie with the hood up, black pants, black shoes. A small glowing visor or screen glow on the face is the only bright accent, so he stays readable against the dark scene.
- Built from primitives (capsules/boxes) as a `THREE.Group` with separate limb pivots.
- Animations done in code: run cycle (swing limbs with a sine wave), jump pose, slide pose (body tilted back, low), stumble.

**Chaser: "the Agent"**
- Black suit, white shirt, thin black tie, sunglasses, short hair.
- Same rig approach as the Hacker, with a stiffer, more mechanical run cycle.

---

## 6. Asset Strategy

**Default: procedural.** Everything at first is built in code from three.js primitives and `CanvasTexture`s. That means no extra downloads, nothing to break offline, and the art is quick to change.

**Later, if wanted:** swap characters or props for small `.glb` files in `assets/models/` (each under ~300 KB, low-poly). This requires vendoring `GLTFLoader.js` into `libs/`. Any `.glb` must be self-made or properly licensed (e.g. CC0), with credit recorded in a `CREDITS.md`.

**Sound:** short SFX (jump, slide, stumble, caught, button click) and one looping music track. Either:
- generate them with the Web Audio API in code (zero files), or
- use small CC0 `.ogg` files in `assets/sounds/`.

Audio starts only after the first user click (browser autoplay rules). The mute setting is saved in `localStorage`.

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
- [ ] Runs offline from a local static server in current Chrome, Firefox, Safari, and Edge
- [ ] 3 obstacle types, each with one clear correct action
- [ ] Hacker runner and Agent chaser with visible run animations
- [ ] Wasteland city with broken screens, hanging wires, abandoned cars
- [ ] Menu, HUD, pause, and game over/play-again screens all work
- [ ] High score persists across browser restarts
- [ ] Steady 60 fps on a typical laptop

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
- AABB collision with slide-aware hitbox. Head-on hit = game over (temporary: console log + freeze). Until Phase 4 adds the stumble, side clips also end the run.
- Speed ramp, distance score.
- **Acceptance:** *(verified 2026-11-17; see the Phase 2 handoff)*
  - [x] You can play a full run (until caught; refresh to restart until Phase 3)
  - [x] Every obstacle row is passable (a test bot that waits a full reaction time before changing lanes survives 4-minute runs on 12 seeds; an independent check confirms every open lane leaves the full reaction time over 20 seeds)
  - [x] The game gets harder over time (speed ramp, denser rows, harder patterns)

### Phase 3: Game states, GUI, high score
- Menu, HUD, pause (including auto-pause on blur), game over with Play Again. Full reset logic.
- `localStorage` high score with "NEW HIGH SCORE!" badge.
- **Acceptance:** Menu → play → pause/resume → die → play again loop works with no page reload. High score survives a refresh.

### Phase 4: Characters & chaser
- Procedural Hacker and Agent rigs with run, jump, slide, and stumble animations.
- Side-clip stumble mechanic. The Agent closes in and catches you on a second stumble.
- **Acceptance:** Characters replace the boxes. Stumbling visibly brings the Agent closer.

### Phase 5: Wasteland environment
- Ruined buildings, flickering broken screens, sagging wires overhead, abandoned hover-cars as set dressing.
- Fog, haze sky color, dust particles, lighting pass.
- **Acceptance:** The scene reads clearly as "dead futuristic city" and stays at 60 fps.

### Phase 6: Themed obstacles
- Replace placeholder obstacles: low → fallen screens/barriers; high → hanging sparking wires/beams; block → wrecked hover-cars/pillars.
- Make sure each type is visually distinct at speed (silhouette and color cue).
- **Acceptance:** A new player can tell at a glance which action each obstacle needs.

### Phase 7: Audio & juice
- SFX and music (Web Audio or small files), mute toggle saved to storage.
- Camera shake on stumble, landing squash, sparks, screen-flicker on near-miss.

### Phase 8: Polish & extras (pick and choose)
- Touch/swipe controls for tablets.
- Data-shard collectibles.
- Settings (quality low/high, which toggles particles/shadows).
- Performance profiling pass and final browser testing against §8.

---

## 10. Open Questions (decide as we go)
1. **Game title:** "Neon Wasteland" is a working name.
2. **Split `game.js` into modules** once it gets big, or keep a single file? *(Partly answered: logic is modular from the start, per ADR-0001. View code still to be decided.)*
3. **Audio:** generated in code (zero files) vs. CC0 sound files?
4. **Collectibles:** include data shards in v1, or keep pure distance scoring?
