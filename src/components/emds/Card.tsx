import type { CSSProperties, ReactNode } from 'react';
import styles from './Card.module.css';

interface CardProps {
  children: ReactNode;
  className?: string;
  inset?: boolean;
  style?: CSSProperties;
  as?: 'div' | 'article' | 'section';
  id?: string;
}

export function Card({
  children,
  className = '',
  inset = false,
  style,
  as: Tag = 'div',
  id,
}: CardProps) {
  return (
    <Tag
      id={id}
      className={`${styles.card} ${inset ? styles.inset : ''} ${className}`.trim()}
      style={style}
    >
      {children}
    </Tag>
  );
}
