import { useCallback, useRef } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { accentFromHue, accentHue } from '@/theme/paletteEngine';
import styles from './HuePickerBar.module.css';

interface HuePickerBarProps {
  className?: string;
}

export function HuePickerBar({ className }: HuePickerBarProps) {
  const { accent, setAccent } = useTheme();
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const hue = accentHue(accent);
  const thumbLeft = `${(hue / 360) * 100}%`;

  const pickAt = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return;

    const rect = track.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    setAccent(accentFromHue(ratio * 360));
  }, [setAccent]);

  const onPointerDown = useCallback((event: { clientX: number; pointerId: number; currentTarget: HTMLDivElement }) => {
    draggingRef.current = true;
    event.currentTarget.style.touchAction = 'none';
    event.currentTarget.setPointerCapture(event.pointerId);
    pickAt(event.clientX);
  }, [pickAt]);

  const onPointerMove = useCallback((event: { clientX: number }) => {
    if (!draggingRef.current) return;
    pickAt(event.clientX);
  }, [pickAt]);

  const onPointerUp = useCallback((event: { pointerId: number; currentTarget: HTMLDivElement }) => {
    draggingRef.current = false;
    event.currentTarget.style.touchAction = '';
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <div className={`${styles.bar} ${className ?? ''}`} aria-label="Wybór koloru akcentu">
      <div
        ref={trackRef}
        id="palette-color-track"
        className={styles.track}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={360}
        aria-valuenow={Math.round(hue)}
        aria-valuetext={accent}
      >
        <span
          id="palette-color-thumb"
          className={styles.thumb}
          style={{ left: thumbLeft, backgroundColor: accent }}
          aria-hidden
        />
      </div>
    </div>
  );
}
