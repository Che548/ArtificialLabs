import { useEffect, useRef } from 'react';
import { PanResponder, Platform } from 'react-native';
import { canCaptureSwipe, committedSwipe, type SwipeOptions } from './swipe-gesture';

type Options = SwipeOptions & {
  enabled?: boolean;
  onSwipe: (direction: -1 | 1) => void;
  onStart?: () => void;
  onDrag?: (distance: number) => void;
  onCancel?: () => void;
};

/** Only captures deliberate one-finger iOS swipes; taps and vertical lists keep their responders. */
export function useIOSSwipe(options: Options) {
  const latest = useRef(options);
  latest.current = options;
  const invalid = useRef(false);
  const active = useRef(false);
  const responder = useRef<ReturnType<typeof PanResponder.create> | null>(null);
  if (!responder.current) {
    const cancel = () => {
      if (!active.current) return;
      active.current = false;
      latest.current.onCancel?.();
    };
    responder.current = PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponderCapture: (_, gesture) =>
        Platform.OS === 'ios' && latest.current.enabled !== false
        && canCaptureSwipe(gesture, latest.current),
      onPanResponderGrant: () => {
        invalid.current = false;
        active.current = true;
        latest.current.onStart?.();
      },
      onPanResponderStart: (_, gesture) => {
        if (gesture.numberActiveTouches > 1) invalid.current = true;
      },
      onPanResponderMove: (_, gesture) => {
        if (gesture.numberActiveTouches !== 1 || latest.current.enabled === false) {
          invalid.current = true;
        }
        if (!invalid.current) {
          const distance = latest.current.axis === 'horizontal' ? gesture.dx : gesture.dy;
          latest.current.onDrag?.(latest.current.positiveOnly ? Math.max(0, distance) : distance);
        }
      },
      onPanResponderRelease: (_, gesture) => {
        const direction = invalid.current || latest.current.enabled === false
          ? 0 : committedSwipe(gesture, latest.current);
        if (direction) {
          active.current = false;
          latest.current.onSwipe(direction);
        } else cancel();
      },
      onPanResponderTerminationRequest: () => true,
      onPanResponderTerminate: cancel,
    });
  }
  useEffect(() => {
    if (options.enabled === false && active.current) {
      active.current = false;
      invalid.current = true;
      latest.current.onCancel?.();
    }
  }, [options.enabled]);
  return Platform.OS === 'ios' ? responder.current.panHandlers : {};
}
