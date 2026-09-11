import { useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';

let cachedReducedMotion = true;

export function useProfileReducedMotion() {
  const [reduced, setReduced] = useState(cachedReducedMotion);
  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      cachedReducedMotion = value;
      if (mounted) setReduced(value);
    });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (value) => { cachedReducedMotion = value; setReduced(value); });
    return () => { mounted = false; subscription.remove(); };
  }, []);
  return reduced;
}

/** Retains the contents until closing finishes; measures changes such as OTP/errors. */
export function ProfileCollapse({ open, children }: { open: boolean; children: ReactNode }) {
  const reduced = useProfileReducedMotion();
  const [mounted, setMounted] = useState(open);
  const [contentHeight, setContentHeight] = useState(0);
  const height = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  useEffect(() => { if (open) setMounted(true); }, [open]);
  useEffect(() => {
    const animation = Animated.parallel([
      Animated.timing(height, {
        toValue: open ? contentHeight : 0,
        duration: reduced ? 0 : 240,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: false,
      }),
      Animated.timing(opacity, {
        toValue: open ? 1 : 0,
        duration: reduced ? 0 : open ? 180 : 120,
        useNativeDriver: false,
      }),
    ]);
    animation.start(({ finished }) => { if (finished && !open) setMounted(false); });
    return () => animation.stop();
  }, [open, contentHeight, reduced, height, opacity]);
  if (!mounted) return null;
  return (
    <Animated.View
      style={{ height, opacity, overflow: 'hidden' }}
      pointerEvents={open ? 'auto' : 'none'}
      accessibilityElementsHidden={!open}
      importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}
    >
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0 }} onLayout={(event) => setContentHeight(event.nativeEvent.layout.height)}>
        {children}
      </View>
    </Animated.View>
  );
}

export function ProfileDisclosureArrow({ expanded, children }: { expanded: boolean; children: ReactNode }) {
  const reduced = useProfileReducedMotion();
  const progress = useRef(new Animated.Value(expanded ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(progress, {
      toValue: expanded ? 1 : 0,
      duration: reduced ? 0 : 200,
      easing: Easing.bezier(0.22, 1, 0.36, 1),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [expanded, reduced, progress]);
  return <Animated.View style={{ transform: [{ rotate: progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) }] }}>{children}</Animated.View>;
}
