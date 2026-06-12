import { useEffect, useState, type ReactNode } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import styles from './DotReveal.module.css';

interface DotRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const REVEAL_THRESHOLD = 0.18;
const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';

export function DotReveal({ children, className = '', delay = 0 }: DotRevealProps) {
  const [reduceMotion, setReduceMotion] = useState(false);
  const { ref, visible } = useScrollReveal<HTMLDivElement>(REVEAL_THRESHOLD, REVEAL_ROOT_MARGIN);
  const show = visible || reduceMotion;

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setReduceMotion(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <div ref={ref} className={`${styles.root} ${className}`.trim()}>
      <div
        className={`${styles.content} ${show ? styles.visible : ''} ${reduceMotion ? styles.instant : ''}`}
        style={reduceMotion ? undefined : { transitionDelay: `${delay}s` }}
      >
        {children}
      </div>
    </div>
  );
}
