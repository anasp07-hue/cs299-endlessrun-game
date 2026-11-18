# ADR-0014: Themed obstacle models fitted to their hitboxes, tested in Node

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 6 (SPEC §9)

## Context
Phase 6 replaces the colour-coded placeholder boxes with themed obstacles: LOW becomes fallen screens or barriers, HIGH becomes hanging wires or beams, and BLOCK becomes wrecked hover-cars or pillars. Two requirements:
- A new player must be able to tell at a glance which action each one needs.
- SPEC §3.4's "hitbox = visual" must keep holding, so a jump or slide that looks clear is clear.

Free-form models make it easy to break both without noticing.

## Decision
- **`js/obstacleModels.js` (view, no DOM)** builds 2 variants per type (`OBSTACLE_VARIANTS`).
  - Each variant is two merged, vertex-coloured geometries:
    - **body:** lit parts (concrete, steel, rust, dark glass).
    - **glow:** unlit parts in that type's cue colour only.
  - The looks:
    - **LOW (jump):** a fallen screen on a rubble bed, or a concrete barrier laid across the lane. Both carry amber/black diagonal hazard stripes on the top and front.
    - **HIGH (slide):** a hanging billboard frame, or a broken I-beam with a sparking cable bundle. Both have a `sparkWhite` line along the bottom edge, exactly at `HIGH_BOTTOM`. The frame hangs on thin cables rising into the dark (decoration above `HIGH_TOP`), and nothing is below `HIGH_BOTTOM`: the space you slide through is visibly empty. `glowBlue` is allowed as a secondary spark.
    - **BLOCK (dodge):** a hover-car crashed tail-first, nose up and roof toward you (reusing the city's car parts), or a broken concrete pillar. Both are tall and solid with bold `dangerRed` lights or bands.
  - LOW and BLOCK models are fitted to their hitbox by a measured transform (bounding box → hitbox). HIGH is built directly in hitbox coordinates.
- **Variant choice:** `obstacleVariant(row, lane)`, a deterministic hash, so a look never changes mid-pass and the spawner's RNG is untouched.
- **Rendering** (`game.js`): one `InstancedMesh` per (type, variant, part), 12 draw calls in place of 3, sharing just two materials (a Lambert with vertex colours, and a Basic with vertex colours). Both use the city's sky-matched fog (`applySkyFog`, ADR-0013). The per-frame loop only writes instance matrices, and only the live instances are uploaded.
- **No shared faces between body and glow:** body parts that touch a glow part are inset by 0.012, so the cue never z-fights (tested for HIGH's slide line).
- **Shared builders** (merging coloured parts, the hover-car, the barrier profile, tubes) move from `js/city.js` to `js/geometry.js`, also DOM-free.
- **Tests import three.js in Node** (`tests/obstacles.test.js`). ADR-0001 keeps game rules three.js-free. This adds a narrower practice: view modules that are DOM-free may be imported by tests, so real geometry can be measured. The tests check:
  - every model stays inside its hitbox across the lane and along the road, and fills it (≥ 95% width, ≥ 85% depth, full height),
  - LOW never rises above `LOW_HEIGHT`,
  - HIGH has nothing below `HIGH_BOTTOM` and its glow line sits exactly there across the lane,
  - BLOCK reaches `BLOCK_HEIGHT` and is buried at most 0.4,
  - each type glows only in its own cue colour, and no body uses any cue colour,
  - variants are deterministic and evenly used.

## Alternatives considered
- **Changing hitboxes to fit nicer models** (e.g. a BLOCK as long as a car, 3.8). Rejected. It changes the fairness timing that the spawner and the 4-minute bot tests guarantee (ADR-0006/0007), to suit a look.
- **Textures for the hazard stripes.** Rejected. Geometry stripes (slanted slats) need no canvas, so the models stay DOM-free and testable, and they stay crisp at any distance.
- **One material per part colour.** Rejected. Vertex colours keep it to two materials and 12 draw calls in total.
- **Testing only in the browser.** Rejected. "hitbox = visual" is exactly the kind of rule that drifts silently when someone tweaks a model.

## Consequences
- New looks are added by writing a builder and adding it to every type's list in `BUILDERS`. `OBSTACLE_VARIANTS` is derived from those lists, and the tests then check the new look automatically.
- Phase 7's sparks or flicker on HIGH cables and BLOCK beacons can animate the glow materials without touching the models.
- Draw calls at max speed: about 88. Triangles: about 10k.
