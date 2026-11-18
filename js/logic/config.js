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
  HEMI_INTENSITY: 1.4,
  SUN_INTENSITY: 1.6,
  RUNNER_LIGHT_INTENSITY: 14, // soft cold light behind/above the Hacker so his dark outfit keeps a silhouette
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

  // --- Ground segments (recycled; SPEC §7.2 World) ---
  GROUND_SEGMENT_LENGTH: 20,
  GROUND_SEGMENT_COUNT: 10, // 200 units: far edge always past the camera far plane (no pop-in)
  GROUND_BACK_Z: 15, // a segment wraps to the front once its far edge passes this z (behind camera)
  GROUND_WIDTH: 10,
  FLOOR_SIZE: 1200, // static floor beyond the road; wide enough for 32:9 windows at CAMERA_FAR
});
