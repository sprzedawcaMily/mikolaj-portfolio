export interface ExperienceItem {
  id: string;
  role: string;
  company: string;
  period: string;
  highlights: string[];
}

export const experience: ExperienceItem[] = [
  {
    id: 'transitrank',
    role: 'Lead Mobile Developer & Backend Architect',
    company: 'TransitRank',
    period: 'Maj 2025 — obecnie',
    highlights: [
      'Autor logo TransitRank',
      'Ekosystem 4 repo: mobile, web, trips-api, timetable-api',
      'Kubernetes/k3s, GitHub Actions, preview per PR, własny Docker registry',
      'Bun + Hono, Redis, Supabase/PostgreSQL, OpenTripPlanner, BODS API',
      'Algorytmy opóźnień, routing RAPTOR, GTFS Realtime',
      'React Native, Zustand, gamifikacja, LLM do moderacji zgłoszeń',
    ],
  },
  {
    id: 'assembless',
    role: 'Fullstack Engineer',
    company: 'Assembless',
    period: 'Czerwiec 2023 — Kwiecień 2025',
    highlights: [
      'Front-end, back-end i UI/UX w międzynarodowym zespole',
      'Open-source i aplikacje komercyjne na dużą skalę',
      'Nowoczesne struktury projektów i procesy Agile',
    ],
  },
  {
    id: 'kamochi',
    role: 'Founder & Full-stack Developer',
    company: 'Kamochi',
    period: 'Styczeń 2025 — obecnie',
    highlights: [
      'Założyciel jednego z największych vintage skate shopów w Polsce',
      'Next.js storefront + Firebase, optymalizacja kosztów odczytów',
      'Fly.io: scraper Vinted i serwer powiadomień (WAW)',
      'RPA Puppeteer — publikacja na Vinted/Grailed, desktop Electron',
      'Mobile z IAP, raporty finansowe Python → Excel',
    ],
  },
];
