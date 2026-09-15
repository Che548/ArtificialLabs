import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, expect, test, vi } from 'vitest';

const native = vi.hoisted(() => ({ handlers: {} as Record<string, (...args: any[]) => any> }));
vi.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PanResponder: { create: (handlers: typeof native.handlers) => {
    native.handlers = handlers;
    return { panHandlers: {} };
  } },
}));
import { useIOSSwipe } from './use-ios-swipe';

const onSwipe = vi.fn();
const onCancel = vi.fn();
function Harness({ enabled = true }) {
  useIOSSwipe({ axis: 'horizontal', enabled, onSwipe, onCancel });
  return null;
}
const gesture = (dx: number, touches = 0) => ({ dx, dy: 0, vx: 0, vy: 0, x0: 5, numberActiveTouches: touches });
beforeEach(() => { vi.clearAllMocks(); renderToStaticMarkup(createElement(Harness)); });

test('late native termination cannot restore a page after a completed back swipe', () => {
  native.handlers.onPanResponderGrant();
  native.handlers.onPanResponderRelease({}, gesture(100));
  native.handlers.onPanResponderTerminate();
  expect(onSwipe).toHaveBeenCalledExactlyOnceWith(1);
  expect(onCancel).not.toHaveBeenCalled();
});
test('cancelled short swipe restores its position only once', () => {
  native.handlers.onPanResponderGrant();
  native.handlers.onPanResponderRelease({}, gesture(20));
  native.handlers.onPanResponderTerminate();
  expect(onSwipe).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
test('interrupted swipe restores position without navigation', () => {
  native.handlers.onPanResponderGrant();
  native.handlers.onPanResponderTerminate();
  expect(onSwipe).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
test('second finger cancels navigation even when released before the first', () => {
  native.handlers.onPanResponderGrant();
  native.handlers.onPanResponderStart({}, gesture(30, 2));
  native.handlers.onPanResponderRelease({}, gesture(100));
  expect(onSwipe).not.toHaveBeenCalled();
  expect(onCancel).toHaveBeenCalledTimes(1);
});
test('busy controls never capture a gesture', () => {
  renderToStaticMarkup(createElement(Harness, { enabled: false }));
  expect(native.handlers.onMoveShouldSetPanResponderCapture({}, gesture(100, 1))).toBe(false);
});
