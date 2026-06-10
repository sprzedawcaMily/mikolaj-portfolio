import { motion, useReducedMotion } from 'framer-motion';
import { type ReactNode } from 'react';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import styles from './DotReveal.module.css';

interface DotRevealProps {
  children: ReactNode;
  className?: string;
  delay?: number;
}

const REVEAL_THRESHOLD = 0.18;
const REVEAL_ROOT_MARGIN = '0px 0px -12% 0px';
const MD3_EMPHASIZED_DECELERATE = [0.05, 0.7, 0.1, 1] as const;
const ENTER_DURATION_S = 0.58;

const HIDDEN = {
  opacity: 0,
  y: 14,
  scale: 0.972,
  filter: 'blur(5px)',
};

const VISIBLE = {
  opacity: 1,
  y: 0,
  scale: 1,
  filter: 'blur(0px)',
};

export function DotReveal({ children, className = '', delay = 0 }: DotRevealProps) {
  const reduceMotion = useReducedMotion();
  const { ref, visible } = useScrollReveal<HTMLDivElement>(REVEAL_THRESHOLD, REVEAL_ROOT_MARGIN);
  const show = visible || reduceMotion;

  return (
    <div ref={ref} className={`${styles.root} ${className}`.trim()}>
      <motion.div
        className={styles.content}
        initial={reduceMotion ? false : HIDDEN}
        animate={show ? VISIBLE : HIDDEN}
        transition={{
          duration: reduceMotion ? 0.01 : ENTER_DURATION_S,
          delay: reduceMotion ? 0 : delay,
          ease: MD3_EMPHASIZED_DECELERATE,
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}
