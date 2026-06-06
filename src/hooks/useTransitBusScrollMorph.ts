import { useEffect, useState, type CSSProperties } from 'react';

const MORPH_IDLE = 0.0005;
const MORPH_ANIM_LERP = 0.09;
const TRANSITRANK_MESH_ANCHOR_ID = 'transit-rank-mesh-anchor';
const BUS_PORTAL_ID = 'transit-bus-portal-root';

function easeSmoothStep(value: number) {
  const t = Math.max(0, Math.min(1, value));
  return t * t * (3 - 2 * t);
}

function readAnchorRect() {
  const anchor = document.getElementById(TRANSITRANK_MESH_ANCHOR_ID);
  return anchor?.getBoundingClientRect() ?? null;
}

function cardScrollMorph(cardRect: DOMRect, viewH: number) {
  const centerY = cardRect.top + cardRect.height * 0.5;
  const start = viewH * 0.76;
  const end = viewH * 0.36;

  if (centerY >= start) return 0;
  if (centerY <= end) return 1;

  return easeSmoothStep((start - centerY) / (start - end));
}

function transitBusVisible(cardRect: DOMRect, viewH: number) {
  const centerY = cardRect.top + cardRect.height * 0.5;
  return centerY > viewH * 0.12 && centerY < viewH * 0.88;
}

function busStageSize(vw: number, vh: number) {
  return {
    stageW: Math.min(500, Math.max(280, vw * 0.34)),
    stageH: Math.min(480, Math.max(260, vh * 0.48)),
  };
}

function computeBusPin(anchorRect: DOMRect) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 12;
  const gap = 18;
  const { stageW: baseW, stageH } = busStageSize(vw, vh);
  let stageW = baseW;
  const narrow = vw < 900;

  let left: number;
  let top: number;

  if (narrow) {
    left = anchorRect.right - stageW * 0.55;
    top = anchorRect.bottom - stageH * 0.85;
    left = Math.max(margin, Math.min(left, vw - stageW - margin));
  } else {
    left = anchorRect.right + gap;
    if (left + stageW > vw - margin) {
      stageW = Math.max(260, vw - left - margin);
    }
    top = anchorRect.top + anchorRect.height * 0.5 - stageH * 0.5;
    left = Math.max(margin, left);
  }

  top = Math.max(margin, Math.min(top, vh - stageH - margin));

  return { left, top, stageW, stageH };
}

export function useTransitBusScrollMorph() {
  const [morphTarget, setMorphTarget] = useState(0);
  const [pinStyle, setPinStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    let raf = 0;
    let active = true;
    let animProgress = 0;

    function applyFrame() {
      const anchorRect = readAnchorRect();
      if (!anchorRect || !transitBusVisible(anchorRect, window.innerHeight)) {
        animProgress = 0;
        setPinStyle(null);
        setMorphTarget(0);
        return;
      }

      const scrollT = cardScrollMorph(anchorRect, window.innerHeight);

      animProgress += (scrollT - animProgress) * MORPH_ANIM_LERP;
      if (Math.abs(scrollT - animProgress) < 0.002) {
        animProgress = scrollT;
      }

      const pin = computeBusPin(anchorRect);
      setPinStyle({
        position: 'fixed',
        top: pin.top,
        left: pin.left,
        width: pin.stageW,
        height: pin.stageH,
        zIndex: 0,
        pointerEvents: 'none',
        overflow: 'visible',
      });

      setMorphTarget(animProgress);
    }

    function tick() {
      if (!active) return;
      applyFrame();
      raf = requestAnimationFrame(tick);
    }

    applyFrame();
    raf = requestAnimationFrame(tick);

    window.addEventListener('scroll', applyFrame, { passive: true });
    window.addEventListener('resize', applyFrame, { passive: true });

    return () => {
      active = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', applyFrame);
      window.removeEventListener('resize', applyFrame);
    };
  }, []);

  return { morphTarget, pinStyle, isActive: morphTarget > MORPH_IDLE };
}

export { BUS_PORTAL_ID, TRANSITRANK_MESH_ANCHOR_ID };
