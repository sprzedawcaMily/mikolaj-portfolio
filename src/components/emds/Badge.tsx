import type { ReactNode } from 'react';
import styles from './Badge.module.css';

interface BadgeProps {
  children: ReactNode;
  tone?: 'default' | 'accent' | 'success' | 'warning';
  className?: string;
}

export function Badge({ children, tone = 'default', className }: BadgeProps) {
  return (
    <span className={`${styles.badge} ${styles[tone]}${className ? ` ${className}` : ''}`}>
      {children}
    </span>
  );
}
