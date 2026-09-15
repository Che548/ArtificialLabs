import { colors } from '../../design-system/tokens';
import type { ThemeColors } from '../../lib/theme';

// This fixture exercises contact actions, not device preferences/SQLCipher.
export const useAppTheme = () => ({ colors, mode: 'light' as const });
export const useThemeStyles = <T>(factory: (value: ThemeColors) => T) => factory(colors);
