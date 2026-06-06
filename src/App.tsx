import { InteractiveDotField } from '@/components/animation/InteractiveDotField';
import { SiteHeader } from '@/components/layout/SiteHeader';
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

export default function App() {
  return (
    <ThemeProvider>
      <div id="mesh-portal-root" aria-hidden="true" />
      <InteractiveDotField />
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
    </ThemeProvider>
  );
}
