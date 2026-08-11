import type { LiquidGlassPetalViewProps } from './LiquidGlassPetalView';
import { View } from 'react-native';

export default function LiquidGlassPetalView(props: LiquidGlassPetalViewProps) {
  const { activeIndex: _, onPetalPress: __, ...viewProps } = props;
  return <View {...viewProps} />;
}
