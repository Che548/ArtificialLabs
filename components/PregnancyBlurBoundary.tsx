import type { PropsWithChildren } from 'react';
import { Animated, StyleSheet } from 'react-native';

/** A native clipping window that can never extend into the week/content block. */
export function PregnancyBlurBoundary({
  children, scrollY, contentStart, height,
}: PropsWithChildren<{ scrollY: Animated.Value; contentStart: number; height: number }>) {
  const bottom = Math.max(0, Math.min(height, contentStart - 8));
  const inputRange = [0, Math.max(1, bottom)];
  // Translate a fixed-height clip instead of animating height, so it remains
  // synchronized with the native-driven scroll even when the JS thread is busy.
  const clipY = scrollY.interpolate({ inputRange, outputRange: [bottom - height, -height], extrapolate: 'clamp' });
  const contentY = Animated.multiply(clipY, -1);
  return (
    <Animated.View
      testID="pregnancy-blur-boundary"
      collapsable={false}
      pointerEvents="none"
      style={[styles.clip, { height, transform: [{ translateY: clipY }] }]}
    >
      <Animated.View collapsable={false} style={[styles.content, { height, transform: [{ translateY: contentY }] }]}>
        {children}
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  clip: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden', zIndex: 2 },
  content: { position: 'absolute', left: 0, right: 0, top: 0 },
});
