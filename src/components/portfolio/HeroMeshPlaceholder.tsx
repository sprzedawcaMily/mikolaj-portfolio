import { useEffect, useState } from 'react';
import { useLocale } from '@/context/LocaleProvider';
import { isMeshReady, subscribeMeshReady } from '@/hooks/meshZoneStore';
import styles from './HeroMeshPlaceholder.module.css';

export function HeroMeshPlaceholder() {
  const { t } = useLocale();
  const [ready, setReady] = useState(isMeshReady);

  useEffect(() => subscribeMeshReady(() => setReady(isMeshReady())), []);

  if (ready) return null;

  return (
    <div className={styles.placeholder} aria-hidden="true">
      <div className={styles.glow} />
      <div className={styles.grid}>
        {Array.from({ length: 48 }, (_, i) => (
          <span key={i} className={styles.dot} style={{ animationDelay: `${(i % 8) * 0.08}s` }} />
        ))}
      </div>
      <p className={styles.label}>{t.hero.meshLoading}</p>
    </div>
  );
}
