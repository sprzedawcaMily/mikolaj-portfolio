import type { Translations } from './types';

export const pl: Translations = {
  meta: {
    title: 'Mikołaj Mikołajczuk — Portfolio',
    description:
      'Mikołaj Mikołajczuk — Software Engineer. TransitRank, Forkfull, Kamochi.',
  },
  nav: {
    aria: 'Główna nawigacja',
    about: 'O mnie',
    projects: 'Projekty',
    career: 'Kariera',
    skills: 'Umiejętności',
    contact: 'Kontakt',
    openMenu: 'Otwórz menu',
    closeMenu: 'Zamknij menu',
  },
  hero: {
    badge: 'Full-Stack · TypeScript · Mobile',
    greeting: 'Player select',
    characterClass: 'Class: Software Engineer · GTFS / AI',
    summary:
      'Wybierasz Mikołaja: inżyniera full-stack, który projektuje skalowalne architektury w TypeScript, buduje pipeline’y danych transportowych i dowozi produkty od backendu po aplikacje mobilne z AI w produkcji.',
    skillPanelAria: 'Poziom umiejętności postaci',
    skillHeader: 'Skill stats',
    skillBuild: 'High level build',
    skills: [
      { label: 'Frontend', value: 97 },
      { label: 'Backend', value: 94 },
      { label: 'Mobile', value: 96 },
      { label: 'Data / ETL', value: 90 },
    ],
    ctaProjects: 'Zobacz projekty',
    ctaConfirm: 'Zatwierdź',
    meshLoading: 'Ładowanie animacji…',
  },
  about: {
    label: 'O mnie',
    title: 'Skalowalne systemy od interfejsu po warstwę danych',
    subtitle:
      'Full-Stack Software Engineer w ekosystemie TypeScript (React, React Native, Bun). Projektuję skalowalne architektury, pipeline’y danych transportowych (GTFS, ETL) i integracje AI w produkcji. Matura 2025, studia na Uczelni Łazarskiego.',
    location: 'Lokalizacja',
    specialization: 'Specjalizacja',
    specializationValue: 'TypeScript · K8s · AI Mobile',
    language: 'Język',
    workMode: 'Forma pracy',
    github: 'GitHub',
    availability: 'Dostępność',
    paletteLabel: 'Paleta · motyw strony',
    paletteAria: 'Wybór koloru akcentu',
  },
  projects: {
    label: 'Projekty',
    title: 'Produkty, które projektuję i wdrażam',
    subtitle:
      'Pięć ekosystemów — od Kubernetes i API transportowych, przez AI mobile, po e-commerce z automatyzacją.',
    infrastructure: 'Infrastruktura',
    zoomHint: 'Kliknij, aby powiększyć',
    zoomAria: 'Powiększ zrzut ekranu',
    thumbAria: 'Podgląd',
    placeholderHint: 'Podgląd projektu',
    items: {
      transitrank: {
        name: 'TransitRank',
        tagline: 'Platforma transportu publicznego — mobile, web i dwa API',
        description:
          'Ekosystem czterech repozytoriów dla pasażerów autobusów w UK. Stworzyłem logo TransitRank. Mobile i web łączą recenzje społeczności, gamifikację (XP, perki), planowanie tras i sklep headless. Backend agreguje dane BODS, GTFS Realtime i OpenTripPlanner, z warstwą AI do analizy zgłoszeń.',
        role: 'Lead Mobile Developer & Backend Architect',
        infrastructure: [
          'Kubernetes/k3s — prod, staging i preview per PR',
          'GitHub Actions → własny registry Docker',
          'Domeny: trips.transitrank.co.uk + środowiska PR',
          'Docker Compose z Redis, 100+ testów automatycznych',
          'Integracje: BODS API, GTFS-RT, Stripe, WooCommerce',
        ],
        features: [
          'Autorskie logo TransitRank',
          '4 repozytoria: mobile, web, trips-api, timetable-api',
          'Routing RAPTOR i algorytmy opóźnień',
          'Gamifikacja, moderacja i analityka sieci',
          'Web-push i powiadomienia o zakłóceniach',
          'Headless e-commerce ze Stripe',
        ],
        screenshots: [
          { alt: 'Dashboard TransitRank' },
          { alt: 'Community Reviews' },
          { alt: 'Dodawanie recenzji' },
          { alt: 'Trip Planner' },
          { alt: 'Menu More' },
        ],
      },
      forkfull: {
        name: 'Forkfull',
        tagline: 'Świadome odżywianie — AI, local-first, subskrypcje',
        description:
          'Aplikacja mobilna do śledzenia makro z analizą posiłków ze zdjęcia przez Gemini. Architektura privacy-first: SQLite lokalnie, opcjonalny sync w chmurze. Meal Copilot, Health Connect i plany Premium przez RevenueCat.',
        role: 'Co-creator architektury & implementacji',
        infrastructure: [
          'Firebase Cloud Functions (Node 22) — analyzeMeal, chatMeal',
          'Firebase Auth + Firestore (sync opcjonalny)',
          'EAS Build — profile dev, prod i APK',
          'Landing na Fly.io (Frankfurt) — Docker + Nginx',
          'i18n PL / EN / DE, Health Connect (Android)',
        ],
        features: [
          'Analiza AI ze zdjęcia — Gemini w produkcji',
          'Dane lokalne w SQLite, sync gdy użytkownik chce',
          'Meal Copilot i plany Basic / Premium',
          'Wersja 2.19 — dojrzały produkt mobilny',
          'Material Design 3, FlashList, offline-first',
        ],
        screenshots: [
          { alt: 'Dzienne spożycie' },
          { alt: 'Analiza posiłku' },
          { alt: 'Podział na produkty' },
          { alt: 'Mój Plan' },
          { alt: 'Ustawienia' },
        ],
      },
      kamochi: {
        name: 'Kamochi',
        tagline: 'Jeden z największych vintage skate shopów w Polsce',
        description:
          'Założyłem Kamochi — jeden z największych vintage skate shopów w Polsce. Ekosystem e-commerce obejmuje Next.js storefront, scraping Vinted w czasie rzeczywistym, desktop z powiadomieniami, RPA publikacji ogłoszeń i raporty finansowe — jeden lejek od produktu do kasy.',
        role: 'Founder & Full-stack Developer',
        infrastructure: [
          'Fly.io — scraper i serwer powiadomień (region WAW)',
          'Electron + Socket.io — desktop real-time alerts',
          'Puppeteer RPA — Vinted, Grailed, auto-ceny',
          'Static JSON feed na CDN — optymalizacja Firestore',
          'Instalatory Windows/Linux, GitHub Actions',
        ],
        features: [
          'Jeden z największych vintage skate shopów w Polsce',
          'Sklep Next.js + Firestore z feedem statycznym',
          'Scraper z auto-restartem i stealth Puppeteer',
          'Generator ogłoszeń: zdjęcia → opisy → publikacja',
          'Mobile „Szybkie Ogłoszenia” z IAP',
          'Python: maile Vinted → Excel (raporty sprzedaży)',
        ],
        screenshots: [
          { alt: 'Kamochi — strona główna' },
          { alt: 'Katalog produktów — Galoty' },
          { alt: 'Sekcja marek — Akademiks' },
          { alt: 'Polski hip-hop amerykański' },
          { alt: 'Spodnie baggy — Wild Leg' },
        ],
      },
      legitcheck: {
        name: 'LegitCheck',
        tagline: 'AI weryfikacja autentyczności streetwear i luxury',
        description:
          'Aplikacja mobilna porównująca zdjęcia użytkownika z bazą referencyjną authentic/fake. Gemini analizuje detale produktu i zwraca werdykt z uzasadnieniem — niszowe computer vision poza typowymi chatbotami.',
        role: 'Autor produktu & implementacja mobile',
        infrastructure: [
          'Supabase — storage zdjęć referencyjnych',
          'EAS Build + GitHub Actions (Android)',
          'Google Play — com.legitcheck.app',
          'i18n, React Native Paper (MD3)',
        ],
        features: [
          'Porównanie zdjęć user vs baza authentic/fake',
          'Gemini analyzeAuthenticity() w produkcji',
          'Baza referencyjna w Supabase Storage',
          'Produkt mobilny z CI/CD — nie skrypt jednorazowy',
          'Niszowy use case AI w streetwear/luxury',
        ],
        screenshots: [],
      },
      stylerank: {
        name: 'StyleRank',
        tagline: 'Tier listy mody — drag-and-drop, ranking globalny, eksport',
        description:
          'Prosta, ale dopracowana aplikacja webowa do tworzenia tier list produktów i stylów. Drag-and-drop z @dnd-kit, tryb turniejowy, globalny ranking Elo i eksport listy do JPG — z katalogiem marek w Supabase i wdrożeniem na stylerank.pl.',
        role: 'Creator & Full-stack Developer',
        infrastructure: [
          'Vercel — stylerank.pl, PWA',
          'Supabase — znormalizowany katalog, RLS, ranking globalny',
          'IndexedDB — autosave lokalny + merge z chmurą',
          'Puppeteer — scrapery marek (Pandora, Swarovski, Vivienne Westwood)',
        ],
        features: [
          'Tier listy z drag-and-drop i trybem turniejowym',
          'Globalny ranking Elo — głosowanie multiplayer',
          'Eksport JPG i udostępnianie przez Web Share API',
          'Katalog marek luxury w Supabase + panel admina',
          'Dopracowany UI — glass, złote akcenty, mobile-first',
        ],
        screenshots: [
          { alt: 'StyleRank — strona główna' },
          { alt: 'Tier listy — bransoletki' },
          { alt: 'Tryb turniejowy — VS' },
        ],
      },
    },
  },
  experience: {
    label: 'Doświadczenie',
    title: 'Kariera w skrócie',
    subtitle:
      'Od Assembless po TransitRank i Kamochi — plus matura 2025 i studia na Uczelni Łazarskiego.',
    educationLabel: 'Wykształcenie',
    educationTitle: 'Matura i studia',
    educationSubtitle:
      'Liceum ogólnokształcące z maturą 2025 oraz studia licencjackie na Uczelni Łazarskiego.',
    items: {
      transitrank: {
        role: 'Lead Mobile Developer & Backend Architect',
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
      assembless: {
        role: 'Fullstack Engineer',
        period: 'Czerwiec 2023 — Kwiecień 2025',
        highlights: [
          'Front-end, back-end i UI/UX w międzynarodowym zespole pod mentoringiem seniorów',
          'Aplikacje komercyjne i open-source na dużą skalę — TypeScript, React, Node.js',
          'Współtworzenie architektury produktów webowych i mobilnych w procesie Agile/Scrum',
          'Integracje API, nowoczesne struktury projektów i code review w zespole rozproszonym',
        ],
      },
      kamochi: {
        role: 'Founder & Full-stack Developer',
        period: 'Styczeń 2025 — obecnie',
        highlights: [
          'Założyciel jednego z największych vintage skate shopów w Polsce — kamochi.pl',
          'Next.js storefront + Firebase, feed statyczny na CDN — optymalizacja kosztów Firestore',
          'Fly.io (WAW): scraper Vinted i serwer powiadomień w czasie rzeczywistym',
          'RPA Puppeteer — publikacja na Vinted/Grailed, desktop Electron + Socket.io',
          'Mobile z IAP, raporty finansowe Python → Excel, GitHub Actions',
        ],
      },
    },
    education: {
      lazarski: {
        school: 'Uczelnia Łazarskiego',
        degree: 'Administracja — specjalizacja Administrowanie Ruchem Dronów',
        period: 'X 2025 — obecnie',
        form: 'Studia I stopnia, niestacjonarne',
        highlights: [
          'Lazarski Aviation Academy — program lotniczy Uczelni Łazarskiego',
          'Prawo dronów, zarządzanie operacjami BSP, analiza ryzyk',
          'AI, IoT i analiza danych w kontekście przestrzeni powietrznej',
        ],
      },
      'lo-curie': {
        school: 'I Liceum Ogólnokształcące im. Marii Skłodowskiej-Curie',
        degree: 'Liceum ogólnokształcące — matura 2025',
        period: 'IX 2022 — V 2025',
        form: 'Egzamin maturalny',
        highlights: [
          'Rozszerzenia: fizyka, matematyka, język angielski',
          'Angielski — swobodna komunikacja w zespole międzynarodowym',
        ],
      },
    },
  },
  skills: {
    label: 'Umiejętności',
    title: 'Stack technologiczny',
    subtitle:
      'Bun, React Native, Kubernetes, Gemini i Puppeteer — stack powtarzalny w moich produktach.',
    groups: {
      core: { label: 'Core Development' },
      data: { label: 'Dane & Chmura' },
      devops: { label: 'DevOps & Infra' },
      ai: { label: 'AI & Automatyzacja' },
      design: { label: 'Design & Metodyki' },
    },
  },
  contact: {
    label: 'Kontakt',
    title: 'Porozmawiajmy o współpracy',
    subtitle: 'Full-stack · mobile · AI',
    email: 'Email',
    phone: 'Telefon',
    github: 'GitHub',
    location: 'Lokalizacja',
    workMode: 'Forma pracy',
    ctaEmail: 'Napisz wiadomość',
    ctaGithub: 'Zobacz GitHub',
  },
  footer: {
    contactLinks: 'Linki kontaktowe',
    contact: 'Kontakt',
  },
  profile: {
    location: 'Sokołów Podlaski, Polska',
    workMode: 'B2B / UoP · remote · hybryda',
    english: 'Angielski · B2',
    availability: 'Full-stack · mobile · AI',
    summary:
      'Full-Stack Software Engineer w ekosystemie TypeScript (React, React Native, Bun). Projektuję skalowalne architektury, pipeline’y danych transportowych (GTFS, ETL) i integracje AI w produkcji. Matura 2025, studia na Uczelni Łazarskiego.',
  },
  locale: {
    switchTo: 'Zmień język',
    pl: 'PL',
    en: 'EN',
  },
  lightbox: {
    close: 'Zamknij podgląd',
    prev: 'Poprzedni zrzut',
    next: 'Następny zrzut',
  },
};
