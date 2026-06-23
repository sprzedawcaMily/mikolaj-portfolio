import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from '@/i18n/en';
import { pl } from '@/i18n/pl';
import type { Locale, Translations } from '@/i18n/types';

const STORAGE_KEY = 'portfolio-locale';

const catalogs: Record<Locale, Translations> = { pl, en };

type LocaleContextValue = {
  locale: Locale;
  t: Translations;
  setLocale: (next: Locale) => void;
  toggleLocale: () => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === 'en' || stored === 'pl') return stored;
  return 'en';
}

function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.title = catalogs[locale].meta.title;
  const meta = document.querySelector('meta[name="description"]');
  if (meta) meta.setAttribute('content', catalogs[locale].meta.description);
}

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readStoredLocale);

  const setLocale = useCallback((next: Locale) => {
    setLocaleState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'pl' ? 'en' : 'pl');
  }, [locale, setLocale]);

  useEffect(() => {
    applyDocumentLocale(locale);
  }, [locale]);

  const value = useMemo(
    () => ({
      locale,
      t: catalogs[locale],
      setLocale,
      toggleLocale,
    }),
    [locale, setLocale, toggleLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale() {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error('useLocale must be used within LocaleProvider');
  return ctx;
}
