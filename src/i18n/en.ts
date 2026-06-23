import type { Translations } from './types';

export const en: Translations = {
  meta: {
    title: 'Mikołaj Mikołajczuk — Portfolio',
    description:
      'Mikołaj Mikołajczuk — Software Engineer. TransitRank, Forkfull, Kamochi.',
  },
  nav: {
    aria: 'Main navigation',
    about: 'About',
    projects: 'Projects',
    career: 'Career',
    skills: 'Skills',
    contact: 'Contact',
    openMenu: 'Open menu',
    closeMenu: 'Close menu',
  },
  hero: {
    badge: 'Full-Stack · TypeScript · Mobile',
    greeting: 'Player select',
    characterClass: 'Class: Software Engineer · GTFS / AI',
    summary:
      'You select Mikołaj: a full-stack engineer who designs scalable TypeScript architectures, builds public-transport data pipelines, and ships products from backend to mobile apps with production AI.',
    skillPanelAria: 'Character skill levels',
    skillHeader: 'Skill stats',
    skillBuild: 'High level build',
    skills: [
      { label: 'Frontend', value: 97 },
      { label: 'Backend', value: 94 },
      { label: 'Mobile', value: 96 },
      { label: 'Data / ETL', value: 90 },
    ],
    ctaProjects: 'View projects',
    ctaConfirm: 'Confirm',
    meshLoading: 'Loading animation…',
  },
  about: {
    label: 'About',
    title: 'Scalable systems from UI to the data layer',
    subtitle:
      'Full-Stack Software Engineer in the TypeScript ecosystem (React, React Native, Bun). I design scalable architectures, public-transport data pipelines (GTFS, ETL), and production AI integrations. High school diploma 2025, studies at Lazarski University.',
    location: 'Location',
    specialization: 'Specialization',
    specializationValue: 'TypeScript · K8s · AI Mobile',
    language: 'Language',
    workMode: 'Work arrangement',
    github: 'GitHub',
    availability: 'Availability',
    paletteLabel: 'Palette · site theme',
    paletteAria: 'Accent color picker',
  },
  projects: {
    label: 'Projects',
    title: 'Products I design and ship',
    subtitle:
      'Five ecosystems — from Kubernetes and transport APIs, through AI mobile apps, to e-commerce with automation.',
    infrastructure: 'Infrastructure',
    zoomHint: 'Click to enlarge',
    zoomAria: 'Enlarge screenshot',
    thumbAria: 'Preview',
    placeholderHint: 'Project preview',
    items: {
      transitrank: {
        name: 'TransitRank',
        tagline: 'Public transport platform — mobile, web, and two APIs',
        description:
          'A four-repository ecosystem for UK bus passengers. I created the TransitRank logo. Mobile and web combine community reviews, gamification (XP, perks), trip planning, and a headless store. The backend aggregates BODS, GTFS Realtime, and OpenTripPlanner data, with an AI layer for report analysis.',
        role: 'Lead Mobile Developer & Backend Architect',
        infrastructure: [
          'Kubernetes/k3s — prod, staging, and preview per PR',
          'GitHub Actions → custom Docker registry',
          'Domains: trips.transitrank.co.uk + PR environments',
          'Docker Compose with Redis, 100+ automated tests',
          'Integrations: BODS API, GTFS-RT, Stripe, WooCommerce',
        ],
        features: [
          'Original TransitRank logo',
          '4 repositories: mobile, web, trips-api, timetable-api',
          'RAPTOR routing and delay algorithms',
          'Gamification, moderation, and network analytics',
          'Web push and disruption notifications',
          'Headless e-commerce with Stripe',
        ],
        screenshots: [
          { alt: 'TransitRank dashboard' },
          { alt: 'Community reviews' },
          { alt: 'Adding a review' },
          { alt: 'Trip planner' },
          { alt: 'More menu' },
        ],
      },
      forkfull: {
        name: 'Forkfull',
        tagline: 'Mindful nutrition — AI, local-first, subscriptions',
        description:
          'A mobile macro-tracking app with meal analysis from photos via Gemini. Privacy-first architecture: SQLite locally, optional cloud sync. Meal Copilot, Health Connect, and Premium plans through RevenueCat.',
        role: 'Co-creator of architecture & implementation',
        infrastructure: [
          'Firebase Cloud Functions (Node 22) — analyzeMeal, chatMeal',
          'Firebase Auth + Firestore (optional sync)',
          'EAS Build — dev, prod, and APK profiles',
          'Landing on Fly.io (Frankfurt) — Docker + Nginx',
          'i18n PL / EN / DE, Health Connect (Android)',
        ],
        features: [
          'AI analysis from photos — Gemini in production',
          'Local SQLite data, sync when the user wants',
          'Meal Copilot and Basic / Premium plans',
          'Version 2.19 — mature mobile product',
          'Material Design 3, FlashList, offline-first',
        ],
        screenshots: [
          { alt: 'Home screen with daily intake' },
          { alt: 'Meal preview from photo' },
          { alt: 'Detailed ingredient breakdown' },
          { alt: 'Daily goal and progress view' },
          { alt: 'Profile and health metrics' },
        ],
      },
      kamochi: {
        name: 'Kamochi',
        tagline: 'One of Poland’s largest vintage skate shops',
        description:
          'I founded Kamochi — one of Poland’s largest vintage skate shops. The e-commerce ecosystem includes a Next.js storefront, real-time Vinted scraping, a desktop app with notifications, RPA listing publishing, and financial reports — one funnel from product to checkout.',
        role: 'Founder & Full-stack Developer',
        infrastructure: [
          'Fly.io — scraper and notification server (WAW region)',
          'Electron + Socket.io — desktop real-time alerts',
          'Puppeteer RPA — Vinted, Grailed, auto-pricing',
          'Static JSON feed on CDN — Firestore cost optimization',
          'Windows/Linux installers, GitHub Actions',
        ],
        features: [
          'One of Poland’s largest vintage skate shops',
          'Next.js store + Firestore with static feed',
          'Scraper with auto-restart and stealth Puppeteer',
          'Listing generator: photos → descriptions → publish',
          'Mobile “Quick Listings” with IAP',
          'Python: Vinted emails → Excel (sales reports)',
        ],
        screenshots: [
          { alt: 'Kamochi — homepage' },
          { alt: 'Product catalog — Galoty' },
          { alt: 'Brands section — Akademiks' },
          { alt: 'Polish American hip-hop' },
          { alt: 'Baggy pants — Wild Leg' },
        ],
      },
      legitcheck: {
        name: 'LegitCheck',
        tagline: 'AI authenticity verification for streetwear and luxury',
        description:
          'A mobile app comparing user photos with an authentic/fake reference database. Gemini analyzes product details and returns a verdict with reasoning — niche computer vision beyond typical chatbots.',
        role: 'Product author & mobile implementation',
        infrastructure: [
          'Supabase — reference photo storage',
          'EAS Build + GitHub Actions (Android)',
          'Google Play — com.legitcheck.app',
          'i18n, React Native Paper (MD3)',
        ],
        features: [
          'User photos vs authentic/fake reference base',
          'Gemini analyzeAuthenticity() in production',
          'Reference database in Supabase Storage',
          'Mobile product with CI/CD — not a one-off script',
          'Niche AI use case in streetwear/luxury',
        ],
        screenshots: [],
      },
      stylerank: {
        name: 'StyleRank',
        tagline: 'Fashion tier lists — drag-and-drop, global ranking, export',
        description:
          'A simple but polished web app for creating product and style tier lists. Drag-and-drop with @dnd-kit, tournament mode, global Elo ranking, and JPG export — with a brand catalog in Supabase and deployment at stylerank.pl.',
        role: 'Creator & Full-stack Developer',
        infrastructure: [
          'Vercel — stylerank.pl, PWA',
          'Supabase — normalized catalog, RLS, global ranking',
          'IndexedDB — local autosave + cloud merge',
          'Puppeteer — brand scrapers (Pandora, Swarovski, Vivienne Westwood)',
        ],
        features: [
          'Tier lists with drag-and-drop and tournament mode',
          'Global Elo ranking — multiplayer voting',
          'JPG export and sharing via Web Share API',
          'Luxury brand catalog in Supabase + admin panel',
          'Polished UI — glass, gold accents, mobile-first',
        ],
        screenshots: [
          { alt: 'StyleRank — homepage' },
          { alt: 'Tier lists — bracelets' },
          { alt: 'Tournament mode — VS' },
        ],
      },
    },
  },
  experience: {
    label: 'Experience',
    title: 'Career at a glance',
    subtitle:
      'From Assembless to TransitRank and Kamochi — plus high school diploma 2025 and studies at Lazarski University.',
    educationLabel: 'Education',
    educationTitle: 'High school & university',
    educationSubtitle:
      'General secondary school with diploma 2025 and bachelor’s studies at Lazarski University.',
    items: {
      transitrank: {
        role: 'Lead Mobile Developer & Backend Architect',
        period: 'May 2025 — present',
        highlights: [
          'Logo author and 4-repo ecosystem: mobile, web, trips-api, timetable-api',
          'Kubernetes/k3s, GitHub Actions, preview per PR, custom Docker registry',
          'Bun + Hono, Redis, Supabase/PostgreSQL, OpenTripPlanner, BODS API',
          'Delay algorithms, RAPTOR routing, GTFS Realtime — transport data layer',
          '100+ automated tests, React Native, Zustand, gamification',
          'LLM for community report moderation in production',
        ],
      },
      assembless: {
        role: 'Fullstack Engineer',
        period: 'June 2023 — April 2025',
        highlights: [
          'Front-end, back-end, and UI/UX in an international team under senior mentorship',
          'Commercial and open-source apps at scale — TypeScript, React, Node.js',
          'Co-creating architecture for web and mobile products in Agile/Scrum',
          'API integrations, modern project structures, and code review in a distributed team',
        ],
      },
      kamochi: {
        role: 'Founder & Full-stack Developer',
        period: 'January 2025 — present',
        highlights: [
          'Founder of one of Poland’s largest vintage skate shops — kamochi.pl',
          'Next.js storefront + Firebase, static feed on CDN — Firestore cost optimization',
          'Fly.io (WAW): Vinted scraper and real-time notification server',
          'Puppeteer RPA — publishing on Vinted/Grailed, Electron desktop + Socket.io',
          'Mobile with IAP, Python financial reports → Excel, GitHub Actions',
        ],
      },
    },
    education: {
      lazarski: {
        school: 'Lazarski University',
        degree: 'Administration — UAV Operations Management specialization',
        period: 'Oct 2025 — present',
        form: 'Bachelor’s degree, part-time',
        highlights: [
          'Lazarski Aviation Academy — university aviation program',
          'Drone law, UAV operations management, risk analysis',
          'AI, IoT, and data analysis in airspace context',
        ],
      },
      'lo-curie': {
        school: 'Maria Skłodowska-Curie High School',
        degree: 'General secondary school — diploma 2025',
        period: 'Sep 2022 — May 2025',
        form: 'Matura exam',
        highlights: [
          'Extended subjects: physics, mathematics, English',
          'English — fluent communication in international teams',
        ],
      },
    },
  },
  skills: {
    label: 'Skills',
    title: 'Tech stack',
    subtitle:
      'Bun, React Native, Kubernetes, Gemini, and Puppeteer — a stack repeated across my products.',
    groups: {
      core: { label: 'Core Development' },
      data: { label: 'Data & Cloud' },
      devops: { label: 'DevOps & Infra' },
      ai: { label: 'AI & Automation' },
      design: { label: 'Design & Methods' },
    },
  },
  contact: {
    label: 'Contact',
    title: 'Let’s talk about working together',
    subtitle: 'Full-stack · mobile · AI',
    email: 'Email',
    phone: 'Phone',
    github: 'GitHub',
    location: 'Location',
    workMode: 'Work arrangement',
    ctaEmail: 'Send a message',
    ctaGithub: 'View GitHub',
  },
  footer: {
    contactLinks: 'Contact links',
    contact: 'Contact',
  },
  profile: {
    location: 'Sokołów Podlaski, Poland',
    workMode: 'B2B / employment · remote · hybrid',
    english: 'English · B2',
    availability: 'Full-stack · mobile · AI',
    summary:
      'Full-Stack Software Engineer in the TypeScript ecosystem (React, React Native, Bun). I design scalable architectures, public-transport data pipelines (GTFS, ETL), and production AI integrations. High school diploma 2025, studies at Lazarski University.',
  },
  locale: {
    switchTo: 'Change language',
    pl: 'PL',
    en: 'EN',
  },
  lightbox: {
    close: 'Close preview',
    prev: 'Previous screenshot',
    next: 'Next screenshot',
  },
};
