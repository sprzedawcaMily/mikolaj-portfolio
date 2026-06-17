import { useCallback, useState } from 'react';
import { DotReveal } from '@/components/animation/DotReveal';
import { Badge, Card, MetaLabel } from '@/components/emds';
import type { Project } from '@/data/projects';
import { useMobileLayout } from '@/hooks/mobileLayout';
import {
  TRANSITRANK_MESH_ANCHOR_ID,
  FORKFULL_MESH_ANCHOR_ID,
  KAMOCHI_MESH_ANCHOR_ID,
  LEGITCHECK_MESH_ANCHOR_ID,
  STYLERANK_MESH_ANCHOR_ID,
} from '@/hooks/meshScrollEngine';
import { ScreenshotLightbox } from './ScreenshotLightbox';
import styles from './ProjectCard.module.css';
interface ProjectCardProps {
  project: Project;
  index: number;
}

export function ProjectCard({ project, index }: ProjectCardProps) {
  const isMobile = useMobileLayout();
  const [shotIndex, setShotIndex] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const shot = project.screenshots[shotIndex];
  const isLandscape = project.screenshotOrientation === 'landscape';
  const hasShots = project.screenshots.length > 0;

  const onShotChange = useCallback((i: number) => {
    setShotIndex(i);
    setImgOk(true);
  }, []);

  const shotArea = hasShots ? (
    <div className={`${styles.shotArea} ${isLandscape ? styles.shotAreaLandscape : ''}`}>
      <button
        type="button"
        className={`${styles.frame} ${isLandscape ? styles.frameLandscape : styles.framePortrait}`}
        onClick={() => setLightboxOpen(true)}
        aria-label={`Powiększ: ${shot?.alt ?? project.name}`}
      >
        {shot && imgOk ? (
          <img
            src={shot.src}
            alt={shot.alt}
            className={`${styles.shot} ${isLandscape ? styles.shotLandscape : styles.shotPortrait}`}
            loading="lazy"
            onError={() => setImgOk(false)}
          />
        ) : (
          <div className={styles.placeholderInner}>
            <span>Dodaj zrzut do folderu public/images</span>
            <code>{shot?.src ?? project.screenshots[0]?.src}</code>
          </div>
        )}
        <span className={styles.zoomHint} aria-hidden>
          Kliknij, aby powiększyć
        </span>
      </button>
      {project.screenshots.length > 1 && (
        <div className={styles.thumbs}>
          {project.screenshots.map((s, i) => (
            <button
              key={s.src}
              type="button"
              className={`${styles.thumb} ${isLandscape ? styles.thumbLandscape : ''} ${i === shotIndex ? styles.thumbActive : ''}`}
              onClick={() => onShotChange(i)}
              aria-label={`Podgląd ${i + 1}: ${s.alt}`}
            >
              <img src={s.src} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  ) : null;

  const meshAnchorId =
    project.id === 'transitrank'
      ? TRANSITRANK_MESH_ANCHOR_ID
      : project.id === 'forkfull'
        ? FORKFULL_MESH_ANCHOR_ID
        : project.id === 'kamochi'
          ? KAMOCHI_MESH_ANCHOR_ID
          : project.id === 'legitcheck'
            ? LEGITCHECK_MESH_ANCHOR_ID
            : project.id === 'stylerank'
              ? STYLERANK_MESH_ANCHOR_ID
              : null;

  return (
    <DotReveal
      delay={index * 0.06}
      className={`${styles.wrap} ${project.id === 'transitrank' ? styles.wrapTransitRank : ''} ${project.id === 'forkfull' ? styles.wrapForkFull : ''} ${project.id === 'kamochi' ? styles.wrapKamochi : ''} ${project.id === 'legitcheck' ? styles.wrapLegitCheck : ''} ${project.id === 'stylerank' ? styles.wrapStyleRank : ''}`}
    >
      {meshAnchorId && !isMobile && (
        <div
          id={meshAnchorId}
          className={`${styles.meshSlot} ${project.id === 'forkfull' || project.id === 'legitcheck' ? styles.meshSlotLeft : ''}`}
          aria-hidden="true"
        />
      )}
      <Card
        className={`${styles.card} ${project.id === 'transitrank' ? styles.cardTransitRank : ''} ${project.id === 'forkfull' ? styles.cardForkFull : ''} ${project.id === 'kamochi' ? styles.cardKamochi : ''} ${project.id === 'legitcheck' ? styles.cardLegitCheck : ''} ${project.id === 'stylerank' ? styles.cardStyleRank : ''} ${!hasShots ? styles.cardNoShots : ''} ${isLandscape ? styles.cardLandscape : ''}`}
      >
        <div className={styles.cardMain}>
          <div className={styles.header}>
            <div>
              <MetaLabel>{project.role}</MetaLabel>
              <h3 className={styles.name}>{project.name}</h3>
              <p className={styles.tagline}>{project.tagline}</p>
              {project.url && (
                <a
                  href={project.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.link}
                >
                  {project.url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')}
                  <span aria-hidden> ↗</span>
                </a>
              )}
            </div>
            <span
              className={styles.accentDot}
              style={{ background: project.accent }}
              aria-hidden
            />
          </div>

          <p className={styles.description}>{project.description}</p>

          {project.infrastructure.length > 0 && (
            <div className={styles.infra}>
              <p className={styles.infraLabel}>Infrastruktura</p>
              <ul className={styles.infraList}>
                {project.infrastructure.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          )}

          {isLandscape && shotArea}

          <ul className={styles.features}>
            {project.features.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>

          <div className={styles.stack}>
            {project.stack.map((t) => (
              <Badge key={t} tone="accent">
                {t}
              </Badge>
            ))}
          </div>
        </div>

        {!isLandscape && shotArea}

        {lightboxOpen && (
          <ScreenshotLightbox
            shots={project.screenshots}
            index={shotIndex}
            onClose={() => setLightboxOpen(false)}
            onIndexChange={onShotChange}
          />
        )}
      </Card>
    </DotReveal>
  );
}
