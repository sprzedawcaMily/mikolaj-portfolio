import { GitHubIcon } from '@/components/emds';
import { profile } from '@/data/profile';
import { useLocale } from '@/context/LocaleProvider';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  const year = new Date().getFullYear();
  const { t } = useLocale();

  return (
    <footer className={styles.footer}>
      <p className={styles.meta}>
        © {year} {profile.name}
      </p>
      <nav className={styles.links} aria-label={t.footer.contactLinks}>
        <a href={`mailto:${profile.email}`} className={styles.link}>
          {t.contact.email}
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
      </nav>
    </footer>
  );
}
