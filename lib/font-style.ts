import { Platform } from 'react-native';
import type { TextStyle } from 'react-native';

const weights = {
  'SFProDisplay-Regular': '400',
  'SFProDisplay-Medium': '500',
  'SFProDisplay-Semibold': '600',
  'SFProDisplay-Bold': '700',
} as const;

export function fontStyle(
  fontFamily: string | undefined,
): Pick<TextStyle, 'fontFamily' | 'fontWeight'> {
  const weight = weights[fontFamily as keyof typeof weights];
  return Platform.OS === 'ios' && weight
    ? { fontFamily: 'System', fontWeight: weight }
    : { fontFamily };
}
