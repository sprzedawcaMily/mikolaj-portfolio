/**
 * Scroll → dyskretne cele (strefy), bez pośrednich morphów 0.37 itd.
 * Zatrzymanie scrolla = ten sam cel co w focusie, kropki dolecają same.
 */

import { EYE_MESH_STAGE_INSET } from '@/components/animation/parseKamochiEyeSvg';
import { readMorphZoneLock } from '@/hooks/meshZoneStore';

export const PIVOT_Y_RATIO = 0.1;
export const AIM_GAP_PX = 18;
export const ARROW_PIN_LIFT_PX = 68;
export const CANVAS_BOTTOM_PAD = 48;
export const AIM_X_RATIO = 0.58;
export const ARROW_STAGE_EXTRA_W = 96;
export const MESH_LAYER_ID = 'mesh-flying-layer';
export const FLYING_MESH_CANVAS_ID = 'flying-mesh-canvas';
export const HERO_MESH_ANCHOR_ID = 'hero-mesh-anchor';
export const PALETTE_MESH_ANCHOR_ID = 'palette-mesh-anchor';
export const TRANSITRANK_MESH_ANCHOR_ID = 'transit-rank-mesh-anchor';
export const FORKFULL_MESH_ANCHOR_ID = 'forkfull-mesh-anchor';
export const KAMOCHI_MESH_ANCHOR_ID = 'kamochi-mesh-anchor';
export const LEGITCHECK_MESH_ANCHOR_ID = 'legitcheck-mesh-anchor';
export const STYLERANK_MESH_ANCHOR_ID = 'stylerank-mesh-anchor';
export const EXPERIENCE_MESH_ANCHOR_ID = 'experience-mesh-anchor';
export const SKILLS_MESH_ANCHOR_ID = 'skills-mesh-anchor';
export const CONTACT_MESH_ANCHOR_ID = 'contact-mesh-anchor';
export const CONTACT_CTA_ANCHOR_ID = 'contact-cta-anchor';
export const ARROW_MESH_ASPECT = 1243 / 2207;
export const TRANSIT_MESH_SLOT_ID = 'transit-rank-mesh-slot';
export const BUS_DISPLAY_ROTATE_DEG = 15;
export const PALETTE_DISPLAY_ROTATE_DEG = -15;
export const FORK_DISPLAY_ROTATE_DEG = 10;
export const SPRAY_DISPLAY_ROTATE_DEG = 15;
/** Powiększenie mesha w slocie karty (widelec / sprej). */
export const FORK_MESH_STAGE_SCALE = 1.4;
export const SPRAY_MESH_STAGE_SCALE = 1.4;
export const LOUPE_DISPLAY_ROTATE_DEG = -10;
export const RING_DISPLAY_ROTATE_DEG = 15;
export const EYE_MESH_ASPECT = 1408 / 867;

const BUS_MESH_ASPECT = 1146 / 1196;

function readRect(id: string) {
  return document.getElementById(id)?.getBoundingClientRect() ?? null;
}

export function segmentMid(zone: MeshZone): number | null {
  switch (zone) {
    case 'hero':
      return readDocMid(HERO_MESH_ANCHOR_ID);
    case 'palette':
      return readDocMid('studio-palety');
    case 'bus':
      return readDocMid(TRANSITRANK_MESH_ANCHOR_ID);
    case 'fork':
      return readDocMid(FORKFULL_MESH_ANCHOR_ID);
    case 'spray':
      return readDocMid(KAMOCHI_MESH_ANCHOR_ID);
    case 'loupe':
      return readDocMid(LEGITCHECK_MESH_ANCHOR_ID);
    case 'ring':
      return readDocMid(STYLERANK_MESH_ANCHOR_ID);
    case 'careerEye':
      return readDocMid(EXPERIENCE_MESH_ANCHOR_ID);
    case 'skillsEye':
      return readDocMid(SKILLS_MESH_ANCHOR_ID);
    case 'contactArrow':
      return readDocMid(CONTACT_MESH_ANCHOR_ID);
  }
}

/** Najbliższy anchor kształtu — projekty i oczy na tych samych zasadach co ring/loupe. */
function resolveClosestShapeZone(probeY: number): MeshZone {
  const shapes: { zone: MeshZone; id: string }[] = [
    { zone: 'bus', id: TRANSITRANK_MESH_ANCHOR_ID },
    { zone: 'fork', id: FORKFULL_MESH_ANCHOR_ID },
    { zone: 'spray', id: KAMOCHI_MESH_ANCHOR_ID },
    { zone: 'loupe', id: LEGITCHECK_MESH_ANCHOR_ID },
    { zone: 'ring', id: STYLERANK_MESH_ANCHOR_ID },
    { zone: 'careerEye', id: EXPERIENCE_MESH_ANCHOR_ID },
    { zone: 'skillsEye', id: SKILLS_MESH_ANCHOR_ID },
  ];

  let best: MeshZone = 'bus';
  let bestDist = Number.POSITIVE_INFINITY;
  for (const shape of shapes) {
    const mid = readDocMid(shape.id);
    if (mid == null) continue;
    const dist = Math.abs(probeY - mid);
    if (dist < bestDist) {
      bestDist = dist;
      best = shape.zone;
    }
  }
  return best;
}

function maxScrollY(vh = window.innerHeight) {
  return Math.max(
    0,
    document.documentElement.scrollHeight - vh,
    document.body.scrollHeight - vh,
  );
}

/** Kontakt w dolnej części okna — tylko gdy scroll nie dociera (zoom out) lub jesteś przy dole strony. */
function contactSectionVisibleInViewport(vh: number): boolean {
  const scrollMax = maxScrollY(vh);
  const atDocBottom = scrollMax < 96 || window.scrollY >= scrollMax - 48;
  if (!atDocBottom) return false;

  const el = document.getElementById('kontakt');
  if (!el) return false;
  const rect = el.getBoundingClientRect();
  const visibleH = Math.min(rect.bottom, vh) - Math.max(rect.top, 0);
  if (visibleH < 56) return false;
  const centerY = rect.top + rect.height * 0.38;
  return centerY >= vh * 0.36;
}

/**
 * Punkt próbkowania scrolla — przy zoom out cała strona mieści się w viewport
 * i klasyczny probe (44% wysokości okna) zostaje w górnej połowie dokumentu.
 */
function readViewportProbeY(vh = window.innerHeight): number {
  const scrollMax = maxScrollY(vh);
  const docH = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );

  if (scrollMax < 96) {
    return Math.max(docH * 0.82, docH - vh * 0.16);
  }

  if (window.scrollY >= scrollMax - 64) {
    return window.scrollY + vh * 0.68;
  }

  return window.scrollY + vh * VIEW_PROBE_RATIO;
}

function resolvePostProjectsZone(probeY: number, vh: number): MeshZone {
  if (contactSectionVisibleInViewport(vh)) return 'contactArrow';

  const contactTop = readDocTop('kontakt');
  if (contactTop != null && probeY >= contactTop + 40) {
    return 'contactArrow';
  }
  return resolveClosestShapeZone(probeY);
}

/** Scroll wybiera segment — nie procent drogi, tylko strefa viewportu. */
function resolveSegmentZone(probeY: number, vh = window.innerHeight): MeshZone {
  const paletteTop = readDocTop('studio-palety');
  const projectsTop = readDocTop('projekty');

  const paletteAnchor = readRect(PALETTE_MESH_ANCHOR_ID);

  // Twarz w hero — paleta dopiero w sekcji Studio palety (nie w „O mnie”).
  if (paletteTop == null || !paletteAnchor || probeY < paletteTop - 96) {
    return 'hero';
  }
  if (projectsTop != null && probeY >= projectsTop + 120) {
    return resolvePostProjectsZone(probeY, vh);
  }

  const studioBottom = readDocBottom('studio-palety');
  if (studioBottom != null && probeY > studioBottom - 96) {
    return resolvePostProjectsZone(probeY, vh);
  }

  return 'palette';
}

/** Dyskretna strefa z histerezą — scroll wybiera cel, nie % morphu. */
export function resolveActiveMeshZone(vh = window.innerHeight): MeshZone {
  const locked = readMorphZoneLock();
  if (locked) return locked;
  return resolveActiveZoneWithHysteresis(vh);
}

/** Utrzymuje histerezę zgodną z aktywnym morph — bez oscylacji przy odwróceniu scrolla. */
export function pinCommittedMeshZone(zone: MeshZone) {
  committedZone = zone;
}

/** Po zoomie / resize — strefa od nowa ze scrolla (bez zaciętej histerezy). */
export function refreshMeshZoneAfterViewportChange(vh = window.innerHeight) {
  invalidateZonePinsCache();
  committedZone = resolveSegmentZone(readViewportProbeY(vh), vh);
}

function resolveActiveZoneWithHysteresis(vh: number): MeshZone {
  const probeY = readViewportProbeY(vh);
  const candidate = resolveSegmentZone(probeY, vh);

  if (candidate === committedZone) return committedZone;

  const curMid = segmentMid(committedZone);
  const nextMid = segmentMid(candidate);
  if (curMid == null || nextMid == null) {
    committedZone = candidate;
    return committedZone;
  }

  const curDist = Math.abs(probeY - curMid);
  const nextDist = Math.abs(probeY - nextMid);
  if (nextDist + ZONE_HYSTERESIS_PX < curDist) {
    committedZone = candidate;
  }
  return committedZone;
}

export type PaintLayer = {
  layer: MeshZone;
  t: number;
  demorph: boolean;
};

const MORPH_LAYER_ACTIVE = 0.008;

/** Jedna aktywna warstwa — bez skoków twarzy przy demorphu. */
export function resolvePaintLayer(
  display: ScrollMorphTargets,
  scrollTarget: ScrollMorphTargets,
): PaintLayer {
  if (display.skillsEyeMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'skillsEye',
      t: display.skillsEyeMorph,
      demorph: scrollTarget.skillsEyeMorph < display.skillsEyeMorph - 0.006,
    };
  }
  if (display.careerEyeMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'careerEye',
      t: display.careerEyeMorph,
      demorph: scrollTarget.careerEyeMorph < display.careerEyeMorph - 0.006,
    };
  }
  if (display.ringMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'ring',
      t: display.ringMorph,
      demorph: scrollTarget.ringMorph < display.ringMorph - 0.006,
    };
  }
  if (display.loupeMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'loupe',
      t: display.loupeMorph,
      demorph: scrollTarget.loupeMorph < display.loupeMorph - 0.006,
    };
  }
  if (display.sprayMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'spray',
      t: display.sprayMorph,
      demorph: scrollTarget.sprayMorph < display.sprayMorph - 0.006,
    };
  }
  if (display.forkMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'fork',
      t: display.forkMorph,
      demorph: scrollTarget.forkMorph < display.forkMorph - 0.006,
    };
  }
  if (display.busMorph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'bus',
      t: display.busMorph,
      demorph: scrollTarget.busMorph < display.busMorph - 0.006,
    };
  }
  if (display.morph > MORPH_LAYER_ACTIVE) {
    return {
      layer: 'palette',
      t: display.morph,
      demorph: scrollTarget.morph < display.morph - 0.006,
    };
  }
  return { layer: 'hero', t: clamp01(1 - display.morph), demorph: false };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

export type MeshZone =
  | 'hero'
  | 'palette'
  | 'bus'
  | 'fork'
  | 'spray'
  | 'loupe'
  | 'ring'
  | 'careerEye'
  | 'skillsEye'
  | 'contactArrow';

export const ZONE_ORDER: MeshZone[] = [
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
];

export function zoneIndex(zone: MeshZone) {
  return ZONE_ORDER.indexOf(zone);
}

const ZONE_HYSTERESIS_PX = 220;
const VIEW_PROBE_RATIO = 0.44;
let committedZone: MeshZone = 'hero';

function readDocMid(id: string) {
  const el = document.getElementById(id);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  return rect.top + window.scrollY + rect.height * 0.5;
}

function readDocTop(id: string) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.getBoundingClientRect().top + window.scrollY;
}

function readDocBottom(id: string) {
  const el = document.getElementById(id);
  if (!el) return null;
  return el.getBoundingClientRect().bottom + window.scrollY;
}

export type MeshPinState = {
  left: number;
  top: number;
  docLeft: number;
  docTop: number;
  stageW: number;
  stageH: number;
  rotateDeg: number;
  originStr: string;
  /** Lustrzane oko (stack) — odbicie poziome layoutu mesh. */
  flipX?: boolean;
};

export function attachDocCoords(
  pin: Omit<MeshPinState, 'docLeft' | 'docTop'>,
): MeshPinState {
  return {
    ...pin,
    docLeft: pin.left + window.scrollX,
    docTop: pin.top + window.scrollY,
  };
}

export function syncPinViewport(pin: MeshPinState) {
  pin.left = pin.docLeft - window.scrollX;
  pin.top = pin.docTop - window.scrollY;
}

export function pinDelta(sim: MeshPinState, target: MeshPinState) {
  return (
    Math.hypot(sim.docLeft - target.docLeft, sim.docTop - target.docTop)
    + Math.abs(sim.stageW - target.stageW) * 0.08
    + Math.abs(sim.stageH - target.stageH) * 0.08
    + Math.abs(sim.rotateDeg - target.rotateDeg) * 0.5
  );
}

function easePinBlend(t: number) {
  const v = Math.max(0, Math.min(1, t));
  return 0.5 - Math.cos(v * Math.PI) / 2;
}

/** Pin zsynchronizowany z postępem morphu (0→1) — pozycja i rozmiar z bieżącego kształtu. */
export function blendPinState(a: MeshPinState, b: MeshPinState, t: number): MeshPinState {
  const u = easePinBlend(t);
  const docLeft = a.docLeft + (b.docLeft - a.docLeft) * u;
  const docTop = a.docTop + (b.docTop - a.docTop) * u;
  return {
    docLeft,
    docTop,
    left: docLeft - window.scrollX,
    top: docTop - window.scrollY,
    stageW: a.stageW + (b.stageW - a.stageW) * u,
    stageH: a.stageH + (b.stageH - a.stageH) * u,
    rotateDeg: a.rotateDeg + (b.rotateDeg - a.rotateDeg) * u,
    originStr: u < 0.5 ? a.originStr : b.originStr,
  };
}

export type ScrollMorphTargets = {
  morph: number;
  busMorph: number;
  forkMorph: number;
  sprayMorph: number;
  loupeMorph: number;
  ringMorph: number;
  careerEyeMorph: number;
  skillsEyeMorph: number;
};

export type ScrollAimPoint = {
  x: number;
  y: number;
  centerX: number;
  stageW: number;
  stageH: number;
};

export type ScrollFrame = {
  zone: MeshZone;
  targets: ScrollMorphTargets;
  pinTarget: MeshPinState;
  palettePin: MeshPinState | null;
  paletteAim: ScrollAimPoint | null;
  aim: ScrollAimPoint | null;
  isAtPalette: boolean;
};

export function targetsForZone(zone: MeshZone): ScrollMorphTargets {
  const on = 1;
  const off = 0;
  switch (zone) {
    case 'hero':
      return {
        morph: off,
        busMorph: off,
        forkMorph: off,
        sprayMorph: off,
        loupeMorph: off,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'palette':
      return {
        morph: on,
        busMorph: off,
        forkMorph: off,
        sprayMorph: off,
        loupeMorph: off,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'bus':
      return {
        morph: on,
        busMorph: on,
        forkMorph: off,
        sprayMorph: off,
        loupeMorph: off,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'fork':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: off,
        loupeMorph: off,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'spray':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: off,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'loupe':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: on,
        ringMorph: off,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'ring':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: on,
        ringMorph: on,
        careerEyeMorph: off,
        skillsEyeMorph: off,
      };
    case 'careerEye':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: on,
        ringMorph: on,
        careerEyeMorph: on,
        skillsEyeMorph: off,
      };
    case 'skillsEye':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: on,
        ringMorph: on,
        careerEyeMorph: on,
        skillsEyeMorph: on,
      };
    case 'contactArrow':
      return {
        morph: on,
        busMorph: on,
        forkMorph: on,
        sprayMorph: on,
        loupeMorph: on,
        ringMorph: on,
        careerEyeMorph: on,
        skillsEyeMorph: on,
      };
  }
}

function computePalettePin(_vw: number, _vh: number) {
  const anchorRect = readRect(PALETTE_MESH_ANCHOR_ID);
  if (!anchorRect || anchorRect.width < 24 || anchorRect.height < 24) return null;

  const stageW = anchorRect.width;
  const stageH = anchorRect.height;
  const left = anchorRect.left;
  const top = anchorRect.top;

  const thumb = document.getElementById('palette-color-thumb');
  const track = document.getElementById('palette-color-track');
  const thumbRect = thumb?.getBoundingClientRect();
  const trackRect = track?.getBoundingClientRect();

  let aimX = stageW * 0.5;
  let aimY = stageH * 0.72;
  if (thumbRect) {
    aimX = thumbRect.left + thumbRect.width * 0.5 - left;
    aimY = thumbRect.top + thumbRect.height * 0.5 - top;
  } else if (trackRect) {
    aimX = trackRect.left + trackRect.width * 0.5 - left;
    aimY = trackRect.top + trackRect.height * 0.5 - top;
  }

  return {
    pin: attachDocCoords({
      left,
      top,
      stageW,
      stageH,
      rotateDeg: PALETTE_DISPLAY_ROTATE_DEG,
      originStr: '50% 50%',
    }),
    aim: {
      x: aimX,
      y: aimY,
      centerX: stageW * 0.5,
      stageW,
      stageH,
    } satisfies ScrollAimPoint,
  };
}

function cardStageSize(vw: number, vh: number, aspect: number) {
  let stageW = Math.min(420, Math.max(280, vw * 0.42));
  let stageH = Math.round(stageW * aspect);
  const maxH = Math.round(vh * 0.5);
  if (stageH > maxH) {
    stageH = Math.max(260, maxH);
    stageW = Math.round(stageH / aspect);
  }
  return {
    stageW: Math.max(260, Math.min(stageW, 420)),
    stageH: Math.max(260, stageH),
  };
}

/** Mesh w slocie obok karty — stały rozmiar stage, pozycja ze slotu (nie z całej karty). */
function pinInMeshSlot(
  slotRect: DOMRect,
  stageW: number,
  stageH: number,
  rotateDeg: number,
  originStr: string,
): MeshPinState {
  const left = slotRect.left + (slotRect.width - stageW) * 0.5;
  const top = slotRect.top + (slotRect.height - stageH) * 0.5;
  return attachDocCoords({
    left,
    top,
    stageW,
    stageH,
    rotateDeg,
    originStr,
  });
}

function projectPinFromAnchor(
  anchorRect: DOMRect,
  vw: number,
  vh: number,
  mode: 'transit' | 'fork' | 'spray' | 'loupe' | 'ring',
): MeshPinState {
  if (mode === 'transit') {
    const { stageW, stageH } = cardStageSize(vw, vh, BUS_MESH_ASPECT * 1.06);
    return pinInMeshSlot(
      anchorRect,
      stageW,
      stageH,
      BUS_DISPLAY_ROTATE_DEG,
      '50% 54%',
    );
  }

  const rotate =
    mode === 'fork'
      ? FORK_DISPLAY_ROTATE_DEG
      : mode === 'spray'
        ? SPRAY_DISPLAY_ROTATE_DEG
        : mode === 'loupe'
          ? LOUPE_DISPLAY_ROTATE_DEG
          : RING_DISPLAY_ROTATE_DEG;

  const origin =
    mode === 'fork' || mode === 'spray' || mode === 'loupe' ? '50% 50%' : '50% 54%';

  const aspect =
    mode === 'fork' ? 1.08 : mode === 'spray' ? 1.12 : 1.02;
  let { stageW, stageH } = cardStageSize(vw, vh, aspect);
  const stageScale =
    mode === 'fork'
      ? FORK_MESH_STAGE_SCALE
      : mode === 'spray'
        ? SPRAY_MESH_STAGE_SCALE
        : 1;
  if (stageScale !== 1) {
    stageW = Math.round(stageW * stageScale);
    stageH = Math.round(stageH * stageScale);
  }

  return pinInMeshSlot(anchorRect, stageW, stageH, rotate, origin);
}

/** Strzałka kontaktu — obrót z geometrii dokumentu (stabilny przy scrollu). */
function arrowPinFromSlot(slotRect: DOMRect, ctaRect: DOMRect | null): MeshPinState {
  const stageW = Math.max(200, slotRect.width);
  const stageH = stageW / ARROW_MESH_ASPECT;
  const pinLeft = slotRect.left + (slotRect.width - stageW) * 0.5;
  const pinTop = slotRect.top + (slotRect.height - stageH) * 0.5;

  let rotateDeg = 90;
  if (ctaRect) {
    const sx = window.scrollX;
    const sy = window.scrollY;
    const cx = pinLeft + stageW * 0.5 + sx;
    const cy = pinTop + stageH * 0.5 + sy;
    const tx = ctaRect.left + ctaRect.width * 0.46 + sx;
    const ty = ctaRect.top + ctaRect.height * 0.52 + sy;
    const aimRad = Math.atan2(ty - cy, tx - cx);
    rotateDeg = Math.round((((aimRad * 180) / Math.PI + 90) * 2)) / 2;
  }

  return pinInMeshSlot(slotRect, stageW, stageH, rotateDeg, '50% 50%');
}

function eyePinFromAnchor(
  anchorRect: DOMRect,
  _vw: number,
  _vh: number,
  flipX: boolean,
): MeshPinState {
  let stageW = Math.max(240, anchorRect.width - EYE_MESH_STAGE_INSET * 2);
  let stageH = Math.max(180, anchorRect.height - EYE_MESH_STAGE_INSET * 2);
  const aspect = EYE_MESH_ASPECT;
  if (stageW / stageH > aspect) {
    stageW = stageH * aspect;
  } else {
    stageH = stageW / aspect;
  }
  return {
    ...pinInMeshSlot(anchorRect, stageW, stageH, 0, '50% 50%'),
    flipX,
  };
}

export type ZonePins = {
  hero: MeshPinState;
  palette: MeshPinState | null;
  bus: MeshPinState | null;
  fork: MeshPinState | null;
  spray: MeshPinState | null;
  loupe: MeshPinState | null;
  ring: MeshPinState | null;
  careerEye: MeshPinState | null;
  skillsEye: MeshPinState | null;
  contactArrow: MeshPinState | null;
  paletteAim: ScrollAimPoint | null;
};

let pinsCacheFrame = -1;
let pinsScrollHoldUntil = -1;
let pinsCache: ZonePins | null = null;

function computeAllZonePinsUncached(): ZonePins | null {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const heroRect = readRect(HERO_MESH_ANCHOR_ID);
  if (!heroRect) return null;

  const heroPin = attachDocCoords({
    left: heroRect.left,
    top: heroRect.top,
    stageW: heroRect.width,
    stageH: heroRect.height,
    rotateDeg: 0,
    originStr: '',
  });

  const paletteData = computePalettePin(vw, vh);
  const transitRect = readRect(TRANSITRANK_MESH_ANCHOR_ID);
  const forkRect = readRect(FORKFULL_MESH_ANCHOR_ID);
  const sprayRect = readRect(KAMOCHI_MESH_ANCHOR_ID);
  const loupeRect = readRect(LEGITCHECK_MESH_ANCHOR_ID);
  const ringRect = readRect(STYLERANK_MESH_ANCHOR_ID);
  const careerRect = readRect(EXPERIENCE_MESH_ANCHOR_ID);
  const skillsRect = readRect(SKILLS_MESH_ANCHOR_ID);
  const contactRect = readRect(CONTACT_MESH_ANCHOR_ID);
  const ctaRect = readRect(CONTACT_CTA_ANCHOR_ID);
  const transitPin = transitRect ? projectPinFromAnchor(transitRect, vw, vh, 'transit') : null;
  const forkPin = forkRect ? projectPinFromAnchor(forkRect, vw, vh, 'fork') : null;
  const sprayPin = sprayRect ? projectPinFromAnchor(sprayRect, vw, vh, 'spray') : null;
  const loupePin = loupeRect ? projectPinFromAnchor(loupeRect, vw, vh, 'loupe') : null;
  const ringPin = ringRect ? projectPinFromAnchor(ringRect, vw, vh, 'ring') : null;
  const careerPin = careerRect ? eyePinFromAnchor(careerRect, vw, vh, false) : null;
  const skillsPin = skillsRect ? eyePinFromAnchor(skillsRect, vw, vh, true) : null;
  const contactPin = contactRect ? arrowPinFromSlot(contactRect, ctaRect) : null;

  const pins = {
    hero: heroPin,
    palette: paletteData?.pin ?? null,
    bus: transitPin,
    fork: forkPin,
    spray: sprayPin,
    loupe: loupePin,
    ring: ringPin,
    careerEye: careerPin,
    skillsEye: skillsPin,
    contactArrow: contactPin,
    paletteAim: paletteData?.aim ?? null,
  };

  for (const pin of [
    pins.palette,
    pins.bus,
    pins.fork,
    pins.spray,
    pins.loupe,
    pins.ring,
    pins.careerEye,
    pins.skillsEye,
    pins.contactArrow,
  ]) {
    if (pin) syncPinViewport(pin);
  }
  syncPinViewport(pins.hero);

  return pins;
}

/** Współdzielony cache pinów — jeden odczyt DOM na klatkę animacji mesh. */
export function computeAllZonePins(meshFrameId = -1, scrollHold = false): ZonePins | null {
  if (meshFrameId >= 0 && pinsCacheFrame === meshFrameId && pinsCache) {
    return pinsCache;
  }
  if (scrollHold && pinsCache && meshFrameId >= 0 && meshFrameId <= pinsScrollHoldUntil) {
    return pinsCache;
  }
  pinsCache = computeAllZonePinsUncached();
  pinsCacheFrame = meshFrameId;
  pinsScrollHoldUntil = scrollHold && meshFrameId >= 0 ? meshFrameId + 2 : -1;
  return pinsCache;
}

export function invalidateZonePinsCache() {
  pinsCacheFrame = -1;
  pinsScrollHoldUntil = -1;
  pinsCache = null;
}

export function pinForZonePins(pins: ZonePins, zone: MeshZone): MeshPinState {
  switch (zone) {
    case 'hero':
      return pins.hero;
    case 'palette':
      return pins.palette ?? pins.hero;
    case 'bus':
      return pins.bus ?? pins.hero;
    case 'fork':
      return pins.fork ?? pins.bus ?? pins.hero;
    case 'spray':
      return pins.spray ?? pins.fork ?? pins.hero;
    case 'loupe':
      return pins.loupe ?? pins.spray ?? pins.hero;
    case 'ring':
      return pins.ring ?? pins.loupe ?? pins.hero;
    case 'careerEye':
      return pins.careerEye ?? pins.hero;
    case 'skillsEye':
      return pins.skillsEye ?? pins.careerEye ?? pins.hero;
    case 'contactArrow':
      return pins.contactArrow ?? pins.skillsEye ?? pins.careerEye ?? pins.hero;
  }
}

export function computeScrollFrame(meshFrameId = -1): ScrollFrame | null {
  const vh = window.innerHeight;
  const heroRect = readRect(HERO_MESH_ANCHOR_ID);
  if (!heroRect) return null;

  const zone = resolveActiveZoneWithHysteresis(vh);
  const targets = targetsForZone(zone);

  const allPins = computeAllZonePins(meshFrameId);
  if (!allPins) return null;

  const pinTarget = pinForZonePins(allPins, zone);
  syncPinViewport(pinTarget);

  const aim = zone === 'palette' && allPins.paletteAim ? allPins.paletteAim : null;

  return {
    zone,
    targets,
    pinTarget,
    palettePin: allPins.palette,
    paletteAim: allPins.paletteAim,
    aim,
    isAtPalette: zone === 'palette' || (targets.morph === 1 && zone !== 'hero'),
  };
}

function stepScalarToward(current: number, target: number, step: number) {
  const gap = target - current;
  if (Math.abs(gap) < 0.25) return target;
  return current + Math.sign(gap) * Math.min(Math.abs(gap), step);
}

export function stepPinToward(
  sim: MeshPinState,
  target: MeshPinState,
  dt: number,
  speedPx = 22,
) {
  const step = speedPx * dt;
  sim.docLeft = stepScalarToward(sim.docLeft, target.docLeft, step);
  sim.docTop = stepScalarToward(sim.docTop, target.docTop, step);
  sim.stageW = stepScalarToward(sim.stageW, target.stageW, step * 0.55);
  sim.stageH = stepScalarToward(sim.stageH, target.stageH, step * 0.55);
  sim.rotateDeg = stepScalarToward(sim.rotateDeg, target.rotateDeg, step * 0.4);
  syncPinViewport(sim);
  sim.originStr = target.originStr;
}

export type ScrollBlend = {
  from: MeshZone;
  to: MeshZone;
  t: number;
};

/** Płynny blend stref na podstawie scrolla — kropki jadą w stronę docelowego kształtu. */
export function resolveScrollBlend(vh: number): ScrollBlend {
  const probeY = readViewportProbeY(vh);
  const mids: { zone: MeshZone; y: number }[] = [];

  for (const zone of ZONE_ORDER) {
    const mid = segmentMid(zone);
    if (mid != null) mids.push({ zone, y: mid });
  }

  if (mids.length === 0) return { from: 'hero', to: 'hero', t: 0 };
  if (probeY <= mids[0].y) {
    const next = mids[1];
    return { from: 'hero', to: next?.zone ?? 'hero', t: 0 };
  }
  if (probeY >= mids[mids.length - 1].y) {
    const last = mids[mids.length - 1];
    return { from: last.zone, to: last.zone, t: 1 };
  }

  for (let i = 0; i < mids.length - 1; i += 1) {
    const a = mids[i];
    const b = mids[i + 1];
    if (probeY >= a.y && probeY <= b.y) {
      const span = Math.max(b.y - a.y, 1);
      return { from: a.zone, to: b.zone, t: easePinBlend((probeY - a.y) / span) };
    }
  }

  return { from: 'hero', to: 'hero', t: 0 };
}
