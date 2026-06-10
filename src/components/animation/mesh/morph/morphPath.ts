import { clamp01, easeSmoothStep } from '@/components/animation/mesh/svgMesh';
import type { NormPt, PixelPt } from './types';

export { clamp01, easeSmoothStep };

export function normToPixel(goal: NormPt, w: number, h: number): PixelPt {
  return { x: goal.nx * w, y: goal.ny * h };
}

const PHI = 0.618033988749895;

/** Rozłożenie startów w czasie — od dołu do góry, szeroko rozłożone. */
const DEPARTURE_SPAN = 0.92;

export function dotTravelDuration(seed: number) {
  const b = (seed * PHI) % 1;
  const c = (seed * 0.381966011250105) % 1;
  return 0.18 + b * 0.28 + c * 0.12;
}

/**
 * travelU=0 → kropka na źródle (zachowuje kształt).
 * Start lotu zależy od departureRank, tempo od seed (host id).
 */
export function morphDotTravelU(
  morphT: number,
  departureRank: number,
  pairCount: number,
  durationSeed: number,
) {
  const t = clamp01(morphT);
  const start = (departureRank / Math.max(pairCount - 1, 1)) * DEPARTURE_SPAN;
  const duration = dotTravelDuration(durationSeed);
  if (t <= start) return 0;
  return clamp01((t - start) / duration);
}

export function morphGlobalU(morphT: number) {
  return easeSmoothStep(clamp01(morphT));
}

/** @deprecated */
export function morphSqueezeInU(_morphT: number) {
  return 0;
}

/** @deprecated */
export function morphSqueezeDepth(_morphT: number) {
  return 0;
}

/** @deprecated */
export function morphDotExpandU(morphT: number, index: number, count: number) {
  return morphDotTravelU(morphT, index, count, index);
}

/** @deprecated */
export function morphExpandGlobalU(morphT: number) {
  return morphGlobalU(morphT);
}

/** @deprecated */
export function morphShapeComplete(_morphT: number) {
  return false;
}

/** @deprecated */
export const MORPH_SQUEEZE_END = 0;
/** @deprecated */
export const MORPH_HOLD_END = 0;
/** @deprecated */
export const MORPH_FOLD_MIN_SCALE = 0.2;

/** @deprecated */
export function morphCollapseU(_morphT: number) {
  return 0;
}

/** @deprecated */
export function morphClusterU(morphT: number) {
  return morphGlobalU(morphT);
}

/** @deprecated */
export function morphDotAssembleU(morphT: number, index: number, count: number) {
  return morphDotTravelU(morphT, index, count, index);
}

/** @deprecated */
export function morphAssembleGlobalU(morphT: number) {
  return morphGlobalU(morphT);
}

/** @deprecated */
export function morphFlightU(morphT: number) {
  return morphGlobalU(morphT);
}

/** @deprecated */
export function morphExpandSnap(morphT: number) {
  return morphGlobalU(morphT);
}

/** @deprecated */
export function morphShapeReveal(morphT: number) {
  return morphGlobalU(morphT);
}

export function morphTravelU(morphT: number) {
  return morphGlobalU(morphT);
}

export function easeOutEmphasized(t: number) {
  const c = clamp01(t);
  return 1 - (1 - c) ** 2.2;
}

export function morphDotEase(dotU: number) {
  return easeOutEmphasized(dotU);
}

/** @deprecated */
export function morphDotProgress(morphT: number, index: number, count: number) {
  return morphDotTravelU(morphT, index, count, index);
}

/** @deprecated */
export function morphExpandU(dotU: number) {
  return morphGlobalU(dotU);
}

export function morphSpreadU(morphT: number) {
  return morphGlobalU(morphT);
}

export function morphSpreadFromSettle(avgSettle: number) {
  return clamp01(avgSettle);
}

export function morphProgressFromSettle(avgSettle: number) {
  return clamp01(avgSettle);
}

export type CloudAxis = {
  along: PixelPt;
  perp: PixelPt;
};

/** @deprecated */
export function packOffsetForIndex(index: number, radius: number): PixelPt {
  const angle = (index + 0.5) * 2.399963229728653;
  const shell = 0.2 + ((index * PHI) % 1) * 0.36;
  return {
    x: Math.cos(angle) * radius * shell,
    y: Math.sin(angle) * radius * shell * 0.72,
  };
}

/** @deprecated */
export function foldTowardCenter(
  pt: PixelPt,
  center: PixelPt,
  _collapseU: number,
  minScale = 0.2,
): PixelPt {
  return {
    x: center.x + (pt.x - center.x) * minScale,
    y: center.y + (pt.y - center.y) * minScale,
  };
}

export function travelPt(src: PixelPt, tgt: PixelPt, u: number): PixelPt {
  const t = clamp01(u);
  return {
    x: src.x + (tgt.x - src.x) * t,
    y: src.y + (tgt.y - src.y) * t,
  };
}

/** @deprecated */
export function arcMorphPt(src: PixelPt, tgt: PixelPt, u: number, _index: number): PixelPt {
  return travelPt(src, tgt, u);
}

/** @deprecated */
export function morphCloudPhases(morphT: number) {
  const u = morphGlobalU(morphT);
  return { u, clusterU: 0, travelU: u, expandU: u, unfoldU: u, cloudBell: 0 };
}

export function morphGrowU(morphT: number, avgSettle?: number) {
  const u = avgSettle !== undefined ? morphProgressFromSettle(avgSettle) : morphGlobalU(morphT);
  return 0.9 + u * 0.1;
}

export function morphDotScale(_morphT: number, _avgSettle?: number) {
  return 1;
}

export function morphEdgeAllowed(_morphT: number, avgSettle?: number) {
  const u = avgSettle ?? 0;
  if (u < 0.45) return 0;
  if (u > 0.95) return 1;
  return easeSmoothStep((u - 0.45) / 0.5);
}

export function morphCloudDotDim() {
  return 1;
}

export function morphSourceEdgeAlpha(_morphT: number, avgSettle?: number) {
  const u = avgSettle ?? 0;
  if (u > 0.25) return 0;
  return (1 - u / 0.25) * 0.8;
}

export function morphEdgeRevealAlpha(morphT: number, avgSettle?: number) {
  return morphEdgeAllowed(morphT, avgSettle) * 0.86;
}

export function morphSupplementEdgeRevealAlpha(morphT: number, avgSettle?: number) {
  const base = morphEdgeRevealAlpha(morphT, avgSettle);
  if (base <= 0.02) return 0;
  const u = avgSettle ?? 0;
  if (u < 0.55) return 0;
  return base * easeSmoothStep((u - 0.55) / 0.4);
}

export const MORPH_SPLIT_REVEAL = 0.55;

export function splitMorphU(morphT: number): number {
  const u = morphGlobalU(morphT);
  if (u <= MORPH_SPLIT_REVEAL) return 0;
  return easeSmoothStep((u - MORPH_SPLIT_REVEAL) / (1 - MORPH_SPLIT_REVEAL));
}

export function stellarMorphPoint(
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
  morphT: number,
): PixelPt {
  const u = morphGlobalU(morphT);
  return {
    x: sourceX + (targetX - sourceX) * u,
    y: sourceY + (targetY - sourceY) * u,
  };
}

export function wireAlphas(morphT: number) {
  const u = morphGlobalU(morphT);
  return {
    source: (1 - u) * 0.55,
    target: u * 0.9,
  };
}

export function morphDotAlpha(_morphT: number) {
  return 0.96;
}

export function edgeWithinCanvas(
  a: PixelPt,
  b: PixelPt,
  w: number,
  h: number,
  maxLenRatio = 0.36,
) {
  const maxLen = Math.hypot(w, h) * maxLenRatio;
  if (Math.hypot(a.x - b.x, a.y - b.y) > maxLen) return false;
  const pad = 6;
  const inBounds = (pt: PixelPt) =>
    pt.x >= -pad && pt.x <= w + pad && pt.y >= -pad && pt.y <= h + pad;
  return inBounds(a) && inBounds(b);
}

/** Kreska tylko gdy obie kropki są na swoim miejscu docelowym. */
export function edgeSettleAlpha(settleA: number, settleB: number, baseAlpha: number) {
  const gate = Math.min(settleA, settleB);
  if (gate < 0.98) return 0;
  return baseAlpha;
}

export function edgeDepartAlpha(settleA: number, settleB: number, baseAlpha: number) {
  const gate = Math.max(settleA, settleB);
  if (gate > 0.08) return 0;
  if (gate < 0.01) return baseAlpha;
  return baseAlpha * (1 - easeSmoothStep((gate - 0.01) / 0.07));
}
