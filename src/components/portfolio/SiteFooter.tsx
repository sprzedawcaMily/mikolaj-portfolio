import { GitHubIcon } from '@/components/emds';
import { profile } from '@/data/profile';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className={styles.footer}>
      <p className={styles.meta}>
        © {year} {profile.name}
      </p>
      <nav className={styles.links} aria-label="Linki kontaktowe">
        <a href={`mailto:${profile.email}`} className={styles.link}>
          Email
        </a>
        <a
          href={profile.github}
          className={styles.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          <GitHubIcon size={14} />
          GitHub
        </a>
        <a href="#kontakt" className={styles.link}>
          Kontakt
        </a>
      </nav>
    </footer>
  );
}
