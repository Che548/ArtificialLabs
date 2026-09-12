import { useAppTheme } from '../lib/theme';
import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, UIManager } from 'react-native';

export function GradientBlur({
  locations,
  intensity = 30,
  strength = 0.8,
}: {
  locations: [number, number, number, number];
  intensity?: number;
  strength?: number;
}) {
  const { mode } = useAppTheme();
  // Binaries without the native mask leave the background unobscured.
  if (Platform.OS !== 'ios' || !UIManager.getViewManagerConfig('RNCMaskedView'))
    return null;
  return (
    <MaskedView
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      maskElement={
        <LinearGradient
          colors={[
            `rgba(0,0,0,${strength})`,
            `rgba(0,0,0,${strength})`,
            `rgba(0,0,0,${strength * 0.38})`,
            'rgba(0,0,0,0)',
          ]}
          locations={locations}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <BlurView tint={mode} intensity={intensity} style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}
