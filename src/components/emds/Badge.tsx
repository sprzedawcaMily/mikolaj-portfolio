import type { ReactNode } from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning';
}

export function Badge({ children, tone = 'default' }: BadgeProps) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
