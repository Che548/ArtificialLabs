import { useIsFocused } from '@react-navigation/native';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, View } from 'react-native';
import Svg, { Image as SvgImage } from 'react-native-svg';
import {
  pregnancySphereSize,
  PREGNANCY_SPHERE_MOTION_PADDING,
} from '../lib/pregnancy-sphere';
import { useProfileReducedMotion } from './ProfileMotion';
import { SphereTilt } from './SphereTilt';

// Bounds of pixels with alpha >= 4/255 (left, top, right, bottom). Ignore
// near-invisible export speckles when measuring the spheres. Normalize the
// longest visible edge without stretching the artwork or changing the PNGs.
const artwork = [
  {
    week: 1,
    source: require('../transparent-enlarged-4x/1.png'),
    canvas: [3764, 6688],
    bounds: [254, 641, 3571, 4057],
  },
  {
    week: 2,
    source: require('../transparent-enlarged-4x/2.png'),
    canvas: [3764, 6688],
    bounds: [258, 641, 3570, 4056],
  },
  {
    week: 3,
    source: require('../transparent-enlarged-4x/3.png'),
    canvas: [3764, 6688],
    bounds: [255, 635, 3570, 4056],
  },
  {
    week: 4,
    source: require('../transparent-enlarged-4x/4.png'),
    canvas: [3764, 6684],
    bounds: [257, 638, 3571, 4050],
  },
  {
    week: 5,
    source: require('../transparent-enlarged-4x/5.png'),
    canvas: [3764, 6684],
    bounds: [258, 638, 3575, 4054],
  },
  {
    week: 6,
    source: require('../transparent-enlarged-4x/6.png'),
    canvas: [3764, 6688],
    bounds: [254, 630, 3574, 4057],
  },
  {
    week: 7,
    source: require('../transparent-enlarged-4x/7.png'),
    canvas: [3764, 6688],
    bounds: [244, 624, 3581, 4057],
  },
  {
    week: 8,
    source: require('../transparent-enlarged-4x/8.png'),
    canvas: [3764, 6680],
    bounds: [257, 628, 3579, 4056],
  },
  {
    week: 9,
    source: require('../transparent-enlarged-4x/9.png'),
    canvas: [3768, 6676],
    bounds: [257, 632, 3578, 4039],
  },
  {
    week: 10,
    source: require('../transparent-enlarged-4x/10.png'),
    canvas: [3764, 6684],
    bounds: [258, 629, 3584, 4047],
  },
  {
    week: 11,
    source: require('../transparent-enlarged-4x/11.png'),
    canvas: [3764, 6688],
    bounds: [240, 540, 3609, 4081],
  },
  {
    week: 12,
    source: require('../transparent-enlarged-4x/12.png'),
    canvas: [3764, 6688],
    bounds: [249, 582, 3594, 4146],
  },
  {
    week: 13,
    source: require('../transparent-enlarged-4x/13.png'),
    canvas: [3764, 6684],
    bounds: [197, 877, 3608, 4505],
  },
  {
    week: 14,
    source: require('../transparent-enlarged-4x/14.png'),
    canvas: [3764, 6688],
    bounds: [262, 1397, 3502, 4784],
  },
  {
    week: 15,
    source: require('../transparent-enlarged-4x/15.png'),
    canvas: [3764, 6688],
    bounds: [245, 640, 3593, 4088],
  },
  {
    week: 16,
    source: require('../transparent-enlarged-4x/16.png'),
    canvas: [3764, 6688],
    bounds: [241, 629, 3592, 4076],
  },
  {
    week: 17,
    source: require('../transparent-enlarged-4x/17.png'),
    canvas: [3764, 6688],
    bounds: [151, 927, 3594, 4824],
  },
  {
    week: 18,
    source: require('../transparent-enlarged-4x/18.png'),
    canvas: [3764, 6684],
    bounds: [132, 1040, 3701, 5072],
  },
  {
    week: 19,
    source: require('../transparent-enlarged-4x/19.png'),
    canvas: [3764, 6688],
    bounds: [296, 727, 3579, 4572],
  },
  {
    week: 20,
    source: require('../transparent-enlarged-4x/20.png'),
    canvas: [3764, 6688],
    bounds: [239, 631, 3585, 4061],
  },
  {
    week: 21,
    source: require('../transparent-enlarged-4x/21.png'),
    canvas: [4096, 6144],
    bounds: [235, 689, 3945, 4706],
  },
  {
    week: 22,
    source: require('../transparent-enlarged-4x/22.png'),
    canvas: [3764, 6688],
    bounds: [248, 654, 3564, 4357],
  },
  {
    week: 23,
    source: require('../transparent-enlarged-4x/23.png'),
    canvas: [3764, 6688],
    bounds: [266, 803, 3605, 4500],
  },
  {
    week: 24,
    source: require('../transparent-enlarged-4x/24.png'),
    canvas: [3764, 6688],
    bounds: [131, 1040, 3660, 5324],
  },
  {
    week: 25,
    source: require('../transparent-enlarged-4x/25.png'),
    canvas: [3764, 6688],
    bounds: [258, 1224, 3498, 4575],
  },
  {
    week: 27,
    source: require('../transparent-enlarged-4x/27.png'),
    canvas: [3764, 6688],
    bounds: [240, 813, 3621, 4644],
  },
  {
    week: 28,
    source: require('../transparent-enlarged-4x/28.png'),
    canvas: [3764, 6688],
    bounds: [258, 817, 3589, 4717],
  },
  {
    week: 29,
    source: require('../transparent-enlarged-4x/29.png'),
    canvas: [3764, 6688],
    bounds: [187, 901, 3632, 4781],
  },
  {
    week: 30,
    source: require('../transparent-enlarged-4x/30.png'),
    canvas: [3764, 6688],
    bounds: [257, 669, 3560, 4431],
  },
  {
    week: 40,
    source: require('../transparent-enlarged-4x/40.png'),
    canvas: [3764, 6688],
    bounds: [175, 589, 3623, 4537],
  },
] as const;

type Artwork = (typeof artwork)[number];
const BASE_SIZE = 328;

function SphereImage({ item, onLoad }: { item: Artwork; onLoad?: () => void }) {
  const [left, top, right, bottom] = item.bounds;
  const width = right - left;
  const height = bottom - top;
  const edge = Math.max(width, height);
  // Draw the original pixels straight into the visible square at display
  // density. This bypasses RN Image's trilinear texture filtering and avoids
  // carrying the tall transparent canvas through the animated image layer.
  return (
    <Svg
      width={BASE_SIZE}
      height={BASE_SIZE}
      viewBox={`${left - (edge - width) / 2} ${top - (edge - height) / 2} ${edge} ${edge}`}
      accessible={false}
    >
      <SvgImage
        href={item.source}
        width={item.canvas[0]}
        height={item.canvas[1]}
        onLoad={onLoad}
      />
    </Svg>
  );
}

export function PregnancySphere({
  week,
  headerTop,
  stageHeight,
}: {
  week: number;
  headerTop: number;
  stageHeight: number;
}) {
  // Missing illustrations retain the closest preceding artwork (26 → 25,
  // 31–39 → 30, 41–42 → 40); scale always follows the selected week.
  const selected = artwork.reduce<Artwork>(
    (previous, item) => (item.week <= week ? item : previous),
    artwork[0],
  );
  const [layers, setLayers] = useState<{
    current: Artwork;
    previous?: Artwork;
  }>({ current: selected });
  const currentRef = useRef(selected);
  const fadeAnimation = useRef<Animated.CompositeAnimation | null>(null);
  const opacity = useRef(new Animated.Value(1)).current;
  const phase = useRef(new Animated.Value(0.5)).current;
  const size = useRef(
    new Animated.Value(pregnancySphereSize(week) / BASE_SIZE),
  ).current;
  const reducedMotion = useProfileReducedMotion();
  const focused = useIsFocused();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (currentRef.current.week === selected.week) return;
    fadeAnimation.current?.stop();
    const previous = currentRef.current;
    currentRef.current = selected;
    opacity.setValue(0);
    setLayers({ current: selected, previous });
  }, [selected, opacity]);

  useEffect(() => () => fadeAnimation.current?.stop(), []);

  useEffect(() => {
    const animation = Animated.timing(size, {
      toValue: pregnancySphereSize(week) / BASE_SIZE,
      duration: reducedMotion ? 0 : 600,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    animation.start();
    return () => animation.stop();
  }, [week, size, reducedMotion]);

  useEffect(() => {
    phase.setValue(0.5);
    if (reducedMotion || !focused || !foreground) return;
    const timing = (toValue: number, duration: number) =>
      Animated.timing(phase, {
        toValue,
        duration,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
        isInteraction: false,
      });
    const animation = Animated.sequence([
      timing(1, 1800),
      Animated.loop(Animated.sequence([timing(0, 3600), timing(1, 3600)]), {
        resetBeforeIteration: false,
      }),
    ]);
    animation.start();
    return () => animation.stop();
  }, [focused, foreground, phase, reducedMotion]);

  const reveal = () => {
    const loadedWeek = layers.current.week;
    if (currentRef.current.week !== loadedWeek) return;
    fadeAnimation.current?.stop();
    fadeAnimation.current = Animated.timing(opacity, {
      toValue: 1,
      duration: reducedMotion ? 0 : 420,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
      isInteraction: false,
    });
    fadeAnimation.current.start(({ finished }) => {
      if (finished && currentRef.current.week === loadedWeek) {
        setLayers((value) => ({ current: value.current }));
      }
    });
  };

  const top = headerTop + 48 + 16;
  return (
    <View
      testID="pregnancy-sphere-stage"
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={{
        height: stageHeight,
        paddingTop: top,
        paddingBottom: 12,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <SphereTilt
        layer="embryo"
        style={{
          width: BASE_SIZE,
          height: BASE_SIZE,
          marginVertical: PREGNANCY_SPHERE_MOTION_PADDING,
        }}
      >
        <Animated.View
          testID={`pregnancy-sphere-week-${week}`}
          style={{
            width: BASE_SIZE,
            height: BASE_SIZE,
            transform: [
              {
                translateY: phase.interpolate({
                  inputRange: [0, 1],
                  outputRange: [7, -7],
                }),
              },
              {
                translateX: phase.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-3, 3],
                }),
              },
              {
                rotate: phase.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['-1.2deg', '1.2deg'],
                }),
              },
              { scale: size },
            ],
          }}
        >
          {layers.previous && (
            <Animated.View
              style={[
                StyleSheet.absoluteFillObject,
                { opacity: Animated.subtract(1, opacity) },
              ]}
            >
              <SphereImage item={layers.previous} />
            </Animated.View>
          )}
          <Animated.View style={[StyleSheet.absoluteFillObject, { opacity }]}>
            <SphereImage
              key={layers.current.week}
              item={layers.current}
              onLoad={reveal}
            />
          </Animated.View>
        </Animated.View>
      </SphereTilt>
    </View>
  );
}
