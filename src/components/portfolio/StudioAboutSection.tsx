import { DotReveal } from '@/components/animation/DotReveal';
import { HuePickerBar } from '@/components/layout/HuePickerBar';
import { Card, GitHubIcon, SectionHeading } from '@/components/emds';
import { profile } from '@/data/profile';
import { useLocale } from '@/context/LocaleProvider';
import { PALETTE_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { useMobileLayout } from '@/hooks/mobileLayout';
import styles from './StudioAboutSection.module.css';

export function StudioAboutSection() {
  const isMobile = useMobileLayout();
  const { t } = useLocale();

  return (
    <section className={styles.zone} id="studio-palety">
      <div className={styles.aboutBlock} id="o-mnie">
        <div className={styles.inner}>
          {!isMobile && (
            <div className={styles.meshWrap} aria-hidden="true">
              <div id={PALETTE_MESH_ANCHOR_ID} className={styles.meshSlot} />
            </div>
          )}
          <Card className={styles.panel}>
            <DotReveal>
              <SectionHeading
                label={t.about.label}
                title={t.about.title}
                subtitle={t.about.subtitle}
              />
            </DotReveal>
            <div className={styles.grid}>
              <DotReveal delay={0.08}>
                <Card>
                  <p className={styles.statLabel}>{t.about.location}</p>
                  <p className={styles.statValue}>{t.profile.location}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.16}>
                <Card>
                  <p className={styles.statLabel}>{t.about.specialization}</p>
                  <p className={styles.statValue}>{t.about.specializationValue}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.24}>
                <Card>
                  <p className={styles.statLabel}>{t.about.language}</p>
                  <p className={styles.statValue}>{t.profile.english}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.32}>
                <Card>
                  <p className={styles.statLabel}>{t.about.workMode}</p>
                  <p className={styles.statValue}>{t.profile.workMode}</p>
                </Card>
              </DotReveal>
              <DotReveal delay={0.4}>
                <Card>
                  <p className={styles.statLabel}>{t.about.github}</p>
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
                  <p className={styles.statLabel}>{t.about.availability}</p>
                  <p className={styles.statValue}>{t.profile.availability}</p>
                </Card>
              </DotReveal>
            </div>
          </Card>

          <div className={styles.paletteBridge} aria-label={t.about.paletteAria}>
            <Card className={styles.paletteCard}>
              <p className={styles.paletteLabel}>{t.about.paletteLabel}</p>
              <HuePickerBar />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
