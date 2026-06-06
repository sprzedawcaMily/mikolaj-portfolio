import { DotReveal } from '@/components/animation/DotReveal';
import { Card, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import styles from './AboutSection.module.css';

export function AboutSection() {
  return (
    <section className={styles.section} id="o-mnie">
      <div className={styles.inner}>
        <Card className={styles.panel}>
          <DotReveal>
            <SectionHeading
              label="O mnie"
              title="Skalowalne systemy od interfejsu po warstwę danych"
              subtitle={profile.summary}
            />
          </DotReveal>
          <div className={styles.grid}>
            <DotReveal delay={0.08}>
              <Card>
                <p className={styles.statLabel}>Lokalizacja</p>
                <p className={styles.statValue}>{profile.location}</p>
              </Card>
            </DotReveal>
            <DotReveal delay={0.16}>
              <Card>
                <p className={styles.statLabel}>Specjalizacja</p>
                <p className={styles.statValue}>TypeScript · K8s · AI Mobile</p>
              </Card>
            </DotReveal>
            <DotReveal delay={0.24}>
              <Card>
                <p className={styles.statLabel}>Język</p>
                <p className={styles.statValue}>Angielski — płynnie</p>
              </Card>
            </DotReveal>
          </div>
        </Card>
      </div>
    </section>
  );
}
