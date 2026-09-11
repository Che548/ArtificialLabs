import { useEffect, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Easing,
  StyleSheet,
  View,
} from 'react-native';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;

export function CycleAnimatedBackground() {
  const [motionEnabled, setMotionEnabled] = useState(true);
  const leftMotion = useRef(new Animated.Value(0)).current;
  const topRightMotion = useRef(new Animated.Value(0)).current;
  const bottomRightMotion = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let mounted = true;

    void AccessibilityInfo.isReduceMotionEnabled()
      .then((reduceMotion) => {
        if (mounted) setMotionEnabled(!reduceMotion);
      })
      .catch(() => undefined);

    const subscription = AccessibilityInfo.addEventListener(
      'reduceMotionChanged',
      (reduceMotion) => setMotionEnabled(!reduceMotion),
    );

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    const values = [leftMotion, topRightMotion, bottomRightMotion];

    if (!motionEnabled) {
      values.forEach((value) => {
        value.stopAnimation();
        value.setValue(0);
      });
      return undefined;
    }

    const easing = Easing.bezier(0.45, 0, 0.55, 1);
    const createLoop = (value: Animated.Value, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, {
            toValue: 1,
            duration,
            easing,
            useNativeDriver: true,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing,
            useNativeDriver: true,
          }),
        ]),
        { resetBeforeIteration: false },
      );

    const animations = [
      createLoop(leftMotion, 9000),
      createLoop(topRightMotion, 11000),
      createLoop(bottomRightMotion, 10000),
    ];

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
      values.forEach((value) => value.stopAnimation());
    };
  }, [bottomRightMotion, leftMotion, motionEnabled, topRightMotion]);

  return (
    <View pointerEvents="none" style={styles.planningBackground}>
      <Animated.Image
        source={require('../assets/today/cycle-sphere-left.png')}
        resizeMode="stretch"
        style={[
          styles.planningSphereLeft,
          {
            transform: [
              {
                translateX: leftMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 6],
                }),
              },
              {
                translateY: leftMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -5],
                }),
              },
              {
                rotate: leftMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '-0.6deg'],
                }),
              },
              {
                scale: leftMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1.02],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.Image
        source={require('../assets/today/cycle-sphere-top-right.png')}
        resizeMode="stretch"
        style={[
          styles.planningSphereTopRight,
          {
            transform: [
              {
                translateX: topRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
              {
                translateY: topRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 5],
                }),
              },
              {
                rotate: topRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '0.7deg'],
                }),
              },
              {
                scale: topRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1.018],
                }),
              },
            ],
          },
        ]}
      />
      <Animated.Image
        source={require('../assets/today/cycle-sphere-bottom-right.png')}
        resizeMode="stretch"
        style={[
          styles.planningSphereBottomRight,
          {
            transform: [
              {
                translateX: bottomRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 7],
                }),
              },
              {
                translateY: bottomRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, -6],
                }),
              },
              {
                rotate: bottomRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '-0.6deg'],
                }),
              },
              {
                scale: bottomRightMotion.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.985, 1.022],
                }),
              },
            ],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  planningBackground: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
    backgroundColor: '#FDECE5',
  },
  planningSphereLeft: {
    position: 'absolute',
    left: -180,
    top: 299,
    width: 361.9,
    height: 348.31,
  },
  planningSphereTopRight: {
    position: 'absolute',
    left: 57,
    top: -290,
    width: 585,
    height: 600,
  },
  planningSphereBottomRight: {
    position: 'absolute',
    left: 241,
    top: 313,
    width: 325,
    height: 317,
  },
});
