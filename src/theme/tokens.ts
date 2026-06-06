import { buildThemeFromAccent, DEFAULT_ACCENT } from './paletteEngine';
import type { ThemeTokens } from './types';

export type { ThemeTokens } from './types';
export { DEFAULT_ACCENT, PALETTE_PRESETS } from './paletteEngine';

export function getTheme(accent = DEFAULT_ACCENT): ThemeTokens {
  return buildThemeFromAccent(accent);
}
