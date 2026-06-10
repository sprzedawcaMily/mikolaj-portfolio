import { useLayoutEffect, useRef, type RefObject } from 'react';
import {
  blendPinState,
  computeScrollFrame,
  syncPinViewport,
  targetsForZone,
  type MeshPinState,
  type MeshZone,
  type ScrollMorphTargets,
} from '@/hooks/meshScrollEngine';

export {
  HERO_MESH_ANCHOR_ID,
  TRANSITRANK_MESH_ANCHOR_ID,
  FORKFULL_MESH_ANCHOR_ID,
  KAMOCHI_MESH_ANCHOR_ID,
  LEGITCHECK_MESH_ANCHOR_ID,
  STYLERANK_MESH_ANCHOR_ID,
  TRANSIT_MESH_SLOT_ID,
  BUS_DISPLAY_ROTATE_DEG,
  FORK_DISPLAY_ROTATE_DEG,
  SPRAY_DISPLAY_ROTATE_DEG,
  LOUPE_DISPLAY_ROTATE_DEG,
  RING_DISPLAY_ROTATE_DEG,
  PIVOT_Y_RATIO,
} from '@/hooks/meshScrollEngine';

export type PortraitMorphFrame = ScrollMorphTargets & {
  zone: MeshZone;
  busRender: boolean;
  forkRender: boolean;
  sprayRender: boolean;
  loupeRender: boolean;
  ringRender: boolean;
};

export type PortraitAimPoint = {
  x: number;
  y: number;
  centerX: number;
  stageW: number;
  stageH: number;
};

export type MeshPinViewport = {
  left: number;
  top: number;
  width: number;
  height: number;
  rotateDeg: number;
  transformOrigin: string;
};

const MORPH_ACTIVE = 0.008;
/** Rozpad od dołu — kształt źródłowy zostaje, potem lot po kolei. */
const MORPH_DURATION_MS = 4500;
const MORPH_DONE = 0.994;

export { MORPH_DONE };

function morphTFromClock(now: number, startMs: number) {
  if (startMs <= 0) return 1;
  return Math.min(1, (now - startMs) / MORPH_DURATION_MS);
}

function pinViewportFromFrame(pin: MeshPinState): MeshPinViewport {
  return {
    left: pin.docLeft,
    top: pin.docTop,
    width: pin.stageW,
    height: pin.stageH,
    rotateDeg: pin.rotateDeg,
    transformOrigin: pin.originStr || 'center center',
  };
}

function applyMeshPin(el: HTMLElement, pin: MeshPinViewport) {
  el.style.width = `${pin.width}px`;
  el.style.height = `${pin.height}px`;
  el.style.transformOrigin = pin.transformOrigin;
  el.style.left = `${pin.left}px`;
  el.style.top = `${pin.top}px`;
  const rotate =
    Math.abs(pin.rotateDeg) > 0.05 ? ` rotate(${pin.rotateDeg.toFixed(2)}deg)` : '';
  el.style.transform = rotate ? rotate.trim() : 'none';
  el.style.visibility = 'visible';
}

function heroAimFromSize(width: number, height: number): PortraitAimPoint {
  return {
    x: width * 0.53,
    y: height * 0.48,
    centerX: width * 0.5,
    stageW: width,
    stageH: height,
  };
}

export type PortraitMorphTick = (now: number, dt: number) => void;

export function usePortraitScrollMorph(meshLayerRef?: RefObject<HTMLElement | null>) {
  const zoneRef = useRef<MeshZone>('hero');
  const aimPointRef = useRef<PortraitAimPoint | null>(null);
  const morphTickRef = useRef<PortraitMorphTick>(() => {});
  const morphTRef = useRef(1);
  const pinEndRef = useRef<MeshPinState | null>(null);
  const sessionZoneRef = useRef<MeshZone | null>(null);
  const pinStartRef = useRef<MeshPinState | null>(null);
  const pinSessionEndRef = useRef<MeshPinState | null>(null);
  const morphStartMsRef = useRef(0);
  const restartMorphRef = useRef<(now: number) => void>(() => {});

  const morphFrameRef = useRef<PortraitMorphFrame>({
    morph: 0,
    busMorph: 0,
    forkMorph: 0,
    sprayMorph: 0,
    loupeMorph: 0,
    ringMorph: 0,
    careerEyeMorph: 0,
    skillsEyeMorph: 0,
    busRender: false,
    forkRender: false,
    sprayRender: false,
    loupeRender: false,
    ringRender: false,
    zone: 'hero',
  });

  const pinSimRef = useRef<MeshPinState | null>(null);

  useLayoutEffect(() => {
    let active = true;

    function applyFrame(now: number, _dt: number) {
      if (!active) return;

      const frame = computeScrollFrame();
      if (!frame) return;

      const scrollTargets = targetsForZone(frame.zone);
      morphFrameRef.current.zone = frame.zone;
      zoneRef.current = frame.zone;
      Object.assign(morphFrameRef.current, scrollTargets);
      morphFrameRef.current.busRender = scrollTargets.busMorph > MORPH_ACTIVE;
      morphFrameRef.current.forkRender = scrollTargets.forkMorph > MORPH_ACTIVE;
      morphFrameRef.current.sprayRender = scrollTargets.sprayMorph > MORPH_ACTIVE;
      morphFrameRef.current.loupeRender = scrollTargets.loupeMorph > MORPH_ACTIVE;
      morphFrameRef.current.ringRender = scrollTargets.ringMorph > MORPH_ACTIVE;

      const targetPin = frame.pinTarget;
      pinEndRef.current = targetPin;

      if (frame.zone !== sessionZoneRef.current) {
        if (sessionZoneRef.current !== null) {
          pinStartRef.current = pinSimRef.current
            ? { ...pinSimRef.current }
            : { ...targetPin };
          pinSessionEndRef.current = { ...targetPin };
          morphStartMsRef.current = now;
          morphTRef.current = 0;
        } else {
          morphTRef.current = 1;
          morphStartMsRef.current = 0;
          pinStartRef.current = null;
          pinSessionEndRef.current = { ...targetPin };
        }
        sessionZoneRef.current = frame.zone;
      }

      if (morphStartMsRef.current > 0) {
        morphTRef.current = morphTFromClock(now, morphStartMsRef.current);
      }

      const morphEnd = pinSessionEndRef.current ?? targetPin;

      if (!pinSimRef.current) {
        pinSimRef.current = { ...targetPin };
      } else if (morphTRef.current < MORPH_DONE) {
        const start = pinStartRef.current ?? morphEnd;
        const blended = blendPinState(start, morphEnd, morphTRef.current);
        Object.assign(pinSimRef.current, blended);
      } else {
        Object.assign(pinSimRef.current, targetPin);
        syncPinViewport(pinSimRef.current);
      }

      const layer = meshLayerRef?.current;
      if (layer) {
        applyMeshPin(layer, pinViewportFromFrame(pinSimRef.current));
      }

      let nextAim: PortraitAimPoint | null = null;
      if (frame.zone === 'palette' && frame.paletteAim) {
        nextAim = frame.paletteAim;
      } else if (frame.zone === 'hero' && pinSimRef.current) {
        nextAim = heroAimFromSize(pinSimRef.current.stageW, pinSimRef.current.stageH);
      }

      if (nextAim) {
        aimPointRef.current = nextAim;
      }
    }

    restartMorphRef.current = (now: number) => {
      morphStartMsRef.current = now;
      morphTRef.current = 0;
    };

    morphTickRef.current = applyFrame;
    applyFrame(performance.now(), 0);

    function onScroll() {
      applyFrame(performance.now(), 0);
    }

    function onResize() {
      applyFrame(performance.now(), 0);
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });

    return () => {
      active = false;
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [meshLayerRef]);

  return {
    zoneRef,
    aimPointRef,
    morphTickRef,
    morphTRef,
    restartMorphRef,
    pinEndRef,
    pinSessionEndRef,
    morphFrameRef,
    isAtPalette: zoneRef.current === 'palette' || (morphFrameRef.current.morph === 1 && zoneRef.current !== 'hero'),
    morphTarget: morphFrameRef.current.morph,
    busMorphTarget: morphFrameRef.current.busMorph,
    busRenderActive: morphFrameRef.current.busRender,
    forkMorphTarget: morphFrameRef.current.forkMorph,
    forkRenderActive: morphFrameRef.current.forkRender,
    sprayMorphTarget: morphFrameRef.current.sprayMorph,
    sprayRenderActive: morphFrameRef.current.sprayRender,
    loupeMorphTarget: morphFrameRef.current.loupeMorph,
    loupeRenderActive: morphFrameRef.current.loupeRender,
    ringMorphTarget: morphFrameRef.current.ringMorph,
    ringRenderActive: morphFrameRef.current.ringRender,
    transitOnCard: morphFrameRef.current.busRender,
    forkOnCard: morphFrameRef.current.forkRender,
    sprayOnCard: morphFrameRef.current.sprayRender,
    loupeOnCard: morphFrameRef.current.loupeRender,
    ringOnCard: morphFrameRef.current.ringRender,
  };
}
