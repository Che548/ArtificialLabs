import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

/** SF Symbols are iOS-only; keep Android controls visible with vector glyphs. */
export function OnboardingSymbol(props: ComponentProps<typeof SymbolView>) {
  if (Platform.OS === 'ios') return <SymbolView {...props} />;
  const { name, size = 24, tintColor = '#212123' } = props;
  const check = <Path d="m6 12 4 4 8-8" />;
  let glyph;
  switch (name) {
    case 'checkmark':
      glyph = check;
      break;
    case 'circle':
      glyph = <Circle cx="12" cy="12" r="9" />;
      break;
    case 'checkmark.circle.fill':
      glyph = (
        <>
          <Circle cx="12" cy="12" r="10" fill={tintColor} />
          <Path d="m6 12 4 4 8-8" stroke="#FFFFFF" />
        </>
      );
      break;
    case 'xmark':
      glyph = <Path d="m6 6 12 12M18 6 6 18" />;
      break;
    case 'calendar':
      glyph = (
        <>
          <Rect x="3" y="5" width="18" height="16" rx="3" />
          <Path d="M7 3v4m10-4v4M3 10h18M7 14h2m3 0h2m3 0h1M7 18h2m3 0h2" />
        </>
      );
      break;
    case 'heart.circle':
      glyph = (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 17s-6-3.6-6-7a3.2 3.2 0 0 1 6-1.4A3.2 3.2 0 0 1 18 10c0 3.4-6 7-6 7Z" />
        </>
      );
      break;
    case 'figure.and.child.holdinghands':
      glyph = (
        <>
          <Circle cx="7" cy="4" r="2" />
          <Circle cx="18" cy="8" r="1.5" />
          <Path d="M3 13 5 8h4l4 6 3-3h4l2 4M7 8v8m0 0-3 6m3-6 3 6m8-10v5m0 0-2 5m2-5 2 5" />
        </>
      );
      break;
    case 'questionmark.circle':
      glyph = (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Path d="M9 8a3 3 0 0 1 6 0c0 2-3 2-3 5M12 17h.01" />
        </>
      );
      break;
    case 'info.circle':
      glyph = (
        <>
          <Circle cx="12" cy="12" r="10" />
          <Path d="M12 11v6M12 7h.01" />
        </>
      );
      break;
    default:
      return <>{props.fallback}</>;
  }
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={tintColor}
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={false}
      style={props.style}
    >
      {glyph}
    </Svg>
  );
}
