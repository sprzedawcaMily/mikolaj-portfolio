import type { PaletteTone } from '@/components/animation/mesh/parsePaletteMesh';
import type { ThemeTokens } from './types';

export const DEFAULT_ACCENT = '#7C3AED';

export const PALETTE_PRESETS = [
  { id: 'violet', hex: '#7C3AED', label: 'Fiolet' },
  { id: 'cyan', hex: '#06B6D4', label: 'Cyjan' },
  { id: 'rose', hex: '#F43F5E', label: 'Róż' },
  { id: 'emerald', hex: '#10B981', label: 'Szmaragd' },
  { id: 'amber', hex: '#F59E0B', label: 'Bursztyn' },
  { id: 'indigo', hex: '#6366F1', label: 'Indigo' },
  { id: 'sky', hex: '#0EA5E9', label: 'Błękit' },
] as const;

interface Rgb {
  r: number;
  g: number;
  b: number;
}

interface Hsl {
  h: number;
  s: number;
  l: number;
}

export function normalizeHex(hex: string): string {
  const raw = hex.trim().replace(/^#/, '');
  if (!/^[0-9a-f]{3}$/i.test(raw) && !/^[0-9a-f]{6}$/i.test(raw)) {
    return DEFAULT_ACCENT;
  }

  if (raw.length === 3) {
    const [r, g, b] = raw.split('');
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }

  return `#${raw.toUpperCase()}`;
}

function hexToRgb(hex: string): Rgb {
  const value = normalizeHex(hex).slice(1);
  return {
    r: Number.parseInt(value.slice(0, 2), 16),
    g: Number.parseInt(value.slice(2, 4), 16),
    b: Number.parseInt(value.slice(4, 6), 16),
  };
}

function rgbToHex({ r, g, b }: Rgb): string {
  const to = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`.toUpperCase();
}

export function hexToHsl(hex: string): Hsl {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  const l = (max + min) / 2;

  if (delta === 0) {
    return { h: 0, s: 0, l: l * 100 };
  }

  const s = delta / (1 - Math.abs(2 * l - 1));
  let h = 0;

  if (max === rn) h = ((gn - bn) / delta) % 6;
  else if (max === gn) h = (bn - rn) / delta + 2;
  else h = (rn - gn) / delta + 4;

  h *= 60;
  if (h < 0) h += 360;

  return { h, s: s * 100, l: l * 100 };
}

export function hslToHex(h: number, s: number, l: number): string {
  const hn = ((h % 360) + 360) % 360;
  const sn = Math.max(0, Math.min(100, s)) / 100;
  const ln = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1));
  const m = ln - c / 2;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (hn < 60) [rp, gp, bp] = [c, x, 0];
  else if (hn < 120) [rp, gp, bp] = [x, c, 0];
  else if (hn < 180) [rp, gp, bp] = [0, c, x];
  else if (hn < 240) [rp, gp, bp] = [0, x, c];
  else if (hn < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return rgbToHex({
    r: (rp + m) * 255,
    g: (gp + m) * 255,
    b: (bp + m) * 255,
  });
}

function withAlpha(hex: string, alpha: number): string {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function accentHue(hex: string): number {
  const { h } = hexToHsl(normalizeHex(hex));
  return Number.isFinite(h) ? h : 271;
}

export function accentFromHue(hue: number): string {
  return hslToHex(hue, 88, 56);
}

export type PaletteToneColors = Record<PaletteTone, string>;

let paletteColorsCacheKey = '';
let paletteColorsCache: PaletteToneColors | null = null;

/** Wszystkie tony palety naraz — jedno przejście, cache per accent (suwak). */
export function getPaletteToneColors(accentHex: string): PaletteToneColors {
  const key = normalizeHex(accentHex);
  if (paletteColorsCache && paletteColorsCacheKey === key) {
    return paletteColorsCache;
  }

  const theme = buildThemeFromAccent(key);
  const { h, s } = hexToHsl(theme.accent);
  const sat = clamp(s, 38, 92);
  const base = Number.isFinite(h) ? h : 271;

  paletteColorsCache = {
    wire: theme.textMuted,
    shadow: hslToHex(base, clamp(sat * 0.42, 20, 52), 30),
    pink: hslToHex((base - 14 + 360) % 360, clamp(sat * 0.86, 68, 96), 60),
    yellow: hslToHex((base + 46) % 360, clamp(sat * 0.26 + 80, 82, 96), 58),
    green: hslToHex((base + 108) % 360, clamp(sat * 0.72, 48, 82), 58),
    blue: hslToHex((base + 198) % 360, clamp(sat * 0.48 + 48, 70, 94), 56),
    accent: theme.accentStrong,
  };
  paletteColorsCacheKey = key;
  return paletteColorsCache;
}

/** Kolory kropek palety — odcienie z aktualnego motywu (suwak hue). */
export function paletteToneColor(tone: PaletteTone, accentHex: string): string {
  return getPaletteToneColors(accentHex)[tone];
}

export function buildThemeFromAccent(accentHex: string): ThemeTokens {
  const accent = normalizeHex(accentHex);
  const { h, s } = hexToHsl(accent);
  const hue = Number.isFinite(h) ? h : 271;
  const sat = clamp(s, 38, 92);

  const background = hslToHex(hue, clamp(sat * 0.34, 18, 34), 5);
  const backgroundDeep = hslToHex(hue, clamp(sat * 0.28, 14, 28), 2.4);
  const surface = hslToHex(hue, clamp(sat * 0.28, 16, 30), 9);
  const surfaceInset = hslToHex(hue, clamp(sat * 0.3, 18, 32), 6);
  const dot = hslToHex(hue, clamp(sat + 6, 58, 90), 68);
  const accentColor = hslToHex(hue, clamp(sat, 52, 86), 72);
  const accentStrong = hslToHex(hue, clamp(sat + 4, 60, 92), 58);
  const primary = hslToHex(hue, clamp(sat * 0.82, 48, 78), 82);
  const textMain = hslToHex(hue, clamp(sat * 0.22, 10, 24), 97);
  const textMuted = hslToHex(hue, clamp(sat * 0.28, 16, 32), 68);

  return {
    background,
    backgroundDeep,
    surface,
    surfaceInset,
    primary,
    primaryForeground: background,
    textMain,
    textMuted,
    accent: accentColor,
    accentStrong,
    accentMuted: withAlpha(accentColor, 0.18),
    success: '#6A8C71',
    error: '#E07A6E',
    warning: '#D4A35C',
    dot,
    dotLine: withAlpha(dot, 0.45),
    dotGlow: withAlpha(hslToHex(hue, clamp(sat * 0.75, 42, 72), 84), 0.85),
    borderSubtle: withAlpha(textMain, 0.08),
    radiusLg: '24px',
    radiusMd: '14px',
    radiusPill: '9999px',
    fontFamily: '"Outfit", sans-serif',
    shadowFloating: '0 12px 32px -8px rgba(0, 0, 0, 0.55)',
  };
}
