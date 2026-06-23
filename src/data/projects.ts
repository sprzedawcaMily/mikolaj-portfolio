export interface ProjectScreenshot {
  src: string;
  alt: string;
  caption?: string;
}

export interface Project {
  id: string;
  name: string;
  tagline: string;
  description: string;
  role: string;
  stack: string[];
  infrastructure: string[];
  accent: string;
  screenshots: ProjectScreenshot[];
  /** portrait = mobile; landscape = web / desktop */
  screenshotOrientation?: 'portrait' | 'landscape';
  url?: string;
  features: string[];
}

export const projects: Project[] = [
  {
    id: 'transitrank',
    name: 'TransitRank',
    tagline: 'Platforma transportu publicznego — mobile, web i dwa API',
    description:
      'Ekosystem czterech repozytoriów dla pasażerów autobusów w UK. Stworzyłem logo TransitRank. Mobile i web łączą recenzje społeczności, gamifikację (XP, perki), planowanie tras i sklep headless. Backend agreguje dane BODS, GTFS Realtime i OpenTripPlanner, z warstwą AI do analizy zgłoszeń.',
    role: 'Lead Mobile Developer & Backend Architect',
    stack: [
      'React Native',
      'React · Vite',
      'Bun · Hono',
      'PostgreSQL',
      'Redis',
      'Kubernetes',
      'Supabase',
    ],
    infrastructure: [
      'Kubernetes/k3s — prod, staging i preview per PR',
      'GitHub Actions → własny registry Docker',
      'Domeny: trips.transitrank.co.uk + środowiska PR',
      'Docker Compose z Redis, 100+ testów automatycznych',
      'Integracje: BODS API, GTFS-RT, Stripe, WooCommerce',
    ],
    accent: '#5B7FD4',
    screenshots: [
      { src: '/images/transitrank/dashbord.jpg', alt: 'Dashboard TransitRank' },
      { src: '/images/transitrank/community-reviews.jpg', alt: 'Community Reviews' },
      { src: '/images/transitrank/add-review.png', alt: 'Dodawanie recenzji' },
      { src: '/images/transitrank/planner.png', alt: 'Trip Planner' },
      { src: '/images/transitrank/more.jpg', alt: 'Menu More' },
    ],
    features: [
      'Autorskie logo TransitRank',
      '4 repozytoria: mobile, web, trips-api, timetable-api',
      'Routing RAPTOR i algorytmy opóźnień',
      'Gamifikacja, moderacja i analityka sieci',
      'Web-push i powiadomienia o zakłóceniach',
      'Headless e-commerce ze Stripe',
    ],
  },
  {
    id: 'forkfull',
    name: 'Forkful',
    tagline: 'Świadome odżywianie — AI, local-first, subskrypcje',
    description:
      'Aplikacja mobilna do śledzenia makro z analizą posiłków ze zdjęcia przez Gemini. Architektura privacy-first: SQLite lokalnie, opcjonalny sync w chmurze. Meal Copilot, Health Connect i plany Premium przez RevenueCat.',
    role: 'Co-creator architektury & implementacji',
    stack: [
      'React Native · Expo',
      'SQLite · Drizzle',
      'Gemini API',
      'Firebase',
      'RevenueCat',
      'TypeScript',
    ],
    infrastructure: [
      'Firebase Cloud Functions (Node 22) — analyzeMeal, chatMeal',
      'Firebase Auth + Firestore (sync opcjonalny)',
      'EAS Build — profile dev, prod i APK',
      'Landing na Fly.io (Frankfurt) — Docker + Nginx',
      'i18n PL / EN / DE, Health Connect (Android)',
    ],
    accent: '#6A8C71',
    url: 'https://forkful.fly.dev/',
    screenshots: [
      { src: '/images/forkfull/home.png', alt: 'Ekran główny z dziennym spożyciem' },
      { src: '/images/forkfull/meal.png', alt: 'Podgląd posiłku ze zdjęcia' },
      { src: '/images/forkfull/breakdown.png', alt: 'Szczegółowy breakdown składników' },
      { src: '/images/forkfull/plan.png', alt: 'Widok dziennego celu i postępu' },
      { src: '/images/forkfull/settings.png', alt: 'Profil i metryki zdrowotne' },
    ],
    features: [
      'Analiza AI ze zdjęcia — Gemini w produkcji',
      'Dane lokalne w SQLite, sync gdy użytkownik chce',
      'Meal Copilot i plany Basic / Premium',
      'Wersja 2.19 — dojrzały produkt mobilny',
      'Material Design 3, FlashList, offline-first',
    ],
  },
  {
    id: 'kamochi',
    name: 'Kamochi',
    tagline: 'Jeden z największych vintage skate shopów w Polsce',
    description:
      'Założyłem Kamochi — jeden z największych vintage skate shopów w Polsce. Ekosystem e-commerce obejmuje Next.js storefront, scraping Vinted w czasie rzeczywistym, desktop z powiadomieniami, RPA publikacji ogłoszeń i raporty finansowe — jeden lejek od produktu do kasy.',
    role: 'Founder & Full-stack Developer',
    stack: [
      'Next.js 16',
      'Firebase',
      'Puppeteer',
      'Electron',
      'Bun · TypeScript',
      'Fly.io',
    ],
    infrastructure: [
      'Fly.io — scraper i serwer powiadomień (region WAW)',
      'Electron + Socket.io — desktop real-time alerts',
      'Puppeteer RPA — Vinted, Grailed, auto-ceny',
      'Static JSON feed na CDN — optymalizacja Firestore',
      'Instalatory Windows/Linux, GitHub Actions',
    ],
    accent: '#D4A35C',
    screenshotOrientation: 'landscape',
    url: 'https://kamochi.pl/',
    screenshots: [
      { src: '/images/kamochi/hero.png', alt: 'Kamochi — strona główna' },
      { src: '/images/kamochi/galoty.png', alt: 'Katalog produktów — Galoty' },
      { src: '/images/kamochi/brands.png', alt: 'Sekcja marek — Akademiks' },
      { src: '/images/kamochi/hip-hop.png', alt: 'Polski hip-hop amerykański' },
      { src: '/images/kamochi/baggy.png', alt: 'Spodnie baggy — Wild Leg' },
    ],
    features: [
      'Jeden z największych vintage skate shopów w Polsce',
      'Sklep Next.js + Firestore z feedem statycznym',
      'Scraper z auto-restartem i stealth Puppeteer',
      'Generator ogłoszeń: zdjęcia → opisy → publikacja',
      'Mobile „Szybkie Ogłoszenia” z IAP',
      'Python: maile Vinted → Excel (raporty sprzedaży)',
    ],
  },
  {
    id: 'legitcheck',
    name: 'LegitCheck',
    tagline: 'AI weryfikacja autentyczności streetwear i luxury',
    description:
      'Aplikacja mobilna porównująca zdjęcia użytkownika z bazą referencyjną authentic/fake. Gemini analizuje detale produktu i zwraca werdykt z uzasadnieniem — niszowe computer vision poza typowymi chatbotami.',
    role: 'Autor produktu & implementacja mobile',
    stack: [
      'React Native · Expo',
      'Gemini API',
      'Supabase',
      'TypeScript',
      'Zustand',
    ],
    infrastructure: [
      'Supabase — storage zdjęć referencyjnych',
      'EAS Build + GitHub Actions (Android)',
      'Google Play — com.legitcheck.app',
      'i18n, React Native Paper (MD3)',
    ],
    accent: '#A78BFA',
    url: 'https://play.google.com/store/apps/details?id=com.legitcheck.app',
    screenshots: [],
    features: [
      'Porównanie zdjęć user vs baza authentic/fake',
      'Gemini analyzeAuthenticity() w produkcji',
      'Baza referencyjna w Supabase Storage',
      'Produkt mobilny z CI/CD — nie skrypt jednorazowy',
      'Niszowy use case AI w streetwear/luxury',
    ],
  },
  {
    id: 'stylerank',
    name: 'StyleRank',
    tagline: 'Tier listy mody — drag-and-drop, ranking globalny, eksport',
    description:
      'Prosta, ale dopracowana aplikacja webowa do tworzenia tier list produktów i stylów. Drag-and-drop z @dnd-kit, tryb turniejowy, globalny ranking Elo i eksport listy do JPG — z katalogiem marek w Supabase i wdrożeniem na stylerank.pl.',
    role: 'Creator & Full-stack Developer',
    stack: [
      'React · Vite',
      'TypeScript',
      'Supabase',
      '@dnd-kit',
      'Puppeteer',
    ],
    infrastructure: [
      'Vercel — stylerank.pl, PWA',
      'Supabase — znormalizowany katalog, RLS, ranking globalny',
      'IndexedDB — autosave lokalny + merge z chmurą',
      'Puppeteer — scrapery marek (Pandora, Swarovski, Vivienne Westwood)',
    ],
    accent: '#C5A059',
    screenshotOrientation: 'landscape',
    url: 'https://www.stylerank.pl/',
    screenshots: [
      { src: '/images/stylerank/landing.png', alt: 'StyleRank — strona główna' },
      { src: '/images/stylerank/board.png', alt: 'Tier listy — bransoletki' },
      { src: '/images/stylerank/tournament.png', alt: 'Tryb turniejowy — VS' },
    ],
    features: [
      'Tier listy z drag-and-drop i trybem turniejowym',
      'Globalny ranking Elo — głosowanie multiplayer',
      'Eksport JPG i udostępnianie przez Web Share API',
      'Katalog marek luxury w Supabase + panel admina',
      'Dopracowany UI — glass, złote akcenty, mobile-first',
    ],
  },
];
