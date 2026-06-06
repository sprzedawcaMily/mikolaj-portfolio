import type { ReactNode } from 'react';
import styles from './MetaLabel.module.css';

export function MetaLabel({ children }: { children: ReactNode }) {
  return <span className={styles.meta}>{children}</span>;
}
