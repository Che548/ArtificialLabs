export type ThemeMode = 'light' | 'dark';
export type ThemePreference = ThemeMode | 'system';

export function parseThemePreference(saved: string | null | undefined): ThemePreference {
  return saved === 'light' || saved === 'dark' ? saved : 'system';
}

export function resolveThemeMode(preference: ThemePreference, system: string | null | undefined): ThemeMode {
  return preference === 'system' ? (system === 'dark' ? 'dark' : 'light') : preference;
}

export function appearanceOverride(preference: ThemePreference): ThemeMode | null {
  return preference === 'system' ? null : preference;
}
