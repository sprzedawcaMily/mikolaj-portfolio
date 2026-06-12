export interface SkillGroup {
  id: string;
  label: string;
  items: string[];
}

export const skillGroups: SkillGroup[] = [
  {
    id: 'core',
    label: 'Core Development',
    items: [
      'TypeScript',
      'React & React Native',
      'Bun · Hono · Node.js',
      'REST · GraphQL · OpenAPI',
      'SOLID',
    ],
  },
  {
    id: 'data',
    label: 'Dane & Chmura',
    items: [
      'PostgreSQL · Supabase',
      'Firebase · Firestore',
      'Redis · SQLite',
      'GTFS · BODS · ETL',
      'Puppeteer',
    ],
  },
  {
    id: 'devops',
    label: 'DevOps & Infra',
    items: [
      'Kubernetes · Docker',
      'Fly.io',
      'GitHub Actions',
      'EAS Build',
      'CI/CD multi-env',
    ],
  },
  {
    id: 'ai',
    label: 'AI & Automatyzacja',
    items: [
      'Google Gemini API',
      'Firebase Functions + LLM',
      'RPA · scraping',
      'Computer vision (LegitCheck)',
      'AI Coding Assistants',
    ],
  },
  {
    id: 'design',
    label: 'Design & Metodyki',
    items: ['Figma', 'Material Design 3', 'Agile/Scrum', 'Zustand', 'i18n'],
  },
];
