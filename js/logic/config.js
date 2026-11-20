// Central tuning values (SPEC §3, §7). Pure data: no DOM, no THREE.
// Add new tuning numbers here as phases need them, rather than scattering
// magic numbers through game.js.

export const CONFIG = Object.freeze({
  // --- Main loop (SPEC §7.1, ADR-0005) ---
  MAX_DT: 1 / 20, // clamp so a tab switch can't cause a huge step
  SIM_STEP: 1 / 120, // fixed simulation timestep (seconds)
  SIM_MAX_STEPS: 8, // cap per frame; beyond this the backlog is dropped (no spiral)

  // --- Renderer / camera (SPEC §7.3) ---
  PIXEL_RATIO_MAX: 1.5,
  CAMERA_FOV: 60,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 150, // short on purpose; fog (Phase 5) will hide the far-plane cutoff
  CAMERA_Y: 3.4, // height above the road
  CAMERA_Z: 6.5, // distance behind the player (player is at z = 0)
  CAMERA_LOOK_Y: 1.2,
  CAMERA_LOOK_Z: -8, // look ahead down the road
  CAMERA_FOLLOW_X: 0.55, // fraction of the player's x the camera follows
  CAMERA_FOLLOW_RATE: 10, // exponential smoothing rate (1/s)

  // --- Lighting ---
  HEMI_INTENSITY: 1.9,
  SUN_INTENSITY: 2.0,
  RUNNER_LIGHT_INTENSITY: 22, // soft cold light behind/above the Hacker so his dark outfit keeps a silhouette
  RUNNER_LIGHT_RANGE: 7, // units: it only lights the runner, the Agent when close, and a pool of road

  // --- Speed & difficulty (SPEC §3.5) ---
  SPEED_START: 12, // units per second
  SPEED_MAX: 35,
  SPEED_ACCEL: 0.11, // units/s per second: reaches SPEED_MAX after ~3.5 min
  DIFFICULTY_DISTANCE: 1500, // distance at which difficulty reaches 1 (~1:30 into a run)

  // --- Scoring (SPEC §3.7) ---
  SCORE_MULT_DISTANCE: 500, // multiplier steps up every this many units
  SCORE_MULT_STEP: 0.1, // ...by this much (1.0, 1.1, 1.2, …)

  // --- Game states & UI (SPEC §4) ---
  GAMEOVER_INPUT_DELAY: 0.6, // seconds before Enter/Space can restart, so a mashed jump can't skip the game-over screen
  HUD_DIGITS: 9, // digit slots in the HUD score readouts (999,999,999 max)
  HUD_SHARD_DIGITS: 5, // digit slots in the HUD shard counter

  // --- Spawning & fairness (SPEC §3.4, ADR-0006) ---
  SPAWN_AHEAD: 160, // rows appear beyond the camera far plane, so they never pop into view
  DESPAWN_Z: 12, // obstacles are recycled once behind the camera
  FIRST_ROW_DISTANCE: 60, // a calm start: ~5 s before the first row
  REACTION_TIME: 0.55, // seconds needed before any new jump, slide, or lane change
  ROW_TIME_EASY: 1.35, // target seconds between rows at difficulty 0 (before jitter)
  ROW_TIME_HARD: 0.95, // target seconds between rows at difficulty 1 (fairness rules may push it out)
  GAP_JITTER: 0.3, // each gap is randomly scaled by 1 ± this, so the rhythm isn't uniform
  STAGGER_EASY: 0.1, // seconds: max depth spread of obstacles within one row, difficulty 0
  STAGGER_HARD: 0.3, // ...and at difficulty 1
  RANDOM_ROW_EASY: 0.15, // chance a row is generated lane-by-lane instead of from the table
  RANDOM_ROW_HARD: 0.4,
  RANDOM_ROW_FORCED: 0.5, // chance of a random row when 2+ lanes must be filled (else LLL/HHH dominate early)
  RANDOM_W_NONE: 3, // per-lane weights for random rows (all-BLOCK / empty rows are re-rolled)
  RANDOM_W_LOW: 2,
  RANDOM_W_HIGH: 2,
  RANDOM_W_BLOCK: 2,
  MAX_OBSTACLES: 64, // pooled obstacle slots (~2x the most ever live); a row is skipped (never crashes) if full

  // --- Obstacle sizes (hitbox = visual) ---
  OBSTACLE_WIDTH: 2.0, // narrower than a lane (2.5), so neighbouring lanes never clip
  LOW_HEIGHT: 0.9, // jump over
  LOW_DEPTH: 1.0,
  HIGH_BOTTOM: 1.1, // slide under: slide height (0.8) fits, standing (1.8) does not
  HIGH_TOP: 2.5, // must stay above the jump apex (2.2) so it can't be jumped over
  HIGH_DEPTH: 0.6,
  BLOCK_HEIGHT: 2.6, // above the jump apex (2.2): must dodge
  BLOCK_DEPTH: 2.0,

  // --- Lanes (SPEC §3.2) ---
  LANE_COUNT: 3,
  LANE_WIDTH: 2.5,
  LANE_CHANGE_TIME: 0.12, // seconds per one-lane move
  LANE_QUEUE_MAX: 2, // moves that can be queued behind the current one

  // --- Jump / slide (SPEC §3.3) ---
  JUMP_HEIGHT: 2.2, // apex height (units)
  JUMP_TIME: 0.7, // total airtime (seconds)
  JUMP_BUFFER: 0.1, // a jump pressed this long before landing still fires
  FASTFALL_V: 25, // downward speed when slide is pressed in the air
  SLIDE_TIME: 0.7, // seconds

  // --- Player size (the placeholder mesh uses these; Phase 2 derives a ~15%
  //     smaller collision hitbox from them, per the game-systems skill) ---
  PLAYER_WIDTH: 0.9,
  PLAYER_HEIGHT: 1.8,
  PLAYER_SLIDE_HEIGHT: 0.8,
  HITBOX_SCALE: 0.85, // collision box is 15% smaller than the visual, so near-misses feel lucky

  // --- Stumble & chaser (SPEC §3.6, ADR-0011) ---
  STUMBLE_WINDOW: 8, // seconds: a second side clip within this window means caught
  CHASER_GAP_NORMAL: 12, // units behind the player: behind the camera (CAMERA_Z), so off-screen
  CHASER_GAP_STUMBLE: 3.8, // right after a stumble: in view just below the player (closer covers their feet)
  CHASER_CLOSE_SPEED: 30, // units/s the Agent lunges in after a stumble (12 → 3.8 in ~0.3 s)
  CHASER_CATCH_GAP: 1.1, // where the Agent ends up when he catches you
  CATCH_TIME: 0.6, // seconds of the catch "beat" before the game-over screen
  TRAIL_STEPS: 256, // steps of player path the Agent follows (~2.1 s; he needs ≤ GAP_NORMAL / SPEED_START = 1 s)

  // --- Character animation (view only; js/logic/pose.js, ADR-0012) ---
  RUN_CYCLE_BASE: 1.3, // run cycles per second at speed 0 (one cycle = two steps)
  RUN_CYCLE_PER_SPEED: 0.05, // extra cycles/s per unit/s of speed (≈1.9 at start, ≈3.05 at max)
  STUMBLE_ANIM_TIME: 0.45, // seconds the stumble flail lasts
  POSE_BLEND_RATE: 14, // 1/s: how fast poses blend between run / air / slide
  AGENT_AIR_Y: 0.02, // the Agent switches to his jump pose when his path is this high off the road
  CATCH_REACH_AT: 0.6, // fraction of the catch beat by which the Agent's arms are fully out

  // --- Ruined city: set dressing, sky, fog, dust (SPEC §5, Phase 5, ADR-0013) ---
  CITY_SEED: 20261118, // the same street every run: chunk content depends only on (seed, chunk index)
  CITY_CHUNK_LENGTH: 40,
  CITY_CHUNK_COUNT: 5, // 200 units: from CITY_BACK behind the player to ≥ 140 ahead (fully fogged by then)
  CITY_BACK: 20, // a chunk is recycled once it is this far behind the player (camera is at 6.5)
  BUILDING_SETBACK_MIN: 9.5, // |x| of a building's road-facing wall (sidewalk in front of it)
  BUILDING_SETBACK_MAX: 13,
  BUILDING_WIDTH_MIN: 8, // x extent
  BUILDING_WIDTH_MAX: 16,
  BUILDING_DEPTH_MIN: 7, // z extent
  BUILDING_DEPTH_MAX: 16,
  BUILDING_HEIGHT_MIN: 9,
  BUILDING_HEIGHT_MAX: 44,
  BUILDING_ALLEY_CHANCE: 0.25,
  BUILDING_ALLEY_MIN: 2,
  BUILDING_ALLEY_MAX: 5,
  BUILDING_BROKEN_CHANCE: 0.45, // tilted slab left on the roof
  RUBBLE_CHANCE: 0.4,
  RUBBLE_SIZE_MIN: 0.4,
  RUBBLE_SIZE_MAX: 1.3,
  RUBBLE_SPREAD: 2.5, // how far from the wall rubble can roll (stays on the sidewalk)
  SCREEN_CHANCE: 0.3,
  SCREEN_WIDTH_MIN: 4,
  SCREEN_WIDTH_MAX: 8,
  SCREEN_Y_MIN: 4,
  SCREEN_DEAD_SHARE: 0.3, // dead / flickering / glitching (the rest)
  SCREEN_FLICKER_SHARE: 0.4,
  SCREEN_REDRAW_FPS: 6, // shared glitch canvases are redrawn this often (art-direction: 4–8)
  WIRE_CHANCE: 0.55,
  WIRE_MIN_Y: 7, // lowest point of any sagging cable: far above a jump (2.2 + 1.8 = 4.0)
  WIRE_MAX_Y: 12,
  WIRE_SAG_MIN: 1,
  WIRE_SAG_MAX: 2.8,
  WIRE_VARIANTS: 3,
  WIRE_GLOW_CHANCE: 0.3,
  WIRE_RADIUS: 0.05,
  WIRE_SPAN: 14, // cables run from x = −SPAN to +SPAN, into the walls
  WIRE_ANCHOR_X: 11, // where a cable meets the walls (between BUILDING_SETBACK_MIN and _MAX)
  WIRE_ROOF_GAP: 1, // anchors stay this far below both roofs
  CAR_WIDTH: 2.0,
  CAR_LENGTH: 3.8,
  CAR_X_MIN: 6.2, // reach (≈2.15) keeps every wreck ≥ 0.25 outside the lanes (3.75)...
  CAR_X_MAX: 7.3, // ...and off the buildings (9.5)
  CAR_TIPPED_CHANCE: 0.3,
  // Clutter on the shoulders (lane edge 3.75 → kerb 7.6) and sidewalks (→ 9.5).
  // One walk down each side picks items by weight; nothing comes within
  // PROP_LANE_MARGIN of a lane, and nothing uses the obstacle cue colours.
  PROP_LANE_MARGIN: 0.25,
  CHUNK_SEAM_MARGIN: 0.5, // street clutter keeps this far from each chunk end, so neighbours can't overlap
  STREET_LEVEL_Y: 3, // debris below this is street clutter (above: roof slabs)
  PROP_EMPTY_W: 0.12, // weights per step: leave a gap...
  PROP_CAR_W: 0.2, // ...a wreck (≤ MAX_CARS per chunk; never beside a lamp post)
  PROP_BARRIER_W: 0.22, // ...a run of concrete barriers
  PROP_HEAP_W: 0.2, // ...a rubble heap
  PROP_CRATE_W: 0.18, // ...rusted crates
  PROP_GAP_MIN: 0.4,
  PROP_GAP_MAX: 1.8,
  BARRIER_LENGTH: 2.6, // concrete road barrier, laid along the road (a LOW obstacle lies across it)
  BARRIER_WIDTH: 0.6,
  BARRIER_HEIGHT: 0.8,
  BARRIER_X_MIN: 4.9,
  BARRIER_X_MAX: 6.6,
  BARRIER_TILT: 0.25, // radians: knocked crooked
  HEAP_X_MIN: 5.9, // tilted chunks (≤ 0.85 radius) at ±HEAP_SPREAD stay ≥ PROP_LANE_MARGIN off the lanes
  HEAP_X_MAX: 7.0,
  HEAP_SPREAD: 0.8,
  HEAP_SIZE_MIN: 0.35,
  HEAP_SIZE_MAX: 0.9,
  CRATE_X_MIN: 5.2,
  CRATE_X_MAX: 8.5,
  CRATE_SIZE_MIN: 0.8,
  CRATE_SIZE_MAX: 1.4,
  STREETLIGHT_SPACING: 20, // one lamp post every 20 units, alternating sides (divides CITY_CHUNK_LENGTH)
  STREETLIGHT_X: 8.1, // |x| of the post, on the sidewalk just past the kerb (7.6)
  STREETLIGHT_HEIGHT: 6.6, // lamp head height: below the lowest cable (7), far above play
  STREETLIGHT_ARM: 2.3, // the arm reaches this far over the road shoulder
  STREETLIGHT_CLEARANCE: 1.2, // rubble keeps this far (in z) from a post on its side
  STREETLIGHT_DEAD_CHANCE: 0.18,
  STREETLIGHT_FLICKER_CHANCE: 0.14,
  STREETLIGHT_POOL_RADIUS: 6.5, // soft light pool painted on the road under each lamp
  STREETLIGHT_POOL_STRENGTH: 0.32, // additive brightness of that pool
  STREETLIGHT_CONE_STRENGTH: 0.016, // the faint cone of light through the dusty air
  STREETLIGHT_LIGHTS: 2, // real PointLights, handed between the lamps nearest the player
  STREETLIGHT_INTENSITY: 70, // candela (physically based lights): ≈ 1.6 at the player's head under a lamp
  STREETLIGHT_RANGE: 18,
  STREETLIGHT_FULL_AHEAD: 22, // a real light is at full strength from this far ahead...
  STREETLIGHT_FADE_AHEAD: 32, // ...fading in from here (window 32 + 8 = 40: never more than 2 lamps)
  STREETLIGHT_FADE_BEHIND: 8, // ...and fades out by this far behind the player
  FOG_NEAR: 22,
  FOG_FAR: 140, // everything new appears ≥ 140 ahead, already fully fogged into the sky
  SKY_HORIZON_GLOW: 0.3, // horizon/fog colour = skyHaze lifted this far toward skyGlow
  SKY_ZENITH_DARKEN: 0.5, // top of the sky = skyHaze darkened this much
  SKY_FADE_START: 0.0, // sin(elevation) where the darkening starts...
  SKY_FADE_END: 0.38, // ...and where it is complete (the top of the view is ≈ 0.36)
  DUST_COUNT: 320,
  DUST_SIZE: 0.08,
  DUST_AREA_X: 30, // box of drifting dust around the player
  DUST_AREA_Y: 9,
  DUST_AREA_Z: 70,
  DUST_DRIFT: 0.35, // units/s of slow sideways drift

  // --- Audio & juice (SPEC §9 Phase 7, ADR-0015) ---
  NEAR_MISS_MARGIN: 0.3, // an obstacle that passes within this gap of the player (no hit) is a near miss
  SHAKE_DECAY: 1.8, // trauma lost per second
  SHAKE_MAX_OFFSET: 0.32, // camera shake at full trauma (units)
  SHAKE_MAX_ROLL: 0.035, // ...and roll (radians)
  SHAKE_FREQ: 24, // how fast the shake wobbles
  TRAUMA_STUMBLE: 0.6,
  TRAUMA_CATCH: 0.95,
  TRAUMA_LAND: 0.25, // × landing strength
  TRAUMA_NEAR_MISS: 0.15,
  SQUASH_TIME: 0.18, // landing squash recovers over this long
  SQUASH_AMOUNT: 0.22, // at full strength the Hacker squashes 22% shorter
  NEAR_MISS_FLASH_TIME: 0.18,
  NEAR_MISS_FLASH_PEAK: 0.6, // opacity of the cold screen flicker (edges + scanlines only: the centre stays clear)
  SPARK_MAX: 160, // pooled spark particles
  SPARK_GRAVITY: 14,
  SPARK_DRAG: 1.4,
  SPARK_LIFE_MIN: 0.35,
  SPARK_LIFE_MAX: 0.8,
  SPARK_SIZE: 0.24,
  SPARK_AMBIENT_RATE: 7, // sparks per second dripping from each HIGH obstacle's live cable nearby
  SPARK_AMBIENT_RANGE: 45, // ...when it is closer than this
  MUSIC_BPM: 92,
  MUSIC_VOLUME: 0.32,
  SFX_VOLUME: 0.55,

  // --- Data shards (SPEC §3.7, Phase 8, ADR-0016) ---
  // Optional pickups laid in the open stretch between two obstacle rows, never
  // overlapping an obstacle. They use their own RNG, so the obstacle sequence
  // for a seed is unchanged.
  SHARD_RUN_CHANCE: 0.5, // chance a gap between rows gets a line of shards
  SHARD_RUN_MIN: 3, // a gap too short for this many is left empty
  SHARD_RUN_MAX: 5,
  SHARD_SPACING: 2.2, // units between shards in a line
  SHARD_Y: 0.85, // centre height: collected standing or sliding, missed when jumping over
  SHARD_HIT_W: 1.0, // pickup box (x)...
  SHARD_HIT_H: 0.8, // ...(y: 0.45–1.25, so the slide box, top 0.68, still reaches it)...
  SHARD_HIT_D: 0.8, // ...(z)
  SHARD_POINTS: 25, // × the distance multiplier, per shard
  MAX_SHARDS: 48, // pooled; a line that doesn't fit is cut short (never crashes)
  SHARD_VISUAL_W: 0.23, // half-width of the drawn diamond (inside SHARD_HIT_W / 2)
  SHARD_VISUAL_H: 0.33, // half-height; plus SHARD_BOB it stays inside SHARD_HIT_H / 2
  SHARD_SPIN: 2.4, // radians per second
  SHARD_BOB: 0.07, // units up and down
  SHARD_STREAK_TIME: 0.6, // pickups closer together than this climb in pitch (one line)

  // --- Character shop (Round 3, R7/R8; SPEC §4 Shop) ---
  PRICE_ANDROID: 100, // shards (about 2–4 runs)
  PRICE_ALIEN: 200,

  // --- Quality setting (Phase 8, ADR-0016) ---
  PIXEL_RATIO_MAX_LOW: 1, // LOW quality renders at 1 pixel per CSS pixel and drops dust + sparks

  // --- Ground segments (recycled; SPEC §7.2 World) ---
  GROUND_SEGMENT_LENGTH: 20,
  GROUND_SEGMENT_COUNT: 10, // 200 units: far edge always past the camera far plane (no pop-in)
  GROUND_BACK_Z: 15, // a segment wraps to the front once its far edge passes this z (behind camera)
  GROUND_WIDTH: 26, // asphalt to ±7.6 (shoulder for clutter), kerb, sidewalk out to ±13 (the deepest building setback)
  ROAD_ASPHALT_HALF: 7.6, // where the kerb is drawn on the road texture
  FLOOR_SIZE: 1200, // static floor beyond the road; wide enough for 32:9 windows at CAMERA_FAR
});
