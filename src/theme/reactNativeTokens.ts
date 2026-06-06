/**
 * Eksport tokenów EMDS pod React Native (StyleSheet / tamagui / nativewind).
 * Użyj: import { emdsTheme } from '@/theme/reactNativeTokens';
 */
import { getTheme, type ThemeTokens } from './tokens';

export const emdsTheme = getTheme();

export function toReactNativeStyle(tokens: ThemeTokens) {
  return {
    colors: {
      background: tokens.background,
      surface: tokens.surface,
      surfaceInset: tokens.surfaceInset,
      primary: tokens.primary,
      primaryForeground: tokens.primaryForeground,
      text: tokens.textMain,
      textMuted: tokens.textMuted,
      accent: tokens.accent,
      accentStrong: tokens.accentStrong,
      success: tokens.success,
      error: tokens.error,
      warning: tokens.warning,
      dot: tokens.dot,
    },
    borderRadius: {
      lg: 24,
      md: 14,
      pill: 9999,
    },
    fontFamily: tokens.fontFamily,
  };
}
