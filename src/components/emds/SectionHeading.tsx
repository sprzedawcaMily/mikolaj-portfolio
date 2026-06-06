import type { ReactNode } from 'react';
import { MetaLabel } from './MetaLabel';
import styles from './SectionHeading.module.css';

interface SectionHeadingProps {
  label: string;
  title: string;
  subtitle?: ReactNode;
}

export function SectionHeading({ label, title, subtitle }: SectionHeadingProps) {
  return (
    <header className={styles.header}>
      <MetaLabel>{label}</MetaLabel>
      <h2 className={styles.title}>{title}</h2>
      {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
    </header>
  );
}
