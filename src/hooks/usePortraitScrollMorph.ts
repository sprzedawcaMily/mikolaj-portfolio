import { useEffect, useRef, useState, type CSSProperties } from 'react';

const PIVOT_Y_RATIO = 0.1;
const MORPH_IDLE = 0.0005;
const MORPH_ACTIVE = 0.001;
const MORPH_TRIGGER_ON = 0.28;
const MORPH_TRIGGER_OFF = 0.24;
const MORPH_ANIM_LERP = 0.032;
const MORPH_REVERSE_LERP = 0.042;
const TRANSIT_ANIM_LERP = 0.038;
/** Wolniejszy demorph autobus→strzałka — spójnie z widelec→autobus. */
const TRANSIT_REVERSE_LERP = 0.022;
const TRANSIT_REVERSE_LERP_CAP = 0.042;
const FORK_ANIM_LERP = 0.038;
/** Wolniejszy demorph widelec→autobus — bez agresywnego catch-up przy dużej luce. */
const FORK_REVERSE_LERP = 0.022;
const FORK_REVERSE_LERP_CAP = 0.042;
const SPRAY_ANIM_LERP = 0.038;
const SPRAY_REVERSE_LERP = 0.022;
const SPRAY_REVERSE_LERP_CAP = 0.042;
const AIM_GAP_PX = 18;
const CANVAS_BOTTOM_PAD = 48;
const AIM_X_RATIO = 0.58;
const ARROW_STAGE_EXTRA_W = 96;
const MESH_PORTAL_ID = 'mesh-portal-root';
const HERO_MESH_ANCHOR_ID = 'hero-mesh-anchor';
const TRANSITRANK_MESH_ANCHOR_ID = 'transit-rank-mesh-anchor';
const FORKFULL_MESH_ANCHOR_ID = 'forkfull-mesh-anchor';
const KAMOCHI_MESH_ANCHOR_ID = 'kamochi-mesh-anchor';
const TRANSIT_MESH_SLOT_ID = 'transit-rank-mesh-slot';
const BUS_DISPLAY_ROTATE_DEG = 15;
const FORK_DISPLAY_ROTATE_DEG = 10;
const SPRAY_DISPLAY_ROTATE_DEG = 15;
/** Proporcje autobus.svg (1196×1146) — stały aspect stage, bez wiązania z kartą. */
const BUS_MESH_ASPECT = 1146 / 1196;

function transitStageSize(vw: number, vh: number) {
  let stageW = Math.min(500, Math.max(300, vw * 0.36));
  let stageH = Math.round(stageW * BUS_MESH_ASPECT * 1.06);
  const maxH = Math.round(vh * 0.52);

  if (stageH > maxH) {
    stageH = Math.max(280, maxH);
    stageW = Math.round(stageH / (BUS_MESH_ASPECT * 1.06));
  }

  stageW = Math.max(280, Math.min(stageW, 500));
  stageH = Math.max(280, stageH);

  return { stageW, stageH };
}

function easeSmoothStep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function readHeroRect() {
  const anchor = document.getElementById(HERO_MESH_ANCHOR_ID);
  return anchor?.getBoundingClientRect() ?? null;
}

function readTransitRect() {
  const anchor = document.getElementById(TRANSITRANK_MESH_ANCHOR_ID);
  return anchor?.getBoundingClientRect() ?? null;
}

function readForkRect() {
  const anchor = document.getElementById(FORKFULL_MESH_ANCHOR_ID);
  return anchor?.getBoundingClientRect() ?? null;
}

function readSprayRect() {
  const anchor = document.getElementById(KAMOCHI_MESH_ANCHOR_ID);
  return anchor?.getBoundingClientRect() ?? null;
}

function paletteStageSize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 16;

  if (vw < 640) {
    return {
      stageW: Math.min(vw - margin * 2, 640),
      stageH: Math.min(vh * 0.88, 820),
    };
  }

  return {
    stageW: Math.min(1120 + ARROW_STAGE_EXTRA_W, vw - margin * 2),
    stageH: Math.min(960, vh * 0.9),
  };
}

function sectionScrollMorph(sectionRect: DOMRect, viewH: number) {
  const start = viewH * 0.97;
  const end = viewH * 0.48;

  if (sectionRect.top >= start) return 0;
  if (sectionRect.top <= end) return 1;

  return easeSmoothStep((start - sectionRect.top) / (start - end));
}

/** Góra strony — sekcja palety jeszcze poniżej viewportu, widać tylko hero/twarz. */
function pageTopZone(sectionRect: DOMRect, viewH: number) {
  return sectionRect.top > viewH * 0.72;
}

function cardInView(cardRect: DOMRect, viewH: number) {
  const pad = viewH * 0.06;
  return cardRect.bottom > pad && cardRect.top < viewH - pad;
}

function cardEnterZone(cardRect: DOMRect, viewH: number) {
  const centerY = cardRect.top + cardRect.height * 0.5;
  return centerY > viewH * 0.22 && centerY < viewH * 0.78;
}

function paletteInFocus(sectionRect: DOMRect, viewH: number) {
  return (
    sectionRect.bottom > viewH * 0.12 &&
    sectionRect.top < viewH * 0.72 &&
    sectionRect.top + sectionRect.height * 0.35 < viewH * 0.78
  );
}

function readProjectsRect() {
  return document.getElementById('projekty')?.getBoundingClientRect() ?? null;
}

function transitSequenceProgress(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const flyT = easeSmoothStep(clamped);
  const busMorphT = easeSmoothStep(Math.max(0, (clamped - 0.12) / 0.88));
  return {
    flyT,
    busMorphT,
    busRender: clamped > 0.02,
  };
}

function forkSequenceProgress(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const flyT = easeSmoothStep(clamped);
  const forkMorphT = easeSmoothStep(Math.max(0, (clamped - 0.12) / 0.88));
  return {
    flyT,
    forkMorphT,
    forkRender: clamped > 0.02,
  };
}

function spraySequenceProgress(t: number) {
  const clamped = Math.max(0, Math.min(1, t));
  const flyT = easeSmoothStep(clamped);
  const sprayMorphT = easeSmoothStep(Math.max(0, (clamped - 0.12) / 0.88));
  return {
    flyT,
    sprayMorphT,
    sprayRender: clamped > 0.02,
  };
}

function forkExitedDown(forkRect: DOMRect, viewH: number) {
  const centerY = forkRect.top + forkRect.height * 0.5;
  return centerY < viewH * 0.24;
}

function forkExitedUp(forkRect: DOMRect, viewH: number) {
  const centerY = forkRect.top + forkRect.height * 0.5;
  return centerY > viewH * 0.76;
}

/** Widelec w viewport — wystarczająco widać kartę Forkfull. */
function forkVisibleForDemorph(forkRect: DOMRect, viewH: number) {
  const visibleTop = Math.max(forkRect.top, 0);
  const visibleBottom = Math.min(forkRect.bottom, viewH);
  return visibleBottom - visibleTop >= viewH * 0.14 && forkRect.bottom > viewH * 0.06;
}

/** Kamochi opuścił strefę focusu w dół (scroll w górę) — nie drobny scroll do tytułu. */
function sprayLeftFocusDown(sprayRect: DOMRect, viewH: number, scrollUp: boolean) {
  if (!scrollUp) return false;
  const centerY = cardCenterY(sprayRect);
  return !cardEnterZone(sprayRect, viewH) && centerY > viewH * 0.52;
}

function cardCenterY(cardRect: DOMRect) {
  return cardRect.top + cardRect.height * 0.5;
}

function sprayShouldDemorphToFork(
  prevStage: MeshStage,
  sprayRect: DOMRect | null,
  forkRect: DOMRect | null,
  viewH: number,
  scrollUp: boolean,
) {
  if (prevStage !== 'spray' || !sprayRect || !scrollUp) return false;
  if (forkRect && forkVisibleForDemorph(forkRect, viewH)) return true;
  if (sprayLeftFocusDown(sprayRect, viewH, scrollUp)) return true;
  return false;
}

function cardOffScreen(cardRect: DOMRect, viewH: number) {
  return cardRect.bottom < viewH * 0.05 || cardRect.top > viewH * 0.95;
}

type MeshStage = 'hero' | 'palette' | 'transit' | 'fork' | 'spray';

function resolveMeshStage(
  viewH: number,
  inView: boolean,
  sectionRect: DOMRect,
  transitRect: DOMRect | null,
  forkRect: DOMRect | null,
  sprayRect: DOMRect | null,
  projectsRect: DOMRect | null,
  prevStage: MeshStage,
  sprayScrollUp: boolean,
): MeshStage {
  if (pageTopZone(sectionRect, viewH)) {
    return 'hero';
  }

  const paletteFocus = inView && paletteInFocus(sectionRect, viewH);
  const sprayActive =
    sprayRect != null && !cardOffScreen(sprayRect, viewH) && cardEnterZone(sprayRect, viewH);
  const forkActive =
    forkRect != null && !cardOffScreen(forkRect, viewH) && cardEnterZone(forkRect, viewH);
  const transitActive =
    transitRect != null && !cardOffScreen(transitRect, viewH) && cardEnterZone(transitRect, viewH);
  const inProjects =
    projectsRect != null &&
    projectsRect.top < viewH * 0.88 &&
    projectsRect.bottom > viewH * 0.12;
  const paletteClear = !inView || sectionRect.bottom < viewH * 0.2;
  const demorphSprayToFork = sprayShouldDemorphToFork(
    prevStage,
    sprayRect,
    forkRect,
    viewH,
    sprayScrollUp,
  );
  /** Trzymaj spray dopóki karta Kamochi w viewport — chyba że wracamy w górę do widelca. */
  const spraySticky =
    prevStage === 'spray' &&
    sprayRect != null &&
    cardInView(sprayRect, viewH) &&
    !forkActive &&
    !demorphSprayToFork;
  /** Wejście w spray tylko po zejściu z widelca w dół i gdy Kamochi już widać. */
  const sprayApproach =
    prevStage === 'fork' &&
    sprayRect != null &&
    cardInView(sprayRect, viewH) &&
    forkRect != null &&
    forkExitedDown(forkRect, viewH);

  if (demorphSprayToFork) {
    return 'fork';
  }

  if (sprayActive || spraySticky || sprayApproach) {
    return 'spray';
  }
  if (forkActive) {
    return 'fork';
  }
  if (transitActive) {
    return 'transit';
  }

  if (paletteFocus && !forkActive && !transitActive && !sprayActive) {
    return 'palette';
  }

  // Po zejściu z Kamochi — demorph sprej→widelec
  if (prevStage === 'spray' && !sprayActive && !forkActive) {
    return 'fork';
  }
  // Po zejściu z karty transit — demorph autobus→strzałka
  if (prevStage === 'transit' && !transitActive && !forkActive && !sprayActive) {
    return 'palette';
  }
  // Po zejściu z widelca w górę → transit (widelec→autobus); w dół → trzymaj widelec
  if (
    prevStage === 'fork' &&
    !forkActive &&
    !transitActive &&
    !sprayActive &&
    !spraySticky &&
    !sprayApproach
  ) {
    if (forkRect && forkExitedUp(forkRect, viewH)) {
      return 'transit';
    }
    const holdForSpray =
      inProjects &&
      sprayRect != null &&
      forkRect != null &&
      sprayRect.top > forkRect.top &&
      forkExitedDown(forkRect, viewH);
    if (holdForSpray) {
      return 'fork';
    }
    return 'transit';
  }

  // Między kartami projektów — tylko gdy sekcja palety już zniknęła z ekranu
  if (inProjects && paletteClear) {
    if (
      prevStage === 'spray' &&
      sprayRect &&
      cardInView(sprayRect, viewH) &&
      cardEnterZone(sprayRect, viewH)
    ) {
      return 'spray';
    }
    if (
      prevStage === 'fork' &&
      forkRect &&
      cardInView(forkRect, viewH) &&
      !forkExitedUp(forkRect, viewH)
    ) {
      return 'fork';
    }
    if (
      prevStage !== 'spray' &&
      forkRect &&
      cardInView(forkRect, viewH) &&
      forkRect.top < viewH * 0.75
    ) {
      return 'fork';
    }
  }

  if (inView && sectionRect.top < viewH * 0.9) {
    return 'palette';
  }
  return 'hero';
}

type StagePin = {
  left: number;
  top: number;
  stageW: number;
  stageH: number;
};

/** Pin w układzie dokumentu — zostaje w tle strony podczas scrolla. */
type DocumentPin = {
  docLeft: number;
  docTop: number;
  stageW: number;
  stageH: number;
};

function viewportPinFromDocument(doc: DocumentPin): StagePin {
  return {
    left: doc.docLeft - window.scrollX,
    top: doc.docTop - window.scrollY,
    stageW: doc.stageW,
    stageH: doc.stageH,
  };
}

function documentPinFromViewport(pin: StagePin): DocumentPin {
  return {
    docLeft: pin.left + window.scrollX,
    docTop: pin.top + window.scrollY,
    stageW: pin.stageW,
    stageH: pin.stageH,
  };
}

function forkStageSize(vw: number, vh: number) {
  const isWide = vw > 720;
  const padX = 56;
  const padY = 120;
  const innerW = Math.min(isWide ? 360 : 310, Math.max(250, vw * 0.34));
  const innerH = Math.min(Math.max(640, vh * 0.62), vh * 0.88);
  return { stageW: innerW + padX, stageH: innerH + padY };
}

function computeTransitDocumentPin(anchorRect: DOMRect, vw: number, vh: number): DocumentPin {
  const margin = 12;
  const gap = 18;
  let { stageW, stageH } = transitStageSize(vw, vh);
  let viewportLeft = anchorRect.right + gap;

  if (viewportLeft + stageW > vw - margin) {
    stageW = Math.max(260, vw - viewportLeft - margin);
    stageH = Math.round(stageW * BUS_MESH_ASPECT * 1.06);
  }

  let viewportTop = anchorRect.top + anchorRect.height * 0.5 - stageH * 0.5;
  viewportLeft = Math.max(margin, viewportLeft);

  return documentPinFromViewport({
    left: viewportLeft,
    top: viewportTop,
    stageW,
    stageH,
  });
}

function computeForkDocumentPin(anchorRect: DOMRect, vw: number, vh: number): DocumentPin {
  const isWideCard = anchorRect.width > 720;
  const padX = 56;
  const innerW = Math.min(isWideCard ? 360 : 310, Math.max(250, vw * 0.34));
  const innerH = Math.min(Math.max(640, vh * 0.62), vh * 0.88);
  const stageW = innerW + padX;
  const stageH = innerH + 120;

  let viewportLeft = anchorRect.left - innerW * 0.72 - padX * 0.35;
  
  // Centrujemy na środku karty "Forkfull". Odsunięcie lekko w dół za pomocą współczynnika.
  let viewportTop = anchorRect.top + anchorRect.height * 0.5 - stageH * 0.5;

  return documentPinFromViewport({
    left: viewportLeft,
    top: viewportTop,
    stageW,
    stageH,
  });
}

function refreshTransitDocumentPin(doc: DocumentPin, vw: number, vh: number): DocumentPin {
  const { stageW, stageH } = transitStageSize(vw, vh);
  return { ...doc, stageW, stageH };
}

function refreshForkDocumentPin(doc: DocumentPin, vw: number, vh: number): DocumentPin {
  const { stageW, stageH } = forkStageSize(vw, vh);
  return { ...doc, stageW, stageH };
}

function computeSprayDocumentPin(anchorRect: DOMRect, vw: number, vh: number): DocumentPin {
  const margin = 12;
  const gap = 18;
  const { stageW, stageH } = forkStageSize(vw, vh);
  const viewportLeft = Math.max(margin, anchorRect.right + gap);
  const viewportTop = anchorRect.top + anchorRect.height * 0.5 - stageH * 0.5;

  return documentPinFromViewport({
    left: viewportLeft,
    top: viewportTop,
    stageW,
    stageH,
  });
}

function refreshSprayDocumentPin(doc: DocumentPin, vw: number, vh: number): DocumentPin {
  const { stageW, stageH } = forkStageSize(vw, vh);
  return { ...doc, stageW, stageH };
}

export function usePortraitScrollMorph() {
  const [morphTarget, setMorphTarget] = useState(0);
  const [busMorphTarget, setBusMorphTarget] = useState(0);
  const [busRenderActive, setBusRenderActive] = useState(false);
  const [forkMorphTarget, setForkMorphTarget] = useState(0);
  const [forkRenderActive, setForkRenderActive] = useState(false);
  const [sprayMorphTarget, setSprayMorphTarget] = useState(0);
  const [sprayRenderActive, setSprayRenderActive] = useState(false);
  const [aimPoint, setAimPoint] = useState<{
    x: number;
    y: number;
    centerX: number;
    stageW: number;
    stageH: number;
  } | null>(null);
  const [pinStyle, setPinStyle] = useState<CSSProperties | null>(null);
  const [isAtPalette, setIsAtPalette] = useState(false);
  const [transitOnCard, setTransitOnCard] = useState(false);
  const [forkOnCard, setForkOnCard] = useState(false);
  const [sprayOnCard, setSprayOnCard] = useState(false);

  const palettePinRef = useRef<{
    left: number;
    top: number;
    stageW: number;
    stageH: number;
    aimX: number;
    aimY: number;
    centerX: number;
  } | null>(null);
  const isAtPaletteRef = useRef(false);
  const transitAnimRef = useRef(0);
  const forkAnimRef = useRef(0);
  const sprayAnimRef = useRef(0);
  const transitStartPinRef = useRef<{
    left: number;
    top: number;
    stageW: number;
    stageH: number;
  } | null>(null);
  const forkStartPinRef = useRef<{
    left: number;
    top: number;
    stageW: number;
    stageH: number;
  } | null>(null);
  const sprayStartPinRef = useRef<{
    left: number;
    top: number;
    stageW: number;
    stageH: number;
  } | null>(null);
  const forkDemorphPinRef = useRef<DocumentPin | null>(null);
  const transitDemorphPinRef = useRef<{
    left: number;
    top: number;
    stageW: number;
    stageH: number;
    aimX: number;
    aimY: number;
    centerX: number;
  } | null>(null);
  const transitFlyFromPinRef = useRef<DocumentPin | null>(null);
  const busMorphUnlockedRef = useRef(false);
  const paletteMorphLockedRef = useRef(false);
  /** Twarz→strzałka: scroll tylko trigger, animacja jedzie do końca sama. */
  const paletteAnimLockRef = useRef<'morph' | 'demorph' | null>(null);
  const transitLockedPinRef = useRef<DocumentPin | null>(null);
  const forkLockedPinRef = useRef<DocumentPin | null>(null);
  const sprayLockedPinRef = useRef<DocumentPin | null>(null);
  const transitSessionRef = useRef(false);
  const forkSessionRef = useRef(false);
  const spraySessionRef = useRef(false);
  /** Trzyma stage do końca morph/demorph spreju — scroll nie przerywa w połowie. */
  const sprayAnimLockRef = useRef<'morph' | 'demorph' | null>(null);
  const sprayCenterYPrevRef = useRef<number | null>(null);
  /** Trzyma intencję demorphu po pierwszym scrollu w górę — bez migotania kierunku. */
  const sprayScrollUpLatchRef = useRef(false);
  const meshStageRef = useRef<MeshStage>('hero');

  useEffect(() => {
    let raf = 0;
    let active = true;
    let animProgress = 0;
    let morphCommitted = 0;
    let prevCommitted = 0;
    let transitCommitted = 0;
    let prevTransitCommitted = 0;
    let forkCommitted = 0;
    let prevForkCommitted = 0;
    let sprayCommitted = 0;
    let prevSprayCommitted = 0;
    let lastScrollY: number | null = null;

    function readTrack() {
      return document.getElementById('palette-color-track');
    }

    function readThumb() {
      return document.getElementById('palette-color-thumb');
    }

    function computePalettePin() {
      const section = document.getElementById('studio-palety');
      if (!section) return null;

      const sectionRect = section.getBoundingClientRect();
      const thumb = readThumb();
      const track = readTrack();
      const { stageW, stageH } = paletteStageSize();
      const vw = window.innerWidth;
      const margin = 8;
      const sectionCenterX = sectionRect.left + sectionRect.width / 2;

      const trackRect = track?.getBoundingClientRect();
      const thumbRect = thumb?.getBoundingClientRect();
      const anchorBottom =
        (thumbRect?.bottom ?? trackRect?.bottom ?? sectionRect.bottom) + CANVAS_BOTTOM_PAD;

      let top = anchorBottom - stageH;
      const thumbCenterX = thumbRect
        ? thumbRect.left + thumbRect.width / 2
        : trackRect
          ? trackRect.left + trackRect.width * 0.5
          : sectionCenterX;

      let left = thumbCenterX - stageW * AIM_X_RATIO;
      if (sectionRect.width > 0) {
        const edgeShift = Math.min(
          1,
          Math.abs(thumbCenterX - sectionCenterX) / (sectionRect.width * 0.46),
        );
        left = thumbCenterX - stageW * (AIM_X_RATIO + edgeShift * 0.12);
      }
      left = Math.max(margin, Math.min(left, vw - stageW - margin));

      let aimViewportX = thumbCenterX;
      let aimViewportY = (trackRect?.top ?? sectionRect.bottom - 80) - AIM_GAP_PX;

      if (thumbRect) {
        aimViewportY = thumbRect.top - AIM_GAP_PX;
      } else if (trackRect) {
        aimViewportY = trackRect.top - AIM_GAP_PX;
      }

      let aimX = aimViewportX - left;
      let aimY = aimViewportY - top;

      const maxAimX = stageW * 0.68;
      const minAimX = stageW * 0.32;
      if (aimX > maxAimX) {
        left = Math.max(margin, thumbCenterX - maxAimX);
        aimX = thumbCenterX - left;
      } else if (aimX < minAimX) {
        left = Math.min(vw - stageW - margin, thumbCenterX - minAimX);
        aimX = thumbCenterX - left;
      }

      if (aimY > stageH - 20) {
        top -= aimY - (stageH - 20);
        aimY = stageH - 20;
      }

      return {
        left,
        top,
        stageW,
        stageH,
        aimX,
        aimY,
        centerX: sectionCenterX - left,
      };
    }

    function resetProjectMeshState() {
      busMorphUnlockedRef.current = false;
      paletteMorphLockedRef.current = false;
      paletteAnimLockRef.current = null;
      transitSessionRef.current = false;
      forkSessionRef.current = false;
      spraySessionRef.current = false;
      sprayAnimLockRef.current = null;
      sprayCenterYPrevRef.current = null;
      sprayScrollUpLatchRef.current = false;
      transitLockedPinRef.current = null;
      forkLockedPinRef.current = null;
      sprayLockedPinRef.current = null;
      transitStartPinRef.current = null;
      forkStartPinRef.current = null;
      sprayStartPinRef.current = null;
      forkDemorphPinRef.current = null;
      transitDemorphPinRef.current = null;
      transitFlyFromPinRef.current = null;
      transitAnimRef.current = 0;
      forkAnimRef.current = 0;
      sprayAnimRef.current = 0;
    }

    function snapProjectAnimsToStage(stage: MeshStage) {
      sprayAnimLockRef.current = null;
      sprayScrollUpLatchRef.current = false;

      if (stage === 'hero') {
        resetProjectMeshState();
        return;
      }

      if (stage === 'palette') {
        resetProjectMeshState();
        return;
      }

      if (stage === 'transit') {
        resetProjectMeshState();
        transitAnimRef.current = 1;
        transitSessionRef.current = true;
        return;
      }

      if (stage === 'fork') {
        transitAnimRef.current = 1;
        forkAnimRef.current = 1;
        sprayAnimRef.current = 0;
        transitSessionRef.current = true;
        forkSessionRef.current = true;
        spraySessionRef.current = false;
        return;
      }

      if (stage === 'spray') {
        transitAnimRef.current = 1;
        forkAnimRef.current = 1;
        sprayAnimRef.current = 1;
        transitSessionRef.current = true;
        forkSessionRef.current = true;
        spraySessionRef.current = true;
      }
    }

    function applyHeroFrame(heroRect: DOMRect) {
      resetProjectMeshState();
      animProgress = 0;
      morphCommitted = 0;
      prevCommitted = 0;
      prevTransitCommitted = 0;
      prevForkCommitted = 0;
      prevSprayCommitted = 0;
      meshStageRef.current = 'hero';
      palettePinRef.current = null;
      paletteAnimLockRef.current = null;
      isAtPaletteRef.current = false;

      setPinStyle({
        position: 'fixed',
        top: heroRect.top,
        left: heroRect.left,
        width: heroRect.width,
        height: heroRect.height,
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        transform: 'none',
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      });
      setMorphTarget(0);
      setBusMorphTarget(0);
      setBusRenderActive(false);
      setForkMorphTarget(0);
      setForkRenderActive(false);
      setSprayMorphTarget(0);
      setSprayRenderActive(false);
      setTransitOnCard(false);
      setForkOnCard(false);
      setSprayOnCard(false);
      setIsAtPalette(false);
      setAimPoint(null);
    }

    function applyFrame() {
      const heroRect = readHeroRect();
      const section = document.getElementById('studio-palety');
      if (!heroRect || !section) return;

      const sectionRect = section.getBoundingClientRect();
      const viewH = window.innerHeight;
      const vw = window.innerWidth;
      const transitRect = readTransitRect();
      const forkRect = readForkRect();
      const sprayRect = readSprayRect();
      const projectsRect = readProjectsRect();

      const scrollT = sectionScrollMorph(sectionRect, viewH);
      const inView = sectionRect.bottom > 0 && sectionRect.top < viewH;
      const atPageTop = pageTopZone(sectionRect, viewH);
      const scrollY = window.scrollY;
      const scrollJump =
        lastScrollY !== null && Math.abs(scrollY - lastScrollY) > viewH * 0.28;
      lastScrollY = scrollY;

      if (
        atPageTop &&
        animProgress <= MORPH_IDLE &&
        transitAnimRef.current <= MORPH_IDLE &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimRef.current <= MORPH_IDLE
      ) {
        applyHeroFrame(heroRect);
        return;
      }

      const sprayCenterY = sprayRect ? cardCenterY(sprayRect) : null;
      const sprayCenterPrev = sprayCenterYPrevRef.current;
      const sprayScrollUp =
        sprayCenterY != null &&
        sprayCenterPrev != null &&
        sprayCenterY > sprayCenterPrev + 1.2;
      const sprayScrollDown =
        sprayCenterY != null &&
        sprayCenterPrev != null &&
        sprayCenterY < sprayCenterPrev - 1.2;
      const forkReadyForDemorph =
        forkRect != null && forkVisibleForDemorph(forkRect, viewH);
      const sprayLeavingFocusDown =
        sprayRect != null &&
        sprayScrollUp &&
        sprayLeftFocusDown(sprayRect, viewH, true);
      if (sprayScrollUp && (forkReadyForDemorph || sprayLeavingFocusDown)) {
        sprayScrollUpLatchRef.current = true;
      }
      if (
        sprayScrollDown ||
        (sprayRect != null && cardEnterZone(sprayRect, viewH) && !forkReadyForDemorph)
      ) {
        sprayScrollUpLatchRef.current = false;
      }
      if (sprayCenterY != null) {
        sprayCenterYPrevRef.current = sprayCenterY;
      }
      const sprayScrollIntentUp = sprayScrollUp || sprayScrollUpLatchRef.current;

      let stage = resolveMeshStage(
        viewH,
        inView,
        sectionRect,
        transitRect,
        forkRect,
        sprayRect,
        projectsRect,
        meshStageRef.current,
        sprayScrollIntentUp,
      );

      const projectAnimActive =
        transitAnimRef.current > MORPH_IDLE ||
        forkAnimRef.current > MORPH_IDLE ||
        sprayAnimRef.current > MORPH_IDLE;

      if (
        stage === 'hero' &&
        !atPageTop &&
        paletteAnimLockRef.current !== 'demorph' &&
        (projectAnimActive || animProgress > MORPH_IDLE || transitSessionRef.current)
      ) {
        stage = inView && sectionRect.top < viewH * 0.9 ? 'palette' : meshStageRef.current;
        if (stage === 'hero') stage = 'palette';
      }

      const demorphSprayScroll = sprayShouldDemorphToFork(
        meshStageRef.current,
        sprayRect,
        forkRect,
        viewH,
        sprayScrollIntentUp,
      );
      const sprayApproachScroll =
        meshStageRef.current === 'fork' &&
        sprayRect != null &&
        cardInView(sprayRect, viewH) &&
        forkRect != null &&
        forkExitedDown(forkRect, viewH);
      const sprayAnim = sprayAnimRef.current;
      const sprayLock = sprayAnimLockRef.current;

      /** Demorph/morph nie nadpisują się nawzajem w trakcie animacji. */
      if (sprayLock === 'demorph') {
        if (sprayAnim <= MORPH_IDLE) {
          sprayAnimLockRef.current = null;
          sprayScrollUpLatchRef.current = false;
        }
      } else if (sprayLock === 'morph') {
        if (sprayAnim >= 0.995) {
          sprayAnimLockRef.current = null;
        } else if (demorphSprayScroll && sprayAnim > MORPH_ACTIVE) {
          sprayAnimLockRef.current = 'demorph';
        }
      } else if (demorphSprayScroll && sprayAnim > MORPH_ACTIVE) {
        sprayAnimLockRef.current = 'demorph';
      } else if (
        !demorphSprayScroll &&
        (stage === 'spray' || sprayApproachScroll) &&
        sprayAnim < 0.995
      ) {
        sprayAnimLockRef.current = 'morph';
      } else if (
        !demorphSprayScroll &&
        sprayAnim > MORPH_ACTIVE &&
        sprayAnim < 0.995
      ) {
        sprayAnimLockRef.current = 'morph';
      }

      // Trzymaj stage do końca animacji — czasowa, nie od scrolla
      if (sprayAnimLockRef.current === 'morph') {
        stage = 'spray';
      } else if (sprayAnimLockRef.current === 'demorph') {
        stage = 'fork';
      } else if (
        forkAnimRef.current > MORPH_ACTIVE &&
        stage !== 'fork' &&
        stage !== 'spray'
      ) {
        stage = 'transit';
      } else if (
        sprayAnim > MORPH_IDLE &&
        stage !== 'spray' &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimLockRef.current !== 'morph'
      ) {
        stage = 'fork';
      } else if (
        transitAnimRef.current > MORPH_IDLE &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimRef.current <= MORPH_IDLE &&
        stage !== 'transit' &&
        stage !== 'fork' &&
        stage !== 'spray'
      ) {
        stage = 'palette';
      }

      if (scrollJump) {
        sprayAnimLockRef.current = null;
        sprayScrollUpLatchRef.current = false;
        snapProjectAnimsToStage(stage);
        if (stage === 'palette' && scrollT >= MORPH_TRIGGER_ON) {
          paletteAnimLockRef.current = 'morph';
        } else if (stage === 'hero' && animProgress > MORPH_ACTIVE) {
          paletteAnimLockRef.current = 'demorph';
        } else if (stage === 'hero') {
          animProgress = 0;
          morphCommitted = 0;
          paletteAnimLockRef.current = null;
        }
      }

      if (stage === 'hero' && animProgress > MORPH_ACTIVE) {
        paletteAnimLockRef.current = 'demorph';
      }

      if (stage !== meshStageRef.current) {
        if (stage === 'palette' && meshStageRef.current === 'hero') {
          resetProjectMeshState();
        }
        if (stage === 'hero') {
          const canHardReset =
            animProgress <= MORPH_IDLE &&
            transitAnimRef.current <= MORPH_IDLE &&
            forkAnimRef.current <= MORPH_IDLE &&
            sprayAnimRef.current <= MORPH_IDLE &&
            !transitSessionRef.current;
          if (canHardReset) {
            animProgress = 0;
            morphCommitted = 0;
            resetProjectMeshState();
            paletteAnimLockRef.current = null;
          } else if (animProgress > MORPH_ACTIVE) {
            paletteAnimLockRef.current = 'demorph';
          } else {
            stage = meshStageRef.current === 'hero' ? 'palette' : meshStageRef.current;
          }
        }
        meshStageRef.current = stage;
      }

      if (stage === 'hero') {
        morphCommitted = 0;
      } else if (stage === 'palette') {
        if (scrollT >= MORPH_TRIGGER_ON) {
          morphCommitted = 1;
        } else if (
          scrollT <= MORPH_TRIGGER_OFF ||
          (animProgress >= 0.995 && scrollT < MORPH_TRIGGER_ON)
        ) {
          morphCommitted = 0;
        }
      } else {
        morphCommitted = 1;
      }

      if (stage === 'palette' && animProgress > 0.94) {
        paletteMorphLockedRef.current = true;
      } else if (stage === 'hero') {
        paletteMorphLockedRef.current = false;
      }

      forkCommitted = stage === 'fork' || stage === 'spray' ? 1 : 0;
      transitCommitted = stage === 'transit' || stage === 'fork' || stage === 'spray' ? 1 : 0;
      /** Lock morph/demorph — committed z intencji animacji, nie z migającego stage scrolla. */
      if (sprayAnimLockRef.current === 'morph' && sprayAnimRef.current < 0.995) {
        sprayCommitted = 1;
      } else if (sprayAnimLockRef.current === 'demorph' && sprayAnimRef.current > MORPH_IDLE) {
        sprayCommitted = 0;
      } else {
        sprayCommitted = stage === 'spray' ? 1 : 0;
      }

      if (prevForkCommitted === 1 && forkCommitted === 0) {
        sprayAnimRef.current = 0;
        spraySessionRef.current = false;
        sprayAnimLockRef.current = null;
        sprayLockedPinRef.current = null;
        sprayStartPinRef.current = null;
      }

      const demorphingSpray = sprayCommitted === 0 && sprayAnimRef.current > MORPH_IDLE;
      const demorphingFork =
        forkCommitted === 0 && forkAnimRef.current > MORPH_IDLE;
      const forkDemorphIdle = !demorphingFork;
      const demorphingTransit =
        transitCommitted === 0 && transitAnimRef.current > MORPH_IDLE && forkDemorphIdle;

      const paletteOnlyMorph =
        (stage === 'palette' || stage === 'hero') &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimRef.current <= MORPH_IDLE &&
        !demorphingFork &&
        !demorphingSpray &&
        !demorphingTransit;

      if (paletteOnlyMorph && transitAnimRef.current > MORPH_IDLE) {
        transitAnimRef.current = 0;
        transitSessionRef.current = false;
        transitLockedPinRef.current = null;
        transitStartPinRef.current = null;
        transitFlyFromPinRef.current = null;
      }

      if (paletteOnlyMorph) {
        if (morphCommitted === 0 && animProgress > MORPH_ACTIVE) {
          paletteAnimLockRef.current = 'demorph';
        } else if (
          morphCommitted === 1 &&
          animProgress < 0.995 &&
          paletteAnimLockRef.current !== 'demorph'
        ) {
          paletteAnimLockRef.current = 'morph';
        }

        if (paletteAnimLockRef.current === 'morph' && animProgress >= 0.995) {
          paletteAnimLockRef.current = null;
        } else if (paletteAnimLockRef.current === 'demorph' && animProgress <= MORPH_IDLE) {
          paletteAnimLockRef.current = null;
        }
      }

      const paletteAnimTarget =
        paletteAnimLockRef.current === 'morph'
          ? 1
          : paletteAnimLockRef.current === 'demorph'
            ? 0
            : morphCommitted;

      const projectMorphActive =
        !paletteOnlyMorph &&
        (sprayAnimRef.current > MORPH_IDLE ||
          forkAnimRef.current > MORPH_IDLE ||
          transitAnimRef.current > MORPH_IDLE);

      if (paletteOnlyMorph) {
        const reversePalette =
          paletteAnimTarget === 0 && animProgress > MORPH_ACTIVE;
        const paletteGap = Math.abs(paletteAnimTarget - animProgress);
        const paletteLerp = reversePalette
          ? Math.min(0.14, MORPH_REVERSE_LERP + paletteGap * 0.08)
          : MORPH_ANIM_LERP;

        animProgress += (paletteAnimTarget - animProgress) * paletteLerp;
        if (Math.abs(paletteAnimTarget - animProgress) < 0.002) {
          animProgress = paletteAnimTarget;
        }
      } else {
        const animTarget = projectMorphActive ? 1 : morphCommitted;
        if (morphCommitted === 1 && prevCommitted === 0 && !projectMorphActive) {
          animProgress = Math.max(animProgress, MORPH_ACTIVE);
        }

        const reverseMorph =
          morphCommitted === 0 && animProgress > MORPH_ACTIVE && !projectMorphActive;
        const reverseGap = Math.abs(animProgress - animTarget);
        const animLerp = scrollJump
          ? Math.min(0.42, 0.18 + reverseGap * 0.22)
          : reverseMorph
            ? Math.min(0.12, MORPH_REVERSE_LERP + reverseGap * 0.1)
            : MORPH_ANIM_LERP;

        animProgress += (animTarget - animProgress) * animLerp;
        if (Math.abs(animTarget - animProgress) < 0.002) {
          animProgress = animTarget;
        }
      }

      prevCommitted = morphCommitted;

      if (stage === 'transit' || stage === 'fork' || stage === 'spray' || demorphingTransit || demorphingFork || demorphingSpray) {
        busMorphUnlockedRef.current = true;
      } else {
        busMorphUnlockedRef.current = false;
      }

      if (stage === 'fork' || stage === 'spray') {
        forkSessionRef.current = true;
      } else if (!demorphingFork) {
        forkSessionRef.current = false;
        if (forkAnimRef.current <= MORPH_IDLE) {
          forkLockedPinRef.current = null;
          forkStartPinRef.current = null;
        }
      }

      if (stage === 'spray') {
        spraySessionRef.current = true;
      } else if (!demorphingSpray) {
        spraySessionRef.current = false;
        if (sprayAnimRef.current <= MORPH_IDLE) {
          sprayLockedPinRef.current = null;
          sprayStartPinRef.current = null;
        }
      }

      if (stage === 'transit' || stage === 'fork' || stage === 'spray') {
        transitSessionRef.current = true;
      } else if (stage === 'hero') {
        if (!demorphingTransit) {
          transitSessionRef.current = false;
          transitLockedPinRef.current = null;
          transitStartPinRef.current = null;
        }
      } else if (stage === 'palette' && !demorphingTransit && transitAnimRef.current <= MORPH_IDLE) {
        transitSessionRef.current = false;
        transitLockedPinRef.current = null;
        transitStartPinRef.current = null;
      } else if (stage === 'palette' && demorphingTransit) {
        transitSessionRef.current = true;
      }

      const transitTarget =
        transitCommitted ? 1 : demorphingFork || demorphingSpray ? transitAnimRef.current : 0;
      const transitReverse = transitCommitted === 0 && transitAnimRef.current > MORPH_ACTIVE;
      const transitGap = Math.abs(transitAnimRef.current - transitTarget);
      const transitLerp = transitReverse
        ? Math.min(TRANSIT_REVERSE_LERP_CAP, TRANSIT_REVERSE_LERP + transitGap * 0.028)
        : TRANSIT_ANIM_LERP;

      transitAnimRef.current += (transitTarget - transitAnimRef.current) * transitLerp;
      if (Math.abs(transitTarget - transitAnimRef.current) < 0.002) {
        transitAnimRef.current = transitTarget;
      }
      if ((stage === 'fork' || stage === 'spray') && transitAnimRef.current < 1) {
        transitAnimRef.current = 1;
      }

      const forkTarget = forkCommitted
        ? 1
        : demorphingSpray
          ? forkAnimRef.current
          : 0;
      const forkReverse = forkCommitted === 0 && forkAnimRef.current > MORPH_ACTIVE;
      const forkGap = Math.abs(forkAnimRef.current - forkTarget);
      const forkLerp = forkReverse
        ? Math.min(FORK_REVERSE_LERP_CAP, FORK_REVERSE_LERP + forkGap * 0.028)
        : FORK_ANIM_LERP;

      forkAnimRef.current += (forkTarget - forkAnimRef.current) * forkLerp;
      if (Math.abs(forkTarget - forkAnimRef.current) < 0.002) {
        forkAnimRef.current = forkTarget;
      }
      if (stage === 'spray' && forkAnimRef.current < 1) {
        forkAnimRef.current = 1;
      }

      const sprayTarget = sprayCommitted ? 1 : 0;
      const sprayReverse = sprayCommitted === 0 && sprayAnimRef.current > MORPH_ACTIVE;
      const sprayGap = Math.abs(sprayAnimRef.current - sprayTarget);
      const sprayLerp = sprayReverse
        ? Math.min(SPRAY_REVERSE_LERP_CAP, SPRAY_REVERSE_LERP + sprayGap * 0.028)
        : sprayCommitted && sprayAnimRef.current > 0.35
          ? Math.min(0.072, SPRAY_ANIM_LERP + sprayGap * 0.04)
          : SPRAY_ANIM_LERP;

      sprayAnimRef.current += (sprayTarget - sprayAnimRef.current) * sprayLerp;
      if (Math.abs(sprayTarget - sprayAnimRef.current) < 0.002) {
        sprayAnimRef.current = sprayTarget;
      }

      const layoutT = animProgress;
      const transitSeq = transitSequenceProgress(transitAnimRef.current);
      const forkSeq = forkSequenceProgress(forkAnimRef.current);
      const onCard = stage === 'transit' || stage === 'fork' || stage === 'spray';
      const onForkOnly = stage === 'fork';
      const onSprayOnly = stage === 'spray';
      const onForkCard = onForkOnly || onSprayOnly;

      const freshPin = computePalettePin();
      if (freshPin && inView && sectionRect.top < viewH * 0.98) {
        palettePinRef.current = freshPin;
      } else if (animProgress > MORPH_IDLE && palettePinRef.current) {
        // Trzymaj pin do końca animacji powrotnej.
      } else if (!onCard && !onForkCard) {
        palettePinRef.current = null;
      }

      const palettePin = palettePinRef.current;
      let pinLeft = heroRect.left;
      let pinTop = heroRect.top;
      let pinW = heroRect.width;
      let pinH = heroRect.height;
      let nextAim: {
        x: number;
        y: number;
        centerX: number;
        stageW: number;
        stageH: number;
      } | null = null;

      let nextBusMorph = 0;
      let nextBusRender = false;
      let nextForkMorph = 0;
      let nextForkRender = false;
      let nextSprayMorph = 0;
      let nextSprayRender = false;
      let rotateDeg = 0;
      let originStr = '';

      if (palettePin && animProgress > MORPH_IDLE) {
        const pin = freshPin ?? palettePin;
        const posT = easeSmoothStep(layoutT);
        const sizeT = easeSmoothStep(Math.max(0, (layoutT - 0.04) / 0.45));
        pinLeft = lerp(heroRect.left, pin.left, posT);
        pinTop = lerp(heroRect.top, pin.top, posT);
        pinW = Math.round(lerp(heroRect.width, pin.stageW, sizeT));
        pinH = Math.round(lerp(heroRect.height, pin.stageH, sizeT));

        nextAim = {
          x: pin.aimX,
          y: pin.aimY,
          centerX: pin.centerX,
          stageW: pin.stageW,
          stageH: pin.stageH,
        };
      } else if (animProgress > MORPH_IDLE && palettePinRef.current) {
        const pin = palettePinRef.current;
        const posT = easeSmoothStep(layoutT);
        const sizeT = easeSmoothStep(Math.max(0, (layoutT - 0.04) / 0.45));
        pinLeft = lerp(heroRect.left, pin.left, posT);
        pinTop = lerp(heroRect.top, pin.top, posT);
        pinW = Math.round(lerp(heroRect.width, pin.stageW, sizeT));
        pinH = Math.round(lerp(heroRect.height, pin.stageH, sizeT));

        nextAim = {
          x: pin.aimX,
          y: pin.aimY,
          centerX: pin.centerX,
          stageW: pin.stageW,
          stageH: pin.stageH,
        };
      }

      if (transitCommitted === 1 && prevTransitCommitted === 0) {
        transitStartPinRef.current = {
          left: pinLeft,
          top: pinTop,
          stageW: pinW,
          stageH: pinH,
        };
        transitSessionRef.current = true;
        if (transitRect) {
          transitLockedPinRef.current = computeTransitDocumentPin(transitRect, vw, viewH);
        }
      }

      if (prevTransitCommitted === 1 && transitCommitted === 0) {
        const snapPin = palettePin ?? freshPin ?? palettePinRef.current;
        if (snapPin) {
          transitDemorphPinRef.current = { ...snapPin };
        }
        if (transitRect) {
          transitFlyFromPinRef.current = computeTransitDocumentPin(transitRect, vw, viewH);
        } else if (transitLockedPinRef.current) {
          transitFlyFromPinRef.current = { ...transitLockedPinRef.current };
        }
      }

      if (demorphingTransit && (freshPin || palettePin)) {
        const livePin = freshPin ?? palettePin;
        if (livePin) {
          transitDemorphPinRef.current = { ...livePin };
        }
      }

      if (!demorphingTransit && transitAnimRef.current <= MORPH_IDLE) {
        transitDemorphPinRef.current = null;
        transitFlyFromPinRef.current = null;
      }

      if (
        (stage === 'transit' || stage === 'fork' || stage === 'spray') &&
        !transitLockedPinRef.current &&
        transitRect
      ) {
        transitSessionRef.current = true;
        transitLockedPinRef.current = computeTransitDocumentPin(transitRect, vw, viewH);
      }

      if (
        transitRect &&
        cardOffScreen(transitRect, viewH) &&
        stage !== 'transit' &&
        stage !== 'fork' &&
        stage !== 'spray' &&
        !demorphingTransit
      ) {
        transitSessionRef.current = false;
        transitLockedPinRef.current = null;
      }

      let left = pinLeft;
      let top = pinTop;
      let stageW = pinW;
      let stageH = pinH;

      let transitLeft = pinLeft;
      let transitTop = pinTop;
      let transitW = pinW;
      let transitH = pinH;
      let transitRotate = 0;

      if (
        (stage === 'transit' || stage === 'fork' || stage === 'spray' || demorphingTransit || demorphingFork || demorphingSpray) &&
        (transitRect || transitFlyFromPinRef.current)
      ) {
        const flyT =
          onForkOnly || onSprayOnly || demorphingFork || demorphingSpray
            ? 1
            : easeSmoothStep(transitAnimRef.current);
        const transitDocPin =
          (demorphingTransit ? transitFlyFromPinRef.current : null) ??
          transitLockedPinRef.current ??
          (transitRect ? computeTransitDocumentPin(transitRect, vw, viewH) : null);
        if (!transitDocPin) {
          // brak pinu — zostaw pinLeft
        } else {
        const transitPin = viewportPinFromDocument(transitDocPin);
        const paletteEnd = transitDemorphPinRef.current ??
          palettePin ??
          transitStartPinRef.current ?? {
            left: pinLeft,
            top: pinTop,
            stageW: pinW,
            stageH: pinH,
          };

        transitLeft = lerp(paletteEnd.left, transitPin.left, flyT);
        transitTop = lerp(paletteEnd.top, transitPin.top, flyT);
        transitW = Math.round(lerp(paletteEnd.stageW, transitPin.stageW, flyT));
        transitH = Math.round(lerp(paletteEnd.stageH, transitPin.stageH, flyT));
        transitRotate = BUS_DISPLAY_ROTATE_DEG * flyT;

        if ((stage === 'transit' || demorphingTransit) && !demorphingFork && !demorphingSpray) {
          nextBusMorph = transitSeq.busMorphT;
          if (demorphingTransit && flyT < 0.42) {
            nextBusMorph = Math.min(nextBusMorph, easeSmoothStep(flyT / 0.42) * 0.22);
          }
          nextBusRender = transitSeq.busRender && flyT > 0.06;
          if (flyT > 0.08 && !demorphingTransit) {
            nextAim = null;
          } else if (demorphingTransit && flyT <= 0.38) {
            const aimPin = transitDemorphPinRef.current ?? palettePin;
            if (aimPin) {
              nextAim = {
                x: aimPin.aimX,
                y: aimPin.aimY,
                centerX: aimPin.centerX,
                stageW: aimPin.stageW,
                stageH: aimPin.stageH,
              };
            }
          }
        } else if (stage === 'fork' || stage === 'spray') {
          nextBusMorph = 1;
          nextBusRender = true;
        }
        }
      }

      let forkLeft = pinLeft;
      let forkTop = pinTop;
      let forkW = pinW;
      let forkH = pinH;
      let forkRotate = 0;

      if (forkCommitted === 1 && prevForkCommitted === 0 && prevSprayCommitted === 0) {
        forkStartPinRef.current = {
          left: transitLeft,
          top: transitTop,
          stageW: transitW,
          stageH: transitH,
        };
        forkSessionRef.current = true;
        if (forkRect) {
          forkLockedPinRef.current = computeForkDocumentPin(forkRect, vw, viewH);
        }
      }

      if (stage === 'fork' && forkRect && !forkLockedPinRef.current) {
        forkLockedPinRef.current = computeForkDocumentPin(forkRect, vw, viewH);
      }

      if (
        (onForkOnly || demorphingFork || onSprayOnly || demorphingSpray) &&
        (forkRect || forkLockedPinRef.current)
      ) {
        const forkDocPin =
          forkLockedPinRef.current ??
          (forkRect ? computeForkDocumentPin(forkRect, vw, viewH) : null);
        if (forkDocPin) {
        const forkFlyT =
          onSprayOnly || demorphingSpray ? 1 : easeSmoothStep(forkAnimRef.current);
        const forkPin = viewportPinFromDocument(forkDocPin);
        const fromPin = {
          left: transitLeft,
          top: transitTop,
          stageW: transitW,
          stageH: transitH,
          rotate: transitRotate,
        };

        forkLeft = lerp(fromPin.left, forkPin.left, forkFlyT);
        forkTop = lerp(fromPin.top, forkPin.top, forkFlyT);
        forkW = Math.round(lerp(fromPin.stageW, forkPin.stageW, forkFlyT));
        forkH = Math.round(lerp(fromPin.stageH, forkPin.stageH, forkFlyT));
        forkRotate = lerp(fromPin.rotate, FORK_DISPLAY_ROTATE_DEG, forkFlyT);

        if (demorphingFork || (onForkOnly && !onSprayOnly)) {
        left = forkLeft;
        top = forkTop;
        stageW = forkW;
        stageH = forkH;
        rotateDeg = forkRotate;
        
        let ox = lerp(50, 86, forkFlyT);
        let oy = lerp(54, 40, forkFlyT);
        originStr = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;

        nextForkMorph = demorphingFork
          ? forkSeq.forkMorphT
          : Math.max(forkSeq.forkMorphT, 0.05);
        nextForkRender = true;
        nextBusMorph = demorphingFork ? clamp01(1 - forkSeq.forkMorphT) : 1;
        nextBusRender = true;
        nextAim = null;
        }
        }
      }

      if (sprayCommitted === 1 && prevSprayCommitted === 0) {
        sprayStartPinRef.current = {
          left: forkLeft,
          top: forkTop,
          stageW: forkW,
          stageH: forkH,
        };
        spraySessionRef.current = true;
        if (sprayRect) {
          sprayLockedPinRef.current = computeSprayDocumentPin(sprayRect, vw, viewH);
        }
      }

      if (stage === 'spray' && sprayRect && !sprayLockedPinRef.current) {
        sprayLockedPinRef.current = computeSprayDocumentPin(sprayRect, vw, viewH);
      }

      if ((onSprayOnly || demorphingSpray) && (sprayRect || sprayLockedPinRef.current)) {
        const sprayDocPin =
          sprayLockedPinRef.current ??
          (sprayRect ? computeSprayDocumentPin(sprayRect, vw, viewH) : null);
        if (sprayDocPin) {
        const flyT = easeSmoothStep(sprayAnimRef.current);
        const seq = spraySequenceProgress(sprayAnimRef.current);
        const sprayPin = viewportPinFromDocument(sprayDocPin);
        const fromPin = {
          left: forkLeft,
          top: forkTop,
          stageW: forkW,
          stageH: forkH,
          rotate: forkRotate,
        };

        left = lerp(fromPin.left, sprayPin.left, flyT);
        top = lerp(fromPin.top, sprayPin.top, flyT);
        stageW = Math.round(lerp(fromPin.stageW, sprayPin.stageW, flyT));
        stageH = Math.round(lerp(fromPin.stageH, sprayPin.stageH, flyT));
        rotateDeg = lerp(fromPin.rotate, SPRAY_DISPLAY_ROTATE_DEG, flyT);

        const ox = lerp(50, 14, flyT);
        const oy = lerp(54, 40, flyT);
        originStr = `${ox.toFixed(1)}% ${oy.toFixed(1)}%`;

        nextForkRender = true;
        nextBusMorph = 1;
        nextBusRender = true;
        nextAim = null;

        if (demorphingSpray) {
          nextSprayMorph = seq.sprayMorphT;
          nextForkMorph = clamp01(1 - seq.sprayMorphT);
          nextSprayRender = true;
        } else if (flyT > 0.12) {
          nextSprayMorph = Math.max(seq.sprayMorphT, 0.05);
          nextForkMorph = clamp01(1 - seq.sprayMorphT);
          nextSprayRender = true;
        } else {
          nextSprayMorph = 0;
          nextForkMorph = 1;
          nextSprayRender = false;
        }
        }
      } else if (
        (stage === 'transit' || demorphingTransit) &&
        !demorphingFork &&
        (transitRect || transitFlyFromPinRef.current)
      ) {
        left = transitLeft;
        top = transitTop;
        stageW = transitW;
        stageH = transitH;
        rotateDeg = transitRotate;
        originStr = rotateDeg > 0.05 ? '50% 54%' : '';

        if (demorphingTransit) {
          nextBusMorph = transitSeq.busMorphT;
          nextBusRender = transitSeq.busRender;
          nextForkMorph = 0;
          nextForkRender = false;
          nextSprayMorph = 0;
          nextSprayRender = false;
        }
      } else if (
        (stage === 'hero' || stage === 'palette') &&
        transitAnimRef.current <= MORPH_IDLE &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimRef.current <= MORPH_IDLE
      ) {
        nextBusMorph = 0;
        nextBusRender = false;
        nextForkMorph = 0;
        nextForkRender = false;
        nextSprayMorph = 0;
        nextSprayRender = false;
      }

      if (forkAnimRef.current <= MORPH_IDLE) {
        forkDemorphPinRef.current = null;
      }

      if (sprayAnimRef.current <= MORPH_IDLE) {
        sprayStartPinRef.current = null;
      }

      if (
        transitAnimRef.current <= MORPH_IDLE &&
        transitCommitted === 0 &&
        forkAnimRef.current <= MORPH_IDLE &&
        sprayAnimRef.current <= MORPH_IDLE &&
        !busMorphUnlockedRef.current &&
        !transitSessionRef.current
      ) {
        transitStartPinRef.current = null;
        transitLockedPinRef.current = null;
        busMorphUnlockedRef.current = false;
        paletteMorphLockedRef.current = false;
      }

      if (
        forkAnimRef.current <= MORPH_IDLE &&
        forkCommitted === 0 &&
        !forkSessionRef.current
      ) {
        forkStartPinRef.current = null;
        forkLockedPinRef.current = null;
      }

      if (
        sprayAnimRef.current <= MORPH_IDLE &&
        sprayCommitted === 0 &&
        !spraySessionRef.current
      ) {
        sprayStartPinRef.current = null;
        sprayLockedPinRef.current = null;
      }

      prevTransitCommitted = transitCommitted;
      prevForkCommitted = forkCommitted;
      prevSprayCommitted = sprayCommitted;

      if (paletteOnlyMorph) {
        nextBusMorph = 0;
        nextBusRender = false;
        nextForkMorph = 0;
        nextForkRender = false;
        nextSprayMorph = 0;
        nextSprayRender = false;
      }

      setPinStyle({
        position: 'fixed',
        top,
        left,
        width: stageW,
        height: stageH,
        right: 'auto',
        bottom: 'auto',
        margin: 0,
        transform: rotateDeg > 0.05 ? `rotate(${rotateDeg}deg)` : 'none',
        transformOrigin: originStr || undefined,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      });

      setMorphTarget(
        stage === 'hero' || stage === 'palette' ? animProgress : 1,
      );
      setBusMorphTarget(nextBusMorph);
      setBusRenderActive(nextBusRender);
      setForkMorphTarget(nextForkMorph);
      setForkRenderActive(nextForkRender);
      setSprayMorphTarget(nextSprayMorph);
      setSprayRenderActive(nextSprayRender);
      setTransitOnCard(onCard);
      setForkOnCard(onForkCard);
      setSprayOnCard(onSprayOnly);

      if (animProgress > 0.96) isAtPaletteRef.current = true;
      else if (animProgress < 0.04) isAtPaletteRef.current = false;
      setIsAtPalette(isAtPaletteRef.current);
      setAimPoint(nextAim);
    }

    function updateMode() {
      const section = document.getElementById('studio-palety');
      const heroRect = readHeroRect();
      if (!section || !heroRect) return;

      const sectionRect = section.getBoundingClientRect();
      const viewH = window.innerHeight;
      const inView = sectionRect.bottom > 0 && sectionRect.top < viewH;
      const pin = computePalettePin();

      if (inView && sectionRect.top < viewH * 0.98 && pin) {
        palettePinRef.current = pin;
      }
    }

    function tick() {
      if (!active) return;
      updateMode();
      applyFrame();
      raf = requestAnimationFrame(tick);
    }

    function onScroll() {
      updateMode();
    }

    function onResize() {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (transitLockedPinRef.current) {
        transitLockedPinRef.current = refreshTransitDocumentPin(
          transitLockedPinRef.current,
          vw,
          vh,
        );
      }
      if (forkLockedPinRef.current) {
        forkLockedPinRef.current = refreshForkDocumentPin(forkLockedPinRef.current, vw, vh);
      }
      if (sprayLockedPinRef.current) {
        sprayLockedPinRef.current = refreshSprayDocumentPin(sprayLockedPinRef.current, vw, vh);
      }
      updateMode();
      applyFrame();
    }

    updateMode();
    applyFrame();
    raf = requestAnimationFrame(tick);

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  return {
    morphTarget,
    busMorphTarget,
    busRenderActive,
    forkMorphTarget,
    forkRenderActive,
    sprayMorphTarget,
    sprayRenderActive,
    transitOnCard,
    forkOnCard,
    sprayOnCard,
    aimPoint,
    pinStyle,
    isAtPalette,
  };
}

export {
  MESH_PORTAL_ID,
  HERO_MESH_ANCHOR_ID,
  TRANSITRANK_MESH_ANCHOR_ID,
  FORKFULL_MESH_ANCHOR_ID,
  KAMOCHI_MESH_ANCHOR_ID,
  TRANSIT_MESH_SLOT_ID,
  BUS_DISPLAY_ROTATE_DEG,
  FORK_DISPLAY_ROTATE_DEG,
  SPRAY_DISPLAY_ROTATE_DEG,
  PIVOT_Y_RATIO,
};

export type PortraitAimPoint = {
  x: number;
  y: number;
  centerX: number;
  stageW: number;
  stageH: number;
};
