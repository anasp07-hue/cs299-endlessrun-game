// Fixed-timestep accumulator (ADR-0005). Pure: no DOM, no THREE.
//
// Usage per rendered frame:
//   const n = stepper.consume(dt);        // dt already clamped
//   for (let i = 0; i < n; i++) simulate(step);
//   render(stepper.alpha());              // 0..1 blend between last two sim states

/**
 * @param {number} step     fixed simulation step in seconds (e.g. 1/120)
 * @param {number} maxSteps cap on steps per frame, so a slow frame can't spiral
 */
export function createFixedStepper(step, maxSteps = 8) {
  if (!Number.isFinite(step) || step <= 0) {
    throw new TypeError(`createFixedStepper: step must be a positive finite number, got ${step}`);
  }
  let acc = 0;

  const stepper = {
    step,
    /** Add frame time; returns how many fixed steps to simulate now. */
    consume(dt) {
      if (Number.isFinite(dt) && dt > 0) acc += dt;
      let n = Math.floor(acc / step + 1e-9); // epsilon: 2 × (1/120) must be 2 steps
      if (n > maxSteps) {
        n = maxSteps;
        acc = 0; // drop the backlog rather than spiral
        return n;
      }
      acc -= n * step;
      if (acc < 0) acc = 0;
      return n;
    },
    /** Leftover fraction of a step, for render interpolation. Always in [0, 1). */
    alpha() {
      const a = acc / step;
      return a < 1 ? a : 0.999999;
    },
    /** Forget leftover time (call on reset / resume). */
    reset() {
      acc = 0;
    },
  };
  return stepper;
}
