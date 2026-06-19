import { useCallback, useEffect, useState } from 'react';
import { useLocale } from '@/context/LocaleProvider';
import { LanguageSwitcher } from './LanguageSwitcher';
import styles from './SiteHeader.module.css';

const linkHrefs = [
  { href: '#o-mnie', key: 'about' as const },
  { href: '#projekty', key: 'projects' as const },
  { href: '#doswiadczenie', key: 'career' as const },
  { href: '#umiejetnosci', key: 'skills' as const },
  { href: '#kontakt', key: 'contact' as const },
];

export function SiteHeader() {
  const { locale, setLocale, t } = useLocale();
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMenu();
    };
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  return (
    <>
      <header className={styles.header}>
        <a href="#" className={styles.logo} onClick={closeMenu}>
          MM
        </a>

        <nav className={styles.nav} aria-label={t.nav.aria}>
          {linkHrefs.map((l) => (
            <a key={l.href} href={l.href} className={styles.link}>
              {t.nav[l.key]}
            </a>
          ))}
        </nav>

        <div className={styles.actions}>
          <LanguageSwitcher locale={locale} onChange={setLocale} compact />
          <button
            type="button"
            className={`${styles.menuBtn} ${menuOpen ? styles.menuBtnOpen : ''}`}
            aria-expanded={menuOpen}
            aria-controls="mobile-nav"
            aria-label={menuOpen ? t.nav.closeMenu : t.nav.openMenu}
            onClick={() => setMenuOpen((v) => !v)}
          >
            <span className={styles.menuIcon} aria-hidden />
          </button>
        </div>
      </header>

      <div
        className={`${styles.drawerBackdrop} ${menuOpen ? styles.drawerBackdropOpen : ''}`}
        aria-hidden={!menuOpen}
        onClick={closeMenu}
      />

      <nav
        id="mobile-nav"
        className={`${styles.drawer} ${menuOpen ? styles.drawerOpen : ''}`}
        aria-label={t.nav.aria}
        aria-hidden={!menuOpen}
      >
        <div className={styles.drawerInner}>
          {linkHrefs.map((l, i) => (
            <a
              key={l.href}
              href={l.href}
              className={styles.drawerLink}
              style={{ animationDelay: `${i * 0.04}s` }}
              onClick={closeMenu}
            >
              {t.nav[l.key]}
            </a>
          ))}
          <div className={styles.drawerLocale}>
            <LanguageSwitcher locale={locale} onChange={setLocale} />
          </div>
        </div>
      </nav>
    </>
  );
}
