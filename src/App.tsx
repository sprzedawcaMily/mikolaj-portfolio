import { DeferredFlyingMesh } from '@/components/animation/DeferredFlyingMesh';
import { DeferredMeshPerfMonitor } from '@/components/debug/DeferredMeshPerfMonitor';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { LocaleProvider } from '@/context/LocaleProvider';
import { MeshZoneProvider } from '@/context/MeshZoneContext';
import { useMobileLayout } from '@/hooks/mobileLayout';
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
  const isMobile = useMobileLayout();

  return (
    <ThemeProvider>
      <LocaleProvider>
        {!isMobile && <DeferredMeshPerfMonitor />}
        <MeshZoneProvider>
          <div className={styles.pageShell}>
            {!isMobile && <DeferredFlyingMesh />}
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
      </LocaleProvider>
    </ThemeProvider>
  );
}
