import type { PropsWithChildren } from 'react';
import { useAppTheme, useThemeStyles } from './theme';

// Kept as compatibility aliases for profile components; every flow now follows the app theme.
export function ProfileAppearanceScope({ children }: PropsWithChildren) { return children; }
export const useProfileAppearance = useAppTheme;
export const useProfileStyles = useThemeStyles;
