import { profile } from '@/data/profile';
import styles from './SiteFooter.module.css';

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className={styles.footer}>
      <p className={styles.meta}>
        © {year} {profile.name}
      </p>
    </footer>
  );
}
