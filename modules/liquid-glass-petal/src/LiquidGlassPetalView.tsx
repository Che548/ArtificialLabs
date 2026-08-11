import { requireNativeViewManager } from 'expo-modules-core';
import type { NativeSyntheticEvent, ViewProps } from 'react-native';

type PetalPressEvent = {
  index: number;
};

export type LiquidGlassPetalViewProps = ViewProps & {
  activeIndex: number;
  onPetalPress?: (event: NativeSyntheticEvent<PetalPressEvent>) => void;
};

export default requireNativeViewManager<LiquidGlassPetalViewProps>(
  'LiquidGlassPetal',
  'LiquidGlassPetalWheelView',
);
