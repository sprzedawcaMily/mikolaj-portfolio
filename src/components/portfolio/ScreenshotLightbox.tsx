import { useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ProjectScreenshot } from '@/data/projects';
import styles from './ScreenshotLightbox.module.css';

interface ScreenshotLightboxProps {
  shots: ProjectScreenshot[];
  index: number;
  onClose: () => void;
  onIndexChange: (index: number) => void;
}

export function ScreenshotLightbox({
  shots,
  index,
  onClose,
  onIndexChange,
}: ScreenshotLightboxProps) {
  const shot = shots[index];
  const hasPrev = index > 0;
  const hasNext = index < shots.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) onIndexChange(index - 1);
  }, [hasPrev, index, onIndexChange]);

  const goNext = useCallback(() => {
    if (hasNext) onIndexChange(index + 1);
  }, [hasNext, index, onIndexChange]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === 'ArrowRight') goNext();
    };
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose, goPrev, goNext]);

  if (!shot) return null;

  return createPortal(
    <div
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-label={shot.alt}
      onClick={onClose}
    >
      <button
        type="button"
        className={styles.close}
        onClick={onClose}
        aria-label="Zamknij podgląd"
      >
        ×
      </button>

      {shots.length > 1 && (
        <>
          <button
            type="button"
            className={`${styles.nav} ${styles.navPrev}`}
            onClick={(e) => {
              e.stopPropagation();
              goPrev();
            }}
            disabled={!hasPrev}
            aria-label="Poprzedni zrzut"
          >
            ‹
          </button>
          <button
            type="button"
            className={`${styles.nav} ${styles.navNext}`}
            onClick={(e) => {
              e.stopPropagation();
              goNext();
            }}
            disabled={!hasNext}
            aria-label="Następny zrzut"
          >
            ›
          </button>
        </>
      )}

      <figure className={styles.figure} onClick={(e) => e.stopPropagation()}>
        <img src={shot.src} alt={shot.alt} className={styles.image} />
        {shot.caption && <figcaption className={styles.caption}>{shot.caption}</figcaption>}
        {shots.length > 1 && (
          <p className={styles.counter}>
            {index + 1} / {shots.length}
          </p>
        )}
      </figure>
    </div>,
    document.body,
  );
}
