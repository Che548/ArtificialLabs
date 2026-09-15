export type TiltPoint = { x: number; y: number };
export type TiltSpring = TiltPoint & { vx: number; vy: number };

// Deeper artwork travels less and catches up more slowly. All distances use
// the Today screen's 402-point canvas; the embryo stays inside its safe stage.
export const SPHERE_TILT_LAYERS = {
  embryo: { maxX: 10, maxY: 4, stiffness: 36, damping: 13 },
  back: { maxX: 26, maxY: 18, stiffness: 60, damping: 14 },
  middle: { maxX: 36, maxY: 26, stiffness: 90, damping: 16 },
  front: { maxX: 46, maxY: 32, stiffness: 125, damping: 18 },
} as const;
export type SphereTiltLayer = keyof typeof SPHERE_TILT_LAYERS;
export type TiltLayerState = Record<SphereTiltLayer, TiltSpring>;

export function createTiltLayerState(): TiltLayerState {
  'worklet';
  return {
    embryo: { x: 0, y: 0, vx: 0, vy: 0 },
    back: { x: 0, y: 0, vx: 0, vy: 0 },
    middle: { x: 0, y: 0, vx: 0, vy: 0 },
    front: { x: 0, y: 0, vx: 0, vy: 0 },
  };
}

/** Gravity is in m/s². The opening posture is neutral, not a fixed phone angle. */
export function sphereTiltTarget(
  gravity: TiltPoint,
  origin: TiltPoint,
): TiltPoint {
  'worklet';
  const axis = (delta: number) => {
    const magnitude = Math.abs(delta);
    if (!Number.isFinite(magnitude) || magnitude < 0.12) return 0;
    return Math.sign(delta) * Math.min(1, (magnitude - 0.12) / 4.8);
  };
  return { x: axis(gravity.x - origin.x), y: axis(origin.y - gravity.y) };
}

/** A damped spring preserves momentum; hard bounds also cover abrupt turns. */
export function advanceTiltSpring(
  state: TiltSpring,
  target: TiltPoint,
  elapsedSeconds: number,
  response = { stiffness: 72, damping: 12 },
): TiltSpring {
  'worklet';
  const dt = Number.isFinite(elapsedSeconds)
    ? Math.max(0, Math.min(1 / 30, elapsedSeconds))
    : 0;
  let vx =
    state.vx +
    ((target.x - state.x) * response.stiffness - state.vx * response.damping) *
      dt;
  let vy =
    state.vy +
    ((target.y - state.y) * response.stiffness - state.vy * response.damping) *
      dt;
  const x = Math.max(-1, Math.min(1, state.x + vx * dt));
  const y = Math.max(-1, Math.min(1, state.y + vy * dt));
  if (Math.abs(x) === 1 && x * vx > 0) vx = 0;
  if (Math.abs(y) === 1 && y * vy > 0) vy = 0;
  return { x, y, vx, vy };
}

/** One sensor sample drives independent springs, rather than one rigid group. */
export function advanceTiltLayers(
  state: TiltLayerState,
  target: TiltPoint,
  elapsedSeconds: number,
): TiltLayerState {
  'worklet';
  return {
    embryo: advanceTiltSpring(
      state.embryo,
      target,
      elapsedSeconds,
      SPHERE_TILT_LAYERS.embryo,
    ),
    back: advanceTiltSpring(
      state.back,
      target,
      elapsedSeconds,
      SPHERE_TILT_LAYERS.back,
    ),
    middle: advanceTiltSpring(
      state.middle,
      target,
      elapsedSeconds,
      SPHERE_TILT_LAYERS.middle,
    ),
    front: advanceTiltSpring(
      state.front,
      target,
      elapsedSeconds,
      SPHERE_TILT_LAYERS.front,
    ),
  };
}
