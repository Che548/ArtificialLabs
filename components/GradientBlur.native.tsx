import MaskedView from '@react-native-masked-view/masked-view';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { Platform, StyleSheet, UIManager } from 'react-native';

export function GradientBlur({
  locations,
}: {
  locations: [number, number, number, number];
}) {
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
            'rgba(0,0,0,0.8)',
            'rgba(0,0,0,0.8)',
            'rgba(0,0,0,0.304)',
            'rgba(0,0,0,0)',
          ]}
          locations={locations}
          style={StyleSheet.absoluteFill}
        />
      }
    >
      <BlurView tint="light" intensity={30} style={StyleSheet.absoluteFill} />
    </MaskedView>
  );
}
