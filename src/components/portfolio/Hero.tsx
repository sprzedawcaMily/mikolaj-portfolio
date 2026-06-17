import { motion } from 'framer-motion';
import { Badge, GitHubIcon } from '@/components/emds';
import { profile } from '@/data/profile';
import { HERO_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { useMobileLayout } from '@/hooks/mobileLayout';
import styles from './Hero.module.css';

const skillStats = [
  { label: 'Frontend', value: 97 },
  { label: 'Backend', value: 94 },
  { label: 'Mobile', value: 96 },
  { label: 'Data / ETL', value: 90 },
];

export function Hero() {
  const isMobile = useMobileLayout();

  return (
    <section className={styles.hero} id="top">
      <div className={styles.heroGrid}>
        <motion.div
          className={styles.copy}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <Badge tone="accent">Full-Stack · TypeScript · Mobile</Badge>
          <p className={styles.greeting}>Player select</p>
          <h1 className={styles.name}>{profile.name}</h1>
          <p className={styles.characterClass}>Class: {profile.title} · GTFS / AI</p>
          <p className={styles.summary}>
            Wybierasz Mikołaja: inżyniera full-stack, który projektuje skalowalne
            architektury w TypeScript, buduje pipeline’y danych transportowych i dowozi
            produkty od backendu po aplikacje mobilne z AI w produkcji.
          </p>

          <div className={styles.skillPanel} aria-label="Poziom umiejętności postaci">
            <div className={styles.skillHeader}>
              <span>Skill stats</span>
              <strong>High level build</strong>
            </div>
            {skillStats.map((stat) => (
              <div className={styles.skillRow} key={stat.label}>
                <span className={styles.skillLabel}>{stat.label}</span>
                <div className={styles.skillTrack} aria-hidden="true">
                  <span className={styles.skillFill} style={{ width: `${stat.value}%` }} />
                </div>
                <strong className={styles.skillValue}>{stat.value}</strong>
              </div>
            ))}
          </div>

          <div className={styles.actions}>
            <a href="#projekty" className={styles.ctaPrimary}>
              Zobacz projekty
            </a>
            <a href="#kontakt" className={styles.ctaSecondary}>
              Zatwierdź
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
        </motion.div>

        {!isMobile && (
          <div id={HERO_MESH_ANCHOR_ID} className={styles.meshSlot} aria-hidden="true" />
        )}
      </div>
    </section>
  );
}
