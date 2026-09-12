import { BlurView } from 'expo-blur';
import type { BlurTint } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

import { useAppTheme } from '../lib/theme';

export type FallbackGlassTone = 'light' | 'dark';

type FallbackGlassBackdropProps = {
  decoration?: boolean;
  intensity?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
  tint?: BlurTint;
  tone?: FallbackGlassTone;
  washColor?: string;
  washOpacity?: number;
};

/**
 * A visual-only approximation of the iOS 26 glass material for older iOS
 * versions. It deliberately contains no content or interaction so native
 * GlassView branches can stay untouched and callers retain their hit targets.
 */
export function FallbackGlassBackdrop({
  decoration = true,
  intensity = 64,
  radius = 999,
  style,
  tint,
  tone = 'light',
  washColor = 'transparent',
  washOpacity,
}: FallbackGlassBackdropProps) {
  const { mode } = useAppTheme();
  const dark = mode === 'dark' || tone === 'dark';

  return (
    <View
      pointerEvents="none"
      style={[styles.root, { borderRadius: radius }, style]}
    >
      <BlurView
        tint={dark ? 'systemThinMaterialDark' : (tint ?? 'systemUltraThinMaterialLight')}
        intensity={intensity}
        experimentalBlurMethod="dimezisBlurView"
        style={[StyleSheet.absoluteFillObject, styles.blurLayer]}
      />

      <View
        style={[
          StyleSheet.absoluteFillObject,
          styles.washLayer,
          {
            backgroundColor: dark
              ? 'rgba(18,16,20,0.48)'
              : 'rgba(255,255,255,0.14)',
          },
        ]}
      />

      {washColor !== 'transparent' ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            styles.washLayer,
            { backgroundColor: washColor, opacity: washOpacity ?? (dark ? 0.28 : 0.46) },
          ]}
        />
      ) : null}

      {decoration ? (
        <>
          <LinearGradient
            colors={
              dark
                ? [
                    'rgba(255,255,255,0.10)',
                    'rgba(255,255,255,0.015)',
                    'rgba(255,255,255,0.035)',
                  ]
                : [
                    'rgba(255,255,255,0.66)',
                    'rgba(255,255,255,0.12)',
                    'rgba(255,255,255,0.20)',
                  ]
            }
            locations={[0, 0.46, 1]}
            start={{ x: 0.04, y: 0 }}
            end={{ x: 0.96, y: 1 }}
            style={[StyleSheet.absoluteFillObject, styles.highlightLayer]}
          />
          <LinearGradient
            colors={
              dark
                ? ['rgba(255,255,255,0)', 'rgba(255,255,255,0.025)']
                : ['rgba(255,255,255,0)', 'rgba(234,64,135,0.045)']
            }
            locations={[0.58, 1]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={[StyleSheet.absoluteFillObject, styles.highlightLayer]}
          />
          <View
            style={[
              styles.stroke,
              {
                borderColor: dark
                  ? 'rgba(255,255,255,0.14)'
                  : 'rgba(255,255,255,0.62)',
                borderRadius: radius,
              },
            ]}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  blurLayer: {
    zIndex: 0,
  },
  washLayer: {
    zIndex: 1,
  },
  highlightLayer: {
    zIndex: 2,
  },
  stroke: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 3,
    borderWidth: 0.8,
  },
});
