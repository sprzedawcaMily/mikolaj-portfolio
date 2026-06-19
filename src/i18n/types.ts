export type Locale = 'pl' | 'en';

export type ProjectId =
  | 'transitrank'
  | 'forkfull'
  | 'kamochi'
  | 'legitcheck'
  | 'stylerank';

export interface ProjectCopy {
  name: string;
  tagline: string;
  description: string;
  role: string;
  infrastructure: string[];
  features: string[];
  screenshots: { alt: string; caption?: string }[];
}

export interface ExperienceCopy {
  role: string;
  period: string;
  highlights: string[];
}

export interface EducationCopy {
  school: string;
  degree: string;
  period: string;
  form: string;
  highlights: string[];
}

export interface SkillGroupCopy {
  label: string;
}

export interface Translations {
  meta: {
    title: string;
    description: string;
  };
  nav: {
    aria: string;
    about: string;
    projects: string;
    career: string;
    skills: string;
    contact: string;
    openMenu: string;
    closeMenu: string;
  };
  hero: {
    badge: string;
    greeting: string;
    characterClass: string;
    summary: string;
    skillPanelAria: string;
    skillHeader: string;
    skillBuild: string;
    skills: { label: string; value: number }[];
    ctaProjects: string;
    ctaConfirm: string;
    meshLoading: string;
  };
  about: {
    label: string;
    title: string;
    subtitle: string;
    location: string;
    specialization: string;
    specializationValue: string;
    language: string;
    workMode: string;
    github: string;
    availability: string;
    paletteLabel: string;
    paletteAria: string;
  };
  projects: {
    label: string;
    title: string;
    subtitle: string;
    infrastructure: string;
    zoomHint: string;
    zoomAria: string;
    thumbAria: string;
    placeholderHint: string;
    items: Record<ProjectId, ProjectCopy>;
  };
  experience: {
    label: string;
    title: string;
    subtitle: string;
    educationLabel: string;
    educationTitle: string;
    educationSubtitle: string;
    items: Record<string, ExperienceCopy>;
    education: Record<string, EducationCopy>;
  };
  skills: {
    label: string;
    title: string;
    subtitle: string;
    groups: Record<string, SkillGroupCopy>;
  };
  contact: {
    label: string;
    title: string;
    subtitle: string;
    email: string;
    phone: string;
    github: string;
    location: string;
    workMode: string;
    ctaEmail: string;
    ctaGithub: string;
  };
  footer: {
    contactLinks: string;
    contact: string;
  };
  profile: {
    location: string;
    workMode: string;
    english: string;
    availability: string;
    summary: string;
  };
  lightbox: {
    close: string;
    prev: string;
    next: string;
  };
  locale: {
    switchTo: string;
    pl: string;
    en: string;
  };
}
