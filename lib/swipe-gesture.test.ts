import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjacentSwipeIndex, canCaptureSwipe, committedSwipe, type SwipeSample } from './swipe-gesture';

const sample = (overrides: Partial<SwipeSample> = {}): SwipeSample => ({
  dx: 0, dy: 0, vx: 0, vy: 0, x0: 10, numberActiveTouches: 1, ...overrides,
});
const horizontal = { axis: 'horizontal' } as const;
const back = { ...horizontal, positiveOnly: true, edgeOnly: true };
const down = { axis: 'vertical', positiveOnly: true } as const;

test('ordinary taps and vertical scrolling do not switch modes', () => {
  assert.equal(canCaptureSwipe(sample({ dx: 5 }), horizontal), false);
  assert.equal(canCaptureSwipe(sample({ dx: 20, dy: 70 }), horizontal), false);
  assert.equal(canCaptureSwipe(sample({ dx: 35, dy: 30 }), horizontal), false);
});
test('back starts only at the left edge and moves right', () => {
  assert.equal(canCaptureSwipe(sample({ dx: 25 }), back), true);
  assert.equal(canCaptureSwipe(sample({ dx: 25, x0: 90 }), back), false);
  assert.equal(canCaptureSwipe(sample({ dx: -25 }), back), false);
});
test('short drags cancel, intentional swipes commit in either direction', () => {
  assert.equal(committedSwipe(sample({ dx: 30 }), horizontal), 0);
  assert.equal(committedSwipe(sample({ dx: 70, numberActiveTouches: 0 }), horizontal), 1);
  assert.equal(committedSwipe(sample({ dx: -70, numberActiveTouches: 0 }), horizontal), -1);
});
test('flick requires enough travel and velocity in the same direction', () => {
  assert.equal(committedSwipe(sample({ dx: 28, vx: 0.9 }), horizontal), 1);
  assert.equal(committedSwipe(sample({ dx: 10, vx: 2 }), horizontal), 0);
  assert.equal(committedSwipe(sample({ dx: 28, vx: -0.9 }), horizontal), 0);
});
test('sheet ignores upward, sideways and short downward gestures', () => {
  assert.equal(canCaptureSwipe(sample({ dy: -30 }), down), false);
  assert.equal(committedSwipe(sample({ dy: 40 }), down), 0);
  assert.equal(committedSwipe(sample({ dy: 100, dx: 100 }), down), 0);
  assert.equal(committedSwipe(sample({ dy: 90 }), down), 1);
});
test('multi-touch cannot trigger navigation or dismissal', () => {
  const gesture = sample({ dx: 100, numberActiveTouches: 2 });
  assert.equal(canCaptureSwipe(gesture, horizontal), false);
  assert.equal(committedSwipe(gesture, horizontal), 0);
});
test('switchers skip disabled options and stop at either end', () => {
  const options = [{}, { disabled: true }, {}];
  assert.equal(adjacentSwipeIndex(options, 0, -1), 2);
  assert.equal(adjacentSwipeIndex(options, 2, 1), 0);
  assert.equal(adjacentSwipeIndex(options, 0, 1), 0);
  assert.equal(adjacentSwipeIndex(options, 2, -1), 2);
});
