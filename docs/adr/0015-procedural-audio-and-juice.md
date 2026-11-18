# ADR-0015: Audio generated in code; juice driven by event counters

- **Status:** Accepted
- **Date:** 2026-11-18
- **Phase:** 7 (SPEC §9). This resolves SPEC §10 open question 3.

## Context
Phase 7 adds SFX, music, a mute toggle saved to storage, camera shake on stumble, landing squash, sparks, and a screen flicker on near-misses. SPEC §6 allowed either Web Audio generated in code or small CC0 files (§10 Q3). The game must run fully offline with no remote assets (§1). Browsers allow audio only after a user gesture, and per-frame code must not allocate (§7.3).

## Decision
- **All audio is generated with the Web Audio API in `js/audio.js`.** There are zero audio files.
  - **SFX:** short oscillator/noise envelopes for jump (rising blip), landing (a thud scaled by impact), slide (a filtered-noise whoosh), stumble (a crunch, a thump, and a detuned metal clang, panned to the hit side), caught (a falling saw, a sub boom, and noise), near-miss (a high zip panned toward the obstacle's lane), button click, and spark crackle (rate-limited).
  - **Music:** a generative A-minor loop at `MUSIC_BPM` 92: a detuned drone with a slow LFO, a bass pulse, a sparse arpeggio through a feedback echo, and offbeat ticks at speed. A 25 ms lookahead scheduler queues notes ahead (never in the render loop). The lowpass opens and the density rises with the run's speed. The music ducks on the menu (0.55), on pause (0.25), and at game over (0.4).
  - Nothing is created until the first click or key press (`unlock()`). Without Web Audio every call is a silent no-op. The context suspends while the tab is hidden.
- **Mute.**
  - Toggled with **M** in any state, or with buttons on the menu, the pause screen, and the HUD.
  - Saved as JSON under **`neonWasteland.settings`** (same legacy prefix as the high score, ADR-0010) by pure `js/logic/settings.js`. Unknown or garbage values fall back to defaults, and every storage call is wrapped.
- **Events as counters, not lists.**
  - The player counts `jumps`, `landings` (plus `landSpeed`), and `slides`. The run counts `nearMisses` (plus the type and lane). The chaser already counts `stumbles` and has `catching`.
  - Each frame the view compares these with the last values it saw and fires sound and effects. Nothing allocates, every event is caught even with several sim steps per frame (e.g. a buffered jump landing and jumping in one step), and the counters reset with the run.
- **Near miss** (pure, `trackNearMisses` in `js/logic/spawner.js`). While an obstacle overlaps the player in depth, it records the smallest gap across the lane and in height. Once the obstacle has passed, a gap greater than 0 but under `NEAR_MISS_MARGIN` (0.3) counts once, provided the obstacle wasn't hit or side-clipped. Measured that way:
  - a jump that only just clears a LOW counts,
  - a comfortable jump, an ordinary slide under a HIGH (0.42 of clearance), and a BLOCK in the next lane don't,
  - shaving past a BLOCK while changing lanes does.
- **Juice** (pure, `js/logic/juice.js`, `js/logic/particles.js`).
  - **Camera shake:** trauma with the shake = trauma², decaying at `SHAKE_DECAY`. Trauma is added on stumble (0.6), catch (0.95), hard landings (0.25 × strength²), and near-misses (0.15).
  - **Landing squash:** up to 22% shorter, recovering over 0.18 s.
  - **Near-miss flicker:** a CSS overlay of a cold edge vignette plus scanlines, flickering for 0.18 s with its centre left clear.
  - **Sparks:** a fixed pool of 160 in typed arrays, with gravity, drag, one weak bounce, and carried along by the world's scroll. They fire on a stumble (off the hit side), on the catch, and dripping from HIGH obstacles' live cables, with a shower when you slide under one.
  - All effects freeze while paused and reset with the run.

## Alternatives considered
- **CC0 `.ogg` files.** Rejected. They mean extra files to find, license, credit, and ship (§1 lightweight), they need decoding and fetch handling, and they're harder to tune than numbers in code. Generated sound is zero bytes and fits the cold synth mood.
- **An event queue (array of events) from the simulation.** Rejected: it allocates or needs a ring buffer, and it's more state to reset. Counters do the same job.
- **Shake via random jitter each frame.** Rejected. Smooth noise of trauma² reads as an impact rather than a vibration, and small knocks stay subtle.

## Consequences
- SPEC §3.3 (M key), §4 (the menu's mute toggle, deferred in ADR-0008, now exists), §6, and §10 Q3 are updated.
- Web Audio one-shot nodes are created per sound event. That's inherent to the API and happens only on events, never per frame.
- The music is functional rather than composed. A future pass can swap patterns without touching the game.
