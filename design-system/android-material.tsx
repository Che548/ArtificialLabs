import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { useAppTheme } from '../lib/theme';
import { androidMaterials } from './tokens';

/** Static fallback with the same tint compositing as the iPhone fallback. */
export function AndroidMaterialBackdrop({
  radius = 999,
  tone = 'light',
  washColor = 'transparent',
}: {
  radius?: number;
  tone?: 'light' | 'strong' | 'dark';
  washColor?: string;
}) {
  const { mode } = useAppTheme();
  const resolvedTone = mode === 'dark' ? 'dark' : tone;
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFillObject,
        androidMaterials[resolvedTone],
        { borderRadius: radius, overflow: 'hidden' },
      ]}
    >
      {washColor !== 'transparent' ? (
        <View
          style={[
            StyleSheet.absoluteFillObject,
            {
              backgroundColor: washColor,
              opacity: resolvedTone === 'dark' ? 0.28 : 0.46,
            },
          ]}
        />
      ) : null}
      {resolvedTone === 'dark' ? (
        <LinearGradient
          pointerEvents="none"
          colors={['rgba(255,255,255,0.10)', 'rgba(255,255,255,0.015)', 'rgba(255,255,255,0.035)']}
          locations={[0, 0.46, 1]}
          start={{ x: 0.04, y: 0 }}
          end={{ x: 0.96, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />
      ) : null}
    </View>
  );
}
