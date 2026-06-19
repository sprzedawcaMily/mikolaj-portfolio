import { DotReveal } from '@/components/animation/DotReveal';
import { KamochiEye } from '@/components/animation/KamochiEye';
import { Card, MetaLabel, SectionHeading } from '@/components/emds';
import { useLocale } from '@/context/LocaleProvider';
import { getLocalizedSkillGroups } from '@/i18n';
import { SKILLS_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { useMobileLayout } from '@/hooks/mobileLayout';
import meshStyles from './sectionMeshLayout.module.css';
import styles from './SkillsSection.module.css';

export function SkillsSection() {
  const isMobile = useMobileLayout();
  const { locale, t } = useLocale();
  const skillGroups = getLocalizedSkillGroups(locale);

  return (
    <section className={styles.section} id="umiejetnosci">
      <div className={styles.inner}>
        <DotReveal>
          <div className={`${meshStyles.wrap} ${meshStyles.wrapEyeLeft}`}>
            {!isMobile && (
              <div
                id={SKILLS_MESH_ANCHOR_ID}
                className={meshStyles.meshSlot}
                aria-hidden="true"
              >
                <KamochiEye
                  anchorId={SKILLS_MESH_ANCHOR_ID}
                  className={meshStyles.eye}
                  mirrored
                  irisOnly
                  meshZone="skillsEye"
                />
              </div>
            )}
            <div className={meshStyles.content}>
              <SectionHeading
                label={t.skills.label}
                title={t.skills.title}
                subtitle={t.skills.subtitle}
              />
              <div className={styles.grid}>
                {skillGroups.map((group, i) => (
                  <DotReveal key={group.id} delay={i * 0.06}>
                    <Card>
                      <MetaLabel>{group.label}</MetaLabel>
                      <ul className={styles.list}>
                        {group.items.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </Card>
                  </DotReveal>
                ))}
              </div>
            </div>
          </div>
        </DotReveal>
      </div>
    </section>
  );
}
