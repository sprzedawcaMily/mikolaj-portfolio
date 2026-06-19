import styles from './LanguageSwitcher.module.css';

interface LanguageSwitcherProps {
  locale: 'pl' | 'en';
  onChange: (locale: 'pl' | 'en') => void;
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  locale,
  onChange,
  compact = false,
  className = '',
}: LanguageSwitcherProps) {
  return (
    <div
      className={`${styles.switcher} ${compact ? styles.compact : ''} ${className}`.trim()}
      role="group"
      aria-label="Language"
    >
      <button
        type="button"
        className={`${styles.btn} ${locale === 'pl' ? styles.active : ''}`}
        onClick={() => onChange('pl')}
        aria-pressed={locale === 'pl'}
      >
        PL
      </button>
      <button
        type="button"
        className={`${styles.btn} ${locale === 'en' ? styles.active : ''}`}
        onClick={() => onChange('en')}
        aria-pressed={locale === 'en'}
      >
        EN
      </button>
    </div>
  );
}
