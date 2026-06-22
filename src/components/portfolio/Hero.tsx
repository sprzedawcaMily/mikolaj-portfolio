import { Badge, GitHubIcon } from '@/components/emds';
import { profile } from '@/data/profile';
import { useLocale } from '@/context/LocaleProvider';
import { HERO_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { useMobileLayout } from '@/hooks/mobileLayout';
import { HeroMeshPlaceholder } from './HeroMeshPlaceholder';
import styles from './Hero.module.css';

export function Hero() {
  const isMobile = useMobileLayout();
  const { t } = useLocale();

  return (
    <section className={styles.hero} id="top">
      <div className={styles.heroGrid}>
        <div className={styles.copy}>
          <Badge tone="accent" className={styles.heroReveal}>
            {t.hero.badge}
          </Badge>
          <p className={`${styles.greeting} ${styles.heroReveal}`}>{t.hero.greeting}</p>
          <h1 className={styles.name}>{profile.name}</h1>
          <p className={`${styles.characterClass} ${styles.heroReveal}`}>{t.hero.characterClass}</p>
          <p className={`${styles.summary} ${styles.heroReveal}`}>{t.hero.summary}</p>

          <div
            className={`${styles.skillPanel} ${styles.heroReveal}`}
            aria-label={t.hero.skillPanelAria}
          >
            <div className={styles.skillHeader}>
              <span>{t.hero.skillHeader}</span>
              <strong>{t.hero.skillBuild}</strong>
            </div>
            {t.hero.skills.map((stat) => (
              <div className={styles.skillRow} key={stat.label}>
                <span className={styles.skillLabel}>{stat.label}</span>
                <div className={styles.skillTrack} aria-hidden="true">
                  <span className={styles.skillFill} style={{ width: `${stat.value}%` }} />
                </div>
                <strong className={styles.skillValue}>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className={`${styles.actions} ${styles.heroReveal}`}>
            <a href="#projekty" className={styles.ctaPrimary}>
              {t.hero.ctaProjects}
            </a>
            <a href="#kontakt" className={styles.ctaSecondary}>
              {t.hero.ctaConfirm}
            </a>
            <a
              href={profile.github}
              className={styles.ctaSecondary}
              target="_blank"
              rel="noopener noreferrer"
            >
              <GitHubIcon size={16} />
              GitHub
            </a>
          </div>
        </div>

        {!isMobile && (
          <div id={HERO_MESH_ANCHOR_ID} className={styles.meshSlot} aria-hidden="true">
            <HeroMeshPlaceholder />
          </div>
        )}
      </div>
    </section>
  );
}
