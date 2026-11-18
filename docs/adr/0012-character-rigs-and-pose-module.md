# ADR-0012: Character rigs in js/characters.js, poses as pure joint angles

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 4 (SPEC §9)

## Context
Phase 4 replaces the placeholder box with procedural Hacker and Agent rigs that have run, jump, slide, and stumble animations (SPEC §5). That raises two questions:
- where the view code goes, since `game.js` is about 500 lines and SPEC §2 suggests splitting view modules once it grows, and
- how to keep "the visual matches the hitbox" testable when the animation is three.js code.

The near-black Hacker on the cold, blue-black scene also needed a readability fix (art-direction skill).

## Decision
- **`js/logic/pose.js` (pure).**
  - Holds the rig dimensions (`RIG`, 1.80 tall, feet at y = 0) and poses as plain joint-angle objects: hip height, lean, roll, head, thighs, knees, shoulders, elbows, arm spread.
  - Pose builders: `hackerRun`, `hackerAir`, `hackerSlide`, `agentRun`, `agentAir`, `agentSlide`, `agentReach`, `standPose`.
  - The stumble/hit overlay: `hitWeight`, `hitOverlay`.
  - Blending (`blendPose`), the speed-scaled run-cycle phase (`cycleRate`, `advancePhase`), and side-view forward kinematics (`headTopY`, `footY`).
  - Tests use these to check that the run cycle stays about 1.8 tall, the slide pose fits under the slide hitbox (0.80) with clear room below HIGH obstacles (1.1), and feet never go through the road.
- **`js/characters.js` (view).**
  - Builds `THREE.Group` skeletons with pivots: body (roll) → hips → torso → head / shoulders → elbows, and hips → legs → knees.
  - Dresses them in low-poly boxes with shared materials, and `applyPose()` writes the angles to the pivots.
  - Everything is created once at startup, so there's no per-frame allocation.
- **`game.js`** keeps only the per-frame wiring (`updateCharacters`): phase and blend-weight bookkeeping. These blend weights are view state, not run state.
- **The look:**
  - The Hacker wears a hood, a dark face, and a cold `glowBlue` visor that's slightly wider than the hood so its tips show from behind. He has a backpack with a `glowBlue` LED strip, because the camera sees his back.
  - The Agent is drawn at `AGENT_SCALE = 1.05`: charcoal suit, white collar, thin tie, sunglasses, short hair (covering the back of the head), and pale hands.
- **Readability:** a single dim, cold `PointLight` (`glowPale`, `RUNNER_LIGHT_INTENSITY` / `RUNNER_LIGHT_RANGE`) follows the Hacker from behind and above, so his silhouette and the close Agent stay readable.
- **Agent visibility:** the Agent is hidden while `gap ≥ CAMERA_Z`, i.e. while he's behind the camera.

## Alternatives considered
- **Animation math inline in `game.js`.** Rejected. The height and slide-clearance rules couldn't be tested, and `game.js` would grow by about 300 lines.
- **`.glb` models** (SPEC §6 "later"). Rejected for now: they need GLTFLoader vendored, plus assets and credits. Procedural rigs are the SPEC default.
- **Merging each rig into one geometry/skinned mesh.** Rejected for now. About 18 + 19 small meshes keeps the frame at about 41 draw calls (budget 150). Revisit in the Phase 8 perf pass if needed.
- **Emissive hoodie or a fresnel rim shader** for readability. Rejected. Emissive flattens the shape, and a custom shader is more than Phase 4 needs. The Phase 5 lighting pass can revisit this.

## Consequences
- Pose tuning (angles) happens in `pose.js` and is covered by tests. Material and shape tuning happens in `characters.js`.
- SPEC §2 lists the new modules.
- The runner light lights a small pool of road around the player. Phase 5's lighting pass should keep it in mind (it's one of the "2–3 small dim cool lights" the skill allows).
