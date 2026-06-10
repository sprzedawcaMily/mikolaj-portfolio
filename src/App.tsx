import { FlyingMeshDots } from '@/components/animation/FlyingMeshDots';
import { InteractiveDotField } from '@/components/animation/InteractiveDotField';
import { SiteHeader } from '@/components/layout/SiteHeader';
import { MeshZoneProvider } from '@/context/MeshZoneContext';
import {
  AboutSection,
  ContactSection,
  ExperienceSection,
  Hero,
  HuePickerSection,
  ProjectsSection,
  SiteFooter,
  SkillsSection,
} from '@/components/portfolio';
import { ThemeProvider } from '@/theme/ThemeProvider';
import styles from './App.module.css';

export default function App() {
  return (
    <ThemeProvider>
      <InteractiveDotField />
      <MeshZoneProvider>
        <div className={styles.pageShell}>
          <FlyingMeshDots />
          <div className={styles.pageContent}>
            <SiteHeader />
            <main>
              <Hero />
              <AboutSection />
              <HuePickerSection />
              <ProjectsSection />
              <ExperienceSection />
              <SkillsSection />
              <ContactSection />
            </main>
            <SiteFooter />
          </div>
        </div>
      </MeshZoneProvider>
    </ThemeProvider>
  );
}
