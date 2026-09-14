import { useIsFocused } from '@react-navigation/native';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type PropsWithChildren,
} from 'react';
import {
  AppState,
  Platform,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, {
  IOSReferenceFrame,
  SensorType,
  useAnimatedSensor,
  useAnimatedStyle,
  useFrameCallback,
  useSharedValue,
  type SharedValue,
} from 'react-native-reanimated';
import {
  advanceTiltLayers,
  createTiltLayerState,
  SPHERE_TILT_LAYERS,
  sphereTiltTarget,
  type SphereTiltLayer,
  type TiltLayerState,
} from '../lib/sphere-tilt';
import { useProfileReducedMotion } from './ProfileMotion';

const TiltContext = createContext<SharedValue<TiltLayerState> | null>(null);

function ActiveTiltSensor({ motion }: { motion: SharedValue<TiltLayerState> }) {
  // Fused accelerometer gravity has the same units/signs on iOS and Android;
  // Reanimated 4's raw ACCELEROMETER includes gravity on iOS but not Android.
  const gravity = useAnimatedSensor(SensorType.GRAVITY, {
    interval: 32,
    adjustToInterfaceOrientation: true,
    iosReferenceFrame: IOSReferenceFrame.XArbitraryZVertical,
  }).sensor;
  const origin = useSharedValue({ x: 0, y: 0, orientation: -1 });

  useFrameCallback((frame) => {
    const sample = gravity.value;
    const magnitude = Math.hypot(sample.x, sample.y, sample.z);
    // The sensor begins at zero and can be unavailable on simulators/devices.
    if (!Number.isFinite(magnitude) || magnitude < 1) return;
    if (origin.value.orientation !== sample.interfaceOrientation) {
      origin.value = {
        x: sample.x,
        y: sample.y,
        orientation: sample.interfaceOrientation,
      };
      motion.value = createTiltLayerState();
      return;
    }
    motion.value = advanceTiltLayers(
      motion.value,
      sphereTiltTarget(sample, origin.value),
      (frame.timeSincePreviousFrame ?? 16) / 1000,
    );
  });
  return null;
}

/** One local sensor subscription for Today; unmounted when it is not visible. */
export function SphereTiltProvider({
  children,
  enabled = true,
}: PropsWithChildren<{ enabled?: boolean }>) {
  const motion = useSharedValue<TiltLayerState>(createTiltLayerState());
  const focused = useIsFocused();
  const reducedMotion = useProfileReducedMotion();
  const [foreground, setForeground] = useState(
    AppState.currentState === 'active',
  );
  const active =
    enabled && focused && foreground && !reducedMotion && Platform.OS !== 'web';
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) =>
      setForeground(state === 'active'),
    );
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (!active) motion.value = createTiltLayerState();
  }, [active, motion]);
  return (
    <TiltContext.Provider value={motion}>
      {active && <ActiveTiltSensor motion={motion} />}
      {children}
    </TiltContext.Provider>
  );
}

/** A separate transform keeps existing idle, rotation and scroll motion intact. */
export function SphereTilt({
  children,
  layer,
  style,
}: PropsWithChildren<{
  layer: SphereTiltLayer;
  style?: StyleProp<ViewStyle>;
}>) {
  const motion = useContext(TiltContext);
  const { maxX, maxY } = SPHERE_TILT_LAYERS[layer];
  const tiltStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          Math.max(-1, Math.min(1, motion?.value[layer].x ?? 0)) * maxX,
      },
      {
        translateY:
          Math.max(-1, Math.min(1, motion?.value[layer].y ?? 0)) * maxY,
      },
    ],
  }));
  return (
    <Reanimated.View pointerEvents="none" style={[style, tiltStyle]}>
      {children}
    </Reanimated.View>
  );
}
