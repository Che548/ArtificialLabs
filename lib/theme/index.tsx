import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Alert, Appearance, Platform } from 'react-native';
import { StatusBar, type StatusBarProps } from 'expo-status-bar';
import Storage from 'expo-sqlite/kv-store';
import { colors as lightColors } from '../../design-system/tokens';

export type ThemeMode = 'light' | 'dark';
export type ThemeColors = { [K in keyof typeof lightColors]: { [P in keyof typeof lightColors[K]]: string } };
export const darkColors: ThemeColors = {
  brand: { ...lightColors.brand, burgundy: '#EBA6AE' },
  text: { primary: '#F4F0F2', secondary: '#B4ADB2', inverse: '#FFFFFF' },
  surface: {
    canvas: '#161417', raised: '#252226', warm: '#302329', rose: '#382530',
    glassWash: 'rgba(37,34,38,0.35)', headerGlassWash: 'rgba(22,20,23,0.70)', divider: '#3B363C',
  },
  state: { disabled: '#716A72', error: '#FF737D' },
};
const key = 'sfera.interface.theme';
const ThemeContext = createContext({ mode: 'light' as ThemeMode, colors: lightColors as ThemeColors, setMode: (_mode: ThemeMode) => {} });

function readMode(): ThemeMode {
  try {
    const saved = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) : Storage.getItemSync(key);
    return saved === 'dark' ? 'dark' : 'light';
  } catch { return 'light'; }
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [mode, updateMode] = useState<ThemeMode>(readMode);
  useEffect(() => {
    if (Platform.OS !== 'web') Appearance.setColorScheme(mode);
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const value = useMemo(() => ({
    mode, colors: mode === 'dark' ? darkColors : lightColors,
    setMode(next: ThemeMode) {
      try {
        if (Platform.OS === 'web') globalThis.localStorage.setItem(key, next);
        else Storage.setItemSync(key, next);
        updateMode(next);
      } catch { Alert.alert('Не удалось сохранить тему', 'Попробуйте ещё раз.'); }
    },
  }), [mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Local rendering palette; never changes the saved preference or system appearance. */
export function AppThemeScope({ mode, children }: PropsWithChildren<{ mode: ThemeMode }>) {
  const parent = useContext(ThemeContext);
  const value = useMemo(() => ({
    ...parent,
    mode,
    colors: mode === 'dark' ? darkColors : lightColors,
  }), [parent, mode]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useAppTheme = () => useContext(ThemeContext);
const styleCache = new WeakMap<Function, WeakMap<ThemeColors, unknown>>();
export function useThemeStyles<T>(factory: (colors: ThemeColors) => T): T {
  const { colors } = useAppTheme();
  let variants = styleCache.get(factory);
  if (!variants) { variants = new WeakMap(); styleCache.set(factory, variants); }
  if (!variants.has(colors)) variants.set(colors, factory(colors));
  return variants.get(colors) as T;
}

export function ThemeStatusBar(props: StatusBarProps) {
 const { mode } = useAppTheme();
 return <StatusBar {...props} style={mode === "dark" ? "light" : "dark"} />;
}
