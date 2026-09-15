import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme } from '../lib/theme';
import { memo } from 'react';
import { GradientBlur } from './GradientBlur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Theme-colored fade and blur behind header controls. */
export const TopChromeBackdrop = memo(function TopChromeBackdrop({
  headerTop,
  style,
  strength,
}: {
  headerTop?: number;
  strength?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const { mode } = useAppTheme();
  const controlsTop = headerTop ?? Math.max(16, insets.top + 8);
  const solidHeight = Math.max(0, controlsTop - 32);
  const customHeight = StyleSheet.flatten(style)?.height;
  const height = typeof customHeight === 'number' ? customHeight : controlsTop + 280;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { height }, style]}
    >
      <GradientBlur
        strength={strength}
        locations={[0, solidHeight / height, controlsTop / height, 1]}
      />
      <LinearGradient
        colors={mode === 'dark' ? ['rgba(22,20,23,1)', 'rgba(22,20,23,0.82)', 'rgba(22,20,23,0)'] : ['rgba(255,255,255,1)', 'rgba(255,255,255,0.82)', 'rgba(255,255,255,0)']}
        locations={[0, 0.42, 1]}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: Math.min(height, controlsTop + 120) }}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8, overflow: 'hidden' },
});
