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
      'Autor logo i ekosystem 4 repozytoriów: mobile, web, trips-api, timetable-api',
      'Kubernetes/k3s, GitHub Actions, preview per PR, własny Docker registry',
      'Bun + Hono, Redis, Supabase/PostgreSQL, OpenTripPlanner, BODS API',
      'Algorytmy opóźnień, routing RAPTOR, GTFS Realtime — warstwa danych transportowych',
      '100+ testów automatycznych, React Native, Zustand, gamifikacja',
      'LLM do moderacji zgłoszeń społeczności w produkcji',
    ],
  },
  {
    id: 'assembless',
    role: 'Fullstack Engineer',
    company: 'Assembless',
    period: 'Czerwiec 2023 — Kwiecień 2025',
    highlights: [
      'Front-end, back-end i UI/UX w międzynarodowym zespole pod mentoringiem seniorów',
      'Aplikacje komercyjne i open-source na dużą skalę — TypeScript, React, Node.js',
      'Współtworzenie architektury produktów webowych i mobilnych w procesie Agile/Scrum',
      'Integracje API, nowoczesne struktury projektów i code review w zespole rozproszonym',
    ],
  },
  {
    id: 'kamochi',
    role: 'Founder & Full-stack Developer',
    company: 'Kamochi',
    period: 'Styczeń 2025 — obecnie',
    highlights: [
      'Założyciel jednego z największych vintage skate shopów w Polsce — kamochi.pl',
      'Next.js storefront + Firebase, feed statyczny na CDN — optymalizacja kosztów Firestore',
      'Fly.io (WAW): scraper Vinted i serwer powiadomień w czasie rzeczywistym',
      'RPA Puppeteer — publikacja na Vinted/Grailed, desktop Electron + Socket.io',
      'Mobile z IAP, raporty finansowe Python → Excel, GitHub Actions',
    ],
  },
];
