import { useCallback, useState, type CSSProperties } from 'react';
import { DotReveal } from '@/components/animation/DotReveal';
import { Badge, Card, MetaLabel } from '@/components/emds';
import type { Project } from '@/data/projects';
import { MESH_ASSETS } from '@/data/meshAssets';
import { useLocale } from '@/context/LocaleProvider';
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

const PROJECT_MESH_ICON: Record<string, string> = {
  transitrank: MESH_ASSETS.bus,
  forkfull: MESH_ASSETS.fork,
  kamochi: MESH_ASSETS.spray,
  legitcheck: MESH_ASSETS.loupe,
  stylerank: MESH_ASSETS.ring,
};

interface ProjectCardProps {
  project: Project;
  index: number;
}

export function ProjectCard({ project, index }: ProjectCardProps) {
  const isMobile = useMobileLayout();
  const { t } = useLocale();
  const [shotIndex, setShotIndex] = useState(0);
  const [imgOk, setImgOk] = useState(true);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const shot = project.screenshots[shotIndex];
  const isLandscape = project.screenshotOrientation === 'landscape';
  const hasShots = project.screenshots.length > 0;
  const meshIcon = PROJECT_MESH_ICON[project.id];

  const onShotChange = useCallback((i: number) => {
    setShotIndex(i);
    setImgOk(true);
  }, []);

  const shotArea = hasShots ? (
    <div className={`${styles.shotArea} ${isLandscape ? styles.shotAreaLandscape : ''}`}>
      <button
        type="button"
        className={`${styles.frame} ${isLandscape ? styles.frameLandscape : styles.framePortrait}`}
        onClick={() => imgOk && setLightboxOpen(true)}
        aria-label={`${t.projects.zoomAria}: ${shot?.alt ?? project.name}`}
        disabled={!imgOk}
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
          <div
            className={styles.placeholderInner}
            style={{ '--project-accent': project.accent } as CSSProperties}
          >
            {meshIcon && (
              <img src={meshIcon} alt="" className={styles.placeholderMesh} aria-hidden />
            )}
            <span className={styles.placeholderTitle}>{project.name}</span>
            <span className={styles.placeholderHint}>{t.projects.placeholderHint}</span>
          </div>
        )}
        {imgOk && (
          <span className={styles.zoomHint} aria-hidden>
            {t.projects.zoomHint}
          </span>
        )}
      </button>
      {project.screenshots.length > 1 && (
        <div className={styles.thumbs}>
          {project.screenshots.map((s, i) => (
            <button
              key={s.src}
              type="button"
              className={`${styles.thumb} ${isLandscape ? styles.thumbLandscape : ''} ${i === shotIndex ? styles.thumbActive : ''}`}
              onClick={() => onShotChange(i)}
              aria-label={`${t.projects.thumbAria} ${i + 1}: ${s.alt}`}
            >
              <img src={s.src} alt="" loading="lazy" onError={(e) => {
                (e.target as HTMLImageElement).style.opacity = '0.3';
              }} />
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
              <p className={styles.infraLabel}>{t.projects.infrastructure}</p>
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
            {project.stack.map((tech) => (
              <Badge key={tech} tone="accent">
                {tech}
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
