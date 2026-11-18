# ADR-0013: The city as deterministic recycled chunks, with a sky-matched fog

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 5 (SPEC §9)

## Context
Phase 5 adds the wasteland environment: ruined buildings, broken screens, overhead cables, wrecked hover-cars, fog, a haze sky, dust, and a lighting pass. It has to read as a dead futuristic city and hold 60 fps (SPEC §5, §7.3). Open questions:
- how to lay out and recycle the set dressing without per-frame allocation,
- how to keep it testable (ADR-0001),
- how to stop distant tall buildings from popping in or out at the far plane, and
- how to make plain boxes read as buildings without textures per building.

## Decision
- **Layout is pure** (`js/logic/scenery.js`).
  - The street is cut into chunks of `CITY_CHUNK_LENGTH = 40` along the track. `CITY_CHUNK_COUNT = 5` slots are reused: slot i shows the chunk k ≡ i (mod 5) that is in range, from `CITY_BACK = 20` behind the player to at least 140 ahead.
  - A chunk's content (buildings, broken roof slabs, rubble, screens, cables, wrecks) is generated into preallocated fixed-capacity records from a seed derived from `(CITY_SEED, k)`. So a restart, with the scroll back at 0, rebuilds the identical street, and regenerating never allocates.
  - Tests check the readability rules:
    - Nothing on the lanes. Wrecks stay at least 0.25 outside the lanes at any rotation, and rubble stays on the sidewalk.
    - Cables never come lower than `WIRE_MIN_Y = 7`, well above a jump.
    - Buildings never overlap.
    - New content always appears already fully fogged.
- **View** (`js/city.js`). Each chunk is a `THREE.Group` holding `InstancedMesh`es for facades, debris, wrecks, and wreck light strips, plus 2 screen planes and 2 cable meshes. Moving a chunk is one `position.z` write. Instances are only rewritten when a chunk wraps, and their bounding spheres are recomputed then, so frustum culling works. The result is about 55 draw calls in total.
- **Sky and fog.**
  - A sky dome (behind everything, following the camera) shows a vertical gradient. The horizon is `skyHaze` lifted 30% toward `skyGlow`, and the sky darkens upward.
  - `scene.fog` uses the horizon colour. City materials are patched so their fog fades to the sky colour in the view direction, using the same `skyColor()` GLSL as the dome. So fogged ruins dissolve into the gradient exactly, with no seam or far-plane pop.
  - `skyGlsl()` lives in the pure module, and a test evaluates the generated shader formula against the JS `skyColorAt()`.
  - three.js mixes fog after colour-space conversion, so the sky colours are sRGB.
- **Facades.** One shared Lambert material, patched with a window grid computed in metres from the instance scale. Tall and short buildings get the same window size, and there are no textures. About 2% of windows glow faintly in `glowBlue`, seeded per building by its position.
- **Screens.** Shared canvases:
  - one dead screen (cracked, a dim corner),
  - two leftover public messages that flicker on their own rhythms ("STAY INSIDE", "NO SIGNAL"),
  - one glitch canvas redrawn at `SCREEN_REDRAW_FPS = 6`.
- **Streetlights** (added after the user found the scene too dark and the Hacker hard to see).
  - A lamp post every `STREETLIGHT_SPACING = 20` on the sidewalk (|x| = 8.1), alternating sides by global lamp index. An arm reaches over the road shoulder to a cold `glowPale` lamp head at 6.6, below the lowest cable.
  - About 18% of lamps are dead and 14% flicker (deterministic per lamp).
  - Each lamp draws an emissive lens, a soft additive light pool on the road, and a faint additive cone. Both additive glows fade to black with distance, not toward the sky, which would brighten them.
  - Only `STREETLIGHT_LIGHTS = 2` real `PointLight`s exist. Each frame they are handed to the lamps nearest the player, weighted by `lampWeight(z)`. That weight is full from 22 ahead to the player and fades to 0 at 32 ahead and 8 behind. The window (40) is shorter than two lamp spacings, so at most two lamps ever need a light, and a light hops to the next lamp only while at zero strength: no popping.
  - The lights stay in the scene at intensity 0 when unused, so the light count and every shader stay fixed. Measured: the shader count holds at 20 over 42 recycled chunks.
  - Wrecks park on the kerb opposite each lamp, and rubble keeps clear of the posts.
  - The general scene light was raised too (hemisphere 1.4 → 1.9, moon 1.6 → 2.0, runner light 14 → 22), and the Hacker's outfit lifted from near-black to charcoal-black (`#272a32`).
- **Street clutter** (added after the user found the shoulders and sidewalks too empty).
  - One walk down each side of each chunk picks, by weight: a gap, a wreck (up to 5 per chunk, never beside a lamp post), a run of 1–3 concrete "jersey" barriers laid along the road (some knocked crooked), a rubble heap, or rusted crates (sometimes stacked). Each item takes its own stretch of z, so nothing overlaps.
  - Rubble from the walls is placed last and keeps clear of wrecks, barriers, and posts.
  - Rules (tested): every item stays ≥ `PROP_LANE_MARGIN` (0.25) outside the lanes, using a conservative 3D reach for tilted pieces; it stays off the buildings and lamp posts; and every side of every chunk is at least 40% filled (over 60% on average).
  - Barriers lie along the road and are plain concrete, so they can't be read as a LOW obstacle (which lies across a lane with amber stripes). Crates are rust and dark grey. None use the obstacle cues.
- **Dust.** One `Points` system, 320 motes. Positions are a pure function of (scroll, view time), so pause and reset need no special care.
- **Road.** The ground strip is widened to 26 (originally 19; widened in the pre-commit review so the sidewalk reaches the deepest setback): asphalt to ±7.6 (with a shoulder for wrecks), a kerb, and sidewalk slabs out to ±13, under every building's front wall. The texture has cracks, faint oil stains, and worn lane lines, and still tiles seamlessly.
- **The view clock** (flicker, glitch, dust) stops only while PAUSED, so the paused frame stays exact (SPEC §4).

## Alternatives considered
- **`scene.fog` with the flat `skyHaze` (the art-direction skill's default) and a flat sky.** It works, but there's no gradient. A gradient sky with plain fog makes fully fogged buildings show as flat slabs against the brighter or darker sky, popping in at the far plane.
- **A screen-space background gradient texture.** Rejected. It crops with the aspect ratio and doesn't line up with the real horizon.
- **Canvas facade textures.** Rejected. Box UVs stretch with instance scale, so tall and short buildings would get different window sizes, and per-building textures cost memory and draw calls.
- **Random (non-deterministic) chunk content.** Rejected. It's untestable, and the menu street would change every restart.
- **A real `PointLight` per streetlight.** Rejected. About 10 lights in view would add cost to every lit fragment of the whole scene. Two handed-off lights give the same effect where it matters (on the Hacker), and painted pools and cones carry the rest.
- **One global `InstancedMesh` per prop type with per-frame matrix updates.** Rejected. It means more CPU work every frame for no draw-call saving worth having.

## Consequences
- `CONFIG` gains the city, fog, sky, and dust values. `GROUND_WIDTH` goes from 10 to 26, and `ROAD_ASPHALT_HALF` is new.
- The fog colour is the lifted horizon, not raw `skyHaze`. The skill's "fog = background so the horizon blends" still holds, because the dome's horizon is that exact colour.
- Phase 6's themed obstacles must keep their cue colours out of the set dressing. Wrecks are rust with a `duskViolet` strip and cables are dark or soft blue, so the red/amber/white cues stay unique. When BLOCK obstacles become hover-cars, they should reuse `makeCarGeometry` and add the red cue.
- Sparks near live cables are left for Phase 7 ("sparks" is listed under juice there).
