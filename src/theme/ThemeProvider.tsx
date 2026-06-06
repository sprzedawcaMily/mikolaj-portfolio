import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_ACCENT, normalizeHex } from './paletteEngine';
import { getTheme, type ThemeTokens } from './tokens';

interface ThemeContextValue {
  accent: string;
  tokens: ThemeTokens;
  setAccent: (accent: string) => void;
  resetAccent: () => void;
}

const ACCENT_STORAGE_KEY = 'portfolio-accent';

const ThemeContext = createContext<ThemeContextValue | null>(null);

function readStoredAccent(): string {
  if (typeof window === 'undefined') return DEFAULT_ACCENT;
  const stored = localStorage.getItem(ACCENT_STORAGE_KEY);
  return stored ? normalizeHex(stored) : DEFAULT_ACCENT;
}

function applyCssVariables(tokens: ThemeTokens) {
  const root = document.documentElement;
  root.dataset.theme = 'dark';
  root.style.setProperty('--bg', tokens.background);
  root.style.setProperty('--bg-deep', tokens.backgroundDeep);
  root.style.setProperty('--surface', tokens.surface);
  root.style.setProperty('--surface-inset', tokens.surfaceInset);
  root.style.setProperty('--primary', tokens.primary);
  root.style.setProperty('--primary-fg', tokens.primaryForeground);
  root.style.setProperty('--text', tokens.textMain);
  root.style.setProperty('--text-muted', tokens.textMuted);
  root.style.setProperty('--accent', tokens.accent);
  root.style.setProperty('--accent-strong', tokens.accentStrong);
  root.style.setProperty('--accent-muted', tokens.accentMuted);
  root.style.setProperty('--success', tokens.success);
  root.style.setProperty('--error', tokens.error);
  root.style.setProperty('--warning', tokens.warning);
  root.style.setProperty('--dot', tokens.dot);
  root.style.setProperty('--dot-line', tokens.dotLine);
  root.style.setProperty('--dot-glow', tokens.dotGlow);
  root.style.setProperty('--border-subtle', tokens.borderSubtle);
  root.style.setProperty('--radius-lg', tokens.radiusLg);
  root.style.setProperty('--radius-md', tokens.radiusMd);
  root.style.setProperty('--radius-pill', tokens.radiusPill);
  root.style.setProperty('--shadow-floating', tokens.shadowFloating);
  root.style.colorScheme = 'dark';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [accent, setAccentState] = useState<string>(readStoredAccent);
  const tokens = useMemo(() => getTheme(accent), [accent]);

  useEffect(() => {
    applyCssVariables(tokens);
    localStorage.setItem(ACCENT_STORAGE_KEY, accent);
    localStorage.removeItem('portfolio-theme');
  }, [tokens, accent]);

  const setAccent = useCallback((next: string) => {
    setAccentState(normalizeHex(next));
  }, []);

  const resetAccent = useCallback(() => {
    setAccentState(DEFAULT_ACCENT);
  }, []);

  const value = useMemo(
    () => ({ accent, tokens, setAccent, resetAccent }),
    [accent, tokens, setAccent, resetAccent],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}