import type { TextStyle, ViewStyle } from 'react-native';

export const fonts = {
  sfRegular: 'SFProDisplay-Regular',
  sfMedium: 'SFProDisplay-Medium',
  sfSemibold: 'SFProDisplay-Semibold',
  sfBold: 'SFProDisplay-Bold',
  yaroRegular: 'YaroRg',
} as const;

export const colors = {
  brand: {
    primary: '#D31471',
    primarySoft: '#EA4087',
    burgundy: '#823537',
    success: '#1FBB74',
  },
  text: {
    primary: '#212123',
    secondary: '#736E6C',
    inverse: '#FFFFFF',
  },
  surface: {
    canvas: '#F5F3F3',
    raised: '#FFFFFF',
    warm: '#FDECE5',
    rose: '#FEE8E3',
    glassWash: 'rgba(255,255,255,0.20)',
    headerGlassWash: 'rgba(255,255,255,0.70)',
    divider: '#EDEDED',
  },
  state: {
    disabled: '#C8C3C1',
    error: '#D93838',
  },
} as const;

export const profileTones = {
  health: {
    tile: '#F4E7EB',
    glyph: '#9B3F64',
  },
  monitoring: {
    tile: '#E8F0EA',
    glyph: '#4E755E',
  },
  preferences: {
    tile: '#E9EDF2',
    glyph: '#526477',
  },
  account: {
    tile: '#ECEBED',
    glyph: '#5F5B63',
  },
  destructive: {
    tile: '#F7E8E8',
    glyph: '#BE4141',
  },
} as const;

export const chartColors = {
  primary: colors.brand.primary,
  primarySoft: '#F5A7C9',
  burgundy: colors.brand.burgundy,
  positive: colors.brand.success,
  warning: '#E49A3A',
  neutral: '#A7A1A0',
  grid: '#E8E3E4',
  range: '#F3DDE6',
  quiet: '#F7F4F5',
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  sm: 12,
  md: 20,
  lg: 30,
  xl: 40,
  pill: 999,
} as const;

export const sizes = {
  touch: 48,
  icon: 22,
  screenGutter: 16,
  contentWidth: 370,
} as const;

export const typeScale = {
  display: {
    fontSize: 36,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  title: {
    fontSize: 28,
    lineHeight: 31,
    letterSpacing: -0.56,
  },
  heading: {
    fontSize: 22,
    lineHeight: 25,
    letterSpacing: -0.44,
  },
  body: {
    fontSize: 17,
    lineHeight: 21,
    letterSpacing: -0.34,
  },
  label: {
    fontSize: 15,
    lineHeight: 18,
    letterSpacing: -0.3,
  },
  caption: {
    fontSize: 12,
    lineHeight: 15,
    letterSpacing: -0.12,
  },
} satisfies Record<string, TextStyle>;

export const shadows = {
  control: {
    boxShadow: '0 0 4px rgba(0, 0, 0, 0.18)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 2,
  },
  floating: {
    shadowColor: '#260208',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 8,
  },
  card: {
    shadowColor: '#3A171C',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
} satisfies Record<string, ViewStyle>;

export const motion = {
  pressedScale: 1.035,
  pressedOpacity: 0.72,
} as const;
