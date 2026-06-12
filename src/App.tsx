import { FlyingMeshDots } from '@/components/animation/FlyingMeshDots';
import { MeshPerfMonitor } from '@/components/debug/MeshPerfMonitor';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { MeshZoneProvider } from '@/context/MeshZoneContext';
import {
  ContactZone,
  ExperienceSection,
  Hero,
  ProjectsSection,
  StudioAboutSection,
  SiteFooter,
  SkillsSection,
} from '@/components/portfolio';
import { ThemeProvider } from '@/theme/ThemeProvider';
import styles from './App.module.css';

export default function App() {
  return (
    <ThemeProvider>
      <MeshPerfMonitor />
      <MeshZoneProvider>
        <div className={styles.pageShell}>
          <FlyingMeshDots />
          <div className={styles.pageContent}>
            <SiteHeader />
            <main>
              <Hero />
              <StudioAboutSection />
              <ProjectsSection />
              <ExperienceSection />
              <SkillsSection />
              <ContactZone />
            </main>
            <SiteFooter />
          </div>
        </div>
      </MeshZoneProvider>
    </ThemeProvider>
  );
}
