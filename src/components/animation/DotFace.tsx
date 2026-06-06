import { motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { FACE_CONNECTIONS, FACE_LANDMARKS } from '@/animation/faceLandmarks';
import styles from './DotFace.module.css';

const SIZE = 320;

function scatterOffset(id: number) {
  const angle = (id * 137.5 * Math.PI) / 180;
  const dist = 80 + (id % 7) * 18;
  return { x: Math.cos(angle) * dist, y: Math.sin(angle) * dist };
}

export function DotFace() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const t = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const points = useMemo(
    () =>
      FACE_LANDMARKS.map((p) => ({
        ...p,
        px: p.x * SIZE,
        py: p.y * SIZE,
        scatter: scatterOffset(p.id),
      })),
    [],
  );

  return (
    <div className={styles.wrap} aria-hidden>
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className={styles.svg}
        role="img"
        aria-label="Sylwetka twarzy z fioletowych kropek"
      >
        {FACE_CONNECTIONS.map(([a, b], i) => {
          const p1 = points.find((p) => p.id === a);
          const p2 = points.find((p) => p.id === b);
          if (!p1 || !p2) return null;
          return (
            <motion.line
              key={`line-${a}-${b}`}
              x1={p1.px}
              y1={p1.py}
              x2={p2.px}
              y2={p2.py}
              stroke="var(--dot-line)"
              strokeWidth={1}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={
                ready
                  ? { pathLength: 1, opacity: 1 }
                  : { pathLength: 0, opacity: 0 }
              }
              transition={{ duration: 1.2, delay: 0.4 + i * 0.008, ease: 'easeOut' }}
            />
          );
        })}
        {points.map((p) => (
          <motion.circle
            key={p.id}
            cx={p.px}
            cy={p.py}
            r={p.group === 'contour' ? 3.2 : 2.4}
            fill="var(--dot)"
            initial={{
              cx: p.px + p.scatter.x,
              cy: p.py + p.scatter.y,
              opacity: 0,
              scale: 0,
            }}
            animate={
              ready
                ? {
                    cx: p.px,
                    cy: p.py,
                    opacity: 1,
                    scale: 1,
                  }
                : {}
            }
            transition={{
              type: 'spring',
              stiffness: 120,
              damping: 18,
              delay: 0.05 + p.id * 0.012,
            }}
            style={{ filter: 'drop-shadow(0 0 6px var(--dot-glow))' }}
          />
        ))}
      </svg>
      <div className={styles.glow} />
    </div>
  );
}
