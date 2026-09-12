import { Image, View, type StyleProp, type ViewStyle } from 'react-native';

export type BrandName = 'sfera' | 'sferka';
export const brandImages = {
  sfera: require('../assets/brand/sfera.png'),
  sferka: require('../assets/brand/sferka-v2.png'),
};
const bounds = {
  sfera: { width: 5817, height: 1325, x: 10, y: 10, inkWidth: 5797, inkHeight: 1305 },
  sferka: { width: 5757, height: 1429, x: 8, y: 146, inkWidth: 5741, inkHeight: 1251 },
};

/** Display original artwork with its transparent outer padding excluded from layout. */
export function BrandLogo({ name = 'sfera', width = 160, style }: {
  name?: BrandName;
  width?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const box = bounds[name];
  const scale = width / box.inkWidth;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={name === 'sfera' ? 'Сфера' : 'Сферка'}
      style={[{ width, height: box.inkHeight * scale, overflow: 'hidden' }, style]}>
      <Image source={brandImages[name]} accessible={false} accessibilityIgnoresInvertColors
        resizeMode="contain" style={{ position: 'absolute', left: -box.x * scale,
          top: -box.y * scale, width: box.width * scale, height: box.height * scale }} />
    </View>
  );
}
