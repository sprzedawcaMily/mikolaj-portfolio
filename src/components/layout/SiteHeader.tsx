import styles from './SiteHeader.module.css';

const links = [
  { href: '#o-mnie', label: 'O mnie' },
  { href: '#projekty', label: 'Projekty' },
  { href: '#doswiadczenie', label: 'Doświadczenie' },
  { href: '#kontakt', label: 'Kontakt' },
];

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <a href="#" className={styles.logo}>
        MM
      </a>
      <nav className={styles.nav} aria-label="Główna nawigacja">
        {links.map((l) => (
          <a key={l.href} href={l.href} className={styles.link}>
            {l.label}
          </a>
        ))}
      </nav>
    </header>
  );
}
