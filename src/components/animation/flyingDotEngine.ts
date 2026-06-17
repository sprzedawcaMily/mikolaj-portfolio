import type { MeshZone } from '@/hooks/meshScrollEngine';
import {
  computeAllZonePins,
  CONTACT_CTA_ANCHOR_ID,
  CONTACT_MESH_ANCHOR_ID,
  PALETTE_MESH_ANCHOR_ID,
  pinForZonePins,
  refreshMeshZoneAfterViewportChange,
  pinCommittedMeshZone,
  resolveActiveMeshZone,
  type MeshPinState,
} from '@/hooks/meshScrollEngine';
import type { PaletteTone } from '@/components/animation/mesh/parsePaletteMesh';
import {
  clearPaletteLayoutCache,
  createEmptyDotAtlas,
  ensureAtlasZones,
  roundAtlasCanvas,
  zoneLayout,
  type DotAtlas,
  type MeshReflector,
} from '@/components/animation/mesh/meshDotAtlas';
import { getPaletteToneColors, type PaletteToneColors } from '@/theme/paletteEngine';
import { layoutFaceOnCanvas } from '@/components/animation/mesh/faceMesh';
import type { MeshBundle, MorphEdge, NormPt } from '@/components/animation/mesh/morph/types';
import type { SvgMesh } from '@/components/animation/mesh/svgMesh';
import {
  buildWarpedWhiteZonePath,
  EYE_VIEWBOX,
  pointInEyeIris,
} from '@/components/animation/parseKamochiEyeSvg';
import { snapshotFromZoneLayout } from '@/components/animation/mesh/morph/zoneSnapshot';
import {
  armEyeFirstBlink,
  deactivateAllEyeBlink,
  eyeBlinkCover,
  eyeBlinkSquash,
  eyeBlinkSquashY,
  eyeBlinkStretchX,
  eyeBlinkStretchXPos,
  readEyeFirstBlinkArmed,
  readEyeIrisRevealUnlocked,
  resetEyeIrisReveal,
  setEyeBlinkActive,
  stepEyeBlink,
  stepEyeIrisReveal,
} from '@/components/animation/eyeBlink';
import { publishMeshMotionState } from '@/hooks/meshMotionState';
import { publishMeshZone, readMeshZone } from '@/hooks/meshZoneStore';
import { isMeshLiteMode, isMeshReducedMotion, isMeshSlowMode } from '@/hooks/meshPerfMode';
import {
  isPerfMonitorEnabled,
  logPerfEvent,
  publishMeshPerfStats,
  publishTickPhases,
  recordAtlasBuild,
  setTickSpikeContext,
} from '@/hooks/meshPerfStats';

function easeOutEmphasized(t: number) {
  const c = Math.max(0, Math.min(1, t));
  return 1 - (1 - c) ** 2.2;
}

export type ViewportGoal = { x: number; y: number };

export type FlyingDot = {
  id: string;
  hostId: number | null;
  el: HTMLSpanElement;
  x: number;
  y: number;
  srcX: number;
  srcY: number;
  tgtX: number;
  tgtY: number;
  flightU: number;
  flightDist: number;
  /** Czas trwania lotu (s) — wspólny tempo morphu. */
  flightDur: number;
  speedMul: number;
  departLeft: number;
  alphaHoldLeft: number;
  arcPx: number;
  /** Punkt w zbitnej masie (src → blob → tgt). */
  hubX: number;
  hubY: number;
  gatherCx: number;
  gatherCy: number;
  /** Oś smugi — kierunek podłużnej linii lotu. */
  streakUx: number;
  streakUy: number;
  gatherPath: boolean;
  /** Prosty lot liniowy — budowa twarzy bez smugi / blobu. */
  simpleFlight: boolean;
  alpha: number;
  tgtAlpha: number;
  isHair: boolean;
  hairMix: number;
  tgtHairMix: number;
  /** Przesunięcie wizualne w hero (mysz, mruganie, kołysanie). */
  displayOx: number;
  displayOy: number;
  /** Cel interpolacji przy pointerze — liczony co 2. klatkę. */
  faceTgtOx: number;
  faceTgtOy: number;
  /** 0–1: lokalne podświetlenie kolorem motywu (bliskość kursora). */
  pointerTint: number;
  /** Ostatni klucz paintDot — pomija zbędne zapisy DOM. */
  paintKey?: string;
  /** Rozbłysk po osadzeniu kropki (performance.now). */
  settleBloomAt: number;
  /** 0 po locie → 1: płynne wejście kołysania / driftu bez skoku pozycji. */
  idleMotionBlend: number;
  /** Reflektor autobusu (czerwona kropka w SVG). */
  isReflector: boolean;
  reflectorPhase: number;
  reflectorR: number;
  reflectorHostId: number | null;
  /** Ton kropki w strefie palette (kolory z motywu). */
  paletteTone: PaletteTone | null;
};

export type ScrollBuildDir = 'up' | 'down';

export type FlyingPool = {
  dots: Map<string, FlyingDot>;
  layoutScale: number;
  tgtLayoutScale: number;
  activeZone: MeshZone | null;
  pinKey: string;
  wireEdges: MorphEdge[];
  /** Kreski poprzedniej strefy — gasną w trakcie morphu. */
  retiringWireEdges: MorphEdge[];
  retiringWireZone: MeshZone | null;
  /** Kierunek fali przy ostatniej zmianie strefy. */
  buildWaveDir: ScrollBuildDir;
  activeLayoutKey: string;
  blinkAt: number;
  nextBlinkAt: number;
  viewportKey: string;
  /** Czas zbiorczego rozbłysku po zakończeniu morphu. */
  morphBloomAt: number;
  morphFlying: boolean;
  /** Przesunięcie oddechu palety w stronę / od kropki pickera (px, doc). */
  paletteBreathOx: number;
  paletteBreathOy: number;
  /** hostId → ton koloru kropki palety. */
  paletteTones: Map<number, PaletteTone>;
  /** p:nodeId → ton kropki SVG palety. */
  paletteSplatTones: Map<string, PaletteTone>;
  /** hostId → pozycja plamy farby w układzie stage (px). */
  paletteToneAnchors: Map<number, { x: number; y: number }>;
  eyeFrameOx: number;
  eyeFrameOy: number;
  eyeFrameScale: number;
  eyeFrameScaleX: number;
  eyeFrameScaleY: number;
  eyeFrameReady: boolean;
  /** Białe tło — deformowane z dryfem kropek obrysu. */
  eyeHullPathD: string;
  eyeHullSmoothOffsets: { dx: number; dy: number }[] | null;
  /** Oko — czeka aż slot wejdzie w viewport zanim ruszy morph. */
  /** Oko zbudowane w tej sesji — blokuje natychmiastowy buildT=1. */
  /** Aktywne chmury farby ze spreju (mini-mesh na canvasie). */
  sprayBursts: SprayBurst[];
  sprayNextBurstAt: number;
  sprayBurstToneIdx: number;
  /** Jednorazowe wyczyszczenie śladu spreju po zmianie strefy. */
  sprayFootprintPending: boolean;
  /** Pomija malowanie co N-tą klatkę gdy kształt ustalony. */
  idlePaintPhase: number;
  /** Pomija cały tick na statycznych kartach projektów. */
  idleTickPhase: number;
  /** Morph strefy w toku — kontynuacja w kolejnych klatkach (scroll nie blokuje się na 50 ms). */
  zoneSyncPending: ZoneSyncPending | null;
  /** scrollY w momencie startu sync — odblokowanie przy wyraźnym cofnięciu scrolla. */
  syncScrollAnchorY: number;
  /** Docelowa strefa ze scrolla — stosowana dopiero po zatrzymaniu przewijania. */
  pendingScrollZone: MeshZone | null;
  /** Aktywne kropki do malowania — bez pełnego skanu pool.dots. */
  paintDotIds: string[];
  /** Kropki twarzy / włosów — tylko dla applyHeroFaceMotion. */
  faceMotionDotIds: string[];
  /** Kropki w zasięgu kursora — tylko dla lerp displayOx/Oy. */
  faceInfluencedIds: string[];
  /** Cache dotA/dotB per krawędź — hero paintWires bez poolDotForEdge × 1360. */
  heroWirePairs: { edge: MorphEdge; dotA: FlyingDot; dotB: FlyingDot }[];
  /** 0→1 po morphu — wygładza przejście morph → animacja hero. */
  heroLiveBlend: number;
  /** Spany odłączone na czas scrollLite — bez pętli detach × N klatek. */
  scrollCanvasDetached: boolean;
};

type ZoneSyncPending = {
  zone: MeshZone;
  zoneChanged: boolean;
  layout: ZoneViewportLayout;
  prevZoneIds: Set<string>;
  entries: [string, ViewportGoal][];
  index: number;
  activeIds: Set<string>;
  flightStarts: string[];
  reflectorById: Map<number, MeshReflector>;
  visibleBefore: Set<string>;
  hostOrder: number[];
  leavingHero: boolean;
  buildingShape: boolean;
  dotFragment: DocumentFragment;
  batchNewDots: boolean;
  size: number;
  waveDir: ScrollBuildDir;
};

const SYNC_BUDGET_SCROLL_MS = 6;
const SYNC_BUDGET_IDLE_MS = 48;

const STATIC_CARD_ZONES = new Set<MeshZone>(['bus', 'fork', 'spray', 'loupe', 'ring']);

type SprayNode = {
  along: number;
  across: number;
  delay: number;
};

type SprayEdge = { a: number; b: number };

type SprayBurstBasis = {
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  perpX: number;
  perpY: number;
};

type SprayBurst = {
  startTime: number;
  wireColor: string;
  dirX: number;
  dirY: number;
  perpX: number;
  perpY: number;
  nodes: SprayNode[];
  edges: SprayEdge[];
  dotR: number;
};

export type FacePointer = {
  x: number;
  y: number;
  active: boolean;
  screenX: number;
  screenY: number;
  screenActive: boolean;
};

export const IDLE_FACE_POINTER: FacePointer = {
  x: 0,
  y: 0,
  active: false,
  screenX: 0,
  screenY: 0,
  screenActive: false,
};

const DOT_ALPHA = 0.92;
const DOT_GRAY = '#d9d9d9';
/** Twarz hero — ten sam pipeline co pozostałe meshe (faceMesh + atlas). */
const HERO_FACE_DOT = '#d9d9d9';
const MESH_WIRE_STROKE = 'rgba(255,255,255,0.92)';
const MESH_WIRE_HEX = '#ffffff';
const HERO_HAIR_TONE = '#9aa6b5';
const HERO_HAIR_ACCENT_MIX = 0.9;
const HERO_HAIR_WIRE_ACCENT_MIX = 0.8;
/** Rozmycie gaussa podświetlenia kursora (px, stage). */
const HERO_POINTER_SIGMA = 76;
const ALPHA_SPEED = 7.5;
const SCALE_SPEED = 5;
/** Morph — wolno, wspólnie, majestatyczne lądowanie. */
const FLIGHT_DURATION_S = 2.28;
/** Budowa twarzy — krótszy, równoległy lot bez efektów smugi. */
const HERO_FLIGHT_DURATION_S = 1.35;
/** Budowa powieki — widoczny lot równoległy. */
const EYE_FLIGHT_DURATION_S = 2.15;
const CRUMBLE_FLIGHT_DURATION_S = 2.35;
const MORPH_DEPART_JITTER_S = 0.028;
/** Rozpiętość startu kropek w smudze (s) — tylne wyskakują później. */
const STREAK_DEPART_SPAN_S = 0.72;
/** Jak mocno ściskać smugę prostopadle do kierunku lotu (0 = linia). */
const STREAK_CROSS_COMPRESS = 0.14;
const CRUMBLE_DEPART_SPAN_S = 0.14;
/** Rozpad starych kropek przy zmianie strefy — wolniejsza fala niż twarz. */
const ZONE_EXIT_DEPART_SPAN_S = 0.42;
const ZONE_EXIT_DRIFT_Y = 26;
const CRUMBLE_DRIFT_Y = 40;
const HAIR_COLOR_SPEED = 4.2;
/** Sprej Kamochi — chmura z czerwonej kropki (dziubek): kropki + kreski jak mesh. */
const SPRAY_SVG_W = 561;
const SPRAY_SVG_H = 1712;
/** Czerwona kropka na dyszce w sprej.svg (fallback gdy brak reflektora). */
const SPRAY_NOZZLE_NORM: NormPt = { nx: 222.5 / SPRAY_SVG_W, ny: 45.5 / SPRAY_SVG_H };
/** Kierunek strzału — w lewo od dyszki (SVG). */
const SPRAY_AIM_NORM: NormPt = { nx: 38 / SPRAY_SVG_W, ny: 50 / SPRAY_SVG_H };
const SPRAY_AIM_LEFT_NORM_OFFSET = 0.3;
const SPRAY_BURST_MS = 4400;
const SPRAY_BURST_EXPAND = 2.7;
/** Rozszerzanie chmury: wąsko przy dyszce → coraz szerszy stożek w trakcie lotu. */
const SPRAY_BURST_LATERAL_START = 0.18;
const SPRAY_BURST_LATERAL_END = 1.38;
/** >1 — łagodne puchnięcie pod koniec (bez gwałtownego skoku). */
const SPRAY_BURST_LATERAL_TIME_POWER = 1.18;
const SPRAY_BURST_FADE_START = 0.76;
const SPRAY_BURST_MIN_GAP_MS = 8200;
const SPRAY_BURST_GAP_SPAN_MS = 4600;
const SPRAY_BURST_FIRST_DELAY_MS = 3200;
/** Wolny, majestatyczny dojazd rozszerzania (wyższa potęga = spokojniej). */
const SPRAY_BURST_MAJESTIC_POWER = 3.15;
const SPRAY_BURST_TONES: PaletteTone[] = ['pink', 'green', 'yellow', 'blue', 'accent'];
const FLIGHT_ARC_PX = 14;
/** >1 — wolniejszy start/koniec; umiarkowany, bez „szarpnięć”. */
const FLIGHT_EASE_POWER = 1.38;
/** Smuga — szybciej przez środek, bardzo wolne lądowanie u celu. */
const STREAK_MID_SPLIT = 0.32;
const STREAK_PATH_SPLIT = 0.52;
const STREAK_MID_POWER = 1.06;
const STREAK_ARRIVE_POWER = 3.45;
/** Rozbłysk po osadzeniu kształtu (ms). */
const SETTLE_BLOOM_MS = 820;
const SETTLE_BLOOM_SCALE = 1.12;
const SETTLE_BLOOM_OPACITY = 0.1;
const REFLECTOR_IGNITE_DELAY_MS = SETTLE_BLOOM_MS + 220;
/** Rozpalenie reflektorów — fade-in bez skoku na końcu (ms). */
const REFLECTOR_IGNITE_MS = 920;
/** Lekkie przesunięcie między reflektorami (ms). */
const REFLECTOR_STAGGER_MS = 90;
const SETTLE_WIRE_BLOOM = 0.62;
/** Lekkie „ściągnięcie” poza fazą zbitnej masy. */
const FLIGHT_SHRINK = 0.04;
/** Delikatne powiększenie w środku smugi. */
const GATHER_BLOB_SCALE = 1.05;
const PHI = 0.618033988749895;
/** Konstelacja — każda kropka ma własny, wolny drift; wspólny sway minimalny. */
const STAR_DRIFT_PX = 2.15;
const STAR_SWAY_PX = 0.52;
const STAR_DRIFT_CARD = 1.22;
const STAR_DRIFT_PALETTE = 0.96;
const STAR_DRIFT_HERO = 0.72;
const STAR_DRIFT_HERO_FACE = 0.34;
/** Dodatkowy dryf po osadzeniu kształtu (statyczne karty / strzałka). */
const SETTLED_DRIFT_MUL = 1.28;
/** Czas wygładzenia wejścia w animację spoczynkową po lądowaniu (s). */
const IDLE_MOTION_BLEND_S = 0.42;
/** Morph → animacja hero: płynne wejście ruchu i linii (s). */
const HERO_LIVE_BLEND_S = 0.52;
const HERO_LIVE_MOTION_START = 0.85;
const HERO_DRIFT_LIVE_MUL = 0.78;
const HERO_LIVE_PRE_MUL = 0.42;
const STAR_WIRE_TWINKLE = 0.09;
const STAR_OPACITY_MIN = 0.84;
const STAR_SCALE_PULSE = 0.038;
const RING_SCALE_PULSE = 0.16;
const RING_GEM_GOLD = '#f2c96a';
const RING_GEM_DEEP = '#b8862e';
const RING_GEM_SPARK = '#fff9e8';
const RING_GEM_WHITE = '#ffffff';
/** ~2.4 s pełny cykl — wyraźnie widoczny oddech pierścionka. */
const RING_SHIMMER_HZ = 2.4;
const HERO_BLINK_FIRST_DELAY_MS = 5200;
const HERO_BLINK_MIN_GAP_MS = 9000;
const HERO_BLINK_GAP_SPAN_MS = 11000;

function starSeed(dot: FlyingDot) {
  const n = dot.hostId ?? [...dot.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return n * 0.381966011250105;
}


/** Offset gwiezdny — wchodzi pod koniec lotu, bez skoku po lądowaniu. */
function constellationPositionGate(dot: FlyingDot) {
  if (dot.alpha < 0.05 || dot.tgtAlpha < 0.05) return 0;
  if (dot.departLeft > 0.01) return 0;
  if (dotInFlight(dot)) {
    const u = dotTravelGate(dot);
    if (u < 0.8) return 0;
    return easeOutEmphasized((u - 0.8) / 0.2);
  }
  return 1;
}

/** Migotanie / glow — dopiero po pełnym osadzeniu w kształcie. */
function constellationShimmerGate(dot: FlyingDot) {
  if (dot.alpha < 0.05 || dot.tgtAlpha < 0.05) return 0;
  if (dot.departLeft > 0.01) return 0;
  if (dotInFlight(dot)) return 0;
  return 1;
}

function starDriftScale(zone: MeshZone, heroFaceActive: boolean) {
  if (zone === 'hero') return heroFaceActive ? STAR_DRIFT_HERO_FACE : STAR_DRIFT_HERO;
  if (!isMorphShapeZone(zone)) return 0;
  if (isEyeZone(zone)) return STAR_DRIFT_CARD;
  return zone === 'palette' ? STAR_DRIFT_PALETTE : STAR_DRIFT_CARD;
}

function starOffset(
  dot: FlyingDot,
  pool: FlyingPool,
  now: number,
  zone: MeshZone,
  heroFaceActive: boolean,
) {
  const gate = constellationPositionGate(dot);
  if (gate <= 0.02) return { ox: 0, oy: 0, gate: 0 };

  const seed = starSeed(dot);
  const scale = starDriftScale(zone, heroFaceActive);
  if (scale <= 0.02) return { ox: 0, oy: 0, gate: 0 };

  const settled = constellationShimmerGate(dot);
  const settleBlend = settled > 0.04 ? dot.idleMotionBlend : 0;
  const motionMul = 1 + (SETTLED_DRIFT_MUL - 1) * settleBlend;
  const drift = STAR_DRIFT_PX * scale * gate * motionMul;
  const f1 = 0.00038 + (seed % 1) * 0.00024;
  const f2 = 0.00034 + ((seed * PHI) % 1) * 0.00021;
  const p1 = seed * 2.13;
  const p2 = seed * 3.47;

  const ox =
    Math.sin(now * f1 + p1) * drift
    + Math.cos(now * f2 * 0.87 + p2) * drift * 0.68;
  const oy =
    Math.cos(now * f1 * 0.93 + p2) * drift
    + Math.sin(now * f2 + p1 * 0.71) * drift * 0.64;

  const shared = STAR_SWAY_PX * scale * gate * motionMul;
  const swayX = Math.sin(now * 0.00046) * shared;
  const swayY = Math.cos(now * 0.00042 + 0.6) * shared * 0.88;

  const blend = starMotionBlend(dot, zone, pool);
  return { ox: (ox + swayX) * blend, oy: (oy + swayY) * blend, gate: gate * blend };
}

const WIRE_BODY_ALPHA = 0.58;
const WIRE_HAIR_ALPHA = 0.66;
/** Zasięg łapania linii przez kropki (mnożnik bazowych limitów). */
const WIRE_CATCH_MUL = 1.25;
const WIRE_ARRIVE_PX = 8 * WIRE_CATCH_MUL;
/** Aktualna kreska max tyle razy dłuższa niż docelowa w meshu. */
const WIRE_LEN_RATIO = 1.18 * WIRE_CATCH_MUL;
const WIRE_LEN_RATIO_SETTLED = 1.32 * WIRE_CATCH_MUL;
const WIRE_HAIR_LEN_RATIO = 1.48 * WIRE_CATCH_MUL;
const WIRE_HAIR_LEN_RATIO_SETTLED = 1.62 * WIRE_CATCH_MUL;
const WIRE_SETTLE_MIN = 0.48;
const WIRE_SETTLE_MIN_SHAPE = 0.36;
const WIRE_ABS_MAX_PX = 58 * WIRE_CATCH_MUL;
/** Strzałka ma duży stage — krawędzie po uformowaniu. */
const WIRE_ABS_MAX_PALETTE_PX = 168 * WIRE_CATCH_MUL;
/** Karty projektów (autobus itd.) — dach i boki. */
const WIRE_ABS_MAX_CARD_PX = 96 * WIRE_CATCH_MUL;
/** Twardy limit rysowania — ochrona przed smugami przy spam-scrollu. */
const WIRE_DRAW_ABS_MAX_PX = 168 * WIRE_CATCH_MUL;
const SOFT_TGT_SHIFT_PX = 24;
/** Powolny oddech — cała strzałka jedzie w stronę / od kropki (bez skalowania). */

/** Strefy poza hero — luźniejsze limity kresek i mniej restartów lotu. */
const MORPH_SHAPE_ZONES = new Set<MeshZone>([
  'palette',
  'bus',
  'fork',
  'spray',
  'loupe',
  'ring',
  'careerEye',
  'skillsEye',
  'contactArrow',
]);

function isEyeZone(zone: MeshZone) {
  return zone === 'careerEye' || zone === 'skillsEye';
}

function isMorphShapeZone(zone: MeshZone) {
  return MORPH_SHAPE_ZONES.has(zone);
}

function zoneUsesCanvasDots(zone: MeshZone) {
  return zone === 'hero'
    || (isMorphShapeZone(zone) && zone !== 'palette')
    || zone === 'palette'
    || isEyeZone(zone);
}

function hideDotElement(dot: FlyingDot) {
  if (!dot.el.isConnected) return;
  dot.el.style.opacity = '0';
  dot.el.style.pointerEvents = 'none';
}

/** Canvas przejmuje rysowanie — odłącz osierocone spany DOM (memory + brak podwojenia). */
function detachDotElement(dot: FlyingDot) {
  hideDotElement(dot);
  if (dot.el.isConnected) dot.el.remove();
}

let cachedHeroFaceLayoutKey = '';
let cachedHeroFaceLayout: ReturnType<typeof layoutFaceOnCanvas> | null = null;

function heroFaceLayout(mesh: MeshBundle['faceMesh'], pin: MeshPinState) {
  const key = `${Math.round(pin.stageW)}:${Math.round(pin.stageH)}`;
  if (cachedHeroFaceLayoutKey === key && cachedHeroFaceLayout) return cachedHeroFaceLayout;
  cachedHeroFaceLayoutKey = key;
  cachedHeroFaceLayout = layoutFaceOnCanvas(mesh, pin.stageW, pin.stageH, 0.88);
  return cachedHeroFaceLayout;
}

function isStudioPaletyInView() {
  const section = document.getElementById('studio-palety');
  if (!section) return false;
  const rect = section.getBoundingClientRect();
  const vh = window.innerHeight;
  if (rect.bottom > 24 && rect.top < vh - 24) return true;

  const anchor = document.getElementById(PALETTE_MESH_ANCHOR_ID);
  if (!anchor) return false;
  const anchorRect = anchor.getBoundingClientRect();
  return anchorRect.bottom > 0 && anchorRect.top < vh;
}

type NormGoals = {
  goals: Map<string, NormPt>;
  layoutScale: number;
  edges: MorphEdge[];
  mergeMembers: Map<number, number>;
  reflectors: MeshReflector[];
  paletteTones: Map<number, PaletteTone>;
  paletteSplatTones: Map<string, PaletteTone>;
  paletteToneAnchors: Map<number, { x: number; y: number }>;
};
const normGoalsCache = new Map<string, NormGoals>();
const dotAtlasBySize = new Map<string, DotAtlas>();
let lastSyncLayoutMs = 0;
let lastSyncEnsureDotsMs = 0;
let atlasBuildThisTick = 0;

function clearNormGoalsCache() {
  normGoalsCache.clear();
  clearPaletteLayoutCache();
}

function atlasCacheKey(bundle: MeshBundle, w: number, h: number) {
  const zones = Object.keys(bundle.zoneMeshes).sort().join('|');
  return `${zones}:${w}x${h}`;
}

function ensureDotAtlas(
  bundle: MeshBundle,
  w: number,
  h: number,
  zones: readonly MeshZone[] = ['hero'],
): DotAtlas {
  const { w: rw, h: rh } = roundAtlasCanvas(w, h);
  const key = atlasCacheKey(bundle, rw, rh);
  let atlas = dotAtlasBySize.get(key);
  if (!atlas) {
    atlas = createEmptyDotAtlas(bundle.faceMesh, rw, rh);
    dotAtlasBySize.set(key, atlas);
    if (dotAtlasBySize.size > 18) {
      const oldest = dotAtlasBySize.keys().next().value;
      if (oldest) dotAtlasBySize.delete(oldest);
    }
  }

  const missing = zones.filter((z) => !atlas!.zones[z]);
  if (missing.length === 0) return atlas;

  const t0 = performance.now();
  ensureAtlasZones(atlas, bundle.faceMesh, bundle.zoneMeshes, rw, rh, missing);
  const builtMs = performance.now() - t0;
  atlasBuildThisTick = Math.max(atlasBuildThisTick, builtMs);
  if (builtMs >= 12) recordAtlasBuild(key, builtMs);
  return atlas;
}

type PrewarmJob = {
  bundle: MeshBundle;
  pins: NonNullable<ReturnType<typeof computeAllZonePins>>;
  zoneIndex: number;
  warmed: Set<string>;
};

let prewarmDone = false;
let prewarmJob: PrewarmJob | null = null;
let prewarmChunkId = 0;

const PREWARM_SLICE_MS = 14;

/** Oczy przed kartami — żeby buildDotAtlas nie trafiał w scroll. */
const PREWARM_ZONE_ORDER: MeshZone[] = [
  'hero',
  'careerEye',
  'skillsEye',
  'palette',
  'bus',
  'fork',
  'spray',
  'loupe',
  'ring',
  'contactArrow',
];

function runPrewarmSlice(deadline?: IdleDeadline) {
  const job = prewarmJob;
  if (!job) return;

  const budgetEnd = performance.now() + (
    deadline && deadline.timeRemaining() > 1
      ? Math.min(deadline.timeRemaining(), PREWARM_SLICE_MS)
      : PREWARM_SLICE_MS
  );

  while (job.zoneIndex < PREWARM_ZONE_ORDER.length && performance.now() < budgetEnd) {
    const zone = PREWARM_ZONE_ORDER[job.zoneIndex];
    const pin = pinForZonePins(job.pins, zone);
    const { w, h } = roundAtlasCanvas(pin.stageW, pin.stageH);
    const warmKey = `${zone}:${w}x${h}`;
    if (!job.warmed.has(warmKey)) {
      job.warmed.add(warmKey);
      ensureDotAtlas(job.bundle, pin.stageW, pin.stageH, zone === 'hero' ? ['hero'] : ['hero', zone]);
      if (performance.now() >= budgetEnd) break;
    }
    normGoalsForZone(zone, job.bundle, pin, job.pins.paletteAim, job.pins.paletteAim);
    job.zoneIndex += 1;
  }

  if (job.zoneIndex >= PREWARM_ZONE_ORDER.length) {
    prewarmDone = true;
    prewarmJob = null;
    publishMeshPerfStats({ prewarmDone: true });
    logPerfEvent('prewarm layoutów zakończony (chunked)', { zones: PREWARM_ZONE_ORDER.length });
    return;
  }

  if (typeof requestIdleCallback === 'function') {
    prewarmChunkId = requestIdleCallback(runPrewarmSlice, { timeout: 800 });
  } else {
    prewarmChunkId = window.setTimeout(() => runPrewarmSlice(), 0) as unknown as number;
  }
}

/** Po resize — atlasy i normGoals mogą mieć inne rozmiary. */
export function resetMeshPrewarm() {
  prewarmDone = false;
  prewarmJob = null;
  dotAtlasBySize.clear();
  clearNormGoalsCache();
  if (prewarmChunkId) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(prewarmChunkId);
    else window.clearTimeout(prewarmChunkId);
    prewarmChunkId = 0;
  }
}

/** Buduje layouty w tle — małe kawałki, bez 200 ms freeze na starcie. */
export function prewarmMeshLayouts(bundle: MeshBundle): boolean {
  if (prewarmDone) return true;

  const pins = computeAllZonePins();
  if (!pins) return false;

  if (prewarmJob?.bundle === bundle) return false;

  /* Hero — widoczny od razu; reszta w slice'ach idle (oczy przed kartami). */
  const heroPin = pinForZonePins(pins, 'hero');
  ensureDotAtlas(bundle, heroPin.stageW, heroPin.stageH, ['hero']);

  if (prewarmChunkId) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(prewarmChunkId);
    else window.clearTimeout(prewarmChunkId);
  }

  prewarmJob = { bundle, pins, zoneIndex: 0, warmed: new Set() };

  if (typeof requestIdleCallback === 'function') {
    prewarmChunkId = requestIdleCallback(runPrewarmSlice, { timeout: 1200 });
  } else {
    prewarmChunkId = window.setTimeout(() => runPrewarmSlice(), 16) as unknown as number;
  }

  return false;
}

function viewportLayoutKey() {
  const vv = window.visualViewport;
  const w = Math.round(vv?.width ?? window.innerWidth);
  const h = Math.round(vv?.height ?? window.innerHeight);
  const scale = Math.round((vv?.scale ?? 1) * 100);
  return `${w}x${h}x${scale}`;
}

function layerDocOffset(layer: HTMLElement) {
  const rect = layer.getBoundingClientRect();
  return { x: rect.left + window.scrollX, y: rect.top + window.scrollY };
}

function normToDocument(norm: NormPt, pin: MeshPinState): ViewportGoal {
  const ox = pin.stageW * 0.5;
  const oy = pin.stageH * 0.5;
  let lx = norm.nx * pin.stageW - ox;
  let ly = norm.ny * pin.stageH - oy;
  const rad = (pin.rotateDeg * Math.PI) / 180;
  if (pin.flipX) lx = -lx;
  if (Math.abs(rad) > 0.001) {
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const rx = lx * cos - ly * sin;
    const ry = lx * sin + ly * cos;
    lx = rx;
    ly = ry;
  }
  return {
    x: pin.docLeft + ox + lx,
    y: pin.docTop + oy + ly,
  };
}

function normCacheKey(zone: MeshZone, pin: MeshPinState, aimKey: string) {
  return `${zone}:${Math.round(pin.stageW)}:${Math.round(pin.stageH)}:${Math.round(pin.rotateDeg)}:${aimKey}`;
}

function normGoalsForZone(
  zone: MeshZone,
  bundle: MeshBundle,
  pin: MeshPinState,
  _paletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
  _pinsPaletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
): NormGoals | null {
  const cacheKey = normCacheKey(zone, pin, 'static');
  const cached = normGoalsCache.get(cacheKey);
  if (cached) return cached;

  const atlas = ensureDotAtlas(
    bundle,
    pin.stageW,
    pin.stageH,
    zone === 'hero' ? ['hero'] : ['hero', zone],
  );
  const snap = snapshotFromZoneLayout(zone, atlas, bundle.faceMesh, pin.stageW, pin.stageH);
  if (!snap) return null;

  const layout = zoneLayout(atlas, zone);
  const goals = new Map<string, NormPt>();
  for (const id of snap.mappedIds) {
    const norm = snap.goals.get(id);
    if (norm) goals.set(`h:${id}`, norm);
  }
  for (const ref of layout?.reflectors ?? []) {
    goals.set(`l:${ref.targetId}`, { nx: ref.nx, ny: ref.ny });
  }

  const edges: MorphEdge[] = [
    ...snap.edges,
    ...snap.supplementHostEdges,
    ...(isEyeZone(zone)
      ? []
      : (layout?.reflectorEdges ?? []).map((edge) => ({
          a: edge.a,
          b: edge.b,
          group: 'reflector' as const,
        }))),
  ];

  const result = {
    goals,
    layoutScale: snap.layoutScale,
    edges,
    mergeMembers: layout?.mergeMembers ?? new Map(),
    reflectors: layout?.reflectors ?? [],
    paletteTones: zone === 'palette' ? layout?.paletteTones ?? new Map() : new Map(),
    paletteSplatTones: new Map<string, PaletteTone>(),
    paletteToneAnchors: zone === 'palette' ? layout?.paletteToneAnchors ?? new Map() : new Map(),
  };
  normGoalsCache.set(cacheKey, result);
  if (normGoalsCache.size > 20) normGoalsCache.clear();
  return result;
}

type ZoneViewportLayout = {
  goals: Map<string, ViewportGoal>;
  layoutScale: number;
  mergeMembers: Map<number, number>;
  edges: MorphEdge[];
  reflectors: MeshReflector[];
  paletteTones: Map<number, PaletteTone>;
  paletteSplatTones: Map<string, PaletteTone>;
  paletteToneAnchors: Map<number, { x: number; y: number }>;
};

function viewportGoalsForZone(
  zone: MeshZone,
  bundle: MeshBundle,
  paletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
  pins: NonNullable<ReturnType<typeof computeAllZonePins>>,
): ZoneViewportLayout | null {
  const pin = pinForZonePins(pins, zone);
  const norms = normGoalsForZone(zone, bundle, pin, paletteAim, pins.paletteAim);
  if (!norms) {
    if (import.meta.env.DEV && isEyeZone(zone)) {
      console.warn(
        '[mesh] brak layoutu oka — zoneMeshes:',
        Object.keys(bundle.zoneMeshes).join(', ') || '(puste)',
      );
    }
    return null;
  }

  const goals = new Map<string, ViewportGoal>();
  for (const [id, norm] of norms.goals) {
    goals.set(id, normToDocument(norm, pin));
  }

  return {
    goals,
    layoutScale: norms.layoutScale,
    mergeMembers: norms.mergeMembers,
    edges: norms.edges,
    reflectors: norms.reflectors,
    paletteTones: norms.paletteTones,
    paletteSplatTones: norms.paletteSplatTones,
    paletteToneAnchors: norms.paletteToneAnchors,
  };
}

function sortedHostIds(goals: Map<string, ViewportGoal>) {
  return [...goals.keys()]
    .filter((key) => key.startsWith('h:'))
    .map((key) => Number(key.slice(2)))
    .filter((id) => Number.isFinite(id))
    .sort((a, b) => a - b);
}

let lastScrollY = typeof window !== 'undefined' ? window.scrollY : 0;
let scrollBuildDir: ScrollBuildDir = 'down';

/** Scroll w dół → fala od góry; w górę → od dołu. */
export function stepScrollBuildDir(): ScrollBuildDir {
  const y = window.scrollY;
  if (y > lastScrollY + 1) scrollBuildDir = 'down';
  else if (y < lastScrollY - 1) scrollBuildDir = 'up';
  lastScrollY = y;
  return scrollBuildDir;
}

function waveRanksByY(
  ids: string[],
  yOf: (id: string) => number,
  xOf: (id: string) => number,
  scrollDir: ScrollBuildDir,
) {
  const entries = ids.map((id) => ({ id, y: yOf(id), x: xOf(id) }));
  entries.sort((a, b) =>
    scrollDir === 'down'
      ? a.y - b.y || a.x - b.x
      : b.y - a.y || a.x - b.x,
  );
  const ranks = new Map<string, number>();
  entries.forEach((entry, index) => ranks.set(entry.id, index));
  return ranks;
}

/** Rozpad twarzy — kierunek zgodny ze scrollem. */
function crumbleRanksByCurrentY(
  pool: FlyingPool,
  ids: string[],
  scrollDir: ScrollBuildDir,
) {
  return waveRanksByY(
    ids,
    (id) => pool.dots.get(id)?.y ?? 0,
    (id) => pool.dots.get(id)?.x ?? 0,
    scrollDir,
  );
}

/** Nowa kropka startuje na rodzicu — niezauważalne podwojenie zamiast teleportu w cel. */
function findDuplicateSpawn(
  newId: string,
  pool: FlyingPool,
  visibleBefore: Set<string>,
  mergeMembers: Map<number, number>,
  hostOrder: number[],
): ViewportGoal | null {
  const pick = (id: string) => {
    const dot = pool.dots.get(id);
    if (!dot || dot.alpha < 0.04) return null;
    return { x: dot.x, y: dot.y };
  };

  if (!newId.startsWith('h:')) return null;
  const hostId = Number(newId.slice(2));
  if (!Number.isFinite(hostId)) return null;

  const leaderId = mergeMembers.get(hostId);
  if (leaderId != null) {
    const fromLeader = pick(`h:${leaderId}`);
    if (fromLeader) return fromLeader;
  }

  const idx = hostOrder.indexOf(hostId);
  for (let i = idx - 1; i >= 0; i -= 1) {
    const fromPrev = pick(`h:${hostOrder[i]}`);
    if (fromPrev) return fromPrev;
  }

  for (const id of visibleBefore) {
    const fromAny = pick(id);
    if (fromAny) return fromAny;
  }
  return null;
}

function pinLayoutKey(pins: NonNullable<ReturnType<typeof computeAllZonePins>>) {
  const parts: string[] = [];
  for (const zone of [
    'hero',
    'palette',
    'bus',
    'fork',
    'spray',
    'loupe',
    'ring',
    'careerEye',
    'skillsEye',
    'contactArrow',
  ] as MeshZone[]) {
    const pin = pinForZonePins(pins, zone);
    parts.push(
      `${zone}:${Math.round(pin.docLeft)}:${Math.round(pin.docTop)}:${Math.round(pin.stageW)}:${Math.round(pin.stageH)}:${Math.round(pin.rotateDeg)}`,
    );
  }
  return parts.join('|');
}

function activeZoneLayoutKey(
  zone: MeshZone,
  pins: NonNullable<ReturnType<typeof computeAllZonePins>>,
) {
  const pin = pinForZonePins(pins, zone);
  if (zone === 'contactArrow') {
    return `${Math.round(pin.docLeft / 8) * 8}:${Math.round(pin.docTop / 8) * 8}:${Math.round(pin.stageW)}:${Math.round(pin.stageH)}`;
  }
  return `${Math.round(pin.docLeft)}:${Math.round(pin.docTop)}:${Math.round(pin.stageW)}:${Math.round(pin.stageH)}:${Math.round(pin.rotateDeg)}`;
}

/** Resize / zoom / picker — snap do pinu; w locie tylko cel (chyba że zmienił się rozmiar stage). */
function syncRigidLayoutFollow(
  pool: FlyingPool,
  bundle: MeshBundle,
  zone: MeshZone,
  paletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
  pins: NonNullable<ReturnType<typeof computeAllZonePins>>,
  sizeChanged: boolean,
  _dt: number,
) {
  const layout = viewportGoalsForZone(zone, bundle, paletteAim, pins);
  if (!layout) return;

  pool.wireEdges = layout.edges;
  if (zone === 'hero') refreshHeroWirePairs(pool);
  else pool.heroWirePairs = [];
  pool.tgtLayoutScale = layout.layoutScale;
  pool.layoutScale = layout.layoutScale;
  if (zone === 'palette') {
    pool.paletteTones = layout.paletteTones;
    pool.paletteSplatTones = layout.paletteSplatTones;
    pool.paletteToneAnchors = layout.paletteToneAnchors;
  }

  for (const [id, goal] of layout.goals) {
    const dot = pool.dots.get(id);
    if (!dot || dot.tgtAlpha <= 0.03) continue;

    if (zone === 'palette' && dot.hostId != null) {
      dot.paletteTone = layout.paletteTones.get(dot.hostId) ?? 'wire';
    }

    dot.tgtX = goal.x;
    dot.tgtY = goal.y;

    const inFlight = dotInFlight(dot) || dot.departLeft > 0.01 || dot.flightU < 0.999;
    if (inFlight && !sizeChanged) {
      const rem = Math.hypot(dot.tgtX - dot.x, dot.tgtY - dot.y);
      if (rem > dot.flightDist) dot.flightDist = rem;
      continue;
    }

    dot.x = goal.x;
    dot.y = goal.y;
    dot.srcX = dot.x;
    dot.srcY = dot.y;
    dot.flightU = 1;
    dot.flightDist = 0;
    dot.departLeft = 0;
    dot.alphaHoldLeft = 0;
    if (sizeChanged) {
      dot.displayOx = 0;
      dot.displayOy = 0;
      dot.faceTgtOx = 0;
      dot.faceTgtOy = 0;
    }
    if (zone !== 'contactArrow') {
      dot.idleMotionBlend = 1;
    }
  }
}

function layoutStageSizeFromKey(key: string) {
  if (!key) return '';
  const p = key.split(':');
  return p.length >= 4 ? `${p[2]}:${p[3]}` : '';
}

function parseHex(hex: string) {
  const h = hex.replace('#', '').trim();
  if (h.length === 3) {
    return [
      parseInt(h[0] + h[0], 16),
      parseInt(h[1] + h[1], 16),
      parseInt(h[2] + h[2], 16),
    ] as const;
  }
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ] as const;
}

function mixHex(gray: string, accent: string, t: number) {
  const u = Math.max(0, Math.min(1, t));
  const [gr, gg, gb] = parseHex(gray);
  const [ar, ag, ab] = parseHex(accent);
  const r = Math.round(gr + (ar - gr) * u);
  const g = Math.round(gg + (ag - gg) * u);
  const b = Math.round(gb + (ab - gb) * u);
  return `rgb(${r}, ${g}, ${b})`;
}

function heroPointerStageXY(pin: MeshPinState, pointer: FacePointer) {
  if (!pointer.active) return { x: -1e6, y: -1e6 };
  return {
    x: pointer.screenX - pin.left,
    y: pointer.screenY - pin.top,
  };
}

function heroPointerBlendHeat(rawHeat: number) {
  const h = Math.max(0, Math.min(1, rawHeat));
  return h * h;
}

function heroPointerHeatAtStage(
  stageX: number,
  stageY: number,
  pointerX: number,
  pointerY: number,
) {
  const dx = stageX - pointerX;
  const dy = stageY - pointerY;
  const sigma = HERO_POINTER_SIGMA;
  return Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
}

function dotStageXY(dot: FlyingDot, pin: MeshPinState) {
  return {
    x: dot.x + dot.displayOx - pin.docLeft,
    y: dot.y + dot.displayOy - pin.docTop,
  };
}

function dotPointerHeat(dot: FlyingDot, pin: MeshPinState, pointer: FacePointer) {
  if (!pointer.active || dot.alpha <= 0.04) return 0;
  const p = heroPointerStageXY(pin, pointer);
  const s = dotStageXY(dot, pin);
  return heroPointerHeatAtStage(s.x, s.y, p.x, p.y);
}

function wireSegmentHeat(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  pointerX: number,
  pointerY: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const len2 = abx * abx + aby * aby;
  const ha = heroPointerHeatAtStage(ax, ay, pointerX, pointerY);
  const hb = heroPointerHeatAtStage(bx, by, pointerX, pointerY);
  if (len2 < 1e-4) return ha;

  let sum = ha + hb;
  let n = 2;
  for (const t of [0.25, 0.5, 0.75]) {
    sum += heroPointerHeatAtStage(ax + abx * t, ay + aby * t, pointerX, pointerY);
    n += 1;
  }
  const closestT = Math.max(0, Math.min(1, ((pointerX - ax) * abx + (pointerY - ay) * aby) / len2));
  sum += heroPointerHeatAtStage(
    ax + abx * closestT,
    ay + aby * closestT,
    pointerX,
    pointerY,
  );
  n += 1;
  return sum / n;
}

function heroHairDotColor(accent: string) {
  return mixHex(HERO_HAIR_TONE, accent, HERO_HAIR_ACCENT_MIX);
}

function heroHairWireColor(accent: string) {
  return mixHex(HERO_HAIR_TONE, accent, HERO_HAIR_WIRE_ACCENT_MIX);
}

function heroDotBaseColor(_accent: string, _dot: FlyingDot) {
  return HERO_FACE_DOT;
}

function heroWireBaseColor(
  accent: string,
  zone: MeshZone,
  isHair: boolean,
  matchedPalette: string | null,
) {
  if (matchedPalette) return matchedPalette;
  if (zone === 'hero' && isHair) return heroHairWireColor(accent);
  return MESH_WIRE_STROKE;
}

function heroDotPaintColor(accent: string, baseColor: string, rawHeat: number) {
  const blend = heroPointerBlendHeat(rawHeat);
  if (blend <= 0.01) return baseColor;
  return mixHex(baseColor, accent, blend * 0.78);
}

function heroWirePaintColor(accent: string, baseColor: string, rawHeat: number) {
  const blend = heroPointerBlendHeat(rawHeat);
  if (blend <= 0.01) return baseColor;
  const wireBase = baseColor.startsWith('rgba') ? MESH_WIRE_HEX : baseColor;
  return mixHex(wireBase, accent, blend * 0.72);
}

function stepScalar(current: number, target: number, speed: number, dt: number) {
  const gap = target - current;
  const step = speed * dt;
  if (Math.abs(gap) <= step) return target;
  return current + Math.sign(gap) * step;
}

function easeInOutMelancholy(t: number) {
  const c = Math.max(0, Math.min(1, t));
  const p = FLIGHT_EASE_POWER;
  if (c < 0.5) return 0.5 * (2 * c) ** p;
  return 1 - 0.5 * (2 * (1 - c)) ** p;
}

function easeStreakSpatial(t: number) {
  const c = Math.max(0, Math.min(1, t));
  if (c <= STREAK_MID_SPLIT) {
    return STREAK_PATH_SPLIT * (c / STREAK_MID_SPLIT) ** STREAK_MID_POWER;
  }
  const u = (c - STREAK_MID_SPLIT) / (1 - STREAK_MID_SPLIT);
  return STREAK_PATH_SPLIT + (1 - STREAK_PATH_SPLIT) * (1 - (1 - u) ** STREAK_ARRIVE_POWER);
}

function gatherSpatialT(flightU: number) {
  return easeStreakSpatial(flightU);
}

function settleBloomEnvelope(atMs: number, now: number) {
  if (atMs <= 0) return 0;
  const u = (now - atMs) / SETTLE_BLOOM_MS;
  if (u <= 0 || u >= 1) return 0;
  return Math.sin(u * Math.PI);
}

function markDotSettleBloom(_dot: FlyingDot, _now: number) {
  /* settle bloom wyłączony — połysk laguje morph / lot kropek */
}

function dotSettleBloom(dot: FlyingDot, now: number, allowBloom: boolean) {
  if (!allowBloom) return 0;
  return settleBloomEnvelope(dot.settleBloomAt, now);
}

function reflectorIgniteRamp(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return t * t * (3 - 2 * t);
}

function reflectorIgnite(dot: FlyingDot, pool: FlyingPool, now: number) {
  if (!dot.isReflector) return 0;
  if (dotInFlight(dot) || dot.departLeft > 0.01 || dot.flightU < 0.999) return 0;
  if (pool.morphFlying || anyDotInFlight(pool)) return 0;
  if (pool.morphBloomAt <= 0) return 0;

  const stagger = (dot.reflectorPhase % 1) * REFLECTOR_STAGGER_MS;
  const elapsed = now - pool.morphBloomAt - REFLECTOR_IGNITE_DELAY_MS - stagger;
  if (elapsed <= 0) return 0;

  const u = Math.min(1, elapsed / REFLECTOR_IGNITE_MS);
  return reflectorIgniteRamp(u);
}

/** Oko: tęczówka z alpha lotu; autobus/spray: ignite po morphu. */
function reflectorPaintAlpha(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  now: number,
) {
  if (!dot.isReflector) return 0;
  if (isEyeZone(zone)) return dot.alpha;
  return reflectorIgnite(dot, pool, now);
}

function reflectorDrawScale(dot: FlyingDot, pool: FlyingPool) {
  if (!dot.isReflector || dot.reflectorR <= 0) return 1;
  const meshR = Math.max(1.4, 4.5 * pool.tgtLayoutScale);
  return Math.max(1.55, (dot.reflectorR / meshR) * 0.92);
}

function reflectorAnchorR(dot: FlyingDot, pool: FlyingPool, meshR: number) {
  return meshR * reflectorDrawScale(dot, pool);
}

function poolDotForEdge(pool: FlyingPool, edge: MorphEdge, end: 'a' | 'b') {
  if (edge.group === 'reflector') {
    return end === 'a'
      ? pool.dots.get(`h:${edge.a}`)
      : pool.dots.get(`l:${edge.b}`);
  }
  const id = edge[end];
  return pool.dots.get(`h:${id}`);
}

function allowSettleBloom(scrolling: boolean, zone: MeshZone) {
  if (zone === 'hero') return false;
  return !scrolling;
}

function poolHasActiveReflectors(pool: FlyingPool) {
  for (const dot of pool.dots.values()) {
    if (dot.isReflector && dotIsActive(dot)) return true;
  }
  return false;
}

function updateMorphBloom(pool: FlyingPool, now: number) {
  if (!pool.morphFlying) return;
  let visible = 0;
  let anyActive = false;
  for (const dot of pool.dots.values()) {
    if (!dotIsActive(dot)) continue;
    visible += 1;
    if (dotInFlight(dot) || dot.departLeft > 0.001 || dot.flightU < 0.999) {
      anyActive = true;
    }
  }
  if (visible === 0 || !anyActive) {
    pool.morphFlying = false;
    if (pool.morphBloomAt <= 0 && poolHasActiveReflectors(pool)) {
      pool.morphBloomAt = now;
    }
  }
}

function dotFlightScale(dot: FlyingDot) {
  if (dot.simpleFlight) return 1;
  const u = Math.max(0, Math.min(1, dot.flightU));
  if (!dot.gatherPath) {
    return 1 - Math.sin(u * Math.PI) * FLIGHT_SHRINK;
  }
  const blobness = 4 * u * (1 - u);
  return 1 + (GATHER_BLOB_SCALE - 1) * blobness;
}

function gatherTravelGate(flightU: number) {
  const t = gatherSpatialT(flightU);
  if (t < 0.76) return 0;
  const u = (t - 0.76) / 0.24;
  return u * u * (3 - 2 * u);
}

function dotInFlight(dot: FlyingDot) {
  return dot.flightDist > 14 && dot.flightU < 0.995;
}

function stepIdleMotionBlend(dot: FlyingDot, dt: number, driftReady: boolean) {
  if (dot.idleMotionBlend >= 1 || dot.tgtAlpha <= 0.04) return;
  if (dot.departLeft > 0.01) return;
  if (!driftReady) return;
  if (dotInFlight(dot) && dotTravelGate(dot) < 0.8) return;
  dot.idleMotionBlend = Math.min(1, dot.idleMotionBlend + dt / IDLE_MOTION_BLEND_S);
}

function starMotionBlend(dot: FlyingDot, zone: MeshZone, pool: FlyingPool) {
  let blend = dot.idleMotionBlend;
  if (zone === 'hero') {
    blend = Math.max(blend, pool.heroLiveBlend * HERO_DRIFT_LIVE_MUL);
  }
  return blend;
}

function syncHeroDriftBlend(pool: FlyingPool, zone: MeshZone) {
  if (zone !== 'hero' || pool.heroLiveBlend <= 0.02) return;
  const floor = pool.heroLiveBlend * HERO_DRIFT_LIVE_MUL;
  for (const dot of pool.dots.values()) {
    if (dot.tgtAlpha <= 0.04 || dot.isReflector) continue;
    if (constellationPositionGate(dot) <= 0.02) continue;
    if (dot.idleMotionBlend < floor) dot.idleMotionBlend = floor;
  }
}

function dotIsActive(dot: FlyingDot) {
  return dot.alpha > 0.04 || dot.tgtAlpha > 0.04;
}

export function isMeshMorphBusy(pool: FlyingPool) {
  return pool.morphFlying || pool.zoneSyncPending != null || anyDotInFlight(pool);
}

/** Blokada tylko na czas budowy DOM (sync), nie na cały lot kropek — scroll może iść dalej. */
export function resolveMeshZoneLock(pool: FlyingPool): MeshZone | null {
  if (pool.zoneSyncPending && pool.activeZone) return pool.activeZone;
  return null;
}

export function stashScrollZoneIntent(pool: FlyingPool, zone: MeshZone) {
  pool.pendingScrollZone = zone;
}


function anyDotInFlight(pool: FlyingPool) {
  for (const dot of pool.dots.values()) {
    if (!dotIsActive(dot)) continue;
    if (dotInFlight(dot) || dot.departLeft > 0.01 || dot.flightU < 0.999) return true;
  }
  return false;
}

function idleDotFlight(dot: FlyingDot) {
  dot.flightU = 1;
  dot.flightDist = 0;
  dot.departLeft = 0;
  dot.alphaHoldLeft = 0;
  dot.gatherPath = false;
  dot.simpleFlight = false;
}

/** Reflektory (autobus itd.) — bez lotu; pojawiają się po morphu przez reflectorIgnite. */
function snapReflectorForMorph(dot: FlyingDot, goal: ViewportGoal) {
  dot.x = goal.x;
  dot.y = goal.y;
  dot.srcX = goal.x;
  dot.srcY = goal.y;
  dot.tgtX = goal.x;
  dot.tgtY = goal.y;
  dot.alpha = 0;
  dot.tgtAlpha = DOT_ALPHA;
  dot.displayOx = 0;
  dot.displayOy = 0;
  dot.idleMotionBlend = 1;
  idleDotFlight(dot);
  dot.paintKey = undefined;
}

function reflectorMorphSnapZone(zone: MeshZone) {
  return isMorphShapeZone(zone) && !isEyeZone(zone) && zone !== 'palette';
}

function morphSettled(pool: FlyingPool) {
  return !pool.morphFlying && !anyDotInFlight(pool);
}

function morphBuildProgress(pool: FlyingPool) {
  let sum = 0;
  let count = 0;
  for (const dot of pool.dots.values()) {
    if (dot.tgtAlpha < 0.04) continue;
    const arrival = dotInFlight(dot) ? dotTravelGate(dot) : 1;
    const fade = Math.min(1, dot.alpha / Math.max(dot.tgtAlpha, 0.06));
    sum += arrival * fade;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function computeMorphBuildT(pool: FlyingPool, zone: MeshZone): number {
  if (zone === 'hero') {
    if (!pool.morphFlying && morphSettled(pool)) return 1;
    return morphBuildProgress(pool);
  }
  if (!isMorphShapeZone(zone)) return 1;

  if (!pool.morphFlying && morphSettled(pool)) return 1;
  return morphBuildProgress(pool);
}

export function isMorphSettled(pool: FlyingPool) {
  return morphSettled(pool);
}

function allowFaceMotion(pool: FlyingPool, zone: MeshZone) {
  if (zone !== 'hero') return false;
  if (morphSettled(pool)) return true;
  return morphBuildProgress(pool) >= HERO_LIVE_MOTION_START;
}

function allowHairMotion(pool: FlyingPool, zone: MeshZone) {
  return allowFaceMotion(pool, zone);
}

function stepHeroLiveBlend(pool: FlyingPool, zone: MeshZone, dt: number) {
  if (zone !== 'hero') {
    pool.heroLiveBlend = 0;
    return;
  }
  if (morphSettled(pool)) {
    pool.heroLiveBlend = Math.min(1, pool.heroLiveBlend + dt / HERO_LIVE_BLEND_S);
    return;
  }
  const buildT = morphBuildProgress(pool);
  if (buildT < HERO_LIVE_MOTION_START) {
    pool.heroLiveBlend = 0;
    return;
  }
  const pre = (buildT - HERO_LIVE_MOTION_START) / (1 - HERO_LIVE_MOTION_START);
  pool.heroLiveBlend = Math.max(pool.heroLiveBlend, pre * HERO_LIVE_PRE_MUL);
}

function dotTravelGate(dot: FlyingDot) {
  if (!dotInFlight(dot)) return 1;
  if (dot.simpleFlight) return dot.flightU;
  if (dot.gatherPath) return gatherTravelGate(dot.flightU);
  return easeInOutMelancholy(dot.flightU);
}

/** Kreski — wcześniejszy postęp niż dotTravelGate (gather otwiera się dopiero przy t≈0.76). */
function wireTravelGate(dot: FlyingDot) {
  if (!dotInFlight(dot)) return 1;
  if (!dot.gatherPath) return dotTravelGate(dot);
  const t = gatherSpatialT(dot.flightU);
  if (t <= 0.1) return 0;
  const u = (t - 0.1) / 0.9;
  return u * u * (3 - 2 * u);
}

function heroMorphWireBuilding(pool: FlyingPool, zone: MeshZone) {
  if (zone !== 'hero') return false;
  if (pool.morphFlying || anyDotInFlight(pool)) return true;
  return pool.heroLiveBlend < 0.98;
}

function applyArcFlightPosition(dot: FlyingDot) {
  const u = dot.simpleFlight ? dot.flightU : easeInOutMelancholy(dot.flightU);
  const bx = dot.srcX + (dot.tgtX - dot.srcX) * u;
  const by = dot.srcY + (dot.tgtY - dot.srcY) * u;
  if (Math.abs(dot.arcPx) < 0.5) {
    dot.x = bx;
    dot.y = by;
    return;
  }
  const dx = dot.tgtX - dot.srcX;
  const dy = dot.tgtY - dot.srcY;
  const len = Math.max(Math.hypot(dx, dy), 1);
  const arc = Math.sin(u * Math.PI) * dot.arcPx;
  dot.x = bx + (-dy / len) * arc;
  dot.y = by + (dx / len) * arc;
}

function gatherFlightLength(dot: FlyingDot) {
  return Math.hypot(dot.tgtX - dot.srcX, dot.tgtY - dot.srcY);
}

function applyStreakFlightPosition(dot: FlyingDot) {
  const t = gatherSpatialT(dot.flightU);
  let x = dot.srcX + (dot.tgtX - dot.srcX) * t;
  let y = dot.srcY + (dot.tgtY - dot.srcY) * t;

  const pull = 4 * t * (1 - t);
  const cx = dot.gatherCx;
  const cy = dot.gatherCy;
  const ux = dot.streakUx;
  const uy = dot.streakUy;
  const px = x - cx;
  const py = y - cy;
  const along = px * ux + py * uy;
  const cross = -px * uy + py * ux;
  const crossK = 1 - pull * (1 - STREAK_CROSS_COMPRESS);
  dot.x = cx + along * ux - cross * crossK * uy;
  dot.y = cy + along * uy + cross * crossK * ux;
}

function applyFlightPosition(dot: FlyingDot) {
  if (dot.gatherPath) {
    applyStreakFlightPosition(dot);
    return;
  }
  applyArcFlightPosition(dot);
}

function computeFlightHub(dots: FlyingDot[]) {
  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (const dot of dots) {
    sx += dot.x;
    sy += dot.y;
    tx += dot.tgtX;
    ty += dot.tgtY;
  }
  const n = Math.max(dots.length, 1);
  return {
    x: (sx + tx) / (2 * n),
    y: (sy + ty) / (2 * n),
  };
}

function dotDisplayAlpha(dot: FlyingDot) {
  if (!dotInFlight(dot)) return dot.alpha;
  if (dot.tgtAlpha <= 0) {
    if (dot.departLeft > 0.001 || dot.alphaHoldLeft > 0.001) return dot.alpha;
    const u = easeOutEmphasized(Math.max(0, Math.min(1, dot.flightU)));
    return dot.alpha * (1 - u * 0.96);
  }
  const u = Math.min(1, dot.flightU);
  return Math.max(dot.alpha, dot.tgtAlpha * (0.28 + u * 0.72));
}

function exitRanksForZoneChange(
  pool: FlyingPool,
  exitIds: string[],
  morphHub: ViewportGoal | null,
  scrollDir: ScrollBuildDir,
) {
  const dots = exitIds
    .map((id) => pool.dots.get(id))
    .filter((dot): dot is FlyingDot => dot != null);
  if (morphHub && dots.length > 0) {
    return computeStreakLayout(dots, morphHub).ranks;
  }
  return waveRanksByY(
    exitIds,
    (id) => pool.dots.get(id)?.y ?? 0,
    (id) => pool.dots.get(id)?.x ?? 0,
    scrollDir,
  );
}

function computeStreakLayout(dots: FlyingDot[], hub: ViewportGoal) {
  let sx = 0;
  let sy = 0;
  let tx = 0;
  let ty = 0;
  for (const dot of dots) {
    sx += dot.x;
    sy += dot.y;
    tx += dot.tgtX;
    ty += dot.tgtY;
  }
  const n = Math.max(dots.length, 1);
  sx /= n;
  sy /= n;
  tx /= n;
  ty /= n;
  let dx = tx - sx;
  let dy = ty - sy;
  const len = Math.hypot(dx, dy);
  if (len < 8) {
    dx = 0;
    dy = 1;
  } else {
    dx /= len;
    dy /= len;
  }

  const entries = dots.map((dot) => {
    const srcP = (dot.x - hub.x) * dx + (dot.y - hub.y) * dy;
    const tgtP = (dot.tgtX - hub.x) * dx + (dot.tgtY - hub.y) * dy;
    return { id: dot.id, proj: srcP * 0.5 + tgtP * 0.5 };
  });
  entries.sort((a, b) => b.proj - a.proj);
  const ranks = new Map<string, number>();
  entries.forEach((entry, index) => ranks.set(entry.id, index));
  return { ranks, ux: dx, uy: dy };
}

function dotFlightTraits(
  hostId: number | null,
  rank: number,
  count: number,
  crumble = false,
  streak = false,
  zoneExit = false,
) {
  const seed = hostId ?? rank + 1;
  const b = (seed * 0.381966011250105) % 1;
  const c = (seed * 0.271828182845904) % 1;
  const waveT = rank / Math.max(count - 1, 1);
  const departDelay = crumble
    ? waveT * CRUMBLE_DEPART_SPAN_S + c * 0.015
    : zoneExit
      ? waveT * ZONE_EXIT_DEPART_SPAN_S + c * 0.014
      : streak
        ? waveT * STREAK_DEPART_SPAN_S + c * 0.012
        : c * MORPH_DEPART_JITTER_S;
  return {
    speedMul: 1,
    departDelay,
    arcPx: (b - 0.5) * FLIGHT_ARC_PX,
  };
}

function spawnJitter(seed: number) {
  const a = (seed * PHI) % 1;
  const b = (seed * 0.381966011250105) % 1;
  return { x: (a - 0.5) * 4, y: (b - 0.5) * 4 };
}

type FlightOpts = {
  holdAlpha?: boolean;
  crumble?: boolean;
  zoneExit?: boolean;
  gather?: boolean;
  simpleHero?: boolean;
  eyeMorph?: boolean;
  hub?: ViewportGoal;
  streakUx?: number;
  streakUy?: number;
};

function beginFlight(dot: FlyingDot, rank: number, count: number, opts?: FlightOpts) {
  const simpleHero = opts?.simpleHero ?? false;
  const gather = !simpleHero && (opts?.gather ?? false);
  const zoneExit = opts?.zoneExit ?? false;
  const streak = gather && !(opts?.crumble ?? false) && !zoneExit;
  const traits = dotFlightTraits(
    dot.hostId,
    rank,
    count,
    opts?.crumble ?? false,
    streak,
    zoneExit,
  );
  dot.srcX = dot.x;
  dot.srcY = dot.y;
  dot.flightU = 0;
  dot.gatherPath = gather;
  dot.simpleFlight = simpleHero;
  dot.arcPx = simpleHero || gather ? 0 : traits.arcPx;
  if (gather && opts?.hub) {
    dot.gatherCx = opts.hub.x;
    dot.gatherCy = opts.hub.y;
    dot.streakUx = opts.streakUx ?? 0;
    dot.streakUy = opts.streakUy ?? 1;
    dot.hubX = dot.srcX + (dot.tgtX - dot.srcX) * 0.5;
    dot.hubY = dot.srcY + (dot.tgtY - dot.srcY) * 0.5;
  } else {
    dot.gatherCx = (dot.srcX + dot.tgtX) * 0.5;
    dot.gatherCy = (dot.srcY + dot.tgtY) * 0.5;
    dot.streakUx = 0;
    dot.streakUy = 1;
    dot.hubX = dot.gatherCx;
    dot.hubY = dot.gatherCy;
  }
  dot.flightDist = gather
    ? gatherFlightLength(dot)
    : Math.hypot(dot.tgtX - dot.srcX, dot.tgtY - dot.srcY);
  dot.flightDur = opts?.crumble || zoneExit
    ? CRUMBLE_FLIGHT_DURATION_S
    : simpleHero
      ? (opts?.eyeMorph ? EYE_FLIGHT_DURATION_S : HERO_FLIGHT_DURATION_S)
      : FLIGHT_DURATION_S;
  dot.speedMul = traits.speedMul;
  dot.departLeft = simpleHero ? 0 : traits.departDelay;
  dot.alphaHoldLeft = opts?.holdAlpha && !simpleHero ? traits.departDelay : 0;
  dot.displayOx = 0;
  dot.displayOy = 0;
  dot.settleBloomAt = 0;
  dot.idleMotionBlend = 0;
  dot.paintKey = undefined;
}

function stepFlight(dot: FlyingDot, dt: number, now: number) {
  if (dot.departLeft > 0) {
    dot.departLeft = Math.max(0, dot.departLeft - dt);
    return;
  }

  if (dot.flightU >= 1) {
    dot.x = dot.tgtX;
    dot.y = dot.tgtY;
    dot.flightDist = 0;
    dot.flightU = 1;
    if (dot.tgtAlpha <= 0.04) {
      dot.alpha = 0;
    } else {
      markDotSettleBloom(dot, now);
    }
    return;
  }

  dot.flightU = Math.min(1, dot.flightU + dt / Math.max(dot.flightDur, 0.5));

  if (dot.flightU >= 1) {
    dot.x = dot.tgtX;
    dot.y = dot.tgtY;
    dot.flightU = 1;
    dot.flightDist = 0;
    if (dot.tgtAlpha <= 0.04) {
      dot.alpha = 0;
    } else {
      markDotSettleBloom(dot, now);
    }
    return;
  }

  applyFlightPosition(dot);
}

export function createFlyingPool(): FlyingPool {
  return {
    dots: new Map(),
    layoutScale: 1,
    tgtLayoutScale: 1,
    activeZone: null,
    pinKey: '',
    wireEdges: [],
    retiringWireEdges: [],
    retiringWireZone: null,
    buildWaveDir: 'down',
    activeLayoutKey: '',
    blinkAt: 0,
    nextBlinkAt: 0,
    viewportKey: '',
    morphBloomAt: 0,
    morphFlying: false,
    paletteBreathOx: 0,
    paletteBreathOy: 0,
    paletteTones: new Map(),
    paletteSplatTones: new Map(),
    paletteToneAnchors: new Map(),
    eyeFrameOx: 0,
    eyeFrameOy: 0,
    eyeFrameScale: 1,
    eyeFrameScaleX: 1,
    eyeFrameScaleY: 1,
    eyeFrameReady: false,
    eyeHullPathD: '',
    eyeHullSmoothOffsets: null,
    sprayBursts: [],
    sprayNextBurstAt: 0,
    sprayBurstToneIdx: 0,
    sprayFootprintPending: false,
    idlePaintPhase: 0,
    idleTickPhase: 0,
    zoneSyncPending: null,
    syncScrollAnchorY: -1,
    pendingScrollZone: null,
    paintDotIds: [],
    faceMotionDotIds: [],
    faceInfluencedIds: [],
    heroWirePairs: [],
    heroLiveBlend: 0,
    scrollCanvasDetached: false,
  };
}

function refreshHeroWirePairs(pool: FlyingPool) {
  const pairs: { edge: MorphEdge; dotA: FlyingDot; dotB: FlyingDot }[] = [];
  for (const edge of pool.wireEdges) {
    const dotA = poolDotForEdge(pool, edge, 'a');
    const dotB = poolDotForEdge(pool, edge, 'b');
    if (dotA && dotB) pairs.push({ edge, dotA, dotB });
  }
  pool.heroWirePairs = pairs;
}

function refreshPaintDotIds(pool: FlyingPool) {
  const ids: string[] = [];
  for (const [id, dot] of pool.dots) {
    if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) ids.push(id);
  }
  pool.paintDotIds = ids;
}

function refreshFaceMotionDotIds(pool: FlyingPool, mesh: MeshBundle['faceMesh']) {
  const ids: string[] = [];
  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.hostId == null) continue;
    const node = mesh.nodes[dot.hostId];
    if (!node || !mesh.visibleNodeIds.has(dot.hostId)) continue;
    if (node.group !== 'face' && node.group !== 'hair') continue;
    if (node.group === 'hair' && !dot.isHair) continue;
    ids.push(id);
  }
  pool.faceMotionDotIds = ids;
}

function hairAmbientOffset(
  mesh: MeshBundle['faceMesh'],
  node: { x: number; y: number; phase: number },
  now: number,
  live: number,
) {
  const vertical = node.y / mesh.height;
  const centerOffset = (node.x - mesh.width / 2) / mesh.width;
  const hairRootWave = Math.sin(now * 0.002 + vertical * 10);
  const hairTipWave = Math.sin(now * 0.0028 + vertical * 16 + centerOffset * 5);
  const hairSide = Math.sign(centerOffset || 1);
  const hairOuter = Math.min(1, Math.max(0.18, (Math.abs(centerOffset) - 0.08) / 0.34));
  const hairAnchor = 0.18 + hairOuter * 0.82;
  const hairSideSway = Math.max(-1.2, Math.min(8, hairRootWave * 4.8 + hairTipWave * 3.1));
  return {
    dx: hairSideSway * hairSide * hairAnchor * live,
    dy: Math.cos(now * 0.0022 + vertical * 13 + Math.abs(centerOffset) * 4) * 4.2 * hairAnchor * live,
  };
}

function dotHeroPointerInfluence(
  dot: FlyingDot,
  mesh: MeshBundle['faceMesh'],
  _layout: ReturnType<typeof layoutFaceOnCanvas>,
  pin: MeshPinState,
  pointer: FacePointer,
) {
  if (!pointer.active || dot.hostId == null) return false;
  const node = mesh.nodes[dot.hostId];
  if (!node || (node.group !== 'face' && node.group !== 'hair')) return false;
  const p = heroPointerStageXY(pin, pointer);
  const s = dotStageXY(dot, pin);
  const dist = Math.hypot(s.x - p.x, s.y - p.y);
  const radius = node.group === 'hair' ? 220 : 150;
  return dist < radius;
}

function sprayPaintMargin(pin: MeshPinState) {
  const stageMul = pin.stageW / 280;
  const maxAlong = (12 + 86) * stageMul * SPRAY_BURST_EXPAND;
  const maxLateral = (12 + 36) * stageMul * SPRAY_BURST_LATERAL_END * SPRAY_BURST_EXPAND;
  return Math.ceil(maxAlong + maxLateral + 80);
}

function zonePaintClip(
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  layerW: number,
  layerH: number,
  zone: MeshZone = 'hero',
) {
  const margin = zone === 'spray' ? sprayPaintMargin(pin) : 140;
  const x = Math.max(0, pin.docLeft - layerOrigin.x - margin);
  const y = Math.max(0, pin.docTop - layerOrigin.y - margin);
  const right = Math.min(layerW, pin.docLeft - layerOrigin.x + pin.stageW + margin);
  const bottom = Math.min(layerH, pin.docTop - layerOrigin.y + pin.stageH + margin);
  return {
    x,
    y,
    w: Math.max(0, right - x),
    h: Math.max(0, bottom - y),
  };
}

function clearCanvasClips(
  ctx: CanvasRenderingContext2D,
  layerOrigin: { x: number; y: number },
  layerW: number,
  layerH: number,
  clips: { pin: MeshPinState; zone: MeshZone }[],
) {
  for (const { pin, zone } of clips) {
    const clip = zonePaintClip(pin, layerOrigin, layerW, layerH, zone);
    if (clip.w > 0 && clip.h > 0) ctx.clearRect(clip.x, clip.y, clip.w, clip.h);
  }
}

function clearWireCanvasRegion(
  canvas: HTMLCanvasElement,
  layer: HTMLElement,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  lowDpr: boolean,
  morphActive: boolean,
  zone: MeshZone = 'hero',
  extraClearPin: MeshPinState | null = null,
  fullClear = false,
) {
  const { w, h, dpr } = syncWireCanvas(canvas, layer, lowDpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (morphActive || zone === 'palette' || fullClear) {
    ctx.clearRect(0, 0, w, h);
    return;
  }
  const clips: { pin: MeshPinState; zone: MeshZone }[] = [{ pin, zone }];
  if (extraClearPin) clips.push({ pin: extraClearPin, zone: 'spray' });
  clearCanvasClips(ctx, layerOrigin, w, h, clips);
}

function measureEyeMeshFrame(
  pool: FlyingPool,
  pin: MeshPinState,
  zone: MeshZone,
  now: number,
) {
  let docMinX = Infinity;
  let docMaxX = -Infinity;
  let docMinY = Infinity;
  let docMaxY = -Infinity;
  let count = 0;

  for (const dot of pool.dots.values()) {
    if (dot.tgtAlpha < 0.04 || dot.alpha < 0.02 || dot.isReflector) continue;
    const { x, y } = dotDrawPos(dot, pool, zone, pin, now, false, true);
    docMinX = Math.min(docMinX, x);
    docMaxX = Math.max(docMaxX, x);
    docMinY = Math.min(docMinY, y);
    docMaxY = Math.max(docMaxY, y);
    count += 1;
  }

  if (count < 10) return null;

  const cx = (docMinX + docMaxX) * 0.5;
  const cy = (docMinY + docMaxY) * 0.5;
  const pinCx = pin.docLeft + pin.stageW * 0.5;
  const pinCy = pin.docTop + pin.stageH * 0.5;
  const liveW = docMaxX - docMinX;
  const liveH = docMaxY - docMinY;
  const clampScale = (v: number) => Math.max(0.86, Math.min(1.08, v));
  const scaleX = clampScale(liveW / Math.max(pin.stageW, 1));
  const scaleY = clampScale(liveH / Math.max(pin.stageH, 1));
  const scale = (scaleX + scaleY) * 0.5;

  return {
    ox: cx - pinCx,
    oy: cy - pinCy,
    scale,
    scaleX,
    scaleY,
  };
}

const EYE_HULL_SNAP_SVG = 130;

function stepEyeHullWarp(
  pool: FlyingPool,
  pin: MeshPinState,
  zone: MeshZone,
  now: number,
  hull: NonNullable<MeshBundle['eyeWhiteHull']>,
  eyeMesh: SvgMesh,
  dt: number,
) {
  const verts = hull.points;
  if (!pool.eyeHullSmoothOffsets || pool.eyeHullSmoothOffsets.length !== verts.length) {
    pool.eyeHullSmoothOffsets = verts.map(() => ({ dx: 0, dy: 0 }));
  }

  if (!morphSettled(pool)) {
    pool.eyeHullPathD = hull.path;
    return;
  }

  /** Przy mruganiu clip/fill i tak się deformują — oszczędź O(n×m) warpu. */
  if (eyeBlinkCover(zone as 'careerEye' | 'skillsEye', now) > 0.08) return;

  const target = verts.map(() => ({ dx: 0, dy: 0 }));
  const sxScale = EYE_VIEWBOX.w / Math.max(pin.stageW, 1);
  const syScale = EYE_VIEWBOX.h / Math.max(pin.stageH, 1);

  for (let vi = 0; vi < verts.length; vi += 1) {
    const v = verts[vi]!;
    let sumDx = 0;
    let sumDy = 0;
    let sumW = 0;

    for (const dot of pool.dots.values()) {
      if (dot.tgtAlpha < 0.03 || dot.alpha < 0.02 || dot.isReflector) continue;
      const node = dot.hostId != null ? eyeMesh.nodes[dot.hostId] : undefined;
      if (!node || pointInEyeIris(node.x, node.y, 0.92)) continue;

      const dist = Math.hypot(node.x - v.x, node.y - v.y);
      if (dist > EYE_HULL_SNAP_SVG) continue;

      const star = starOffset(dot, pool, now, zone, false);
      if (star.gate < 0.02) continue;

      const w = 1 / (dist + 14);
      sumDx += star.ox * sxScale * w;
      sumDy += star.oy * syScale * w;
      sumW += w;
    }

    if (sumW > 0) {
      target[vi] = { dx: sumDx / sumW, dy: sumDy / sumW };
    }
  }

  const smooth = 1 - Math.exp(-dt * 12);
  const smoothOffsets = pool.eyeHullSmoothOffsets;
  let maxDelta = 0;
  for (let i = 0; i < smoothOffsets.length; i += 1) {
    const off = smoothOffsets[i]!;
    const tgt = target[i]!;
    const ndx = off.dx + (tgt.dx - off.dx) * smooth;
    const ndy = off.dy + (tgt.dy - off.dy) * smooth;
    maxDelta = Math.max(maxDelta, Math.abs(ndx - off.dx), Math.abs(ndy - off.dy));
    off.dx = ndx;
    off.dy = ndy;
  }

  if (maxDelta < 0.04 && pool.eyeHullPathD) return;

  pool.eyeHullPathD = buildWarpedWhiteZonePath(hull.path, smoothOffsets);
}

function stepEyeMeshFrame(
  pool: FlyingPool,
  pin: MeshPinState,
  zone: MeshZone,
  now: number,
  dt: number,
  bundle: MeshBundle,
) {
  if (!isEyeZone(zone)) {
    pool.eyeFrameOx = 0;
    pool.eyeFrameOy = 0;
    pool.eyeFrameScale = 1;
    pool.eyeFrameScaleX = 1;
    pool.eyeFrameScaleY = 1;
    pool.eyeFrameReady = false;
    pool.eyeHullPathD = '';
    pool.eyeHullSmoothOffsets = null;
    return;
  }

  const hull = bundle.eyeWhiteHull;
  const eyeMesh = bundle.zoneMeshes.careerEye;
  if (hull && eyeMesh) {
    stepEyeHullWarp(pool, pin, zone, now, hull, eyeMesh, dt);
  } else if (hull) {
    pool.eyeHullPathD = hull.path;
  }

  if (!morphSettled(pool)) {
    pool.eyeFrameReady = false;
    return;
  }

  const measured = measureEyeMeshFrame(pool, pin, zone, now);
  if (!measured) return;

  const smooth = 1 - Math.exp(-dt * 16);
  const blinkCover = eyeBlinkCover(zone, now);
  pool.eyeFrameOx += (measured.ox - pool.eyeFrameOx) * smooth;
  pool.eyeFrameOy += (measured.oy - pool.eyeFrameOy) * smooth;
  if (blinkCover <= 0.05) {
    pool.eyeFrameScale += (measured.scale - pool.eyeFrameScale) * smooth;
    pool.eyeFrameScaleX += (measured.scaleX - pool.eyeFrameScaleX) * smooth;
    pool.eyeFrameScaleY += (measured.scaleY - pool.eyeFrameScaleY) * smooth;
  }
  pool.eyeFrameReady = true;
}

type DotShimmer = {
  opacityMul: number;
  scaleMul: number;
  wireMul: number;
  gate: number;
  diamond?: boolean;
};

function starShimmer(dot: FlyingDot, now: number): DotShimmer {
  const gate = constellationShimmerGate(dot);
  if (gate <= 0.02) {
    return { opacityMul: 1, scaleMul: 1, wireMul: 1, gate: 0 };
  }
  const seed = starSeed(dot);
  const breathe = 0.5 + 0.5 * Math.sin(now * 0.00022 + seed * 0.55);
  const twinkle = 0.5 + 0.5 * Math.sin(now * 0.00028 + seed * 1.18);
  const burn = STAR_OPACITY_MIN + (1 - STAR_OPACITY_MIN) * breathe * twinkle;
  const opacityMul = 1 - gate + burn * gate;
  const scaleMul = 1 + gate * STAR_SCALE_PULSE
    * (0.5 + 0.5 * Math.sin(now * 0.00024 + seed * 0.85));
  const wireMul = 1 - STAR_WIRE_TWINKLE * gate
    + STAR_WIRE_TWINKLE * gate * (0.5 + 0.5 * twinkle);
  return { opacityMul, scaleMul, wireMul, gate };
}

function ringGemWeight(dot: FlyingDot, pin: MeshPinState) {
  const lx = dot.x - (pin.docLeft + pin.stageW * 0.5);
  const ly = dot.y - (pin.docTop + pin.stageH * 0.5);
  const nx = lx / Math.max(pin.stageW, 1) + 0.5;
  const ny = ly / Math.max(pin.stageH, 1) + 0.5;
  const cx = 1 - Math.min(1, Math.abs(nx - 0.5) / 0.38);
  if (ny < 0.36) {
    const topGem = 1 - Math.min(1, ny / 0.36);
    return Math.max(0.38, cx * (0.52 + topGem * 0.48));
  }
  if (ny < 0.72) return 0.22 + cx * 0.18;
  return 0.16;
}

/** Kamień pierścionka — współrzędne canvas względem pinu. */
function ringGemWeightCanvas(
  px: number,
  py: number,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
) {
  const sx = px + layerOrigin.x - pin.docLeft;
  const sy = py + layerOrigin.y - pin.docTop;
  const nx = sx / Math.max(pin.stageW, 1);
  const ny = sy / Math.max(pin.stageH, 1);
  const cx = 1 - Math.min(1, Math.abs(nx - 0.5) / 0.38);
  // Kamień u góry SVG (ny ≈ 0.02–0.32).
  if (ny < 0.36) {
    const topGem = 1 - Math.min(1, ny / 0.36);
    return Math.max(0.38, cx * (0.52 + topGem * 0.48));
  }
  if (ny < 0.72) return 0.22 + cx * 0.18;
  return 0.16;
}

function ringShimmerPhase(now: number, seed = 0) {
  const t = now * 0.001;
  const master = 0.5 + 0.5 * Math.sin(t * RING_SHIMMER_HZ);
  const ripple = 0.5 + 0.5 * Math.sin(t * (RING_SHIMMER_HZ * 1.35) + 1.1 + seed);
  const glint = 0.5 + 0.5 * Math.sin(t * (RING_SHIMMER_HZ * 2.1) + seed * 0.7);
  return { t, master, ripple, glint, wave: master * ripple * glint };
}

/** Majestatyczny blask pierścionka — szybki, wyraźny, zawsze aktywny. */
function ringDiamondShimmer(dot: FlyingDot, now: number, pin: MeshPinState): DotShimmer {
  const seed = starSeed(dot);
  const gem = ringGemWeight(dot, pin);
  const { ripple, glint, wave, t } = ringShimmerPhase(now, seed);
  const sweep = 0.5 + 0.5 * Math.sin(
    t * (RING_SHIMMER_HZ * 1.8) + seed * 0.55 + gem * 2.4,
  );
  const gemGate = 0.58 + gem * 0.42;
  const pulse = wave * (0.72 + sweep * 0.28);

  return {
    opacityMul: 0.78 + 0.22 * pulse * gemGate,
    scaleMul: 1 + RING_SCALE_PULSE * gemGate * (0.45 + ripple * 0.55),
    wireMul: 0.62 + 0.38 * pulse * glint * gemGate,
    gate: gemGate * (0.55 + 0.45 * pulse),
    diamond: gem > 0.12,
  };
}

function dotShimmer(dot: FlyingDot, now: number, zone: MeshZone, pin: MeshPinState): DotShimmer {
  if (zone === 'hero' || dot.isHair) {
    return { opacityMul: 1, scaleMul: 1, wireMul: 1, gate: 0 };
  }
  if (zone === 'ring') return ringDiamondShimmer(dot, now, pin);
  return starShimmer(dot, now);
}

function dotDrawPos(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
  layoutOnly = false,
) {
  let x = dot.x + dot.displayOx;
  let y = dot.y + dot.displayOy;
  if (!layoutOnly && !dot.isReflector) {
    const star = starOffset(dot, pool, now, zone, heroFaceActive);
    x += star.ox;
    y += star.oy;
  }
  if (!layoutOnly && isEyeZone(zone)) {
    const blink = eyeBlinkCover(zone as 'careerEye' | 'skillsEye', now);
    x = eyeBlinkStretchXPos(x, pin, blink);
    y = eyeBlinkSquashY(y, pin, blink);
  }
  return { x, y };
}

function canvasDotPosition(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  now: number,
  heroFaceActive: boolean,
  frozen = false,
) {
  return {
    x: dotDrawX(dot, pool, zone, pin, now, heroFaceActive, frozen) - layerOrigin.x,
    y: dotDrawY(dot, pool, zone, pin, now, heroFaceActive, frozen) - layerOrigin.y,
  };
}

function dotDrawX(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
  layoutOnly = false,
) {
  return dotDrawPos(dot, pool, zone, pin, now, heroFaceActive, layoutOnly).x;
}

function dotDrawY(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
  layoutOnly = false,
) {
  return dotDrawPos(dot, pool, zone, pin, now, heroFaceActive, layoutOnly).y;
}

function sprayHash(seed: number) {
  const x = Math.sin(seed * 12.9898 + seed * 0.0713) * 43758.5453;
  return x - Math.floor(x);
}

function sprayMajesticEase(u: number) {
  const t = Math.max(0, Math.min(1, u));
  return 1 - (1 - t) ** SPRAY_BURST_MAJESTIC_POWER;
}

function findSprayReflectorDot(pool: FlyingPool): FlyingDot | null {
  for (const dot of pool.dots.values()) {
    if (dot.isReflector && dot.alpha > 0.02) return dot;
  }
  return null;
}

function resolveSprayBurstBasis(
  pool: FlyingPool,
  bundle: MeshBundle,
  pin: MeshPinState,
  zone: MeshZone,
  layerOrigin: { x: number; y: number },
  now: number,
  heroFaceActive: boolean,
  storedDir?: Pick<SprayBurst, 'dirX' | 'dirY' | 'perpX' | 'perpY'>,
): SprayBurstBasis {
  const reflector = findSprayReflectorDot(pool);
  let nozzleDocX: number;
  let nozzleDocY: number;

  if (reflector) {
    nozzleDocX = dotDrawX(reflector, pool, zone, pin, now, heroFaceActive);
    nozzleDocY = dotDrawY(reflector, pool, zone, pin, now, heroFaceActive);
  } else {
    const fallback = normToDocument(SPRAY_NOZZLE_NORM, pin);
    nozzleDocX = fallback.x;
    nozzleDocY = fallback.y;
  }

  let dirX: number;
  let dirY: number;
  if (storedDir) {
    dirX = storedDir.dirX;
    dirY = storedDir.dirY;
  } else {
    const atlas = ensureDotAtlas(bundle, pin.stageW, pin.stageH, ['hero', 'spray']);
    const layout = zoneLayout(atlas, 'spray');
    const refMeta = layout?.reflectors[0];
    const aimDoc = refMeta
      ? normToDocument(
          { nx: refMeta.nx - SPRAY_AIM_LEFT_NORM_OFFSET, ny: refMeta.ny + 0.01 },
          pin,
        )
      : normToDocument(SPRAY_AIM_NORM, pin);
    dirX = aimDoc.x - nozzleDocX;
    dirY = aimDoc.y - nozzleDocY;
    const dLen = Math.hypot(dirX, dirY) || 1;
    dirX /= dLen;
    dirY /= dLen;
  }

  return {
    ox: nozzleDocX - layerOrigin.x,
    oy: nozzleDocY - layerOrigin.y,
    dirX,
    dirY,
    perpX: -dirY,
    perpY: dirX,
  };
}

function buildSprayMeshEdges(nodes: SprayNode[], maxDist: number): SprayEdge[] {
  const edges: SprayEdge[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < nodes.length; i++) {
    const neighbors: { j: number; d: number }[] = [];
    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      const d = Math.hypot(nodes[i].along - nodes[j].along, nodes[i].across - nodes[j].across);
      if (d <= maxDist) neighbors.push({ j, d });
    }
    neighbors.sort((a, b) => a.d - b.d);
    for (let k = 0; k < Math.min(3, neighbors.length); k++) {
      const j = neighbors[k].j;
      const a = Math.min(i, j);
      const b = Math.max(i, j);
      const key = `${a}:${b}`;
      if (seen.has(key)) continue;
      seen.add(key);
      edges.push({ a, b });
    }
  }
  return edges;
}

function createSprayBurst(
  pool: FlyingPool,
  bundle: MeshBundle,
  pin: MeshPinState,
  zone: MeshZone,
  layerOrigin: { x: number; y: number },
  accent: string,
  now: number,
): SprayBurst {
  const colors = getPaletteToneColors(accent);
  const tone = SPRAY_BURST_TONES[pool.sprayBurstToneIdx % SPRAY_BURST_TONES.length];
  pool.sprayBurstToneIdx += 1;

  const basis = resolveSprayBurstBasis(
    pool,
    bundle,
    pin,
    zone,
    layerOrigin,
    now,
    false,
  );

  const stageMul = pin.stageW / 280;
  const nodes: SprayNode[] = [];
  const count = 20 + Math.floor(sprayHash(now * 0.017) * 12);
  for (let i = 0; i < count; i++) {
    const h = sprayHash(i * 2654435761 + Math.floor(now));
    const h2 = sprayHash(i * 1597334677 + Math.floor(now * 0.1));
    const h3 = sprayHash(i * 2246822519 + 42);
    const along = (12 + h * h3 * 86) * stageMul;
    const cone = 0.38 + Math.min(1, along / (82 * stageMul)) * 0.92;
    nodes.push({
      along,
      across: (h2 - 0.5) * (12 + h * 36) * stageMul * cone,
      delay: h * 0.32,
    });
  }

  const edges = buildSprayMeshEdges(nodes, 30 * stageMul);

  return {
    startTime: now,
    wireColor: colors[tone],
    dirX: basis.dirX,
    dirY: basis.dirY,
    perpX: basis.perpX,
    perpY: basis.perpY,
    nodes,
    edges,
    dotR: Math.max(1.5, 4.2 * pool.layoutScale),
  };
}

function stepSprayBursts(
  pool: FlyingPool,
  bundle: MeshBundle,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  accent: string,
  now: number,
  settled: boolean,
) {
  if (zone !== 'spray') {
    if (pool.sprayBursts.length > 0 || pool.sprayNextBurstAt > 0) {
      pool.sprayFootprintPending = true;
    }
    pool.sprayBursts = [];
    pool.sprayNextBurstAt = 0;
    return;
  }

  pool.sprayBursts = pool.sprayBursts.filter((b) => now - b.startTime < SPRAY_BURST_MS);
  if (!settled) return;

  if (pool.sprayNextBurstAt <= 0) {
    pool.sprayNextBurstAt = now + SPRAY_BURST_FIRST_DELAY_MS;
  }

  if (
    now >= pool.sprayNextBurstAt
    && pool.sprayBursts.length < 1
    && findSprayReflectorDot(pool)
  ) {
    pool.sprayBursts.push(createSprayBurst(pool, bundle, pin, zone, layerOrigin, accent, now));
    pool.sprayNextBurstAt =
      now + SPRAY_BURST_MIN_GAP_MS + sprayHash(now * 0.0031) * SPRAY_BURST_GAP_SPAN_MS;
  }
}

function sprayNodePos(
  basis: SprayBurstBasis,
  burst: SprayBurst,
  node: SprayNode,
  scale: number,
  spreadU: number,
) {
  const widenU = spreadU ** SPRAY_BURST_LATERAL_TIME_POWER;
  const lateralMul =
    SPRAY_BURST_LATERAL_START
    + (SPRAY_BURST_LATERAL_END - SPRAY_BURST_LATERAL_START) * widenU;
  const acrossScale = scale * lateralMul * (0.42 + widenU * 0.72);
  return {
    x: basis.ox + burst.dirX * node.along * scale + burst.perpX * node.across * acrossScale,
    y: basis.oy + burst.dirY * node.along * scale + burst.perpY * node.across * acrossScale,
  };
}

function paintSprayBursts(
  ctx: CanvasRenderingContext2D,
  pool: FlyingPool,
  bundle: MeshBundle,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  now: number,
  heroFaceActive: boolean,
) {
  if (pool.sprayBursts.length === 0) return;

  ctx.lineCap = 'round';
  const wireWidth = 0.9 * Math.max(0.9, pool.layoutScale);

  for (const burst of pool.sprayBursts) {
    const u = (now - burst.startTime) / SPRAY_BURST_MS;
    if (u >= 1) continue;

    const basis = resolveSprayBurstBasis(
      pool,
      bundle,
      pin,
      zone,
      layerOrigin,
      now,
      heroFaceActive,
      burst,
    );

    const spreadU = sprayMajesticEase(u);
    const expand = spreadU * SPRAY_BURST_EXPAND;
    const fadeIn = Math.min(1, u / 0.14);
    const fadeSpan = 1 - SPRAY_BURST_FADE_START;
    const fadeOut = u > SPRAY_BURST_FADE_START
      ? 1 - ((u - SPRAY_BURST_FADE_START) / fadeSpan) ** 1.1
      : 1;
    const fade = fadeIn * fadeOut;

    const positions: { x: number; y: number; alpha: number }[] = [];
    for (const node of burst.nodes) {
      const nodeU = u <= node.delay ? 0 : Math.min(1, (u - node.delay) / (1 - node.delay));
      const scale = sprayMajesticEase(nodeU) * expand;
      const pos = sprayNodePos(basis, burst, node, scale, spreadU);
      positions.push({
        x: pos.x,
        y: pos.y,
        alpha: fade * (0.45 + nodeU * 0.55),
      });
    }

    ctx.strokeStyle = burst.wireColor;
    ctx.lineWidth = wireWidth;
    for (const edge of burst.edges) {
      const a = positions[edge.a];
      const b = positions[edge.b];
      if (!a || !b) continue;
      const edgeAlpha = Math.min(a.alpha, b.alpha);
      if (edgeAlpha < 0.03) continue;
      ctx.globalAlpha = edgeAlpha;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.fillStyle = DOT_GRAY;
    for (const pos of positions) {
      if (pos.alpha < 0.03) continue;
      ctx.globalAlpha = pos.alpha * DOT_ALPHA;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, burst.dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}

/** Oddech w stronę przycisku — rampuje z postępem budowy, bez skoku po morphu. */
function applyContactArrowPoint(
  pool: FlyingPool,
  zone: MeshZone,
  now: number,
  settled: boolean,
) {
  if (zone !== 'contactArrow') return;

  const slotEl = document.getElementById(CONTACT_MESH_ANCHOR_ID);
  const ctaEl = document.getElementById(CONTACT_CTA_ANCHOR_ID);
  if (!slotEl || !ctaEl) {
    for (const dot of pool.dots.values()) {
      dot.displayOx = 0;
      dot.displayOy = 0;
    }
    return;
  }

  const slot = slotEl.getBoundingClientRect();
  const cta = ctaEl.getBoundingClientRect();
  const sx = window.scrollX;
  const sy = window.scrollY;
  const cx = slot.left + slot.width * 0.52 + sx;
  const cy = slot.top + slot.height * 0.55 + sy;
  const tx = cta.left + cta.width * 0.48 + sx;
  const ty = cta.top + cta.height * 0.5 + sy;
  let dx = tx - cx;
  let dy = ty - cy;
  const len = Math.hypot(dx, dy) || 1;
  dx /= len;
  dy /= len;

  const breathe = 0.5 + 0.5 * Math.sin(now * 0.0025);
  const push = 8 + breathe * 20;
  const buildGate = settled ? 1 : morphBuildProgress(pool);

  for (const dot of pool.dots.values()) {
    if (dot.alpha < 0.06 && dot.tgtAlpha < 0.06) continue;
    const blend = dot.idleMotionBlend * buildGate;
    dot.displayOx = dx * push * blend;
    dot.displayOy = dy * push * blend;
  }
}

function settleHeroMeshDots(pool: FlyingPool, zone: MeshZone) {
  if (zone !== 'hero') return;
  for (const dot of pool.dots.values()) {
    if (dot.tgtAlpha <= 0.04 || dot.isReflector) continue;
    dot.x = dot.tgtX;
    dot.y = dot.tgtY;
    dot.srcX = dot.x;
    dot.srcY = dot.y;
    dot.flightU = 1;
    dot.flightDist = 0;
    dot.departLeft = 0;
    dot.settleBloomAt = 0;
  }
}

function stepHeroBlink(pool: FlyingPool, now: number) {
  if (pool.nextBlinkAt <= 0) {
    pool.nextBlinkAt = now + HERO_BLINK_FIRST_DELAY_MS;
    return;
  }
  if (now >= pool.nextBlinkAt) {
    pool.blinkAt = now;
    pool.nextBlinkAt =
      now + HERO_BLINK_MIN_GAP_MS + ((now * 0.00061) % 1) * HERO_BLINK_GAP_SPAN_MS;
  }
}

function heroMotionGate(dot: FlyingDot) {
  const rem = Math.hypot(dot.tgtX - dot.x, dot.tgtY - dot.y);
  if (rem > 22) return 0;
  if (dot.flightDist > 14 && dot.flightU < 0.9) return 0;
  return easeOutEmphasized(Math.min(1, dotSettle(dot)));
}

/** Falowanie włosów — także w scrollLite, bez reakcji na kursor. */
function applyHeroHairAmbient(
  pool: FlyingPool,
  mesh: MeshBundle['faceMesh'],
  zone: MeshZone,
  now: number,
) {
  if (zone !== 'hero') return;

  const live = pool.heroLiveBlend;
  if (live <= 0.001) {
    pool.faceInfluencedIds = [];
    return;
  }

  const hairInfluenced: string[] = [];
  for (const id of pool.faceMotionDotIds) {
    const dot = pool.dots.get(id);
    if (!dot?.isHair || dot.alpha < 0.06 || dot.tgtAlpha < 0.06) continue;
    const node = mesh.nodes[dot.hostId!];
    if (!node || node.group !== 'hair') continue;

    const gate = heroMotionGate(dot);
    if (gate <= 0.02) continue;

    const ambient = hairAmbientOffset(mesh, node, now, gate);
    dot.faceTgtOx = ambient.dx * live;
    dot.faceTgtOy = ambient.dy * live;
    hairInfluenced.push(id);
  }
  pool.faceInfluencedIds = hairInfluenced;
}

function lerpHeroFaceMotion(pool: FlyingPool, dt: number, snap = false) {
  const live = pool.heroLiveBlend;
  if (live <= 0.001) return;
  const t = snap ? 1 : Math.min(1, dt * (10 + 16 * live));
  for (const id of pool.faceInfluencedIds) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    const tgtOx = dot.faceTgtOx ?? 0;
    const tgtOy = dot.faceTgtOy ?? 0;
    if (snap) {
      dot.displayOx = tgtOx;
      dot.displayOy = tgtOy;
    } else {
      dot.displayOx += (tgtOx - dot.displayOx) * t;
      dot.displayOy += (tgtOy - dot.displayOy) * t;
    }
  }
}

/** Ruch twarzy i włosów jako delta względem pozycji z morphu — bez skoku po settle. */
function applyHeroFaceMotion(
  pool: FlyingPool,
  mesh: MeshBundle['faceMesh'],
  pin: MeshPinState,
  zone: MeshZone,
  pointer: FacePointer,
  now: number,
  enableFaceMotion: boolean,
) {
  if (zone !== 'hero') return;

  const live = pool.heroLiveBlend;
  const motionIds = pool.faceMotionDotIds;
  if (!enableFaceMotion || live <= 0.001) {
    for (const id of motionIds) {
      const dot = pool.dots.get(id);
      if (!dot) continue;
      if (
        dot.displayOx === 0
        && dot.displayOy === 0
        && dot.faceTgtOx === 0
        && dot.faceTgtOy === 0
      ) continue;
      dot.displayOx = 0;
      dot.displayOy = 0;
      dot.faceTgtOx = 0;
      dot.faceTgtOy = 0;
    }
    pool.faceInfluencedIds = [];
    return;
  }

  const pointerOn = pointer.active;
  const faceLayout = heroFaceLayout(mesh, pin);
  const pointerX = pin.stageW * (0.5 + pointer.x);
  const pointerY = pin.stageH * (0.5 + pointer.y);
  const { scale, offsetX, offsetY } = faceLayout;
  const prevInfluenced = new Set(pool.faceInfluencedIds);
  const nextInfluenced: string[] = [];

  for (const id of motionIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.alpha < 0.06 || dot.tgtAlpha < 0.06) continue;
    const node = mesh.nodes[dot.hostId!];
    if (!node) continue;

    const gate = heroMotionGate(dot);
    if (gate <= 0.02) continue;

    if (node.group === 'hair') {
      const ambient = hairAmbientOffset(mesh, node, now, gate);
      let tgtOx = ambient.dx;
      let tgtOy = ambient.dy;
      const baseX = offsetX + node.x * scale;
      const baseY = offsetY + node.y * scale;
      const dx = baseX - pointerX;
      const dy = baseY - pointerY;
      const dist = Math.hypot(dx, dy);
      const radius = 250;

      if (pointerOn && dist < radius) {
        const blend = dot.idleMotionBlend * gate * live;
        const invDist = 1 / Math.max(dist, 1);
        const nx = dx * invDist;
        const ny = dy * invDist;
        const force = (1 - dist / radius) ** 2 * gate;
        const centerOffset = (node.x - mesh.width / 2) / mesh.width;
        const hairOuter = Math.min(1, Math.max(0.18, (Math.abs(centerOffset) - 0.08) / 0.34));
        const hairAnchor = 0.18 + hairOuter * 0.82;
        const mousePush = 10 * hairAnchor;
        const panic = force;
        const panicShakeX =
          Math.sin(now * 0.026 + node.phase * 7.1) * panic * 5.2 * hairAnchor;
        const panicShakeY =
          Math.cos(now * 0.031 + node.phase * 5.9) * panic * 4.4 * hairAnchor;
        tgtOx += (nx * force * mousePush + panicShakeX) * blend;
        tgtOy += (ny * force * mousePush + panicShakeY) * blend;
      }

      dot.faceTgtOx = tgtOx * live;
      dot.faceTgtOy = tgtOy * live;
      nextInfluenced.push(id);
      prevInfluenced.delete(id);
      continue;
    }

    if (!pointerOn) {
      if (dot.displayOx !== 0 || dot.displayOy !== 0 || dot.faceTgtOx !== 0 || dot.faceTgtOy !== 0) {
        dot.displayOx = 0;
        dot.displayOy = 0;
        dot.faceTgtOx = 0;
        dot.faceTgtOy = 0;
      }
      continue;
    }

    const baseX = offsetX + node.x * scale;
    const baseY = offsetY + node.y * scale;
    const dx = baseX - pointerX;
    const dy = baseY - pointerY;
    const dist = Math.hypot(dx, dy);
    const radius = 160;
    if (dist >= radius) continue;

    const invDist = 1 / Math.max(dist, 1);
    const nx = dx * invDist;
    const ny = dy * invDist;
    const blend = dot.idleMotionBlend * gate * live;
    const force = (1 - dist / radius) ** 2 * gate;
    const panic = force * 0.75;
    const panicShakeX = Math.sin(now * 0.026 + node.phase * 7.1) * panic * 2.1;
    const panicShakeY = Math.cos(now * 0.031 + node.phase * 5.9) * panic * 1.8;

    dot.faceTgtOx = (nx * force * 5 + panicShakeX) * blend;
    dot.faceTgtOy = (ny * force * 5 + panicShakeY) * blend;
    nextInfluenced.push(id);
    prevInfluenced.delete(id);
  }

  for (const id of prevInfluenced) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    dot.faceTgtOx = 0;
    dot.faceTgtOy = 0;
    dot.displayOx = 0;
    dot.displayOy = 0;
  }
  pool.faceInfluencedIds = nextInfluenced;
}

function wireBodyAlpha(isHair: boolean) {
  return isHair ? WIRE_HAIR_ALPHA : WIRE_BODY_ALPHA;
}

function wireHeroSettledAlpha(edge: MorphEdge, dotA: FlyingDot, dotB: FlyingDot) {
  const visA = dotDisplayAlpha(dotA);
  const visB = dotDisplayAlpha(dotB);
  if (visA < 0.04 || visB < 0.04) return 0;
  const isHair = edge.group === 'hair';
  return Math.min(visA, visB) * wireBodyAlpha(isHair);
}

function dotSettle(dot: FlyingDot) {
  const rem = Math.hypot(dot.tgtX - dot.x, dot.tgtY - dot.y);
  if (rem <= WIRE_ARRIVE_PX) return 1;
  const span = Math.max(dot.flightDist, rem, 1);
  return Math.max(0, 1 - rem / span);
}

function expectedSegLen(dotA: FlyingDot, dotB: FlyingDot) {
  return Math.hypot(dotA.tgtX - dotB.tgtX, dotA.tgtY - dotB.tgtY);
}

function wireAbsMaxPx(zone: MeshZone, layoutScale: number) {
  if (zone === 'palette') return WIRE_ABS_MAX_PALETTE_PX + layoutScale * 24 * WIRE_CATCH_MUL;
  if (isMorphShapeZone(zone)) return WIRE_ABS_MAX_CARD_PX + layoutScale * 28 * WIRE_CATCH_MUL;
  return WIRE_ABS_MAX_PX + layoutScale * 42 * WIRE_CATCH_MUL;
}

function dotBaseX(dot: FlyingDot) {
  return dot.x + dot.displayOx;
}

function dotBaseY(dot: FlyingDot) {
  return dot.y + dot.displayOy;
}

function wireSegLen(dotA: FlyingDot, dotB: FlyingDot, _zone: MeshZone) {
  return Math.hypot(dotBaseX(dotA) - dotBaseX(dotB), dotBaseY(dotA) - dotBaseY(dotB));
}

function dotWireAnchorGate(dot: FlyingDot) {
  const rem = Math.hypot(dot.x - dot.srcX, dot.y - dot.srcY);
  const holdPx = 2.5;
  const breakPx = 9;
  if (rem <= holdPx) return 1;
  if (rem >= breakPx) return 0;
  return 1 - (rem - holdPx) / (breakPx - holdPx);
}

function wireSegCap(
  dotA: FlyingDot,
  dotB: FlyingDot,
  zone: MeshZone,
  layoutScale: number,
  settled = false,
  isHair = false,
) {
  const expected = expectedSegLen(dotA, dotB);
  if (expected < 6) return 0;
  const lenRatio = isHair
    ? (settled ? WIRE_HAIR_LEN_RATIO_SETTLED : WIRE_HAIR_LEN_RATIO)
    : (settled ? WIRE_LEN_RATIO_SETTLED : WIRE_LEN_RATIO);
  return Math.min(
    expected * lenRatio,
    wireAbsMaxPx(zone, layoutScale) * (isHair ? 1.12 * WIRE_CATCH_MUL : 1),
    WIRE_DRAW_ABS_MAX_PX,
  );
}

function wireRetireAlpha(
  edge: MorphEdge,
  dotA: FlyingDot,
  dotB: FlyingDot,
  pool: FlyingPool,
) {
  if (edge.group === 'reflector' || edge.group === 'hair') return 0;
  const visA = dotDisplayAlpha(dotA);
  const visB = dotDisplayAlpha(dotB);
  if (visA <= 0.02 || visB <= 0.02) return 0;

  const anchorGate = Math.min(dotWireAnchorGate(dotA), dotWireAnchorGate(dotB));
  if (anchorGate <= 0.02) return 0;
  // Stare kreski przy starcie morphu — kropki jeszcze w klastrze, jedna klatka „flash”.
  if (pool.morphFlying && anchorGate >= 0.72) return 0;

  const retireZone = pool.retiringWireZone;
  if (retireZone) {
    const cap = wireSegCap(dotA, dotB, retireZone, pool.layoutScale);
    if (cap <= 0) return 0;
    const segLen = wireSegLen(dotA, dotB, retireZone);
    if (segLen > cap) return 0;
  }

  return Math.min(visA, visB) * anchorGate * WIRE_BODY_ALPHA;
}

function wireTargetAlpha(
  edge: MorphEdge,
  dotA: FlyingDot,
  dotB: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layoutScale: number,
  now: number,
  allowBloom: boolean,
  _allowHair: boolean,
  _heroFaceActive: boolean,
) {
  if (edge.group === 'reflector') {
    const ignite = Math.max(
      reflectorIgnite(dotA, pool, now),
      reflectorIgnite(dotB, pool, now),
    );
    if (ignite <= 0.04) return 0;
    const travel = Math.min(dotTravelGate(dotA), dotTravelGate(dotB));
    return Math.min(dotA.alpha, dotB.alpha) * travel * WIRE_BODY_ALPHA * (0.38 + ignite * 0.72);
  }

  if (pool.morphFlying) {
    const anchorA = dotWireAnchorGate(dotA);
    const anchorB = dotWireAnchorGate(dotB);
    if (
      dotInFlight(dotA)
      && dotInFlight(dotB)
      && anchorA >= 0.72
      && anchorB >= 0.72
    ) {
      return 0;
    }
  }

  const expected = expectedSegLen(dotA, dotB);
  if (expected < 6) return 0;

  const isHair = edge.group === 'hair';
  const morphHeroBuild = heroMorphWireBuilding(pool, zone);
  const travel = morphHeroBuild
    ? Math.min(wireTravelGate(dotA), wireTravelGate(dotB))
    : Math.min(dotTravelGate(dotA), dotTravelGate(dotB));

  const visA = dotDisplayAlpha(dotA);
  const visB = dotDisplayAlpha(dotB);

  if (morphHeroBuild) {
    if (travel < 0.02) return 0;
    const segLen = wireSegLen(dotA, dotB, zone);
    const morphCap = Math.max(
      expected * (isHair ? WIRE_HAIR_LEN_RATIO_SETTLED : WIRE_LEN_RATIO_SETTLED),
      wireAbsMaxPx(zone, layoutScale) * (isHair ? 1.55 : 1.35),
    );
    if (segLen > morphCap) return 0;
    const lenGate = segLen <= expected
      ? 1
      : Math.max(0, 1 - (segLen - expected) / Math.max(morphCap - expected, 1));
    let alpha = Math.min(visA, visB) * travel * lenGate * wireBodyAlpha(isHair);
    if (alpha <= 0.02) return 0;
    return alpha;
  }

  const segLen = wireSegLen(dotA, dotB, zone);
  const settle = Math.min(dotSettle(dotA), dotSettle(dotB));
  const settled = settle >= 0.86;
  const cap = wireSegCap(
    dotA,
    dotB,
    zone,
    layoutScale,
    settled,
    isHair,
  );
  if (cap <= 0 || segLen > cap) return 0;

  const settleMin = zone === 'hero'
    ? 0
    : isMorphShapeZone(zone)
      ? WIRE_SETTLE_MIN_SHAPE
      : WIRE_SETTLE_MIN;

  if (settle < settleMin) return 0;
  const settleGate = easeOutEmphasized(
    Math.min(1, (settle - settleMin) / (1 - settleMin)),
  );

  let lenGate = segLen <= expected
    ? 1
    : 1 - (segLen - expected) / Math.max(cap - expected, 1);

  let alpha = Math.min(visA, visB) * settleGate * lenGate * wireBodyAlpha(isHair);
  alpha *= travel;
  if (alpha <= 0.02) return 0;

  if (zone === 'hero' || zone === 'ring') return alpha;

  const shA = dotShimmer(dotA, now, zone, pin);
  const shB = dotShimmer(dotB, now, zone, pin);
  const wireTwinkle = shA.gate > 0.02 || shB.gate > 0.02
    ? (shA.wireMul + shB.wireMul) * 0.5
    : 1;
  alpha *= wireTwinkle;

  const bloom = Math.max(
    dotSettleBloom(dotA, now, allowBloom),
    dotSettleBloom(dotB, now, allowBloom),
  );
  if (bloom > 0.02) {
    alpha *= 1 + bloom * SETTLE_WIRE_BLOOM;
  }

  return alpha;
}

function pinInViewport(pin: MeshPinState, marginPx = 280): boolean {
  const bottom = pin.top + pin.stageH;
  const vh = window.innerHeight;
  return bottom > -marginPx && pin.top < vh + marginPx;
}

function syncWireCanvas(canvas: HTMLCanvasElement, layer: HTMLElement, lowDpr = false) {
  const w = Math.max(layer.clientWidth, window.innerWidth);
  const h = parseFloat(layer.style.height) || layer.scrollHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, lowDpr ? 1 : 1.25);
  const pw = Math.round(w * dpr);
  const ph = Math.round(h * dpr);
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw;
    canvas.height = ph;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
  }
  return { w, h, dpr };
}

function paletteWireColor(
  zone: MeshZone,
  dotA: FlyingDot,
  dotB: FlyingDot,
  paletteColors: PaletteToneColors | null,
): string | null {
  if (zone !== 'palette' || !paletteColors) return null;
  const toneA = dotA.paletteTone;
  const toneB = dotB.paletteTone;
  if (!toneA || !toneB || toneA === 'wire' || toneB === 'wire') return null;
  if (toneA !== toneB) return null;
  return paletteColors[toneA];
}

function paintWires(
  pool: FlyingPool,
  canvas: HTMLCanvasElement,
  layer: HTMLElement,
  zone: MeshZone,
  pin: MeshPinState,
  accent: string,
  layerOrigin: { x: number; y: number },
  now: number,
  allowBloom: boolean,
  allowHair: boolean,
  heroFaceActive: boolean,
  paletteColors: PaletteToneColors | null = null,
  lowDpr = false,
  morphActive = false,
  pointer: FacePointer = IDLE_FACE_POINTER,
  extraClearPin: MeshPinState | null = null,
  fullClear = false,
) {
  const pointerPos = heroPointerStageXY(pin, pointer);
  const pointerX = pointerPos.x;
  const pointerY = pointerPos.y;
  const { w, h, dpr } = syncWireCanvas(canvas, layer, lowDpr);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (morphActive || zone === 'palette' || fullClear) {
    ctx.clearRect(0, 0, w, h);
  } else {
    const clips: { pin: MeshPinState; zone: MeshZone }[] = [{ pin, zone }];
    if (extraClearPin) clips.push({ pin: extraClearPin, zone: 'spray' });
    clearCanvasClips(ctx, layerOrigin, w, h, clips);
  }
  ctx.lineCap = 'round';

  type WireBatch = { path: Path2D; alpha: number; color: string; width: number };
  const batches: WireBatch[] = [];

  const drawWireEdge = (
    edge: MorphEdge,
    wireZone: MeshZone,
    alpha: number,
    dotA: FlyingDot,
    dotB: FlyingDot,
  ) => {
    if (alpha <= 0.02) return;
    const travel = Math.min(dotTravelGate(dotA), dotTravelGate(dotB));
    const isHair = edge.group === 'hair';
    const matchedPalette = paletteWireColor(wireZone, dotA, dotB, paletteColors);
    let color = heroWireBaseColor(accent, wireZone, isHair, matchedPalette);
    let ax: number;
    let ay: number;
    let bx: number;
    let by: number;
    if (wireZone === 'hero') {
      ax = dotA.x + dotA.displayOx - layerOrigin.x;
      ay = dotA.y + dotA.displayOy - layerOrigin.y;
      bx = dotB.x + dotB.displayOx - layerOrigin.x;
      by = dotB.y + dotB.displayOy - layerOrigin.y;
      if (pointer.active && !isHair) {
        const axs = dotA.x + dotA.displayOx - pin.docLeft;
        const ays = dotA.y + dotA.displayOy - pin.docTop;
        const bxs = dotB.x + dotB.displayOx - pin.docLeft;
        const bys = dotB.y + dotB.displayOy - pin.docTop;
        const wireHeat = wireSegmentHeat(axs, ays, bxs, bys, pointerX, pointerY);
        color = heroWirePaintColor(accent, color, wireHeat);
      }
    } else {
      ax = dotDrawX(dotA, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.x;
      ay = dotDrawY(dotA, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.y;
      bx = dotDrawX(dotB, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.x;
      by = dotDrawY(dotB, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.y;
    }
    let width =
      (isHair ? 1.0 : 0.9) * Math.max(0.9, pool.layoutScale) * (0.82 + travel * 0.22);
    if (isEyeZone(wireZone)) {
      const cover = eyeBlinkCover(wireZone as 'careerEye' | 'skillsEye', now);
      width *= (eyeBlinkSquash(cover) + eyeBlinkStretchX(cover)) * 0.5;
    }

    if (Math.hypot(bx - ax, by - ay) > WIRE_DRAW_ABS_MAX_PX) return;

    const bucketAlpha = Math.round(alpha * 20) / 20;
    const last = batches[batches.length - 1];
    if (last && last.color === color && last.width === width && last.alpha === bucketAlpha) {
      last.path.moveTo(ax, ay);
      last.path.lineTo(bx, by);
      return;
    }

    const path = new Path2D();
    path.moveTo(ax, ay);
    path.lineTo(bx, by);
    batches.push({ path, alpha: bucketAlpha, color, width });
  };

  const heroMorphing = zone === 'hero' && (pool.morphFlying || anyDotInFlight(pool));
  if (pool.retiringWireZone && pool.retiringWireEdges.length > 0 && !heroMorphing) {
    for (const edge of pool.retiringWireEdges) {
      const dotA = poolDotForEdge(pool, edge, 'a');
      const dotB = poolDotForEdge(pool, edge, 'b');
      if (!dotA || !dotB) continue;
      drawWireEdge(
        edge,
        pool.retiringWireZone,
        wireRetireAlpha(edge, dotA, dotB, pool),
        dotA,
        dotB,
      );
    }
  }

  const heroWireFast = zone === 'hero' && !heroMorphing && pool.heroLiveBlend >= 0.99;
  const useHeroPairs = heroWireFast && pool.heroWirePairs.length > 0;

  const paintWirePair = (
    edge: MorphEdge,
    dotA: FlyingDot,
    dotB: FlyingDot,
  ) => {
    const alpha = heroWireFast
      ? wireHeroSettledAlpha(edge, dotA, dotB)
      : wireTargetAlpha(
        edge,
        dotA,
        dotB,
        pool,
        zone,
        pin,
        pool.layoutScale,
        now,
        allowBloom,
        allowHair,
        heroFaceActive,
      );
    drawWireEdge(edge, zone, alpha, dotA, dotB);
  };

  if (useHeroPairs) {
    for (const { edge, dotA, dotB } of pool.heroWirePairs) {
      if (edge.group === 'hair') continue;
      paintWirePair(edge, dotA, dotB);
    }
    for (const { edge, dotA, dotB } of pool.heroWirePairs) {
      if (edge.group !== 'hair') continue;
      paintWirePair(edge, dotA, dotB);
    }
  } else {
    const paintWireEdge = (edge: MorphEdge) => {
      const dotA = poolDotForEdge(pool, edge, 'a');
      const dotB = poolDotForEdge(pool, edge, 'b');
      if (!dotA || !dotB) return;
      paintWirePair(edge, dotA, dotB);
    };

    for (const edge of pool.wireEdges) {
      if (edge.group === 'hair') continue;
      paintWireEdge(edge);
    }
    for (const edge of pool.wireEdges) {
      if (edge.group !== 'hair') continue;
      paintWireEdge(edge);
    }
  }

  for (const batch of batches) {
    ctx.globalAlpha = batch.alpha;
    ctx.strokeStyle = batch.color;
    ctx.lineWidth = batch.width;
    ctx.stroke(batch.path);
  }

  ctx.globalAlpha = 1;
}

function paintPaletteCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  paletteColors: PaletteToneColors,
  now: number,
  heroFaceActive: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const batches = new Map<string, CanvasDotBatch[]>();
  const gray: CanvasDotBatch[] = [];

  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || !dot.id.startsWith('h:')) continue;
    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;

    const { x: px, y: py } = canvasDotPosition(
      dot, pool, zone, pin, layerOrigin, now, heroFaceActive,
    );
    const a = Math.min(1, alpha * DOT_ALPHA);
    const tone = dot.paletteTone ?? 'wire';

    if (tone === 'wire') {
      gray.push({ x: px, y: py, alpha: a, rad: r });
      continue;
    }

    const color = paletteColors[tone];
    let bucket = batches.get(color);
    if (!bucket) {
      bucket = [];
      batches.set(color, bucket);
    }
    bucket.push({ x: px, y: py, alpha: a, rad: r });
  }

  flushCanvasDotBatch(ctx, DOT_GRAY, gray);
  for (const [color, points] of batches) {
    flushCanvasDotBatch(ctx, color, points);
  }

  ctx.globalAlpha = 1;
}

type CanvasDotBatch = { x: number; y: number; alpha: number; rad: number };

function flushCanvasDotBatch(
  ctx: CanvasRenderingContext2D,
  color: string,
  points: CanvasDotBatch[],
) {
  if (points.length === 0) return;
  ctx.fillStyle = color;
  const byAlpha = new Map<number, CanvasDotBatch[]>();
  for (const p of points) {
    const bucket = Math.round(p.alpha * 16) / 16;
    let group = byAlpha.get(bucket);
    if (!group) {
      group = [];
      byAlpha.set(bucket, group);
    }
    group.push(p);
  }
  for (const [alpha, group] of byAlpha) {
    ctx.globalAlpha = alpha;
    const path = new Path2D();
    for (const p of group) {
      path.moveTo(p.x + p.rad, p.y);
      path.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
    }
    ctx.fill(path);
  }
}

/** Hero — kropki zawsze na canvas (twarz + włosy), bez ~600 spanów DOM / klatkę. */
function paintHeroCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  accent: string,
  now: number,
  heroFaceActive: boolean,
  pointer: FacePointer = IDLE_FACE_POINTER,
  scrollFrozen = false,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  let count = 0;
  const faceByColor = new Map<string, CanvasDotBatch[]>();
  const hairByColor = new Map<string, CanvasDotBatch[]>();
  const white: CanvasDotBatch[] = [];
  const iris: CanvasDotBatch[] = [];
  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.tgtAlpha <= 0.03) continue;
    if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) continue;

    const { x: px, y: py } = canvasDotPosition(
      dot, pool, zone, pin, layerOrigin, now, heroFaceActive, scrollFrozen,
    );

    if (dot.isReflector) {
      const ignite = reflectorPaintAlpha(dot, pool, zone, now);
      if (ignite <= 0.001) continue;
      count += 1;
      const refAlpha = isEyeZone(zone)
        ? Math.min(1, ignite)
        : Math.min(1, ignite * DOT_ALPHA);
      const refDot = {
        x: px,
        y: py,
        alpha: refAlpha,
        rad: reflectorAnchorR(dot, pool, r),
      };
      if (isEyeZone(zone)) iris.push(refDot);
      else white.push(refDot);
      continue;
    }

    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;
    const a = Math.min(1, alpha * DOT_ALPHA);
    count += 1;

    const flightScale = dotInFlight(dot) && dot.gatherPath ? dotFlightScale(dot) : 1;
    const rad = r * flightScale;

    const heat = dotPointerHeat(dot, pin, pointer);
    if (dot.isHair && dot.tgtHairMix > 0) {
      const color = heroHairDotColor(accent);
      let bucket = hairByColor.get(color);
      if (!bucket) {
        bucket = [];
        hairByColor.set(color, bucket);
      }
      bucket.push({ x: px, y: py, alpha: a, rad });
      continue;
    }

    const faceColor = heroDotPaintColor(accent, heroDotBaseColor(accent, dot), heat);
    let faceBucket = faceByColor.get(faceColor);
    if (!faceBucket) {
      faceBucket = [];
      faceByColor.set(faceColor, faceBucket);
    }
    faceBucket.push({ x: px, y: py, alpha: a, rad });
  }

  for (const [color, bucket] of faceByColor) {
    flushCanvasDotBatch(ctx, color, bucket);
  }
  for (const [color, bucket] of hairByColor) {
    flushCanvasDotBatch(ctx, color, bucket);
  }
  flushCanvasDotBatch(ctx, accent, iris);
  flushCanvasDotBatch(ctx, '#ffffff', white);

  ctx.globalAlpha = 1;
  return count;
}

/** Pierścionek StyleRank — mocne złoto, fala błysku, iskry na kamieniu. */
function paintRingCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  now: number,
  heroFaceActive: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  let count = 0;
  const { master, ripple, t } = ringShimmerPhase(now);
  const globalPulse = 0.62 + 0.38 * master * ripple;
  const byColor = new Map<string, CanvasDotBatch[]>();
  const gemLayer: CanvasDotBatch[] = [];
  const halos: CanvasDotBatch[] = [];
  const sparks: CanvasDotBatch[] = [];

  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.tgtAlpha <= 0.03) continue;
    if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) continue;

    const { x: px, y: py } = canvasDotPosition(
      dot, pool, zone, pin, layerOrigin, now, heroFaceActive,
    );
    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;

    const flightScale = dotInFlight(dot) && dot.gatherPath ? dotFlightScale(dot) : 1;
    const seed = starSeed(dot);
    const phase = ringShimmerPhase(now, seed);
    const gemW = ringGemWeightCanvas(px, py, pin, layerOrigin);

    const sx = px + layerOrigin.x - pin.docLeft;
    const sy = py + layerOrigin.y - pin.docTop;
    const nx = sx / Math.max(pin.stageW, 1);
    const ny = sy / Math.max(pin.stageH, 1);
    const sweep = 0.5 + 0.5 * Math.sin(t * (RING_SHIMMER_HZ * 1.65) - nx * 5.2 - ny * 1.8 + seed);
    const twinkle = 0.38 + 0.62 * phase.glint * sweep;
    const pulse = globalPulse * twinkle * (0.82 + gemW * 0.18);

    const rad = r * flightScale * (1 + pulse * RING_SCALE_PULSE * (0.55 + gemW * 0.45));
    const a = Math.min(1, alpha * DOT_ALPHA * (0.76 + pulse * 0.24));

    const goldT = Math.min(
      0.99,
      0.68 + pulse * 0.26 + gemW * 0.28,
    );
    let color = mixHex(DOT_GRAY, RING_GEM_GOLD, goldT);
    if (gemW > 0.32 && phase.wave > 0.62) {
      color = mixHex(color, RING_GEM_WHITE, (phase.wave - 0.62) * gemW * 1.4);
    } else if (pulse < 0.72) {
      color = mixHex(color, RING_GEM_DEEP, (0.72 - pulse) * 0.35);
    }

    count += 1;
    let bucket = byColor.get(color);
    if (!bucket) {
      bucket = [];
      byColor.set(color, bucket);
    }
    bucket.push({ x: px, y: py, alpha: a, rad });

    if (gemW > 0.18) {
      gemLayer.push({
        x: px,
        y: py,
        alpha: Math.min(1, a * (0.78 + gemW * 0.22)),
        rad: rad * (1.08 + pulse * 0.1),
      });
    }
    if (gemW > 0.28) {
      halos.push({
        x: px,
        y: py,
        alpha: Math.min(0.92, a * pulse * (0.48 + gemW * 0.52)),
        rad: rad * (1.55 + pulse * 0.28),
      });
    }
    if (gemW > 0.34 && phase.wave > 0.48) {
      sparks.push({
        x: px,
        y: py,
        alpha: Math.min(1, a * phase.wave * (0.62 + gemW * 0.38)),
        rad: rad * (1.35 + phase.glint * 0.35),
      });
    }
  }

  for (const [color, bucket] of byColor) {
    flushCanvasDotBatch(ctx, color, bucket);
  }

  if (gemLayer.length > 0) {
    flushCanvasDotBatch(
      ctx,
      mixHex(RING_GEM_GOLD, RING_GEM_WHITE, 0.38 + master * 0.42),
      gemLayer,
    );
  }

  if (halos.length > 0 || sparks.length > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    if (halos.length > 0) {
      flushCanvasDotBatch(ctx, RING_GEM_SPARK, halos);
    }
    if (sparks.length > 0) {
      flushCanvasDotBatch(ctx, RING_GEM_WHITE, sparks);
      const cores = sparks.map((p) => ({
        x: p.x,
        y: p.y,
        alpha: Math.min(1, p.alpha * 0.72),
        rad: p.rad * 0.58,
      }));
      flushCanvasDotBatch(ctx, RING_GEM_WHITE, cores);
    }
    ctx.restore();
  }

  ctx.globalAlpha = 1;
  return count;
}

/** Kształty projektów (bus, widelec…) — szare kropki na canvasie. */
function paintShapeCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  now: number,
  heroFaceActive: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  let count = 0;
  const bucket: CanvasDotBatch[] = [];
  const reflectors: CanvasDotBatch[] = [];

  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.tgtAlpha <= 0.03) continue;
    if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) continue;

    const { x: px, y: py } = canvasDotPosition(
      dot, pool, zone, pin, layerOrigin, now, heroFaceActive,
    );

    if (dot.isReflector) {
      const ignite = reflectorPaintAlpha(dot, pool, zone, now);
      if (ignite <= 0.001) continue;
      count += 1;
      reflectors.push({
        x: px,
        y: py,
        alpha: Math.min(1, ignite * DOT_ALPHA),
        rad: reflectorAnchorR(dot, pool, r),
      });
      continue;
    }

    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;

    const flightScale = dotInFlight(dot) && dot.gatherPath ? dotFlightScale(dot) : 1;
    const a = Math.min(1, alpha * DOT_ALPHA);
    const rad = r * flightScale;

    count += 1;
    bucket.push({ x: px, y: py, alpha: a, rad });
  }

  flushCanvasDotBatch(ctx, DOT_GRAY, bucket);
  if (reflectors.length > 0) {
    flushCanvasDotBatch(ctx, '#ffffff', reflectors);
  }
  ctx.globalAlpha = 1;
  return count;
}

/** Oko (career / skills) — kropki na canvas z tą samą deformacją mrugania co kreski. */
function paintEyeCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  accent: string,
  now: number,
  heroFaceActive: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  const eyeZone = zone as 'careerEye' | 'skillsEye';
  const blink = eyeBlinkCover(eyeZone, now);
  const blinkSy = eyeBlinkSquash(blink);
  const blinkSx = eyeBlinkStretchX(blink);

  let count = 0;
  const gray: { x: number; y: number; alpha: number; rx: number; ry: number }[] = [];
  const iris: { x: number; y: number; alpha: number; rx: number; ry: number }[] = [];

  for (const id of pool.paintDotIds) {
    const dot = pool.dots.get(id);
    if (!dot || dot.tgtAlpha <= 0.03) continue;
    if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) continue;

    const { x: px, y: py } = canvasDotPosition(
      dot, pool, zone, pin, layerOrigin, now, heroFaceActive,
    );

    if (dot.isReflector) {
      const ignite = reflectorPaintAlpha(dot, pool, zone, now);
      if (ignite <= 0.001) continue;
      count += 1;
      const baseR = reflectorAnchorR(dot, pool, r);
      iris.push({
        x: px,
        y: py,
        alpha: Math.min(1, ignite),
        rx: baseR * blinkSx,
        ry: baseR * blinkSy,
      });
      continue;
    }

    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;
    count += 1;
    const flightScale = dotInFlight(dot) && dot.gatherPath ? dotFlightScale(dot) : 1;
    const baseR = r * flightScale;
    gray.push({
      x: px,
      y: py,
      alpha: Math.min(1, alpha * DOT_ALPHA),
      rx: baseR * blinkSx,
      ry: baseR * blinkSy,
    });
  }

  flushCanvasEllipseBatch(ctx, DOT_GRAY, gray);
  flushCanvasEllipseBatch(ctx, accent, iris);
  ctx.globalAlpha = 1;
  return count;
}

function flushCanvasEllipseBatch(
  ctx: CanvasRenderingContext2D,
  color: string,
  points: { x: number; y: number; alpha: number; rx: number; ry: number }[],
) {
  if (points.length === 0) return;
  ctx.fillStyle = color;
  const byAlpha = new Map<number, typeof points>();
  for (const p of points) {
    const bucket = Math.round(p.alpha * 16) / 16;
    let group = byAlpha.get(bucket);
    if (!group) {
      group = [];
      byAlpha.set(bucket, group);
    }
    group.push(p);
  }
  for (const [alpha, group] of byAlpha) {
    ctx.globalAlpha = alpha;
    for (const p of group) {
      if (p.rx < 0.2 || p.ry < 0.2) continue;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.rx, p.ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function ensureDot(
  pool: FlyingPool,
  layer: HTMLElement,
  id: string,
  dotClass: string,
  _hairClass: string,
  hairIds: Set<number>,
  _accent: string,
  size: number,
  spawn: ViewportGoal,
  attachToDom = true,
): FlyingDot {
  const existing = pool.dots.get(id);
  if (existing) {
    if (attachToDom && !existing.el.isConnected) layer.appendChild(existing.el);
    return existing;
  }

  const isReflector = id.startsWith('l:');
  const hostId = isReflector
    ? null
    : id.startsWith('h:')
      ? Number(id.slice(2))
      : null;
  const isHair = hostId != null && hairIds.has(hostId);
  const el = document.createElement('span');
  el.dataset.dotId = id;
  el.className = dotClass;
  el.style.background = DOT_GRAY;
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = '0';
  if (attachToDom) layer.appendChild(el);

  const dot: FlyingDot = {
    id,
    hostId,
    el,
    x: spawn.x,
    y: spawn.y,
    srcX: spawn.x,
    srcY: spawn.y,
    tgtX: spawn.x,
    tgtY: spawn.y,
    flightU: 1,
    flightDist: 0,
    flightDur: FLIGHT_DURATION_S,
    speedMul: 1,
    departLeft: 0,
    alphaHoldLeft: 0,
    arcPx: 0,
    hubX: spawn.x,
    hubY: spawn.y,
    gatherCx: spawn.x,
    gatherCy: spawn.y,
    streakUx: 0,
    streakUy: 1,
    gatherPath: false,
    simpleFlight: false,
    alpha: 0,
    tgtAlpha: 0,
    isHair,
    hairMix: 0,
    tgtHairMix: 0,
    displayOx: 0,
    displayOy: 0,
    faceTgtOx: 0,
    faceTgtOy: 0,
    pointerTint: 0,
    settleBloomAt: 0,
    idleMotionBlend: 1,
    isReflector,
    reflectorPhase: 0,
    reflectorR: 0,
    reflectorHostId: null,
    paletteTone: null,
  };
  pool.dots.set(id, dot);
  return dot;
}

function syncFlyingTargets(
  pool: FlyingPool,
  layer: HTMLElement,
  bundle: MeshBundle,
  zone: MeshZone,
  paletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
  pins: NonNullable<ReturnType<typeof computeAllZonePins>>,
  dotClass: string,
  hairClass: string,
  hairIds: Set<number>,
  accent: string,
  zoneChanged: boolean,
  budgetMs: number,
  waveDir: ScrollBuildDir,
): boolean {
  let pending = pool.zoneSyncPending;
  if (pending && pending.zone !== zone) {
    pool.zoneSyncPending = null;
    pool.syncScrollAnchorY = -1;
    pending = null;
  }

  if (!pending) {
    const layoutT0 = performance.now();
    const layout = viewportGoalsForZone(zone, bundle, paletteAim, pins);
    if (!layout) return true;

    if (zoneChanged && pool.activeZone && pool.wireEdges.length > 0) {
      pool.retiringWireEdges = pool.wireEdges;
      pool.retiringWireZone = pool.activeZone;
    }

    pool.wireEdges = layout.edges;
    if (zone === 'hero') refreshHeroWirePairs(pool);
    else pool.heroWirePairs = [];
    pool.paletteTones = zone === 'palette' ? layout.paletteTones : new Map();
    pool.paletteSplatTones = zone === 'palette' ? layout.paletteSplatTones : new Map();
    pool.paletteToneAnchors = zone === 'palette' ? layout.paletteToneAnchors : new Map();

    const prevZoneIds = new Set<string>();
    if (zoneChanged && pool.activeZone) {
      const prevLayout = viewportGoalsForZone(pool.activeZone, bundle, paletteAim, pins);
      if (prevLayout) {
        for (const id of prevLayout.goals.keys()) prevZoneIds.add(id);
      }
    }
    lastSyncLayoutMs = performance.now() - layoutT0;

    const visibleBefore = new Set<string>();
    for (const id of prevZoneIds) {
      const dot = pool.dots.get(id);
      if (dot && (dot.alpha > 0.04 || dot.tgtAlpha > 0.04)) visibleBefore.add(id);
    }

    pool.tgtLayoutScale = layout.layoutScale;
    const r = Math.max(1.4, 4.5 * pool.layoutScale);
    const leavingHero = zoneChanged && pool.activeZone === 'hero' && zone !== 'hero';

    pending = {
      zone,
      zoneChanged,
      layout,
      prevZoneIds,
      entries: [...layout.goals.entries()],
      index: 0,
      activeIds: new Set<string>(),
      flightStarts: [] as string[],
      reflectorById: new Map(
        layout.reflectors.map((ref) => [ref.targetId, ref] as const),
      ),
      visibleBefore,
      hostOrder: sortedHostIds(layout.goals),
      leavingHero,
      buildingShape: zoneChanged && !leavingHero,
      dotFragment: document.createDocumentFragment(),
      batchNewDots: false,
      size: r * 2,
      waveDir,
    };
    pool.zoneSyncPending = pending;
    pool.syncScrollAnchorY = window.scrollY;
  }

  const p = pending;
  const ensureT0 = performance.now();
  const canvasDots = zoneUsesCanvasDots(zone);

  for (; p.index < p.entries.length; p.index += 1) {
    if (performance.now() - ensureT0 > budgetMs) {
      return false;
    }

    const [id, goal] = p.entries[p.index];
    p.activeIds.add(id);
    const wasInPrevZone = p.prevZoneIds.has(id);
    const isNew = !pool.dots.has(id);
    const dot = ensureDot(
      pool,
      layer,
      id,
      dotClass,
      hairClass,
      hairIds,
      accent,
      p.size,
      goal,
      !canvasDots,
    );
    if (isNew) p.batchNewDots = true;

    if (id.startsWith('l:')) {
      const targetId = Number(id.slice(2));
      const ref = p.reflectorById.get(targetId);
      dot.isReflector = true;
      dot.reflectorPhase = ref?.phase ?? dot.reflectorPhase;
      dot.reflectorR = ref?.r ?? dot.reflectorR;
      dot.reflectorHostId = ref?.hostId ?? dot.reflectorHostId;
    } else {
      dot.isReflector = false;
      dot.reflectorHostId = null;
    }

    const prevTgtX = dot.tgtX;
    const prevTgtY = dot.tgtY;
    dot.tgtX = goal.x;
    dot.tgtY = goal.y;
    dot.tgtAlpha = DOT_ALPHA;
    dot.tgtHairMix = dot.isHair && zone === 'hero' ? 1 : 0;
    if (zone === 'palette' && dot.hostId != null) {
      dot.paletteTone = p.layout.paletteTones.get(dot.hostId) ?? 'wire';
    } else {
      dot.paletteTone = null;
    }
    if (p.zoneChanged && dot.isHair && zone === 'hero') {
      dot.hairMix = 0;
    }

    if (p.zoneChanged && p.buildingShape && !wasInPrevZone) {
      if (dot.isReflector && reflectorMorphSnapZone(zone)) {
        snapReflectorForMorph(dot, goal);
      } else {
        const dup = findDuplicateSpawn(
          id,
          pool,
          p.visibleBefore,
          p.layout.mergeMembers,
          p.hostOrder,
        );
        if (dup) {
          dot.x = dup.x;
          dot.y = dup.y;
          dot.srcX = dup.x;
          dot.srcY = dup.y;
        }
        dot.alpha = 0;
      }
    }

    const tgtShift = Math.hypot(prevTgtX - goal.x, prevTgtY - goal.y);
    const hardTargetMoved =
      (p.zoneChanged && wasInPrevZone)
      || (p.zoneChanged && !wasInPrevZone);
    const softShiftLimit = isMorphShapeZone(zone) ? SOFT_TGT_SHIFT_PX : 1.5;
    const softTargetMoved = !p.zoneChanged && tgtShift > softShiftLimit;
    if (hardTargetMoved || softTargetMoved) {
      if (dot.isReflector && reflectorMorphSnapZone(zone)) {
        snapReflectorForMorph(dot, goal);
      } else {
        p.flightStarts.push(id);
      }
    } else if (tgtShift > 0.5) {
      const rem = Math.hypot(dot.x - goal.x, dot.y - goal.y);
      if (rem > dot.flightDist) dot.flightDist = rem;
    }
  }

  if (p.batchNewDots && !canvasDots && p.dotFragment.childNodes.length > 0) {
    layer.appendChild(p.dotFragment);
    p.batchNewDots = false;
  } else if (p.batchNewDots) {
    p.batchNewDots = false;
  }

  lastSyncEnsureDotsMs = performance.now() - ensureT0;

  const heroCrumbleIds = p.leavingHero ? [...p.prevZoneIds] : [];
  const crumbleRanks = p.leavingHero
    ? crumbleRanksByCurrentY(pool, heroCrumbleIds, p.waveDir)
    : null;
  const flightCount = p.leavingHero ? heroCrumbleIds.length : p.flightStarts.length;

  const morphDots = p.flightStarts
    .map((id) => pool.dots.get(id))
    .filter((dot): dot is FlyingDot => dot != null);
  const flightHub = morphDots.length > 0 ? computeFlightHub(morphDots) : null;
  const streakLayout = flightHub && morphDots.length > 0
    ? computeStreakLayout(morphDots, flightHub)
    : null;

  const enteringHero = zone === 'hero' && (p.zoneChanged || pool.activeZone == null);
  // Pierwsze wejście na stronę — szybki lot; powrót z innej strefy — gather jak paleta/bus.
  const simpleMorph = enteringHero && pool.activeZone == null;

  for (const id of p.flightStarts) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    const rank = streakLayout?.ranks.get(id) ?? 0;
    beginFlight(dot, rank, p.flightStarts.length, {
      gather: !simpleMorph,
      simpleHero: simpleMorph,
      hub: simpleMorph ? undefined : flightHub ?? undefined,
      streakUx: simpleMorph ? undefined : streakLayout?.ux,
      streakUy: simpleMorph ? undefined : streakLayout?.uy,
    });
  }
  if (p.flightStarts.length > 0) {
    pool.morphFlying = true;
    pool.morphBloomAt = 0;
    if (zone === 'hero') pool.heroLiveBlend = 0;
  } else if (zone === 'bus' && p.zoneChanged && poolHasActiveReflectors(pool)) {
    pool.morphBloomAt = performance.now();
  }

  const crumbleExits: string[] = [];
  const zoneExitIds: string[] = [];
  for (const [, dot] of pool.dots) {
    if (!p.activeIds.has(dot.id)) {
      dot.tgtAlpha = 0;
      dot.tgtHairMix = 0;
      if (p.leavingHero && p.prevZoneIds.has(dot.id)) {
        crumbleExits.push(dot.id);
      } else if (p.zoneChanged && dot.alpha > 0.04) {
        zoneExitIds.push(dot.id);
      } else if (p.zoneChanged) {
        dot.alpha = 0;
        idleDotFlight(dot);
      }
    }
  }

  const zoneExitRanks = zoneExitIds.length > 0
    ? exitRanksForZoneChange(pool, zoneExitIds, flightHub, p.waveDir)
    : null;
  const zoneExitCount = zoneExitIds.length;

  for (const id of zoneExitIds) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    const rank = zoneExitRanks?.get(id) ?? 0;
    const seed = dot.hostId ?? rank;
    const jitter = spawnJitter(seed);
    dot.tgtX = dot.x + jitter.x * 0.45;
    dot.tgtY = dot.y + ZONE_EXIT_DRIFT_Y + ((seed * PHI) % 1) * 16;
    beginFlight(dot, rank, zoneExitCount, {
      holdAlpha: true,
      zoneExit: true,
    });
  }

  if (zoneExitIds.length > 0) {
    pool.morphFlying = true;
    pool.morphBloomAt = 0;
    if (zone === 'hero') pool.heroLiveBlend = 0;
  }

  for (const id of crumbleExits) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    const rank = crumbleRanks?.get(id) ?? 0;
    const seed = dot.hostId ?? rank;
    const jitter = spawnJitter(seed);
    dot.tgtX = dot.x + jitter.x * 0.55;
    dot.tgtY = dot.y + CRUMBLE_DRIFT_Y + ((seed * PHI) % 1) * 22;
    beginFlight(dot, rank, flightCount, {
      holdAlpha: true,
      crumble: true,
    });
  }

  pool.zoneSyncPending = null;
  pool.syncScrollAnchorY = -1;
  refreshPaintDotIds(pool);
  pool.faceMotionDotIds = [];
  pool.faceInfluencedIds = [];
  pool.heroWirePairs = [];
  return true;
}

function desiredHairMix(dot: FlyingDot) {
  if (dot.tgtHairMix <= 0) return 0;
  if (dot.flightDist > 0.5 && dot.flightU < 1) {
    if (!dot.gatherPath && dot.hairMix > 0.9) return dot.hairMix;
    const travelU = dot.gatherPath ? wireTravelGate(dot) : dot.flightU;
    if (travelU < 0.04) return 0;
    return Math.max(0.88, easeOutEmphasized(travelU));
  }
  return 1;
}

function stepHairMix(
  dot: FlyingDot,
  dt: number,
  hairMotionReady: boolean,
  freezeFade = false,
) {
  if (!dot.isHair) return;
  const morphHairTint = dot.tgtHairMix > 0
    && (dotInFlight(dot) || dot.departLeft > 0.01 || dot.flightU < 0.999);
  if (!hairMotionReady) {
    if (freezeFade || morphHairTint) {
      if (morphHairTint) dot.hairMix = desiredHairMix(dot);
      return;
    }
    dot.hairMix = stepScalar(dot.hairMix, 0, HAIR_COLOR_SPEED * 1.6, dt);
    return;
  }
  const desired = desiredHairMix(dot);
  if (dotInFlight(dot) || dot.departLeft > 0.01 || dot.flightU < 0.999) {
    dot.hairMix = desired;
    return;
  }
  dot.hairMix = stepScalar(dot.hairMix, desired, HAIR_COLOR_SPEED, dt);
}

function paintDot(
  dot: FlyingDot,
  pool: FlyingPool,
  layerOrigin: { x: number; y: number },
  r: number,
  accent: string,
  dotClass: string,
  hairClass: string,
  flightClass: string,
  settleBloomClass: string,
  starClass: string,
  reflectorClass: string,
  diamondClass: string,
  now: number,
  zone: MeshZone,
  pin: MeshPinState,
  allowBloom: boolean,
  heroFaceActive: boolean,
  paletteColors: PaletteToneColors | null = null,
  liteEffects = false,
) {
  const inFlight = dotInFlight(dot);
  const paletteSplatDot = zone === 'palette'
    && dot.paletteTone != null
    && dot.paletteTone !== 'wire';
  const eyeIrisZone = isEyeZone(zone);
  const ignite = reflectorPaintAlpha(dot, pool, zone, now);

  if (dot.isReflector) {
    const anchorR = reflectorAnchorR(dot, pool, r);
    const drawSize = Math.round(anchorR * 2 * 10) / 10;
    const leftRaw = dotDrawX(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.x - anchorR;
    const topRaw = dotDrawY(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.y - anchorR;
    const left = Math.round(leftRaw * 10) / 10;
    const top = Math.round(topRaw * 10) / 10;
    const opacity = ignite <= 0.001 ? 0 : Math.min(1, ignite * (eyeIrisZone ? 1 : DOT_ALPHA));
    const cls = eyeIrisZone ? dotClass : `${dotClass} ${reflectorClass}`;
    const irisBg = eyeIrisZone ? accent : DOT_GRAY;
    const key = `${cls}|${drawSize}|${opacity.toFixed(3)}|${left}|${top}|${irisBg}`;

    if (dot.paintKey === key) return;
    dot.paintKey = key;

    if (dot.el.className !== cls) dot.el.className = cls;
    dot.el.style.width = `${drawSize}px`;
    dot.el.style.height = `${drawSize}px`;
    dot.el.style.opacity = String(opacity);
    dot.el.style.transform = `translate3d(${left}px,${top}px,0)`;
    if (dot.el.style.background !== irisBg) {
      dot.el.style.setProperty('background', irisBg, 'important');
    }
    return;
  }

  const bloom = paletteSplatDot || liteEffects ? 0 : dotSettleBloom(dot, now, allowBloom);
  const shimmer = paletteSplatDot || liteEffects
    ? { opacityMul: 1, scaleMul: 1, wireMul: 1, gate: 0 }
    : dotShimmer(dot, now, zone, pin);
  let scale = (inFlight && !liteEffects ? dotFlightScale(dot) : 1) * shimmer.scaleMul;
  if (bloom > 0.02) scale *= 1 + bloom * (SETTLE_BLOOM_SCALE - 1);
  let blinkSx = 1;
  let blinkSy = 1;
  if (eyeIrisZone) {
    const blink = eyeBlinkCover(zone, now);
    blinkSx = eyeBlinkStretchX(blink);
    blinkSy = eyeBlinkSquash(blink);
  }
  const drawRx = r * scale * blinkSx;
  const drawRy = r * scale * blinkSy;
  const drawSizeW = Math.round(drawRx * 2 * 10) / 10;
  const drawSizeH = Math.round(drawRy * 2 * 10) / 10;
  const bloomCls = bloom > 0.04 ? ` ${settleBloomClass}` : '';
  const starCls = shimmer.gate > 0.04 ? ` ${starClass}` : '';
  const diamondCls = shimmer.diamond && diamondClass ? ` ${diamondClass}` : '';
  const hairTint = dot.isHair ? Math.max(0, Math.min(1, dot.hairMix)) : 0;
  const showHairStyle = hairTint > 0.22;
  const cls = inFlight
    ? `${dotClass} ${flightClass}${showHairStyle ? ` ${hairClass}` : ''}${diamondCls}${starCls}${bloomCls}`
    : `${dotClass}${showHairStyle ? ` ${hairClass}` : ''}${diamondCls}${starCls}${bloomCls}`;
  const opacity = Math.min(
    1,
    (dotDisplayAlpha(dot) + bloom * SETTLE_BLOOM_OPACITY) * shimmer.opacityMul,
  );
  const starActive = constellationPositionGate(dot) > 0.04;
  const leftRaw = dotDrawX(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.x - drawRx;
  const topRaw = dotDrawY(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.y - drawRy;
  const left = starActive ? leftRaw : Math.round(leftRaw * 10) / 10;
  const top = starActive ? topRaw : Math.round(topRaw * 10) / 10;
  let bg = dot.isHair
    ? mixHex(DOT_GRAY, accent, hairTint)
    : paletteSplatDot && paletteColors
      ? paletteColors[dot.paletteTone!]
      : DOT_GRAY;
  if (zone === 'ring') {
    const gem = ringGemWeight(dot, pin);
    const goldMix = Math.min(0.97, 0.26 + gem * 0.58 + shimmer.gate * 0.42);
    bg = mixHex(DOT_GRAY, RING_GEM_GOLD, goldMix);
  }
  const key = `${cls}|${drawSizeW}|${drawSizeH}|${opacity.toFixed(3)}|${left}|${top}|${bg}`;
  if (!starActive && shimmer.gate <= 0.04 && dot.paintKey === key) return;
  dot.paintKey = key;

  if (dot.el.className !== cls) dot.el.className = cls;
  dot.el.style.width = `${drawSizeW}px`;
  dot.el.style.height = `${drawSizeH}px`;
  dot.el.style.opacity = String(opacity);
  dot.el.style.transform = `translate3d(${left}px,${top}px,0)`;
  if (dot.isHair || paletteSplatDot) {
    dot.el.style.setProperty('background', bg, 'important');
    dot.el.style.boxShadow = '';
  } else if (dot.el.style.background !== DOT_GRAY) {
    dot.el.style.setProperty('background', DOT_GRAY, 'important');
    dot.el.style.boxShadow = '';
  }
}

export type TickFlyingDotsOptions = {
  /** Pomija canvas kresek — np. podczas scrolla poza morph. */
  skipWirePaint?: boolean;
  /** Skrót: pomija kreski. */
  skipPaint?: boolean;
  /** Aktywny scroll — wyłącza efekty wtórne (bloom, oddech palety). */
  scrolling?: boolean;
  /** Id klatki ze wspólnej pętli mesh — cache pinów layoutu. */
  meshFrameId?: number;
  /** Co N-tą klatkę malować kreski (1 = każda). */
  wireStride?: number;
  wireFrame?: number;
  /** Scroll aktywny — bez morphu, bez ciężkich efektów (priorytet: płynny wheel). */
  scrollLite?: boolean;
  /** Pierwsza klatka po scrollu — nałóż zaległy morph. */
  catchUp?: boolean;
  /** prefers-reduced-motion — mniej paintów i niższy DPR. */
  reducedMotion?: boolean;
};

/** Lot kropek — scroll zmienia strefę docelową, tempo wspólne dla całego morphu. */
export function tickFlyingDots(
  pool: FlyingPool,
  layer: HTMLElement,
  wireCanvas: HTMLCanvasElement | null,
  bundle: MeshBundle,
  paletteAim: { x: number; y: number; centerX: number; stageW: number; stageH: number } | null,
  dotClass: string,
  hairClass: string,
  hairIds: Set<number>,
  accent: string,
  dt: number,
  pointer: FacePointer = IDLE_FACE_POINTER,
  flightClass = '',
  settleBloomClass = '',
  starClass = '',
  reflectorClass = '',
  diamondClass = '',
  opts: TickFlyingDotsOptions = {},
) {
  const tickStart = performance.now();
  const pinsT0 = performance.now();
  const scrolling = opts.scrolling ?? false;
  const scrollLite = opts.scrollLite ?? false;
  const pins = computeAllZonePins(opts.meshFrameId ?? -1, scrollLite);
  const pinsMs = performance.now() - pinsT0;
  if (!pins) return;

  let syncMs = 0;
  let stepMs = 0;

  const liveAim = pins.paletteAim ?? paletteAim;

  const viewportKey = viewportLayoutKey();
  const viewportChanged = pool.viewportKey !== '' && viewportKey !== pool.viewportKey;
  if (viewportChanged) {
    clearNormGoalsCache();
    refreshMeshZoneAfterViewportChange();
    resetMeshPrewarm();
    prewarmMeshLayouts(bundle);
  }
  pool.viewportKey = viewportKey;

  const scrollDir = stepScrollBuildDir();
  const scrollZone = resolveActiveMeshZone();
  const syncBudget = scrollLite ? SYNC_BUDGET_SCROLL_MS : SYNC_BUDGET_IDLE_MS;

  const normalizeZone = (z: MeshZone) => (z === 'palette' && !pins.palette ? 'hero' : z);
  let zone = normalizeZone(scrollZone);

  if (scrollLite) {
    pool.pendingScrollZone = zone;
    const morphBusy =
      pool.morphFlying
      || pool.zoneSyncPending != null
      || anyDotInFlight(pool);
    if (morphBusy) {
      if (pool.zoneSyncPending) {
        zone = pool.zoneSyncPending.zone;
      } else if (pool.activeZone != null) {
        zone = pool.activeZone;
      }
    }
  } else if (opts.catchUp) {
    zone = normalizeZone(scrollZone);
    pool.pendingScrollZone = null;
  } else if (pool.pendingScrollZone != null) {
    zone = normalizeZone(pool.pendingScrollZone);
    pool.pendingScrollZone = null;
  } else if (pool.zoneSyncPending) {
    zone = pool.zoneSyncPending.zone;
  }

  const pinKey = pinLayoutKey(pins);
  const layoutKey = activeZoneLayoutKey(zone, pins);
  const zoneChanged = pool.activeZone !== zone;
  const layoutChanged = pool.pinKey !== pinKey;
  const anchorChanged = layoutKey !== pool.activeLayoutKey;
  const layerOrigin = layerDocOffset(layer);

  if (zoneChanged) {
    pool.buildWaveDir = scrollDir;
    pool.activeLayoutKey = '';
    pool.morphBloomAt = 0;
    if (zone !== 'hero') pool.heroLiveBlend = 0;
    if (zone === 'hero' && pool.activeZone != null && pool.activeZone !== 'hero') {
      pool.retiringWireEdges = [];
      pool.retiringWireZone = null;
    }
    if (isEyeZone(zone)) resetEyeIrisReveal(zone);
    if (pool.activeZone === 'contactArrow') {
      for (const dot of pool.dots.values()) {
        dot.displayOx = 0;
        dot.displayOy = 0;
      }
    }
    for (const dot of pool.dots.values()) {
      dot.paintKey = undefined;
    }
  }

  if (viewportChanged) {
    cachedHeroFaceLayoutKey = '';
    cachedHeroFaceLayout = null;
    pool.retiringWireEdges = [];
    pool.retiringWireZone = null;
    syncRigidLayoutFollow(pool, bundle, zone, liveAim, pins, true, dt);
    pool.activeZone = zone;
    pool.pinKey = pinKey;
    pool.activeLayoutKey = layoutKey;
  } else if (zoneChanged || pool.activeZone == null || pool.zoneSyncPending) {
    const syncT0 = performance.now();
    const syncDone = syncFlyingTargets(
      pool,
      layer,
      bundle,
      zone,
      liveAim,
      pins,
      dotClass,
      hairClass,
      hairIds,
      accent,
      zoneChanged && pool.activeZone != null,
      syncBudget,
      scrollDir,
    );
    syncMs = performance.now() - syncT0;
    if (syncDone) {
      pool.activeZone = zone;
      pool.pinKey = pinKey;
      pool.activeLayoutKey = layoutKey;
      pinCommittedMeshZone(zone);
    }
  } else if (anchorChanged) {
    const freezeHeroScroll = scrollLite && zone === 'hero';
    const eyeBuilding = isEyeZone(zone) && (pool.morphFlying || anyDotInFlight(pool));
    const scrollFollowStride = scrollLite ? 2 : 1;
    const shouldRigidFollow =
      !freezeHeroScroll
      && !eyeBuilding
      && (!scrollLite || opts.meshFrameId == null || opts.meshFrameId % scrollFollowStride === 0);
    if (shouldRigidFollow) {
      const sizeChanged =
        layoutStageSizeFromKey(layoutKey) !== layoutStageSizeFromKey(pool.activeLayoutKey);
      syncRigidLayoutFollow(pool, bundle, zone, liveAim, pins, sizeChanged, dt);
    }
    if (!freezeHeroScroll) {
      pool.pinKey = pinKey;
      pool.activeLayoutKey = layoutKey;
    }
  } else if (layoutChanged) {
    pool.pinKey = pinKey;
  }

  if (pool.activeZone != null) {
    const cur = readMeshZone();
    if (cur.zone !== pool.activeZone) {
      publishMeshZone({
        zone: pool.activeZone,
        paletteAim: pins.paletteAim ?? cur.paletteAim,
      });
      pinCommittedMeshZone(pool.activeZone);
    }
  }

  pool.layoutScale = stepScalar(pool.layoutScale, pool.tgtLayoutScale, SCALE_SPEED, dt);
  const r = Math.max(1.4, 4.5 * pool.layoutScale);
  const now = performance.now();

  const activePin = pinForZonePins(pins, zone);
  const zoneOnScreen = activePin ? pinInViewport(activePin) : true;
  const scrollDormant =
    scrollLite
    && morphSettled(pool)
    && !zoneOnScreen
    && !pool.morphFlying
    && !anyDotInFlight(pool);

  if (scrollDormant) {
    pool.scrollCanvasDetached = false;
    publishMeshMotionState({
      morphFlying: pool.morphFlying,
      morphSettled: true,
      scrolling,
      morphBuildT: computeMorphBuildT(pool, zone),
      eyeIrisUnlocked: isEyeZone(zone) && readEyeIrisRevealUnlocked(zone),
      eyeFrame: isEyeZone(zone) && pool.eyeFrameReady
        ? {
            ready: true,
            ox: pool.eyeFrameOx,
            oy: pool.eyeFrameOy,
            scale: pool.eyeFrameScale,
            scaleX: pool.eyeFrameScaleX,
            scaleY: pool.eyeFrameScaleY,
          }
        : { ready: false, ox: 0, oy: 0, scale: 1, scaleX: 1, scaleY: 1 },
      eyeHullPathD: isEyeZone(zone) ? pool.eyeHullPathD : '',
    });
    if (pool.activeZone != null) {
      const cur = readMeshZone();
      if (cur.zone !== pool.activeZone) {
        publishMeshZone({
          zone: pool.activeZone,
          paletteAim: pins.paletteAim ?? cur.paletteAim,
        });
        pinCommittedMeshZone(pool.activeZone);
      }
    }
    const totalMs = performance.now() - tickStart;
    publishTickPhases({
      pins: pinsMs,
      sync: syncMs,
      syncLayout: lastSyncLayoutMs,
      syncEnsureDots: lastSyncEnsureDotsMs,
      atlasBuild: atlasBuildThisTick,
      step: 0,
      paintDots: 0,
      paintWires: 0,
      total: totalMs,
    });
    atlasBuildThisTick = 0;
    return;
  }

  const scrollZoneIdle =
    scrollLite
    && morphSettled(pool)
    && !pool.morphFlying
    && !anyDotInFlight(pool);

  const faceMotionReady = !scrollLite && allowFaceMotion(pool, zone);

  const stepT0 = performance.now();
  const heroSettledBase =
    zone === 'hero'
    && morphSettled(pool)
    && !scrollLite
    && !pool.morphFlying;

  const heroPointerLayout = heroSettledBase && pointer.active
    ? heroFaceLayout(bundle.faceMesh, pins.hero)
    : null;

  if (!scrollZoneIdle) for (const dot of pool.dots.values()) {
    const heroSettledIdle =
      heroSettledBase
      && (!pointer.active || !dotHeroPointerInfluence(
        dot,
        bundle.faceMesh,
        heroPointerLayout!,
        pins.hero,
        pointer,
      ));
    if (
      heroSettledIdle
      && !dotInFlight(dot)
      && dot.departLeft <= 0
      && dot.flightU >= 1
      && dot.alphaHoldLeft <= 0
    ) {
      if (dot.alpha !== dot.tgtAlpha && dot.tgtAlpha > 0.04) {
        dot.alpha = stepScalar(dot.alpha, dot.tgtAlpha, ALPHA_SPEED, dt);
      }
      stepIdleMotionBlend(dot, dt, !scrollLite && constellationPositionGate(dot) > 0.02);
      continue;
    }

    stepFlight(dot, dt, now);
    stepIdleMotionBlend(dot, dt, !scrollLite && constellationPositionGate(dot) > 0.02);
    if (dot.alphaHoldLeft > 0) {
      dot.alphaHoldLeft = Math.max(0, dot.alphaHoldLeft - dt);
    } else {
      const alphaSpeed = dot.departLeft > 0 ? ALPHA_SPEED * 0.35 : ALPHA_SPEED;
      const exitFade = dotInFlight(dot) && dot.tgtAlpha <= 0.04;
      if (!exitFade) {
        if (
          dot.isReflector
          && reflectorMorphSnapZone(zone)
          && (pool.morphFlying || anyDotInFlight(pool))
        ) {
          dot.alpha = 0;
        } else {
          dot.alpha = stepScalar(dot.alpha, dot.tgtAlpha, alphaSpeed, dt);
        }
      }
    }
  }

  stepMs = performance.now() - stepT0;

  updateMorphBloom(pool, now);
  if (morphSettled(pool)) {
    pool.retiringWireEdges = [];
    pool.retiringWireZone = null;
    if (!scrollZoneIdle) {
      settleHeroMeshDots(pool, zone);
      if (zone === 'hero') refreshFaceMotionDotIds(pool, bundle.faceMesh);
    }
  }

  const settleBloomReady = allowSettleBloom(scrolling, zone);
  const faceReady = allowFaceMotion(pool, zone);
  const hairReady = !scrollLite && allowHairMotion(pool, zone);
  pool.paletteBreathOx = 0;
  pool.paletteBreathOy = 0;

  stepHeroLiveBlend(pool, zone, dt);
  syncHeroDriftBlend(pool, zone);

  const settled = morphSettled(pool);
  const heroHairLive = zone === 'hero' && settled && faceReady;

  if (isEyeZone(zone)) {
    setEyeBlinkActive(zone, true);
    if (settled) {
      stepEyeBlink(zone, now);
      stepEyeIrisReveal(zone, true, now);
      if (!readEyeFirstBlinkArmed(zone)) {
        armEyeFirstBlink(zone, now);
      }
    } else if (!scrollLite) {
      resetEyeIrisReveal(zone);
    }
  } else {
    deactivateAllEyeBlink();
  }

  if (zone === 'hero' && settled && faceReady && (!scrollLite || zoneOnScreen)) {
    const heroHairTick =
      !scrollLite
      || opts.meshFrameId == null
      || opts.meshFrameId % 2 === 0;
    if (heroHairTick) {
      applyHeroHairAmbient(pool, bundle.faceMesh, zone, now);
    }

    if (!scrollLite) {
      const heroMotionFrame =
        pointer.active
        || !settled
        || heroHairLive
        || opts.meshFrameId == null
        || opts.meshFrameId % 2 === 0;
      if (heroMotionFrame) {
        if (pointer.active) stepHeroBlink(pool, now);
        applyHeroFaceMotion(
          pool,
          bundle.faceMesh,
          pins.hero,
          zone,
          pointer,
          now,
          faceMotionReady,
        );
        lerpHeroFaceMotion(pool, dt, pointer.active && pool.heroLiveBlend >= 0.92);
      }
    } else {
      lerpHeroFaceMotion(pool, dt, false);
    }
  }

  if (!scrollLite) {
    applyContactArrowPoint(pool, zone, now, settled);
  }

  const heroFaceActive = zone === 'hero' && faceReady;
  if (scrollLite) {
    if (zone === 'hero' && zoneOnScreen) {
      for (const id of pool.paintDotIds) {
        const dot = pool.dots.get(id);
        if (dot) stepHairMix(dot, dt, true, true);
      }
    }
    if (isEyeZone(zone)) {
      stepEyeMeshFrame(pool, activePin, zone, now, dt, bundle);
    }
  } else {
    stepSprayBursts(pool, bundle, zone, activePin, layerOrigin, accent, now, settled);
    stepEyeMeshFrame(pool, activePin, zone, now, dt, bundle);
    for (const dot of pool.dots.values()) {
      stepHairMix(dot, dt, hairReady);
    }
  }

  publishMeshMotionState({
    morphFlying: pool.morphFlying,
    morphSettled: settled,
    scrolling,
    morphBuildT: computeMorphBuildT(pool, zone),
    eyeIrisUnlocked: isEyeZone(zone) && readEyeIrisRevealUnlocked(zone),
    eyeFrame: isEyeZone(zone) && pool.eyeFrameReady
      ? {
          ready: true,
          ox: pool.eyeFrameOx,
          oy: pool.eyeFrameOy,
          scale: pool.eyeFrameScale,
          scaleX: pool.eyeFrameScaleX,
          scaleY: pool.eyeFrameScaleY,
        }
      : { ready: false, ox: 0, oy: 0, scale: 1, scaleX: 1, scaleY: 1 },
    eyeHullPathD: isEyeZone(zone) ? pool.eyeHullPathD : '',
  });

  const palettePaintVisible = zone !== 'palette' || isStudioPaletyInView();
  const paletteColors = zone === 'palette' ? getPaletteToneColors(accent) : null;
  const paletteCanvasDots = zone === 'palette' && palettePaintVisible;
  if (paletteCanvasDots) {
    for (const id of pool.paintDotIds) {
      const dot = pool.dots.get(id);
      if (dot) detachDotElement(dot);
    }
  }
  const heroMorphLite = zone === 'hero';
  const heroCanvasDots = zone === 'hero';
  const eyeCanvasDots = isEyeZone(zone);
  const shapeCanvasDots = isMorphShapeZone(zone) && zone !== 'palette' && zone !== 'hero';
  const meshCanvasDots = heroCanvasDots || shapeCanvasDots;

  let paintDotsMs = 0;
  let paintWiresMs = 0;
  let domPaints = 0;
  let canvasDots = 0;
  let visibleDots = 0;
  let activeDots = 0;

  const settledNow = morphSettled(pool);
  const slow = isMeshSlowMode();
  const lite = isMeshLiteMode();
  const reducedMotion = opts.reducedMotion ?? isMeshReducedMotion();
  const lowDpr = slow || lite || reducedMotion || zone === 'hero' || zone === 'palette';
  const morphActive = pool.morphFlying || anyDotInFlight(pool);
  const wireFullClear = morphActive || (zone === 'palette' && !scrollLite);

  if (pool.paintDotIds.length === 0 || morphActive) {
    refreshPaintDotIds(pool);
    if (zone === 'hero') refreshFaceMotionDotIds(pool, bundle.faceMesh);
  } else if (zone === 'hero' && pool.faceMotionDotIds.length === 0) {
    refreshFaceMotionDotIds(pool, bundle.faceMesh);
  }
  if (zone === 'hero' && pool.heroWirePairs.length === 0 && pool.wireEdges.length > 0) {
    refreshHeroWirePairs(pool);
  }

  const paintCanvasLayer = meshCanvasDots || paletteCanvasDots || eyeCanvasDots;
  const eyeBlinkLive = eyeCanvasDots
    && eyeBlinkCover(zone as 'careerEye' | 'skillsEye', now) > 0.02;
  const motionCanvasLive =
    eyeBlinkLive
    || eyeCanvasDots
    || shapeCanvasDots
    || paletteCanvasDots
    || zone === 'hero'
    || pointer.active;

  let skipDomPaint = opts.skipPaint ?? false;
  let skipCanvasPaint = false;
  const canvasIdleEligible =
    paintCanvasLayer
    && settledNow
    && !pool.morphFlying
    && !pool.zoneSyncPending
    && !pointer.active
    && !scrolling
    && !scrollLite
    && !motionCanvasLive;

  if (scrollLite && paintCanvasLayer) {
    skipDomPaint = true;
    skipCanvasPaint = false;
    if (!pool.scrollCanvasDetached) {
      pool.scrollCanvasDetached = true;
      for (const id of pool.paintDotIds) {
        const dot = pool.dots.get(id);
        if (!dot) continue;
        detachDotElement(dot);
      }
    }
    for (const id of pool.paintDotIds) {
      const dot = pool.dots.get(id);
      if (!dot) continue;
      if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) activeDots += 1;
    }
  } else if (scrollLite) {
    skipDomPaint = true;
    pool.scrollCanvasDetached = false;
  } else {
    pool.scrollCanvasDetached = false;
  }

  if (
    !scrollLite
    && zone === 'palette'
    && morphActive
    && !pointer.active
  ) {
    pool.idlePaintPhase = (pool.idlePaintPhase + 1) % 2;
    skipDomPaint = true;
    skipCanvasPaint = pool.idlePaintPhase !== 0;
  } else if (canvasIdleEligible) {
    if (STATIC_CARD_ZONES.has(zone)) {
      pool.idleTickPhase = (pool.idleTickPhase + 1) % 3;
      skipDomPaint = true;
      skipCanvasPaint = pool.idleTickPhase !== 0;
    } else if (zone === 'hero' || zone === 'palette') {
      pool.idlePaintPhase = (pool.idlePaintPhase + 1) % 2;
      skipDomPaint = true;
      skipCanvasPaint = motionCanvasLive ? false : pool.idlePaintPhase !== 0;
    }
  }
  if (
    !skipDomPaint
    && slow
    && settledNow
    && !scrolling
    && !pointer.active
    && STATIC_CARD_ZONES.has(zone)
    && zone !== 'ring'
  ) {
    pool.idlePaintPhase = (pool.idlePaintPhase + 1) % 2;
    skipDomPaint = true;
    skipCanvasPaint = pool.idlePaintPhase !== 0;
  }

  if (zone === 'ring') {
    skipCanvasPaint = false;
  }

  if (!skipDomPaint) {
    const paintDotsStart = performance.now();

    for (const id of pool.paintDotIds) {
      const dot = pool.dots.get(id);
      if (!dot) continue;
      if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) activeDots += 1;
      if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) {
        dot.alpha = 0;
        detachDotElement(dot);
        continue;
      }

      if (scrollLite) {
        if (!palettePaintVisible) {
          detachDotElement(dot);
          continue;
        }
        if (meshCanvasDots || paletteCanvasDots || eyeCanvasDots) {
          detachDotElement(dot);
          if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) canvasDots += 1;
          continue;
        }
        visibleDots += 1;
        domPaints += 1;
        paintDot(
          dot,
          pool,
          layerOrigin,
          r,
          accent,
          dotClass,
          hairClass,
          flightClass,
          settleBloomClass,
          starClass,
          reflectorClass,
          diamondClass,
          now,
          zone,
          activePin,
          settleBloomReady,
          heroFaceActive,
          paletteColors,
          heroMorphLite,
        );
        continue;
      }

      if (!palettePaintVisible) {
        detachDotElement(dot);
        continue;
      }

      if (paletteCanvasDots) {
        detachDotElement(dot);
        if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) canvasDots += 1;
        continue;
      }

      if (meshCanvasDots || eyeCanvasDots) {
        detachDotElement(dot);
        if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) canvasDots += 1;
        continue;
      }

      visibleDots += 1;
      domPaints += 1;
      paintDot(
        dot,
        pool,
        layerOrigin,
        r,
        accent,
        dotClass,
        hairClass,
        flightClass,
        settleBloomClass,
        starClass,
        reflectorClass,
        diamondClass,
        now,
        zone,
        activePin,
        settleBloomReady,
        heroFaceActive,
        paletteColors,
        heroMorphLite,
      );
    }

    paintDotsMs = performance.now() - paintDotsStart;
  }

  let stride = opts.wireStride ?? 1;
  if (zone === 'ring' && settledNow && !pointer.active) {
    stride = 1;
  }
  if (scrollLite && paintCanvasLayer && zone !== 'hero') {
    stride = 1;
  }
  if (scrollLite && paintCanvasLayer && zoneOnScreen) {
    stride = Math.max(stride, zone === 'hero' || zone === 'palette' ? 5 : 4);
  }
  const wireFrame = opts.wireFrame ?? 0;
  const skipWires =
    (opts.skipWirePaint && !scrollLite)
    || (skipDomPaint && settledNow && !paintCanvasLayer && !scrollLite);
  const paintCanvasFrame = wireCanvas && wireFrame % stride === 0;
  const sprayClearPin = pool.sprayFootprintPending ? pins.spray : null;
  if (paintCanvasFrame && paintCanvasLayer && zoneOnScreen && !skipCanvasPaint) {
    const wiresStart = performance.now();
    if (!skipWires) {
      paintWires(
        pool,
        wireCanvas,
        layer,
        zone,
        activePin,
        accent,
        layerOrigin,
        now,
        zone === 'hero' ? false : settleBloomReady,
        scrollLite || hairReady,
        scrollLite || heroFaceActive,
        paletteColors,
        lowDpr,
        morphActive,
        pointer,
        sprayClearPin,
        wireFullClear,
      );
    } else {
      clearWireCanvasRegion(
        wireCanvas,
        layer,
        activePin,
        layerOrigin,
        lowDpr,
        morphActive,
        zone,
        sprayClearPin,
        wireFullClear,
      );
    }
    if (sprayClearPin) pool.sprayFootprintPending = false;
    if (paletteCanvasDots && paletteColors) {
      paintPaletteCanvasDots(
        wireCanvas,
        pool,
        zone,
        activePin,
        layerOrigin,
        r,
        paletteColors,
        now,
        heroFaceActive,
      );
    } else if (heroCanvasDots) {
      canvasDots = paintHeroCanvasDots(
        wireCanvas,
        pool,
        zone,
        activePin,
        layerOrigin,
        r,
        accent,
        now,
        heroFaceActive,
        pointer,
        false,
      );
    } else if (zone === 'ring' && shapeCanvasDots) {
      canvasDots = paintRingCanvasDots(
        wireCanvas,
        pool,
        zone,
        activePin,
        layerOrigin,
        r,
        now,
        heroFaceActive,
      );
    } else if (shapeCanvasDots) {
      canvasDots = paintShapeCanvasDots(
        wireCanvas,
        pool,
        zone,
        activePin,
        layerOrigin,
        r,
        now,
        heroFaceActive,
      );
    } else if (eyeCanvasDots) {
      canvasDots = paintEyeCanvasDots(
        wireCanvas,
        pool,
        zone,
        activePin,
        layerOrigin,
        r,
        accent,
        now,
        heroFaceActive,
      );
    }
    if (zone === 'spray' && pool.sprayBursts.length > 0) {
      const sprayCtx = wireCanvas.getContext('2d');
      if (sprayCtx) {
        paintSprayBursts(
          sprayCtx,
          pool,
          bundle,
          zone,
          activePin,
          layerOrigin,
          now,
          heroFaceActive,
        );
      }
    }
    paintWiresMs = performance.now() - wiresStart;
  }

  const totalMs = performance.now() - tickStart;
  const phases = {
    pins: pinsMs,
    sync: syncMs,
    syncLayout: lastSyncLayoutMs,
    syncEnsureDots: lastSyncEnsureDotsMs,
    atlasBuild: atlasBuildThisTick,
    step: stepMs,
    paintDots: paintDotsMs,
    paintWires: paintWiresMs,
    total: totalMs,
  };
  atlasBuildThisTick = 0;

  publishTickPhases(phases);
  const morphBuildT = computeMorphBuildT(pool, zone);
  const morphFlying = pool.morphFlying;
  setTickSpikeContext(zone, zoneChanged, totalMs, {
    morphFlying,
    morphBuildT,
    activeDots,
  });

  if (isPerfMonitorEnabled()) {
    publishMeshPerfStats({
      meshTickMs: totalMs,
      paintDotsMs,
      paintWiresMs,
      activeDots,
      visibleDots: (meshCanvasDots || eyeCanvasDots) ? canvasDots : visibleDots,
      domPaints,
      canvasDots,
      wireEdges: pool.wireEdges.length,
      zone,
      morphBuildT,
      morphFlying,
      phases,
    });
  }
}
