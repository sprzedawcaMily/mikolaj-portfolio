import { DotReveal } from '@/components/animation/DotReveal';
import { SectionHeading } from '@/components/emds';
import { projects } from '@/data/projects';
import { ProjectCard } from './ProjectCard';
import styles from './ProjectsSection.module.css';

export function ProjectsSection() {
  return (
    <section className={styles.section} id="projekty">
      <div className={styles.inner}>
        <DotReveal>
          <SectionHeading
            label="Projekty"
            title="Produkty, które projektuję i wdrażam"
            subtitle="Cztery ekosystemy — od Kubernetes i API transportowych, przez AI mobile, po e-commerce z automatyzacją."
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
