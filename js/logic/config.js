// Central tuning values (SPEC §7). Pure data: no DOM, no THREE.
// Add new tuning numbers here as phases need them, rather than scattering
// magic numbers through game.js.

export const CONFIG = Object.freeze({
  // --- Main loop (SPEC §7.1) ---
  MAX_DT: 1 / 20, // clamp so a tab switch can't cause a huge step

  // --- Renderer / camera (SPEC §7.3) ---
  PIXEL_RATIO_MAX: 1.5,
  CAMERA_FOV: 60,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 150, // fog hides the far plane, so this can stay short
  CAMERA_X: 0,
  CAMERA_Y: 1.5,
  CAMERA_Z: 5,

  // --- Lighting ---
  AMBIENT_INTENSITY: 0.35,
  SUN_INTENSITY: 2.0,

  // --- Phase 0 test cube ---
  TEST_CUBE_SIZE: 1.5,
  TEST_CUBE_SPIN_X: 0.54, // radians per second
  TEST_CUBE_SPIN_Y: 0.9, // radians per second
});
