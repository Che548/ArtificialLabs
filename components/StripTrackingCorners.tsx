import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, StyleSheet, View } from 'react-native';
import type { TrackingRect } from '../services/scanning/strip-tracking';

const SIZE = 28;
const points = (r: TrackingRect) => [
  { x: r.x, y: r.y }, { x: r.x + r.width - SIZE, y: r.y },
  { x: r.x + r.width - SIZE, y: r.y + r.height - SIZE },
  { x: r.x, y: r.y + r.height - SIZE },
];

export function StripTrackingCorners({ rect }: { rect: TrackingRect }) {
  const positions = useRef(points(rect).map(p => new Animated.ValueXY(p))).current;
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value => { if (active) setReduceMotion(value); });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => { active = false; subscription.remove(); };
  }, []);
  useEffect(() => {
    const next = points(rect);
    const animation = Animated.parallel(positions.map((position, index) => Animated.timing(position, {
      toValue: next[index], duration: reduceMotion ? 0 : 180,
      easing: Easing.out(Easing.quad), useNativeDriver: true,
    })));
    animation.start();
    return () => animation.stop();
  }, [rect.x, rect.y, rect.width, rect.height, reduceMotion, positions]);
  return (
    <View pointerEvents="none" accessible={false} style={StyleSheet.absoluteFillObject}>
      {positions.map((position, index) => (
        <Animated.View key={index} style={[
          styles.corner, [styles.topLeft, styles.topRight, styles.bottomRight, styles.bottomLeft][index],
          { transform: position.getTranslateTransform() },
        ]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  corner: { position: 'absolute', left: 0, top: 0, width: SIZE, height: SIZE, borderColor: '#FFFFFF' },
  topLeft: { borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 9 },
  topRight: { borderTopWidth: 3, borderRightWidth: 3, borderTopRightRadius: 9 },
  bottomRight: { borderBottomWidth: 3, borderRightWidth: 3, borderBottomRightRadius: 9 },
  bottomLeft: { borderBottomWidth: 3, borderLeftWidth: 3, borderBottomLeftRadius: 9 },
});
