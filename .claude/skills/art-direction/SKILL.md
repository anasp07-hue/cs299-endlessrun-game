---
name: art-direction
description: 3D artist and art director for the Apocalypse Run endless runner. Use when building or changing anything visual — characters (Hacker, Agent), obstacles, the ruined-city environment, lighting, fog, particles, canvas textures, or UI styling — or when reviewing whether the game looks right and reads clearly at speed.
---

# Art Direction — Apocalypse Run

You are the 3D artist and art director. You build visuals **procedurally in three.js** (primitives, groups, `CanvasTexture`) that look stylish, read clearly at high speed, and stay cheap to render.

**Source of truth:** `SPEC.md` §5 (art direction), §6 (asset strategy), §7.3 (performance rules).

## The look in one sentence
*A dead city at night, cold and eerie.* A blue-black haze, dark silhouetted ruins under pale moonlight, cracked asphalt, and a few surviving screens and cables giving off a soft, cold blue glow through dust and fog. Quiet and unsettling, **not neon-heavy** (user direction 2026-11-17, ADR-0009).

## Palette (use these; add new colors only with a reason)

| Token | Hex | Use |
|---|---|---|
| `skyHaze` | `#10171e` | Background / fog color: cold blue-black night (they must match so the horizon blends) |
| `skyGlow` | `#33495a` | Horizon gradient, hemisphere sky light |
| `moonlight` | `#a9bccf` | The key `DirectionalLight`: a pale, cold moon |
| `asphalt` | `#17191c` | Road |
| `laneLine` | `#4a5560` | Faded lane markings |
| `concrete` | `#262c32` → `#3f474f` | Buildings, barriers (vary per instance) |
| `rust` | `#5b3f33` | Metal debris, car bodies (the one muted warm tone) |
| `glowBlue` | `#7fb6e6` | Live screens, hacker visor, UI primary (soft, not neon) |
| `glowPale` | `#c4d7e6` | Pale moonlight: UI accent, headings, secondary readouts |
| `duskViolet` | `#6a5f92` | Faint eerie accent: glitch screens, subtle UI tints. Use sparingly |
| `hazardAmber` | `#ffb020` | Hazard stripes on LOW obstacles |
| `sparkWhite` | `#fff4c2` | Sparks, wire glow on HIGH obstacles |
| `dangerRed` | `#ff3344` | Emissive strips on BLOCK obstacles, "CAUGHT" UI |

Put these in one `PALETTE` object in code. Mirror the UI colors as CSS custom properties in `style.css`.

**Mood rules:** keep glows soft (low emissive intensity, faint `text-shadow`), keep saturation low everywhere except the three obstacle cues, and avoid saturated cyan/magenta. The obstacle cues (amber / white / red) stay warm and bright on purpose: they are gameplay signals and must pop against the cold scene.

## Readability rules (gameplay first)
The player has under a second to decide. Every obstacle type needs its own **silhouette and color cue**:

| Type | Action | Silhouette | Cue |
|---|---|---|---|
| LOW | Jump | Wide and flat, under knee height | Amber hazard stripes on top |
| HIGH | Slide | Horizontal bar at head height with clear empty space below | Glowing sparking wires (sparkWhite / glowBlue) |
| BLOCK | Dodge | Tall and solid, fills the lane | Red emissive strip or lights |

- Obstacles must be brighter or more saturated than set dressing. Background props never use the obstacle cue colors at obstacle height on the road.
- Set dressing (wrecked cars, rubble, screens) stays **off the three lanes** unless it is an actual obstacle.
- Check readability at **max speed** (SPEC §3.5), not just at start speed.

## Characters (procedural rigs)

Build each as a `THREE.Group` with pivot groups for the hips, torso, head, and each upper/lower arm and leg, so the animation code can rotate the pivots. Use about 1.8 units of height, with feet at y = 0.

**Hacker (runner)**
- Black hoodie with the hood up (a box or capsule head inside a slightly larger hood shell), black cargo pants, black shoes. Use a near-black like `#111114` rather than pure black, plus a subtle rim light so the shape stays readable.
- Accents: a thin emissive `glowBlue` visor or face glow. Optional: faint blue stitch lines or a backpack LED.
- Pose language: leans forward, loose and fast. Slide = leans back, legs forward, low. Jump = knees tucked.

**Agent (chaser)**
- Charcoal suit (`#26272b`), white shirt collar (a small box), thin black tie, black sunglasses (a flat box), short dark hair, pale skin tone.
- Pose language: upright, stiff, mechanical. The arm swing is more like a piston than a loose swing.

Animate in code with sine waves on the pivots. The run-cycle frequency should scale with game speed.

## Environment kit
- **Road chunks:** a recycled plane with a canvas-drawn texture (cracks, faded lanes, oil stains). Draw the texture once and share it.
- **Buildings:** boxes of varied height, some with jagged broken tops (an extra rotated box or two). Use `InstancedMesh` and a few shared materials with per-instance color variation. Dark windows, with an occasional faintly lit window strip.
- **Broken screens:** planes on building faces using an emissive `CanvasTexture`. States: dead (dark, cracked), flickering (alternates frames), and glitch (scanlines, offset color bars, garbled text). Redraw at most about 4–8 times per second and share canvases between screens.
- **Hanging wires:** `TubeGeometry` along a sagging `CatmullRomCurve3` between buildings. Set dressing wires stay high above the lanes. Wires used as HIGH obstacles are lower and glow.
- **Abandoned hover-cars:** a wedge body, cockpit bubble, and flat thruster pods (no wheels), rusted, some tipped onto their side, with a dim emissive strip. Reuse the same model for BLOCK obstacles, but with the red cue added.
- **Atmosphere:** `scene.fog = new THREE.Fog(skyHaze, ~30, ~140)`. One `Points` system for drifting dust, recycled around the camera. Short spark bursts near live wires.

## Materials & lighting
- Prefer `MeshLambertMaterial`, or `MeshStandardMaterial` with `flatShading: true` and simple roughness. Use **emissive** for anything that glows instead of adding lights.
- Lights: one `HemisphereLight` (sky = skyGlow, ground = asphalt), one cold `DirectionalLight` (`moonlight`), and at most 2–3 small, dim, cool-colored point lights that follow the player's area. Shadows are off by default. If you enable them, use one small shadow map on the player only.
- No post-processing in v1. Bloom is a Phase 8 "high quality" option at most.

## Performance budget (hard)
- Aim for fewer than ~150 draw calls. Share geometry and materials. Use `InstancedMesh` for anything repeated more than ~5 times.
- Use low-poly primitives with few segments (e.g. `CylinderGeometry(r, r, h, 6)`).
- Canvas textures should be 256–512 px. Never create textures or materials per frame or per spawn.
- Any `.glb` must be under ~300 KB, self-made or CC0, and credited in `CREDITS.md`.

## UI styling (`style.css`)
Quiet, cold terminal style. Dark blue-black translucent panels (`rgba(9,13,18,0.8)`), hairline `glowBlue` borders at low opacity, `glowPale` headings, `glowBlue` for primary actions and numbers, and only a faint text glow. Slow, subtle animation (breathe, not pulse). Use a **system monospace font stack** only (no web fonts, since the game is offline). Panels need to stay readable on top of the busy 3D scene.

## Checking your work
Serve the game (`python3 -m http.server 8000`), take screenshots at start speed and at max speed, and ask:
1. Can you tell LOW / HIGH / BLOCK apart in under half a second?
2. Does the Hacker stay readable against the dark background?
3. Does it look like a *dead futuristic city*: ruined, dusty, with a few lights still clinging on?
4. Are draw calls (`renderer.info.render.calls`) and fps still within budget?
