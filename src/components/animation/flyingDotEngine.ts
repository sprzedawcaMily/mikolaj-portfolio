import type { MeshZone } from '@/hooks/meshScrollEngine';
import {
  computeAllZonePins,
  CONTACT_CTA_ANCHOR_ID,
  CONTACT_MESH_ANCHOR_ID,
  isEyeAnchorInView,
  pinForZonePins,
  refreshMeshZoneAfterViewportChange,
  resolveActiveMeshZone,
  ZONE_ORDER,
  type MeshPinState,
} from '@/hooks/meshScrollEngine';
import type { PaletteTone } from '@/components/animation/mesh/parsePaletteMesh';
import {
  buildDotAtlas,
  clearPaletteLayoutCache,
  zoneLayout,
  type DotAtlas,
  type MeshReflector,
} from '@/components/animation/mesh/meshDotAtlas';
import { getPaletteToneColors, type PaletteToneColors } from '@/theme/paletteEngine';
import { projectFaceNode } from '@/components/animation/mesh/faceMesh';
import type { MeshBundle, MorphEdge, NormPt } from '@/components/animation/mesh/morph/types';
import { easeOutEmphasized } from '@/components/animation/mesh/morph/morphPath';
import { snapshotFromZoneLayout } from '@/components/animation/mesh/morph/zoneSnapshot';
import {
  armEyeFirstBlink,
  eyeBlinkCover,
  eyeBlinkSquashY,
  readEyeIrisRevealUnlocked,
  resetEyeIrisReveal,
  setEyeBlinkActive,
  stepEyeBlink,
  stepEyeIrisReveal,
} from '@/components/animation/eyeBlink';
import { publishMeshMotionState } from '@/hooks/meshMotionState';
import {
  isPerfMonitorEnabled,
  logPerfEvent,
  publishMeshPerfStats,
  publishTickPhases,
  recordAtlasBuild,
  setTickSpikeContext,
} from '@/hooks/meshPerfStats';

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
  /** Ostatni klucz paintDot — pomija zbędne zapisy DOM. */
  paintKey?: string;
  /** Rozbłysk po osadzeniu kropki (performance.now). */
  settleBloomAt: number;
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
  /** Start fali kresek włosów od góry (performance.now). */
  hairWireRevealAt: number;
  /** Zcache’owane rangi kresek (0=góra) — stałe na czas fali. */
  hairWireRevealRanks: Map<string, number> | null;
  /** Monotoniczny postęp wzrostu / alpha per kreska — bez cofania. */
  hairWireRevealMaxGrow: Map<string, number> | null;
  hairWireRevealMaxAlpha: Map<string, number> | null;
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
  /** Śledzenie wskaźnika — tęczówka / źrenica oka (px, doc). */
  eyeTrackOx: number;
  eyeTrackOy: number;
  eyeTrackTgtOx: number;
  eyeTrackTgtOy: number;
  eyeFrameOx: number;
  eyeFrameOy: number;
  eyeFrameScale: number;
  eyeFrameScaleX: number;
  eyeFrameScaleY: number;
  eyeFrameReady: boolean;
  eyeRevealArmed: boolean;
  /** Oko — czeka aż slot wejdzie w viewport zanim ruszy morph. */
  eyeMorphHold: MeshZone | null;
  /** Oko zbudowane w tej sesji — blokuje natychmiastowy buildT=1. */
  eyeMorphBuilt: boolean;
  /** Aktywne chmury farby ze spreju (mini-mesh na canvasie). */
  sprayBursts: SprayBurst[];
  sprayNextBurstAt: number;
  sprayBurstToneIdx: number;
};

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
const HAIR_FLIGHT_START = 0.06;
/** Od tego etapu smugi zaczyna się tint włosów (spatial u). */
const HAIR_GATHER_TINT_START = 0.46;
/** Fala kresek włosów — od góry w dół (ms). */
const HAIR_WIRE_REVEAL_MS = 1350;
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
/** Ile czasu fali idzie na rozłożenie po wysokości (0–1). */
const HAIR_WIRE_REVEAL_STAGGER = 0.62;
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
const STAR_WIRE_TWINKLE = 0.09;
const STAR_OPACITY_MIN = 0.84;
const STAR_SCALE_PULSE = 0.038;
const RING_WIRE_GLINT = 0.18;
const RING_SCALE_GLINT = 0.065;
/** Odstęp między mrugnięciami twarzy (ms). */
const HERO_BLINK_FIRST_DELAY_MS = 5200;
const HERO_BLINK_MIN_GAP_MS = 9000;
const HERO_BLINK_GAP_SPAN_MS = 11000;

function starSeed(dot: FlyingDot) {
  const n = dot.hostId ?? [...dot.id].reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return n * 0.381966011250105;
}


/** Offset gwiezdny — od startu lotu (po depart), bez skoku po lądowaniu. */
function constellationPositionGate(dot: FlyingDot) {
  if (dot.alpha < 0.05 || dot.tgtAlpha < 0.05) return 0;
  if (dot.departLeft > 0.01) return 0;
  if (dotInFlight(dot)) return 0;
  return 1;
}

/** Migotanie / glow — dopiero po osadzeniu w kształcie. */
function constellationShimmerGate(dot: FlyingDot) {
  if (constellationPositionGate(dot) <= 0) return 0;
  if (dotInFlight(dot)) return 0;
  return 1;
}

function starDriftScale(zone: MeshZone, heroFaceActive: boolean) {
  if (zone === 'hero') return heroFaceActive ? STAR_DRIFT_HERO_FACE : STAR_DRIFT_HERO;
  if (!isMorphShapeZone(zone)) return 0;
  return zone === 'palette' ? STAR_DRIFT_PALETTE : STAR_DRIFT_CARD;
}

function starOffset(
  dot: FlyingDot,
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
  const motionMul = settled > 0.04 ? SETTLED_DRIFT_MUL : 1;
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

  return { ox: ox + swayX, oy: oy + swayY, gate };
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

const EYE_SVG_W = 1408;
const EYE_SVG_H = 867;
const EYE_CENTER_X = 685.5;
const EYE_CENTER_Y = 477;
const EYE_TRACK_MAX = { x: 228, y: 132 };
const EYE_TRACK_SPEED = 5.2;

function isEyeZone(zone: MeshZone) {
  return zone === 'careerEye' || zone === 'skillsEye';
}

function isMorphShapeZone(zone: MeshZone) {
  return MORPH_SHAPE_ZONES.has(zone);
}

function isStudioPaletyInView() {
  const section = document.getElementById('studio-palety');
  if (!section) return false;
  const rect = section.getBoundingClientRect();
  const vh = window.innerHeight;
  return rect.bottom > 40 && rect.top < vh - 40;
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

function ensureDotAtlas(bundle: MeshBundle, w: number, h: number): DotAtlas {
  const key = `${Math.round(w)}x${Math.round(h)}`;
  let atlas = dotAtlasBySize.get(key);
  if (atlas) return atlas;

  const t0 = performance.now();
  atlas = buildDotAtlas(bundle.faceMesh, bundle.zoneMeshes, w, h, null);
  atlasBuildThisTick = performance.now() - t0;
  recordAtlasBuild(key, atlasBuildThisTick);
  dotAtlasBySize.set(key, atlas);
  if (dotAtlasBySize.size > 14) dotAtlasBySize.clear();
  return atlas;
}

/** Buduje layouty wszystkich stref zanim user scrolluje — unika freeze przy morphu. */
export function prewarmMeshLayouts(bundle: MeshBundle): boolean {
  const pins = computeAllZonePins();
  if (!pins) return false;

  const t0 = performance.now();
  const sizes = new Set<string>();
  for (const zone of ZONE_ORDER) {
    const pin = pinForZonePins(pins, zone);
    const sizeKey = `${Math.round(pin.stageW)}x${Math.round(pin.stageH)}`;
    if (!sizes.has(sizeKey)) {
      sizes.add(sizeKey);
      ensureDotAtlas(bundle, pin.stageW, pin.stageH);
    }
    normGoalsForZone(zone, bundle, pin, pins.paletteAim, pins.paletteAim);
  }

  const ms = performance.now() - t0;
  publishMeshPerfStats({ prewarmDone: true });
  logPerfEvent('prewarm layoutów zakończony', { ms: +ms.toFixed(1), zones: ZONE_ORDER.length });
  return true;
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

  const atlas = ensureDotAtlas(bundle, pin.stageW, pin.stageH);
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
  if (!norms) return null;

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
    dot.displayOx = 0;
    dot.displayOy = 0;
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

function markDotSettleBloom(dot: FlyingDot, now: number) {
  if (dot.settleBloomAt > 0 || dot.tgtAlpha <= 0.04) return;
  dot.settleBloomAt = now;
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

function allowSettleBloom(scrolling: boolean) {
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

function dotIsActive(dot: FlyingDot) {
  return dot.alpha > 0.04 || dot.tgtAlpha > 0.04;
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
  if (zone === 'hero') return morphSettled(pool) ? 1 : 0;
  if (!isMorphShapeZone(zone)) return 1;

  if (isEyeZone(zone)) {
    if (pool.morphFlying || anyDotInFlight(pool)) {
      return morphBuildProgress(pool);
    }
    return pool.eyeMorphBuilt ? 1 : 0;
  }

  if (!pool.morphFlying && morphSettled(pool)) return 1;
  return morphBuildProgress(pool);
}

export function isMorphSettled(pool: FlyingPool) {
  return morphSettled(pool);
}

function allowFaceMotion(pool: FlyingPool, zone: MeshZone) {
  return zone === 'hero' && morphSettled(pool);
}

function allowHairMotion(pool: FlyingPool, zone: MeshZone) {
  return allowFaceMotion(pool, zone);
}

function dotTravelGate(dot: FlyingDot) {
  if (!dotInFlight(dot)) return 1;
  if (dot.simpleFlight) return dot.flightU;
  if (dot.gatherPath) return gatherTravelGate(dot.flightU);
  return easeInOutMelancholy(dot.flightU);
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
  const bloom = easeInOutMelancholy(Math.min(1, dot.flightU * 1.05));
  return Math.max(dot.alpha, dot.tgtAlpha * (0.2 + bloom * 0.8));
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
    hairWireRevealAt: 0,
    hairWireRevealRanks: null,
    hairWireRevealMaxGrow: null,
    hairWireRevealMaxAlpha: null,
    morphFlying: false,
    paletteBreathOx: 0,
    paletteBreathOy: 0,
    paletteTones: new Map(),
    paletteSplatTones: new Map(),
    paletteToneAnchors: new Map(),
    eyeTrackOx: 0,
    eyeTrackOy: 0,
    eyeTrackTgtOx: 0,
    eyeTrackTgtOy: 0,
    eyeFrameOx: 0,
    eyeFrameOy: 0,
    eyeFrameScale: 1,
    eyeFrameScaleX: 1,
    eyeFrameScaleY: 1,
    eyeFrameReady: false,
    eyeRevealArmed: false,
    eyeMorphHold: null,
    eyeMorphBuilt: false,
    sprayBursts: [],
    sprayNextBurstAt: 0,
    sprayBurstToneIdx: 0,
  };
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
    const { x, y } = dotDrawPos(dot, pool, zone, pin, now, false);
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
  const refW = pin.stageW * 0.94;
  const refH = pin.stageH * 0.94;
  const clampScale = (v: number) => Math.max(0.86, Math.min(1.14, v));
  const scaleX = clampScale(liveW / Math.max(refW, 1));
  const scaleY = clampScale(liveH / Math.max(refH, 1));
  const scale = (scaleX + scaleY) * 0.5;

  return {
    ox: cx - pinCx,
    oy: cy - pinCy,
    scale,
    scaleX,
    scaleY,
  };
}

function stepEyeMeshFrame(
  pool: FlyingPool,
  pin: MeshPinState,
  zone: MeshZone,
  now: number,
  dt: number,
) {
  if (!isEyeZone(zone)) {
    pool.eyeFrameOx = 0;
    pool.eyeFrameOy = 0;
    pool.eyeFrameScale = 1;
    pool.eyeFrameScaleX = 1;
    pool.eyeFrameScaleY = 1;
    pool.eyeFrameReady = false;
    return;
  }

  if (!morphSettled(pool)) {
    pool.eyeFrameReady = false;
    return;
  }

  const measured = measureEyeMeshFrame(pool, pin, zone, now);
  if (!measured) return;

  const smooth = 1 - Math.exp(-dt * 16);
  pool.eyeFrameOx += (measured.ox - pool.eyeFrameOx) * smooth;
  pool.eyeFrameOy += (measured.oy - pool.eyeFrameOy) * smooth;
  pool.eyeFrameScale += (measured.scale - pool.eyeFrameScale) * smooth;
  pool.eyeFrameScaleX += (measured.scaleX - pool.eyeFrameScaleX) * smooth;
  pool.eyeFrameScaleY += (measured.scaleY - pool.eyeFrameScaleY) * smooth;
  pool.eyeFrameReady = true;
}

function clampEyeAxis(value: number, max: number) {
  if (value < 0) return Math.max(value, -max);
  if (value > 0) return Math.min(value, max);
  return 0;
}

function stepEyePointerMotion(
  pool: FlyingPool,
  pin: MeshPinState,
  zone: MeshZone,
  pointer: FacePointer,
  dt: number,
) {
  if (!isEyeZone(zone)) {
    pool.eyeTrackTgtOx = 0;
    pool.eyeTrackTgtOy = 0;
    pool.eyeTrackOx = stepScalar(pool.eyeTrackOx, 0, EYE_TRACK_SPEED, dt);
    pool.eyeTrackOy = stepScalar(pool.eyeTrackOy, 0, EYE_TRACK_SPEED, dt);
    return;
  }

  let tgtOx = 0;
  let tgtOy = 0;
  if (pointer.screenActive) {
    const eyeCx = pin.left + (EYE_CENTER_X / EYE_SVG_W) * pin.stageW;
    const eyeCy = pin.top + (EYE_CENTER_Y / EYE_SVG_H) * pin.stageH;
    const scaleX = pin.stageW / EYE_SVG_W;
    const scaleY = pin.stageH / EYE_SVG_H;
    const mirrorSign = pin.flipX ? -1 : 1;
    let dx = (pointer.screenX - eyeCx) * 0.52 * mirrorSign;
    let dy = (pointer.screenY - eyeCy) * 0.4;
    const dist = Math.hypot(dx, dy);
    if (dist > 0.5) {
      const radial = Math.min(1, Math.max(EYE_TRACK_MAX.x * scaleX, EYE_TRACK_MAX.y * scaleY) / dist);
      dx = clampEyeAxis(dx * radial, EYE_TRACK_MAX.x * scaleX);
      dy = clampEyeAxis(dy * radial, EYE_TRACK_MAX.y * scaleY);
      tgtOx = dx;
      tgtOy = dy;
    }
  }

  pool.eyeTrackTgtOx = tgtOx;
  pool.eyeTrackTgtOy = tgtOy;
  pool.eyeTrackOx = stepScalar(pool.eyeTrackOx, tgtOx, EYE_TRACK_SPEED, dt);
  pool.eyeTrackOy = stepScalar(pool.eyeTrackOy, tgtOy, EYE_TRACK_SPEED, dt);
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

/** Kamień i obrączka StyleRank — waga dla mocniejszych błysków na górze. */
function ringGemWeight(dot: FlyingDot, pin: MeshPinState) {
  const lx = dot.x - (pin.docLeft + pin.stageW * 0.5);
  const ly = dot.y - (pin.docTop + pin.stageH * 0.5);
  const nx = lx / Math.max(pin.stageW, 1) + 0.5;
  const ny = ly / Math.max(pin.stageH, 1) + 0.5;
  if (ny > 0.46) return 0;
  const cx = 1 - Math.min(1, Math.abs(nx - 0.5) / 0.3);
  const cy = 1 - Math.min(1, ny / 0.4);
  return Math.max(0, cx * cy);
}

/** Ostre „ognie” — jasno tylko w wąskim paśmie fali, nie ciągły glow. */
function ringGlintPeak(wave: number, threshold: number, power: number) {
  return Math.pow(Math.max(0, Math.abs(wave) - threshold) / (1 - threshold), power);
}

function ringDiamondShimmer(dot: FlyingDot, now: number, pin: MeshPinState): DotShimmer {
  const settled = constellationShimmerGate(dot);
  if (settled <= 0.02) {
    return { opacityMul: 1, scaleMul: 1, wireMul: 1, gate: 0 };
  }

  const seed = starSeed(dot);
  const gem = ringGemWeight(dot, pin);
  const phase = seed * 6.283 + gem * 1.65;

  const slow = Math.sin(now * (0.0013 + (seed % 1) * 0.0015) + phase);
  const fast = Math.sin(now * (0.0042 + ((seed * PHI) % 1) * 0.0038) + phase * 1.25);
  const glintSlow = ringGlintPeak(slow, 0.79, 2.6);
  const glintFast = ringGlintPeak(fast, 0.85, 3.2);
  const flash = Math.min(1, glintSlow * 0.68 + glintFast * (0.32 + gem * 0.42));

  if (flash < 0.07) {
    return { opacityMul: 1, scaleMul: 1, wireMul: 1, gate: 0, diamond: false };
  }

  const opacityMul = 1 + flash * settled * (0.16 + gem * 0.26);
  const scaleMul = 1 + flash * settled * RING_SCALE_GLINT * (0.35 + gem * 0.65);
  const wireMul = 1 + flash * settled * RING_WIRE_GLINT * (0.35 + gem * 0.4);

  return {
    opacityMul,
    scaleMul,
    wireMul,
    gate: flash * settled,
    diamond: flash > 0.48 && (gem > 0.14 || flash > 0.7),
  };
}

function dotShimmer(dot: FlyingDot, now: number, zone: MeshZone, pin: MeshPinState): DotShimmer {
  if (zone === 'ring') return ringDiamondShimmer(dot, now, pin);
  return starShimmer(dot, now);
}

function dotDrawPos(
  dot: FlyingDot,
  _pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
) {
  let x = dot.x + dot.displayOx;
  let y = dot.y + dot.displayOy;
  if (!dot.isReflector) {
    const star = starOffset(dot, now, zone, heroFaceActive);
    x += star.ox;
    y += star.oy;
  }
  if (isEyeZone(zone)) {
    const blink = eyeBlinkCover(now);
    y = eyeBlinkSquashY(y, pin, blink);
  }
  return { x, y };
}

function dotDrawX(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
) {
  return dotDrawPos(dot, pool, zone, pin, now, heroFaceActive).x;
}

function dotDrawY(
  dot: FlyingDot,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  now: number,
  heroFaceActive: boolean,
) {
  return dotDrawPos(dot, pool, zone, pin, now, heroFaceActive).y;
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
  if (dot.flightDist > 14 && dot.flightU < 0.97) return 0;
  const rem = Math.hypot(dot.tgtX - dot.x, dot.tgtY - dot.y);
  if (rem > 18) return 0;
  return easeOutEmphasized(Math.min(1, dotSettle(dot)));
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
    const atlas = ensureDotAtlas(bundle, pin.stageW, pin.stageH);
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
    if (pool.sprayBursts.length > 0) pool.sprayBursts = [];
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

/** Oddech w stronę przycisku — tylko po morphu, bez zmiany layoutu / obrotu. */
function applyContactArrowPoint(
  pool: FlyingPool,
  zone: MeshZone,
  now: number,
  settled: boolean,
) {
  if (zone !== 'contactArrow') return;

  for (const dot of pool.dots.values()) {
    dot.displayOx = 0;
    dot.displayOy = 0;
  }
  if (!settled) return;

  const slotEl = document.getElementById(CONTACT_MESH_ANCHOR_ID);
  const ctaEl = document.getElementById(CONTACT_CTA_ANCHOR_ID);
  if (!slotEl || !ctaEl) return;

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

  for (const dot of pool.dots.values()) {
    if (dot.alpha < 0.06 && dot.tgtAlpha < 0.06) continue;
    dot.displayOx = dx * push;
    dot.displayOy = dy * push;
  }
}

function applyHeroFaceMotion(
  pool: FlyingPool,
  mesh: MeshBundle['faceMesh'],
  pin: MeshPinState,
  zone: MeshZone,
  pointer: FacePointer,
  now: number,
  enableHairMotion: boolean,
  enableFaceMotion: boolean,
) {
  for (const dot of pool.dots.values()) {
    dot.displayOx = 0;
    dot.displayOy = 0;
  }
  if (zone !== 'hero' || (!enableFaceMotion && !enableHairMotion)) return;

  for (const dot of pool.dots.values()) {
    if (dot.hostId == null || dot.alpha < 0.06 || dot.tgtAlpha < 0.06) continue;
    const node = mesh.nodes[dot.hostId];
    if (!node || !mesh.visibleNodeIds.has(dot.hostId)) continue;
    if (node.group === 'hair' && !enableHairMotion) continue;
    if (node.group === 'face' && !enableFaceMotion) continue;

    const gate = heroMotionGate(dot);
    if (gate <= 0.02) continue;

    const p = projectFaceNode(
      mesh,
      node,
      pin.stageW,
      pin.stageH,
      now,
      pointer,
      pool.blinkAt,
      gate,
    );
    dot.displayOx = (pin.docLeft + p.px - dot.x) * gate;
    dot.displayOy = (pin.docTop + p.py - dot.y) * gate;
  }
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

type HairWireRevealState = {
  progress: number;
  ranks: Map<string, number>;
};

function allowHairWires(zone: MeshZone, pool: FlyingPool) {
  if (zone !== 'hero') return false;
  if (pool.hairWireRevealAt > 0) return true;
  return morphSettled(pool) && !pool.morphFlying;
}

function hairWireEdgeKey(edge: MorphEdge) {
  return `${edge.a}:${edge.b}`;
}

function hairWireRevealProgress(pool: FlyingPool, now: number) {
  if (pool.hairWireRevealAt <= 0) return 0;
  const u = Math.min(1, (now - pool.hairWireRevealAt) / HAIR_WIRE_REVEAL_MS);
  return u * u * (3 - 2 * u);
}

function hairWireRevealState(pool: FlyingPool, now: number): HairWireRevealState | null {
  if (pool.hairWireRevealAt <= 0 || !pool.hairWireRevealRanks) return null;
  return {
    progress: hairWireRevealProgress(pool, now),
    ranks: pool.hairWireRevealRanks,
  };
}

function hairWireEdgeReveal(rank: number, progress: number) {
  const edgeStart = rank * HAIR_WIRE_REVEAL_STAGGER;
  const edgeSpan = Math.max(0.12, 1 - HAIR_WIRE_REVEAL_STAGGER);
  const local = (progress - edgeStart) / edgeSpan;
  const alphaGate = Math.max(0, Math.min(1, local * local * (3 - 2 * local)));
  const growU = Math.max(0, Math.min(1, local / 0.62));
  const growGate = growU * growU * (3 - 2 * growU);
  return { alphaGate, growGate };
}

function hairWireEdgeGrow(
  pool: FlyingPool,
  edge: MorphEdge,
  rank: number,
  progress: number,
) {
  const key = hairWireEdgeKey(edge);
  const { alphaGate, growGate } = hairWireEdgeReveal(rank, progress);
  const growMap = pool.hairWireRevealMaxGrow ?? new Map<string, number>();
  const alphaMap = pool.hairWireRevealMaxAlpha ?? new Map<string, number>();
  let grow = growMap.get(key) ?? 0;
  let alpha = alphaMap.get(key) ?? 0;
  grow = Math.max(grow, growGate);
  alpha = Math.max(alpha, alphaGate);
  if (progress >= 0.999) {
    grow = 1;
    alpha = 1;
  }
  growMap.set(key, grow);
  alphaMap.set(key, alpha);
  pool.hairWireRevealMaxGrow = growMap;
  pool.hairWireRevealMaxAlpha = alphaMap;
  return { alphaGate: alpha, growGate: grow };
}

function beginHairWireReveal(pool: FlyingPool, now: number) {
  pool.hairWireRevealAt = now;
  pool.hairWireRevealMaxGrow = new Map();
  pool.hairWireRevealMaxAlpha = new Map();
  const ranks = new Map<string, number>();
  const pending: { key: string; topY: number }[] = [];
  let minY = Infinity;
  let maxY = -Infinity;

  for (const edge of pool.wireEdges) {
    if (edge.group !== 'hair') continue;
    const dotA = poolDotForEdge(pool, edge, 'a');
    const dotB = poolDotForEdge(pool, edge, 'b');
    if (!dotA || !dotB) continue;
    const topY = Math.min(dotA.y, dotB.y);
    pending.push({ key: hairWireEdgeKey(edge), topY });
    minY = Math.min(minY, dotA.y, dotB.y);
    maxY = Math.max(maxY, dotA.y, dotB.y);
  }

  const span = Math.max(8, maxY - minY);
  for (const { key, topY } of pending) {
    ranks.set(key, (topY - minY) / span);
  }
  pool.hairWireRevealRanks = ranks;
}

function resetHairWireReveal(pool: FlyingPool) {
  pool.hairWireRevealAt = 0;
  pool.hairWireRevealRanks = null;
  pool.hairWireRevealMaxGrow = null;
  pool.hairWireRevealMaxAlpha = null;
}

function stepHairWireReveal(pool: FlyingPool, zone: MeshZone, now: number) {
  if (zone !== 'hero') {
    resetHairWireReveal(pool);
    return;
  }
  if (morphSettled(pool) && pool.hairWireRevealAt <= 0) {
    beginHairWireReveal(pool, now);
  }
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
  hairReveal: HairWireRevealState | null,
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

  const expected = expectedSegLen(dotA, dotB);
  if (expected < 6) return 0;

  const segLen = wireSegLen(dotA, dotB, zone);
  const settle = Math.min(dotSettle(dotA), dotSettle(dotB));
  const settled = settle >= 0.86;
  const isHair = edge.group === 'hair';
  const cap = wireSegCap(
    dotA,
    dotB,
    zone,
    layoutScale,
    settled,
    isHair,
  );
  if (cap <= 0 || segLen > cap) return 0;

  const settleMin = isMorphShapeZone(zone)
    ? WIRE_SETTLE_MIN_SHAPE
    : isHair && zone === 'hero'
      ? 0.32
      : WIRE_SETTLE_MIN;

  const travel = Math.min(dotTravelGate(dotA), dotTravelGate(dotB));
  if (settle < settleMin) return 0;
  const settleGate = easeOutEmphasized(
    Math.min(1, (settle - settleMin) / (1 - settleMin)),
  );

  let lenGate = segLen <= expected
    ? 1
    : 1 - (segLen - expected) / Math.max(cap - expected, 1);

  const visA = dotDisplayAlpha(dotA);
  const visB = dotDisplayAlpha(dotB);
  let alpha = Math.min(visA, visB) * settleGate * lenGate * WIRE_BODY_ALPHA;
  alpha *= travel;
  if (isEyeZone(zone)) {
    const buildT = computeMorphBuildT(pool, zone);
    alpha *= easeOutEmphasized(Math.max(0, Math.min(1, (buildT - 0.12) / 0.88)));
  }
  if (alpha <= 0.02) return 0;

  const shA = dotShimmer(dotA, now, zone, pin);
  const shB = dotShimmer(dotB, now, zone, pin);
  const wireTwinkle = shA.gate > 0.02 || shB.gate > 0.02
    ? (shA.wireMul + shB.wireMul) * 0.5
    : 1;
  alpha *= wireTwinkle;

  if (isHair) {
    if (!allowHairWires(zone, pool)) return 0;
    const hairGate = Math.min(dotA.hairMix, dotB.hairMix);
    if (hairGate < 0.05) return 0;
    alpha *= Math.max(hairGate, 0.35) * (WIRE_HAIR_ALPHA / WIRE_BODY_ALPHA);
    if (!hairReveal) return 0;
    const rank = hairReveal.ranks.get(hairWireEdgeKey(edge)) ?? 1;
    const { alphaGate } = hairWireEdgeGrow(pool, edge, rank, hairReveal.progress);
    if (alphaGate <= 0.02) return 0;
    alpha *= alphaGate;
  }

  const bloom = Math.max(
    dotSettleBloom(dotA, now, allowBloom),
    dotSettleBloom(dotB, now, allowBloom),
  );
  if (bloom > 0.02) {
    alpha *= 1 + bloom * SETTLE_WIRE_BLOOM;
  }

  return alpha;
}

function syncWireCanvas(canvas: HTMLCanvasElement, layer: HTMLElement) {
  const w = Math.max(layer.clientWidth, window.innerWidth);
  const h = parseFloat(layer.style.height) || layer.scrollHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
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
) {
  const { w, h, dpr } = syncWireCanvas(canvas, layer);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.lineCap = 'round';

  type WireBatch = { path: Path2D; alpha: number; color: string; width: number };
  const batches: WireBatch[] = [];
  const hairReveal = hairWireRevealState(pool, now);
  const hairWires = allowHairWires(zone, pool);

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
    const color = isHair && hairWires
      ? mixHex(DOT_GRAY, accent, Math.min(dotA.hairMix, dotB.hairMix))
      : matchedPalette ?? 'rgba(255,255,255,0.92)';
    const width =
      (isHair ? 1.0 : 0.9) * Math.max(0.9, pool.layoutScale) * (0.82 + travel * 0.22);
    let ax = dotDrawX(dotA, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.x;
    let ay = dotDrawY(dotA, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.y;
    let bx = dotDrawX(dotB, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.x;
    let by = dotDrawY(dotB, pool, wireZone, pin, now, heroFaceActive) - layerOrigin.y;

    if (Math.hypot(bx - ax, by - ay) > WIRE_DRAW_ABS_MAX_PX) return;

    if (isHair && hairWires && hairReveal) {
      const growGate = pool.hairWireRevealMaxGrow?.get(hairWireEdgeKey(edge)) ?? 0;
      if (growGate <= 0.01) return;
      if (growGate < 0.999) {
        const topIsA = ay <= by;
        const tx = topIsA ? ax : bx;
        const ty = topIsA ? ay : by;
        const fx = topIsA ? bx : ax;
        const fy = topIsA ? by : ay;
        ax = tx;
        ay = ty;
        bx = tx + (fx - tx) * growGate;
        by = ty + (fy - ty) * growGate;
      }
    }

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

  if (pool.retiringWireZone && pool.retiringWireEdges.length > 0) {
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

  for (const edge of pool.wireEdges) {
    const dotA = poolDotForEdge(pool, edge, 'a');
    const dotB = poolDotForEdge(pool, edge, 'b');
    if (!dotA || !dotB) continue;

    drawWireEdge(
      edge,
      zone,
      wireTargetAlpha(
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
        hairReveal,
      ),
      dotA,
      dotB,
    );
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
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const batches = new Map<string, { x: number; y: number; alpha: number }[]>();

  for (const dot of pool.dots.values()) {
    if (!dot.id.startsWith('h:') || dot.paletteTone == null) continue;
    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;

    const tone = dot.paletteTone;
    if (tone === 'wire') continue;
    const color = paletteColors[tone];
    let bucket = batches.get(color);
    if (!bucket) {
      bucket = [];
      batches.set(color, bucket);
    }

    const settled = !dotInFlight(dot) && dot.flightU >= 0.99 && dot.departLeft <= 0.01;
    const anchor = dot.hostId != null ? pool.paletteToneAnchors.get(dot.hostId) : undefined;
    let px: number;
    let py: number;
    if (anchor && settled) {
      const doc = normToDocument(
        { nx: anchor.x / pin.stageW, ny: anchor.y / pin.stageH },
        pin,
      );
      const star = starOffset(dot, now, zone, false);
      px = doc.x + star.ox - layerOrigin.x;
      py = doc.y + star.oy - layerOrigin.y;
    } else {
      px = dotDrawX(dot, pool, zone, pin, now, false) - layerOrigin.x;
      py = dotDrawY(dot, pool, zone, pin, now, false) - layerOrigin.y;
    }

    bucket.push({ x: px, y: py, alpha });
  }

  for (const [color, points] of batches) {
    ctx.fillStyle = color;
    for (const point of points) {
      ctx.globalAlpha = point.alpha;
      ctx.beginPath();
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
}

/** Budowa twarzy — batch na canvas zamiast ~600 aktualizacji DOM / klatkę. */
function paintHeroMorphCanvasDots(
  canvas: HTMLCanvasElement,
  pool: FlyingPool,
  zone: MeshZone,
  pin: MeshPinState,
  layerOrigin: { x: number; y: number },
  r: number,
  now: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;

  let count = 0;
  const gray: { x: number; y: number; alpha: number }[] = [];
  const white: { x: number; y: number; alpha: number; rad: number }[] = [];

  for (const dot of pool.dots.values()) {
    if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) continue;
    const alpha = dotDisplayAlpha(dot);
    if (alpha < 0.04) continue;

    const px = dotDrawX(dot, pool, zone, pin, now, false) - layerOrigin.x;
    const py = dotDrawY(dot, pool, zone, pin, now, false) - layerOrigin.y;
    count += 1;

    if (dot.isReflector) {
      const rad = reflectorAnchorR(dot, pool, r);
      white.push({ x: px, y: py, alpha: Math.min(1, alpha * DOT_ALPHA), rad });
    } else if (dot.id.startsWith('h:')) {
      gray.push({ x: px, y: py, alpha: Math.min(1, alpha * DOT_ALPHA) });
    }
  }

  ctx.fillStyle = DOT_GRAY;
  for (const p of gray) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = '#ffffff';
  for (const p of white) {
    ctx.globalAlpha = p.alpha;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.rad, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  return count;
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
): FlyingDot {
  const existing = pool.dots.get(id);
  if (existing) return existing;

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
  layer.appendChild(el);

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
    settleBloomAt: 0,
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
) {
  const layoutT0 = performance.now();
  const layout = viewportGoalsForZone(zone, bundle, paletteAim, pins);
  if (!layout) return;

  if (zoneChanged && pool.activeZone && pool.wireEdges.length > 0) {
    pool.retiringWireEdges = pool.wireEdges;
    pool.retiringWireZone = pool.activeZone;
  }

  pool.wireEdges = layout.edges;
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
  const hostOrder = sortedHostIds(layout.goals);
  const leavingHero = zoneChanged && pool.activeZone === 'hero' && zone !== 'hero';
  const buildingShape = zoneChanged && !leavingHero;

  pool.tgtLayoutScale = layout.layoutScale;
  const r = Math.max(1.4, 4.5 * pool.layoutScale);
  const size = r * 2;
  const activeIds = new Set<string>();
  const flightStarts: string[] = [];
  const reflectorById = new Map(
    layout.reflectors.map((ref) => [ref.targetId, ref] as const),
  );

  const ensureT0 = performance.now();
  for (const [id, goal] of layout.goals) {
    activeIds.add(id);
    const wasInPrevZone = prevZoneIds.has(id);
    const dot = ensureDot(pool, layer, id, dotClass, hairClass, hairIds, accent, size, goal);
    if (id.startsWith('l:')) {
      const targetId = Number(id.slice(2));
      const ref = reflectorById.get(targetId);
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
      dot.paletteTone = layout.paletteTones.get(dot.hostId) ?? 'wire';
    } else {
      dot.paletteTone = null;
    }
    if (zoneChanged && dot.isHair && zone === 'hero') {
      dot.hairMix = 0;
    }

    if (zoneChanged && buildingShape && !wasInPrevZone) {
      const dup = findDuplicateSpawn(
        id,
        pool,
        visibleBefore,
        layout.mergeMembers,
        hostOrder,
      );
      if (dup) {
        dot.x = dup.x;
        dot.y = dup.y;
        dot.srcX = dup.x;
        dot.srcY = dup.y;
      }
      dot.alpha = 0;
    }

    const tgtShift = Math.hypot(prevTgtX - goal.x, prevTgtY - goal.y);
    const hardTargetMoved =
      (zoneChanged && wasInPrevZone)
      || (zoneChanged && !wasInPrevZone);
    const softShiftLimit = isMorphShapeZone(zone) ? SOFT_TGT_SHIFT_PX : 1.5;
    const softTargetMoved = !zoneChanged && tgtShift > softShiftLimit;
    if (hardTargetMoved || softTargetMoved) {
      flightStarts.push(id);
    } else if (tgtShift > 0.5) {
      const rem = Math.hypot(dot.x - goal.x, dot.y - goal.y);
      if (rem > dot.flightDist) dot.flightDist = rem;
    }
  }

  const waveDir = pool.buildWaveDir;
  const heroCrumbleIds = leavingHero ? [...prevZoneIds] : [];
  const crumbleRanks = leavingHero
    ? crumbleRanksByCurrentY(pool, heroCrumbleIds, waveDir)
    : null;
  const flightCount = leavingHero ? heroCrumbleIds.length : flightStarts.length;

  const morphDots = flightStarts
    .map((id) => pool.dots.get(id))
    .filter((dot): dot is FlyingDot => dot != null);
  const flightHub = morphDots.length > 0 ? computeFlightHub(morphDots) : null;
  const streakLayout = flightHub && morphDots.length > 0
    ? computeStreakLayout(morphDots, flightHub)
    : null;

  const enteringHero = zone === 'hero' && (zoneChanged || pool.activeZone == null);
  const enteringEye = isEyeZone(zone) && zoneChanged;
  const simpleMorph = enteringHero || enteringEye;

  if (enteringEye) {
    pool.eyeMorphBuilt = false;
  }

  for (const id of flightStarts) {
    const dot = pool.dots.get(id);
    if (!dot) continue;
    if (enteringEye) {
      dot.alpha = 0;
      dot.paintKey = undefined;
    }
    const rank = streakLayout?.ranks.get(id) ?? 0;
    beginFlight(dot, rank, flightStarts.length, {
      gather: !simpleMorph,
      simpleHero: simpleMorph,
      eyeMorph: enteringEye,
      hub: simpleMorph ? undefined : flightHub ?? undefined,
      streakUx: simpleMorph ? undefined : streakLayout?.ux,
      streakUy: simpleMorph ? undefined : streakLayout?.uy,
    });
  }
  if (flightStarts.length > 0) {
    pool.morphFlying = true;
    pool.morphBloomAt = 0;
  } else if (zone === 'bus' && zoneChanged && poolHasActiveReflectors(pool)) {
    pool.morphBloomAt = performance.now();
  }

  const crumbleExits: string[] = [];
  const zoneExitIds: string[] = [];
  for (const [, dot] of pool.dots) {
    if (!activeIds.has(dot.id)) {
      dot.tgtAlpha = 0;
      dot.tgtHairMix = 0;
      if (leavingHero && prevZoneIds.has(dot.id)) {
        crumbleExits.push(dot.id);
      } else if (zoneChanged && dot.alpha > 0.04) {
        zoneExitIds.push(dot.id);
      } else if (zoneChanged) {
        dot.alpha = 0;
        idleDotFlight(dot);
      }
    }
  }

  const zoneExitRanks = zoneExitIds.length > 0
    ? exitRanksForZoneChange(pool, zoneExitIds, flightHub, waveDir)
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

  lastSyncEnsureDotsMs = performance.now() - ensureT0;
}

function desiredHairMix(dot: FlyingDot) {
  if (dot.tgtHairMix <= 0) return 0;
  if (dot.flightDist > 0.5 && dot.flightU < 1) {
    if (!dot.gatherPath && dot.hairMix > 0.9) return dot.hairMix;
    if (dot.gatherPath && gatherSpatialT(dot.flightU) < HAIR_GATHER_TINT_START) return 0;
    const start = dot.gatherPath ? HAIR_GATHER_TINT_START : HAIR_FLIGHT_START;
    const travelU = dot.gatherPath ? gatherSpatialT(dot.flightU) : dot.flightU;
    const gate = Math.max(0, (travelU - start) / (1 - start));
    return easeOutEmphasized(gate);
  }
  return dot.flightU >= 1 ? 1 : 0;
}

function stepHairMix(dot: FlyingDot, dt: number, hairMotionReady: boolean) {
  if (!dot.isHair) return;
  if (!hairMotionReady) {
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
  const ignite = dot.isReflector && eyeIrisZone
    ? dot.alpha
    : reflectorIgnite(dot, pool, now);

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
  const drawR = r * scale;
  const drawSize = Math.round(drawR * 2 * 10) / 10;
  const bloomCls = bloom > 0.04 ? ` ${settleBloomClass}` : '';
  const starCls = shimmer.gate > 0.04 ? ` ${starClass}` : '';
  const diamondCls = shimmer.diamond && diamondClass ? ` ${diamondClass}` : '';
  const hairTint = dot.isHair ? Math.max(0, Math.min(1, dot.hairMix)) : 0;
  const showHairStyle = hairTint > 0.22;
  const cls = inFlight
    ? `${dotClass} ${flightClass}${showHairStyle ? ` ${hairClass}` : ''}${diamondCls}${starCls}${bloomCls}`
    : `${dotClass}${showHairStyle ? ` ${hairClass}` : ''}${diamondCls}${starCls}${bloomCls}`;
  const eyeBuildGate = isEyeZone(zone) ? computeMorphBuildT(pool, zone) : 1;
  const opacity = Math.min(
    1,
    (dotDisplayAlpha(dot) + bloom * SETTLE_BLOOM_OPACITY) * shimmer.opacityMul * eyeBuildGate,
  );
  const starActive = constellationPositionGate(dot) > 0.04;
  const leftRaw = dotDrawX(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.x - drawR;
  const topRaw = dotDrawY(dot, pool, zone, pin, now, heroFaceActive) - layerOrigin.y - drawR;
  const left = starActive ? leftRaw : Math.round(leftRaw * 10) / 10;
  const top = starActive ? topRaw : Math.round(topRaw * 10) / 10;
  let bg = dot.isHair
    ? mixHex(DOT_GRAY, accent, hairTint)
    : paletteSplatDot && paletteColors
      ? paletteColors[dot.paletteTone!]
      : DOT_GRAY;
  if (zone === 'ring' && shimmer.diamond) {
    const gemT = 0.18 + 0.72 * Math.min(1, shimmer.gate);
    bg = mixHex(DOT_GRAY, '#ffffff', gemT);
  }
  const key = `${cls}|${drawSize}|${opacity.toFixed(3)}|${left}|${top}|${bg}`;
  if (!starActive && shimmer.gate <= 0.04 && dot.paintKey === key) return;
  dot.paintKey = key;

  if (dot.el.className !== cls) dot.el.className = cls;
  dot.el.style.width = `${drawSize}px`;
  dot.el.style.height = `${drawSize}px`;
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
  const pins = computeAllZonePins(opts.meshFrameId ?? -1);
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
  }
  pool.viewportKey = viewportKey;

  const scrollDir = stepScrollBuildDir();
  const scrollZone = resolveActiveMeshZone();
  let zone = scrollZone;
  if (zone === 'palette' && !pins.palette) zone = 'hero';

  let eyeMorphSyncedThisTick = false;

  if (pool.eyeMorphHold) {
    if (scrollZone !== pool.eyeMorphHold) {
      pool.eyeMorphHold = null;
    } else if (isEyeAnchorInView(pool.eyeMorphHold)) {
      const held = pool.eyeMorphHold;
      pool.eyeMorphHold = null;
      logPerfEvent('oko: start morphu', { zone: held });
      zone = held;
      syncFlyingTargets(
        pool,
        layer,
        bundle,
        held,
        liveAim,
        pins,
        dotClass,
        hairClass,
        hairIds,
        accent,
        pool.activeZone != null,
      );
      pool.activeZone = held;
      pool.pinKey = pinLayoutKey(pins);
      pool.activeLayoutKey = activeZoneLayoutKey(held, pins);
      eyeMorphSyncedThisTick = true;
    } else if (pool.activeZone) {
      zone = pool.activeZone;
    }
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
    pool.eyeRevealArmed = false;
    resetHairWireReveal(pool);
    resetEyeIrisReveal();
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
    pool.retiringWireEdges = [];
    pool.retiringWireZone = null;
    syncRigidLayoutFollow(pool, bundle, zone, liveAim, pins, true, dt);
    pool.activeZone = zone;
    pool.pinKey = pinKey;
    pool.activeLayoutKey = layoutKey;
  } else if ((zoneChanged || pool.activeZone == null) && !eyeMorphSyncedThisTick) {
    if (isEyeZone(scrollZone) && !isEyeAnchorInView(scrollZone)) {
      pool.eyeMorphHold = scrollZone;
      logPerfEvent('oko: morph wstrzymany (poza viewport)', { zone: scrollZone });
    } else {
      const syncT0 = performance.now();
      syncFlyingTargets(
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
      );
      syncMs = performance.now() - syncT0;
      pool.activeZone = zone;
      pool.pinKey = pinKey;
      pool.activeLayoutKey = layoutKey;
    }
  } else if (anchorChanged) {
    const eyeBuilding = isEyeZone(zone) && (pool.morphFlying || anyDotInFlight(pool));
    const contactMorphing =
      zone === 'contactArrow' && (pool.morphFlying || anyDotInFlight(pool));
    if (!eyeBuilding && !contactMorphing) {
      const sizeChanged =
        layoutStageSizeFromKey(layoutKey) !== layoutStageSizeFromKey(pool.activeLayoutKey);
      syncRigidLayoutFollow(pool, bundle, zone, liveAim, pins, sizeChanged, dt);
    }
    pool.pinKey = pinKey;
    pool.activeLayoutKey = layoutKey;
  } else if (layoutChanged) {
    pool.pinKey = pinKey;
  }

  const scrolling = opts.scrolling ?? false;

  pool.layoutScale = stepScalar(pool.layoutScale, pool.tgtLayoutScale, SCALE_SPEED, dt);
  const r = Math.max(1.4, 4.5 * pool.layoutScale);
  const now = performance.now();

  const stepT0 = performance.now();
  for (const dot of pool.dots.values()) {
    stepFlight(dot, dt, now);
    if (dot.alphaHoldLeft > 0) {
      dot.alphaHoldLeft = Math.max(0, dot.alphaHoldLeft - dt);
    } else {
      const alphaSpeed = dot.departLeft > 0 ? ALPHA_SPEED * 0.35 : ALPHA_SPEED;
      const exitFade = dotInFlight(dot) && dot.tgtAlpha <= 0.04;
      if (!exitFade) {
        dot.alpha = stepScalar(dot.alpha, dot.tgtAlpha, alphaSpeed, dt);
      }
    }
  }

  stepMs = performance.now() - stepT0;

  updateMorphBloom(pool, now);
  if (morphSettled(pool)) {
    pool.retiringWireEdges = [];
    pool.retiringWireZone = null;
    if (isEyeZone(zone)) {
      pool.eyeMorphBuilt = true;
    }
  }
  if (!isEyeZone(zone)) {
    pool.eyeMorphBuilt = false;
  }

  const settleBloomReady = allowSettleBloom(scrolling);
  const faceReady = allowFaceMotion(pool, zone);
  const hairReady = allowHairMotion(pool, zone);
  stepHairWireReveal(pool, zone, now);

  pool.paletteBreathOx = 0;
  pool.paletteBreathOy = 0;

  const settled = morphSettled(pool);

  if (isEyeZone(zone)) {
    setEyeBlinkActive(true);
    if (settled) {
      stepEyeBlink(now);
      stepEyeIrisReveal(true, now);
      if (!pool.eyeRevealArmed) {
        armEyeFirstBlink(now);
        pool.eyeRevealArmed = true;
      }
    } else {
      pool.eyeRevealArmed = false;
      resetEyeIrisReveal();
    }
  } else {
    setEyeBlinkActive(false);
    pool.eyeRevealArmed = false;
  }

  if (faceReady) {
    stepHeroBlink(pool, now);
  }
  applyHeroFaceMotion(
    pool,
    bundle.faceMesh,
    pins.hero,
    zone,
    pointer,
    now,
    hairReady,
    faceReady,
  );
  applyContactArrowPoint(pool, zone, now, settled);

  const heroFaceActive = faceReady && zone === 'hero';
  const activePin = pinForZonePins(pins, zone);
  stepSprayBursts(pool, bundle, zone, activePin, layerOrigin, accent, now, settled);
  stepEyePointerMotion(pool, activePin, zone, pointer, dt);
  stepEyeMeshFrame(pool, activePin, zone, now, dt);

  for (const dot of pool.dots.values()) {
    stepHairMix(dot, dt, hairReady);
  }

  publishMeshMotionState({
    morphFlying: pool.morphFlying,
    morphSettled: settled,
    scrolling,
    morphBuildT: computeMorphBuildT(pool, zone),
    eyeIrisUnlocked: isEyeZone(zone) && readEyeIrisRevealUnlocked(),
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
  });

  const palettePaintVisible = zone !== 'palette' || isStudioPaletyInView();
  const paletteColors = zone === 'palette' ? getPaletteToneColors(accent) : null;
  const paletteCanvasDots = zone === 'palette' && palettePaintVisible;
  const heroMorphLite = zone === 'hero' && !settled;
  const heroCanvasDots = heroMorphLite;

  let paintDotsMs = 0;
  let paintWiresMs = 0;
  let domPaints = 0;
  let canvasDots = 0;
  let visibleDots = 0;
  let activeDots = 0;

  if (!opts.skipPaint) {
    const paintDotsStart = performance.now();

    for (const dot of pool.dots.values()) {
      if (dot.alpha > 0.03 || dot.tgtAlpha > 0.03) activeDots += 1;
      if (dot.alpha <= 0.03 && dot.tgtAlpha <= 0.03) {
        dot.alpha = 0;
        dot.el.style.opacity = '0';
        continue;
      }

      if (!palettePaintVisible) {
        dot.el.style.opacity = '0';
        continue;
      }

      if (
        paletteCanvasDots
        && dot.paletteTone
        && dot.paletteTone !== 'wire'
      ) {
        dot.el.style.opacity = '0';
        continue;
      }

      if (heroCanvasDots) {
        dot.el.style.opacity = '0';
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

    const stride = opts.wireStride ?? 1;
    const wireFrame = opts.wireFrame ?? 0;
    if (!opts.skipWirePaint && wireCanvas && wireFrame % stride === 0) {
      const wiresStart = performance.now();
      paintWires(
        pool,
        wireCanvas,
        layer,
        zone,
        activePin,
        accent,
        layerOrigin,
        now,
        heroMorphLite ? false : settleBloomReady,
        hairReady,
        heroFaceActive,
        paletteColors,
      );
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
        );
      } else if (heroCanvasDots) {
        canvasDots = paintHeroMorphCanvasDots(
          wireCanvas,
          pool,
          zone,
          activePin,
          layerOrigin,
          r,
          now,
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
      visibleDots: heroCanvasDots ? canvasDots : visibleDots,
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
