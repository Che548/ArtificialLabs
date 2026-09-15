export type SwipeSample = {
  dx: number;
  dy: number;
  vx: number;
  vy: number;
  x0: number;
  numberActiveTouches: number;
};

export type SwipeOptions = {
  axis: 'horizontal' | 'vertical';
  positiveOnly?: boolean;
  edgeOnly?: boolean;
};

export function canCaptureSwipe(sample: SwipeSample, options: SwipeOptions) {
  if (sample.numberActiveTouches !== 1) return false;
  if (options.edgeOnly && (sample.x0 < 0 || sample.x0 > 28)) return false;
  const main = options.axis === 'horizontal' ? sample.dx : sample.dy;
  const cross = options.axis === 'horizontal' ? sample.dy : sample.dx;
  return (!options.positiveOnly || main > 0)
    && Math.abs(main) > 12 && Math.abs(main) > Math.abs(cross) * 1.6;
}

export function committedSwipe(sample: SwipeSample, options: SwipeOptions): -1 | 0 | 1 {
  // Released touches are zero; multi-touch is rejected while moving by the hook.
  if (sample.numberActiveTouches > 1) return 0;
  const main = options.axis === 'horizontal' ? sample.dx : sample.dy;
  const cross = options.axis === 'horizontal' ? sample.dy : sample.dx;
  const velocity = options.axis === 'horizontal' ? sample.vx : sample.vy;
  if (options.positiveOnly && main <= 0) return 0;
  if (Math.abs(main) <= Math.abs(cross) * 1.6) return 0;
  const distance = options.axis === 'horizontal' ? 56 : 80;
  const flick = Math.abs(main) >= 24 && Math.abs(velocity) > 0.65 && main * velocity > 0;
  if (Math.abs(main) < distance && !flick) return 0;
  return main > 0 ? 1 : -1;
}

export function adjacentSwipeIndex(
  options: ReadonlyArray<{ disabled?: boolean }>, index: number, direction: -1 | 1,
) {
  const step = direction < 0 ? 1 : -1;
  for (let next = index + step; next >= 0 && next < options.length; next += step) {
    if (!options[next].disabled) return next;
  }
  return index;
}
