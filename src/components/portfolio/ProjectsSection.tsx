import { DotReveal } from '@/components/animation/DotReveal';
import { SectionHeading } from '@/components/emds';
import { useLocale } from '@/context/LocaleProvider';
import { getLocalizedProjects } from '@/i18n';
import { ProjectCard } from './ProjectCard';
import styles from './ProjectsSection.module.css';

export function ProjectsSection() {
  const { locale, t } = useLocale();
  const projects = getLocalizedProjects(locale);

  return (
    <section className={styles.section} id="projekty">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label={t.projects.label}
            title={t.projects.title}
            subtitle={t.projects.subtitle}
          />
        </DotReveal>
        <div className={styles.list}>
          {projects.map((p, i) => (
            <ProjectCard key={p.id} project={p} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
