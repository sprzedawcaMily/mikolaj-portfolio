import { DotReveal } from '@/components/animation/DotReveal';
import { Card, MetaLabel, SectionHeading } from '@/components/emds';
import { skillGroups } from '@/data/skills';
import styles from './SkillsSection.module.css';

export function SkillsSection() {
  return (
    <section className={styles.section} id="umiejetnosci">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Umiejętności"
            title="Stack technologiczny"
            subtitle="Bun, React Native, Kubernetes, Gemini i Puppeteer — stack powtarzalny w moich produktach."
          />
        </DotReveal>
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
    </section>
  );
}
