import { DotReveal } from '@/components/animation/DotReveal';
import { HuePickerBar } from '@/components/layout/HuePickerBar';
import { Card, GitHubIcon, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import { PALETTE_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import styles from './StudioAboutSection.module.css';

export function StudioAboutSection() {
  return (
    <section className={styles.zone} id="studio-palety">
      <div className={styles.aboutBlock} id="o-mnie">
        <div className={styles.inner}>
          <div className={styles.meshWrap} aria-hidden="true">
            <div id={PALETTE_MESH_ANCHOR_ID} className={styles.meshSlot} />
          </div>
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
                  <p className={styles.statValue}>{profile.english}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.32}>
                <Card>
                  <p className={styles.statLabel}>Forma pracy</p>
                  <p className={styles.statValue}>{profile.workMode}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.4}>
                <Card>
                  <p className={styles.statLabel}>GitHub</p>
                  <a
                    href={profile.github}
                    className={styles.statLink}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <GitHubIcon size={20} />
                    {profile.githubHandle}
                  </a>
                </Card>
              </DotReveal>
              <DotReveal delay={0.48}>
                <Card>
                  <p className={styles.statLabel}>Dostępność</p>
                  <p className={styles.statValue}>{profile.availability}</p>
                </Card>
              </DotReveal>
            </div>
          </Card>

          <div className={styles.paletteBridge} aria-label="Paleta motywu">
            <Card className={styles.paletteCard}>
              <p className={styles.paletteLabel}>Paleta · motyw strony</p>
              <HuePickerBar />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
