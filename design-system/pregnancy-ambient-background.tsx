import { Image, StyleSheet, View } from 'react-native';

/** The supplied pregnancy background image, identical in both themes. */
export function PregnancyAmbientBackground() {
  return (
    <View
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.root}
    >
      <Image
        source={require('../assets/today/pregnancy-background.png')}
        resizeMode="cover"
        accessible={false}
        style={StyleSheet.absoluteFillObject}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    backgroundColor: '#FCE7DC',
  },
});
