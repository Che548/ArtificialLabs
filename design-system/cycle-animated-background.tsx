import { useAppTheme } from '../lib/theme';
import { SphereTilt } from '../components/SphereTilt';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useIsFocused } from '@react-navigation/native';
import {
  AccessibilityInfo,
  Animated,
  AppState,
  Easing,
  Image,
  type ImageSourcePropType,
  StyleSheet,
  View,
} from 'react-native';

const DESIGN_WIDTH = 402;
const DESIGN_HEIGHT = 874;
const pathSamples = Array.from({ length: 33 }, (_, index) => index / 32);
const easedPathSamples = pathSamples.map((t) => t * t * (3 - 2 * t));
const sphereTrajectories = [
  { distance: 420, sway: 44, lift: 12 },
  { distance: 465, sway: -38, lift: 22 },
  { distance: 510, sway: -62, lift: 32 },
];

// Slow, independent breathing paths for top-right, left and bottom-right spheres.
// Zero remains the supplied composition; scrolling gradually takes over the motion.
const sphereIdleMotion = [
  { x: -16, y: 21, scale: 0.032 },
  { x: 18, y: -16, scale: 0.035 },
  { x: -14, y: -22, scale: 0.028 },
];
const sphereTiltLayers = ['back', 'middle', 'front'] as const;

export type CycleBackgroundState = 'neutral' | 'menstruation' | 'ovulation';
type SphereAsset = {
  source: ImageSourcePropType;
  width: number;
  height: number;
  bounds: readonly [number, number, number, number];
};
type SpherePlacement = {
  asset: SphereAsset;
  x: number;
  y: number;
  width: number;
};
// Coordinates measured in the supplied 497 × 1080 reference panels.
// Source bounds exclude transparent export padding; originals remain unchanged.
const REFERENCE_SCALE = DESIGN_WIDTH / 497;
const assets = {
  m1: {
    source: require('../assets/today/cycle-states/m1.png'),
    width: 1438,
    height: 1438,
    bounds: [245, 243, 948, 942],
  },
  m2: {
    source: require('../assets/today/cycle-states/m2.png'),
    width: 2073,
    height: 2073,
    bounds: [494, 513, 1069, 1068],
  },
  m3: {
    source: require('../assets/today/cycle-states/m3.png'),
    width: 1762,
    height: 1762,
    bounds: [313, 321, 1118, 1118],
  },
  n1: {
    source: require('../assets/today/cycle-states/n1.png'),
    width: 1597,
    height: 1626,
    bounds: [288, 315, 989, 1008],
  },
  n2: {
    source: require('../assets/today/cycle-states/n2.png'),
    width: 1913,
    height: 1903,
    bounds: [476, 458, 989, 993],
  },
  n3: {
    source: require('../assets/today/cycle-states/n3.png'),
    width: 1356,
    height: 1392,
    bounds: [198, 185, 989, 1005],
  },
  o1: {
    source: require('../assets/today/cycle-states/o1.png'),
    width: 1768,
    height: 1768,
    bounds: [363, 353, 1053, 1060],
  },
  o2: {
    source: require('../assets/today/cycle-states/02.png'),
    width: 1824,
    height: 1824,
    bounds: [440, 435, 947, 944],
  },
  o3: {
    source: require('../assets/today/cycle-states/03.png'),
    width: 1865,
    height: 1865,
    bounds: [403, 400, 1057, 1056],
  },
} satisfies Record<string, SphereAsset>;
// Dedicated dark artwork; numbered to match the existing menstrual placements.
const darkMenstruationAssets: SphereAsset[] = [
  { source: require('../assets/today/cycle-states/menstruation-dark-1.png'), width: 1254, height: 1254, bounds: [114, 114, 1026, 1015] },
  { source: require('../assets/today/cycle-states/menstruation-dark-2.png'), width: 1254, height: 1254, bounds: [111, 118, 1032, 1011] },
  { source: require('../assets/today/cycle-states/menstruation-dark-3.png'), width: 1254, height: 1254, bounds: [112, 115, 1029, 1014] },
];

const darkNeutralAssets: SphereAsset[] = [
  { source: require('../assets/today/cycle-states/neutral-dark-1.png'), width: 1254, height: 1254, bounds: [151, 152, 952, 952] },
  { source: require('../assets/today/cycle-states/neutral-dark-2.png'), width: 1254, height: 1254, bounds: [132, 133, 989, 982] },
  { source: require('../assets/today/cycle-states/neutral-dark-3.png'), width: 1254, height: 1254, bounds: [165, 163, 924, 915] },
];
const darkOvulationAssets: SphereAsset[] = [
  { source: require('../assets/today/cycle-states/ovulation-dark-1.png'), width: 1254, height: 1254, bounds: [104, 121, 1046, 1030] },
  { source: require('../assets/today/cycle-states/ovulation-dark-2.png'), width: 1254, height: 1254, bounds: [120, 127, 1012, 1002] },
  { source: require('../assets/today/cycle-states/ovulation-dark-3.png'), width: 1254, height: 1254, bounds: [167, 160, 911, 908] },
];
const darkStateAssets: Partial<Record<CycleBackgroundState, SphereAsset[]>> = {
  menstruation: darkMenstruationAssets,
  neutral: darkNeutralAssets,
  ovulation: darkOvulationAssets,
};

export const cycleBackgroundThemes: Record<
  CycleBackgroundState,
  { color: string; spheres: SpherePlacement[] }
> = {
  menstruation: {
    color: '#F8E4EB',
    spheres: [
      { asset: assets.m1, x: 291, y: -141, width: 396 },
      { asset: assets.m2, x: -375, y: 111, width: 440 },
      { asset: assets.m3, x: 203, y: 485, width: 460 },
    ],
  },
  neutral: {
    color: '#F5F0EB',
    spheres: [
      { asset: assets.n1, x: 290, y: -125, width: 400 },
      { asset: assets.n2, x: -324, y: 89, width: 416 },
      { asset: assets.n3, x: 176, y: 500, width: 408 },
    ],
  },
  ovulation: {
    color: '#E8F1E3',
    spheres: [
      { asset: assets.o1, x: 272, y: -139, width: 404 },
      { asset: assets.o2, x: -286, y: 105, width: 394 },
      { asset: assets.o3, x: 210, y: 461, width: 434 },
    ],
  },
};

export function CycleAnimatedBackground({
  state = 'neutral',
  scrollY,
}: {
  state?: CycleBackgroundState;
  scrollY?: Animated.Value;
}) {
  const { mode } = useAppTheme();
  const [motionEnabled, setMotionEnabled] = useState(false);
  const isFocused = useIsFocused();
  const [appActive, setAppActive] = useState(
    AppState.currentState === 'active',
  );
  const transition = useRef(new Animated.Value(1)).current;
  const [scene, setScene] = useState({ from: state, to: state });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (next) =>
      setAppActive(next === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useLayoutEffect(() => {
    if (scene.to === state) return;
    transition.stopAnimation();
    transition.setValue(0);
    setScene({ from: scene.to, to: state });
  }, [state, scene.to, transition]);

  useEffect(() => {
    if (scene.from === scene.to) {
      transition.setValue(1);
      return;
    }
    const animation = Animated.timing(transition, {
      toValue: 1,
      duration: motionEnabled && isFocused && appActive ? 700 : 0,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start(({ finished }) => {
      if (finished)
        setScene((current) =>
          current.to === scene.to
            ? { from: current.to, to: current.to }
            : current,
        );
    });
    return () => animation.stop();
  }, [scene, transition, motionEnabled, isFocused, appActive]);
  const leftMotion = useRef(new Animated.Value(0)).current;
  const topRightMotion = useRef(new Animated.Value(0)).current;
  const bottomRightMotion = useRef(new Animated.Value(0)).current;
  const rotations = useRef([new Animated.Value(0), new Animated.Value(0), new Animated.Value(0)]).current;
  const stationaryScroll = useRef(new Animated.Value(0)).current;
  const activeScroll = motionEnabled && scrollY ? scrollY : stationaryScroll;

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

    if (!motionEnabled || !isFocused || !appActive) {
      values.forEach((value) => {
        value.stopAnimation();
        if (!motionEnabled) value.setValue(0);
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
            isInteraction: false,
          }),
          Animated.timing(value, {
            toValue: 0,
            duration,
            easing,
            useNativeDriver: true,
            isInteraction: false,
          }),
        ]),
        { resetBeforeIteration: false },
      );

    const animations = [
      createLoop(leftMotion, 8000),
      createLoop(topRightMotion, 10000),
      createLoop(bottomRightMotion, 9000),
    ];

    animations.forEach((animation) => animation.start());

    return () => {
      animations.forEach((animation) => animation.stop());
      values.forEach((value) => value.stopAnimation());
    };
  }, [
    bottomRightMotion,
    leftMotion,
    motionEnabled,
    topRightMotion,
    isFocused,
    appActive,
  ]);

  useEffect(() => {
    let active = true;
    if (!motionEnabled || !isFocused || !appActive) {
      rotations.forEach((value) => {
        value.stopAnimation();
        if (!motionEnabled) value.setValue(0);
      });
      return;
    }

    // Continue from the current angle after returning to the screen. Each turn
    // runs on the native driver, with no reset or pause at the 360-degree seam.
    rotations.forEach((value, index) => {
      const turn = () => value.stopAnimation((angle) => {
        if (!active) return;
        Animated.timing(value, {
          toValue: angle + 1,
          duration: [95000, 112000, 103000][index],
          easing: Easing.linear,
          useNativeDriver: true,
          isInteraction: false,
        }).start(({ finished }) => {
          if (finished && active) turn();
        });
      });
      turn();
    });

    return () => {
      active = false;
      rotations.forEach((value) => value.stopAnimation());
    };
  }, [rotations, motionEnabled, isFocused, appActive]);

  const visibleStates =
    scene.from === scene.to ? [scene.to] : [scene.from, scene.to];
  const motions = [topRightMotion, leftMotion, bottomRightMotion];
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.background}
    >
      {visibleStates.map((layerState) => (
        <Animated.View
          key={layerState}
          style={[
            StyleSheet.absoluteFill,
            {
              backgroundColor: mode === 'dark' ? ({ menstruation: '#30202B', neutral: '#242025', ovulation: '#202C25' })[layerState] : cycleBackgroundThemes[layerState].color,
              opacity: layerState === scene.to ? transition : 1,
            },
          ]}
        >
          {cycleBackgroundThemes[layerState].spheres.map((sphere, index) => {
            const { x, y, width } = sphere;
            const darkAsset = mode === 'dark' ? darkStateAssets[layerState]?.[index] : undefined;
            const usesDarkArtwork = darkAsset !== undefined;
            const asset = darkAsset ?? sphere.asset;
            const [cropX, cropY, cropWidth, cropHeight] = asset.bounds;
            const size = width * REFERENCE_SCALE;
            // Keep the original visible footprint and scroll path, regardless of export padding.
            const height = size * sphere.asset.bounds[3] / sphere.asset.bounds[2];
            const imageScale = size / cropWidth;
            const imageScaleY = height / cropHeight;
            const targetX = DESIGN_WIDTH / 2 - (x * REFERENCE_SCALE + size / 2);
            const targetY = -24 - (y * REFERENCE_SCALE + height / 2);
            const trajectory = sphereTrajectories[index];
            const progress = activeScroll.interpolate({
              inputRange: [0, trajectory.distance],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            });
            // Sample a smooth curved path once per render; scrolling stays on the native driver.
            // Different arcs and travel distances keep the spheres from moving as one rigid group.
            const convergence = progress.interpolate({
              inputRange: pathSamples,
              outputRange: easedPathSamples,
            });
            const pathX = progress.interpolate({
              inputRange: pathSamples,
              outputRange: easedPathSamples.map(
                (t) => targetX * t + trajectory.sway * Math.sin(Math.PI * t),
              ),
            });
            const pathY = progress.interpolate({
              inputRange: pathSamples,
              outputRange: easedPathSamples.map(
                (t) => targetY * t - trajectory.lift * Math.sin(Math.PI * t),
              ),
            });
            const idleMotion = sphereIdleMotion[index];
            const driftStrength = Animated.subtract(1, convergence);
            const drift = Animated.multiply(motions[index], driftStrength);
            return (
              <SphereTilt
                key={index}
                layer={sphereTiltLayers[index]}
                style={StyleSheet.absoluteFillObject}
              >
              <Animated.View
                style={{
                  position: 'absolute',
                  left: x * REFERENCE_SCALE,
                  top: y * REFERENCE_SCALE,
                  width: size,
                  height,
                  opacity: mode === 'dark' && !usesDarkArtwork ? 0.5 : 1,
                  borderRadius: size,
                  overflow: 'hidden',
                  transform: [
                    {
                      translateX: Animated.add(
                        pathX,
                        Animated.multiply(drift, idleMotion.x),
                      ),
                    },
                    {
                      translateY: Animated.add(
                        pathY,
                        Animated.multiply(drift, idleMotion.y),
                      ),
                    },
                    {
                      scale: Animated.add(1, Animated.multiply(drift, idleMotion.scale)),
                    },
                    {
                      rotate: rotations[index].interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0deg', index === 1 ? '360deg' : '-360deg'],
                      }),
                    },
                  ],
                }}
              >
                <Image
                  accessible={false}
                  source={asset.source}
                  resizeMode={usesDarkArtwork ? "stretch" : "contain"}
                  style={{
                    position: 'absolute',
                    left: -cropX * imageScale,
                    top: -cropY * imageScaleY,
                    width: asset.width * imageScale,
                    height: asset.height * imageScaleY,
                  }}
                />
              </Animated.View>
              </SphereTilt>
            );
          })}
        </Animated.View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: DESIGN_WIDTH,
    height: DESIGN_HEIGHT,
    overflow: 'hidden',
  },
});
