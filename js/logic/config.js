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

  // --- Speed (SPEC §3.5; the ramp comes in Phase 2) ---
  SPEED_START: 12, // units per second

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

  // --- Ground segments (recycled; SPEC §7.2 World) ---
  GROUND_SEGMENT_LENGTH: 20,
  GROUND_SEGMENT_COUNT: 10, // 200 units: far edge always past the camera far plane (no pop-in)
  GROUND_BACK_Z: 15, // a segment wraps to the front once its far edge passes this z (behind camera)
  GROUND_WIDTH: 10,
  FLOOR_SIZE: 1200, // static floor beyond the road; wide enough for 32:9 windows at CAMERA_FAR
});
