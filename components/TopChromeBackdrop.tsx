import { memo } from 'react';
import { GradientBlur } from './GradientBlur';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** Native blur behind header controls, without a white overlay. */
export const TopChromeBackdrop = memo(function TopChromeBackdrop({
  headerTop,
  style,
}: {
  headerTop?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const insets = useSafeAreaInsets();
  const controlsTop = headerTop ?? Math.max(16, insets.top + 8);
  const solidHeight = Math.max(0, controlsTop - 32);
  const height = controlsTop + 280;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.root, { height }, style]}
    >
      <GradientBlur
        locations={[0, solidHeight / height, controlsTop / height, 1]}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 8 },
});
