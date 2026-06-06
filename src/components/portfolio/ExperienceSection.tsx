import { DotReveal } from '@/components/animation/DotReveal';
import { Card, MetaLabel, SectionHeading } from '@/components/emds';
import { experience } from '@/data/experience';
import styles from './ExperienceSection.module.css';

export function ExperienceSection() {
  return (
    <section className={styles.section} id="doswiadczenie">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Doświadczenie"
            title="Kariera w skrócie"
            subtitle="Od Assembless po TransitRank i Kamochi — mobile, backend, K8s i automatyzacja."
          />
        </DotReveal>
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
    </section>
  );
}
