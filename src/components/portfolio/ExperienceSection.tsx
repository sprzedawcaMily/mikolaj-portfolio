import { DotReveal } from '@/components/animation/DotReveal';
import { KamochiEye } from '@/components/animation/KamochiEye';
import { Card, MetaLabel, SectionHeading } from '@/components/emds';
import { experience } from '@/data/experience';
import { EXPERIENCE_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import meshStyles from './sectionMeshLayout.module.css';
import styles from './ExperienceSection.module.css';

export function ExperienceSection() {
  return (
    <section className={styles.section} id="doswiadczenie">
      <div className={styles.inner}>
        <DotReveal>
          <div className={`${meshStyles.wrap} ${meshStyles.wrapEyeRight}`}>
            <div
              id={EXPERIENCE_MESH_ANCHOR_ID}
              className={meshStyles.meshSlot}
              aria-hidden="true"
            >
              <KamochiEye
                anchorId={EXPERIENCE_MESH_ANCHOR_ID}
                className={meshStyles.eye}
                irisOnly
                meshZone="careerEye"
              />
            </div>
            <div className={meshStyles.content}>
              <SectionHeading
                label="Doświadczenie"
                title="Kariera w skrócie"
                subtitle="Od Assembless po TransitRank i Kamochi — mobile, backend, K8s i automatyzacja."
              />
              <div className={styles.timeline}>
                {experience.map((item, i) => (
                  <DotReveal key={item.id} delay={i * 0.08}>
                    <Card className={styles.item}>
                      <div className={styles.top}>
                        <div>
                          <MetaLabel>{item.period}</MetaLabel>
                          <h3 className={styles.role}>{item.role}</h3>
                          <p className={styles.company}>{item.company}</p>
                        </div>
                      </div>
                      <ul className={styles.highlights}>
                        {item.highlights.map((h) => (
                          <li key={h}>{h}</li>
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
