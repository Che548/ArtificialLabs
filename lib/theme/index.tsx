import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Appearance, Platform } from 'react-native';
import { StatusBar, type StatusBarProps } from 'expo-status-bar';
import Storage from 'expo-sqlite/kv-store';
import { colors as lightColors } from '../../design-system/tokens';

import { appearanceOverride, parseThemePreference, resolveThemeMode, type ThemeMode, type ThemePreference } from './preference';
export type { ThemeMode, ThemePreference } from './preference';
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
const ThemeContext = createContext({ mode: 'light' as ThemeMode, preference: 'system' as ThemePreference, saveError: undefined as string | undefined, colors: lightColors as ThemeColors, setMode: (_mode: ThemePreference) => {} });

function readPreference(): ThemePreference {
  try {
    const saved = Platform.OS === 'web' ? globalThis.localStorage?.getItem(key) : Storage.getItemSync(key);
    return parseThemePreference(saved);
  } catch { return 'system'; }
}

export function AppThemeProvider({ children }: PropsWithChildren) {
  const [preference, updatePreference] = useState<ThemePreference>(readPreference);
  const [systemMode, updateSystemMode] = useState(Appearance.getColorScheme);
  const [saveError, setSaveError] = useState<string>();
  const mode = resolveThemeMode(preference, systemMode);
  useEffect(() => {
    const subscription = Appearance.addChangeListener(({ colorScheme }) => updateSystemMode(colorScheme));
    // Reset the native override when returning from a manual theme to automatic.
    if (Platform.OS !== 'web') Appearance.setColorScheme(appearanceOverride(preference));
    updateSystemMode(Appearance.getColorScheme());
    return () => subscription.remove();
  }, [preference]);
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') document.documentElement.style.colorScheme = mode;
  }, [mode]);
  const value = useMemo(() => ({
    mode, preference, saveError, colors: mode === 'dark' ? darkColors : lightColors,
    setMode(next: ThemePreference) {
      updatePreference(next);
      setSaveError(undefined);
      try {
        if (Platform.OS === 'web') globalThis.localStorage.setItem(key, next);
        else Storage.setItemSync(key, next);
      } catch { setSaveError('Тема применена, но не сохранена. После перезапуска выбор может сброситься. Попробуйте выбрать её ещё раз.'); }
    },
  }), [mode, preference, saveError]);
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
