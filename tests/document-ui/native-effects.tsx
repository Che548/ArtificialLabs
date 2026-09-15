// Native effects are visual substitutes; profile layout and controls remain real.
import { View } from 'react-native';
export const SymbolView = ({ fallback }: any) => fallback ?? null;
export const BlurView = ({ children, style, pointerEvents }: any) => (
  <View style={style} pointerEvents={pointerEvents}>
    {children}
  </View>
);
export const LinearGradient = BlurView;
export const GlassView = BlurView;
export const isLiquidGlassAvailable = () => false;
export const DateTimePickerAndroid = { open() {} };
export default function DateTimePicker() {
  return null;
}
