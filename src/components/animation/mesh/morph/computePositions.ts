import {
  morphDotTravelU,
  travelPt,
} from './morphPath';
import {
  buildDepartureRanks,
  buildHostMorphPairs,
  hostRanksFromPairs,
} from './dotCatalog';
import type {
  MorphSessionCtx,
  NormPt,
  PixelPt,
  SourceSnapshot,
  ZoneSnapshot,
} from './types';

export type MorphDotState = {
  x: number;
  y: number;
  alpha: number;
  scale: number;
  settle: number;
};

export type IndexedMorphFrame = {
  dots: Map<number, MorphDotState>;
  hostRanks: Map<number, number>;
  sourceHostRanks: Map<number, number>;
};

const DOT_ALPHA = 0.92;
const DOT_SCALE = 1;
/** Krótki podgląd kształtu źródłowego — potem tylko lecące i docelowe kropki. */
const SOURCE_HOLD_T = 0.05;

/** Współrzędne na canvasie — identycznie jak settledPositions. */
function normToCanvas(norm: NormPt, canvasW: number, canvasH: number): PixelPt {
  return { x: norm.nx * canvasW, y: norm.ny * canvasH };
}

function scaleFrozen(
  px: PixelPt,
  startW: number,
  startH: number,
  canvasW: number,
  canvasH: number,
): PixelPt {
  return {
    x: startW > 0 ? px.x * (canvasW / startW) : px.x,
    y: startH > 0 ? px.y * (canvasH / startH) : px.y,
  };
}

/** Punkt startu lotu — zawsze zamrożony piksel, nie norma z atlasu. */
function resolveStartPx(
  hostId: number | null,
  splitKey: string | null,
  src: NormPt,
  session: MorphSessionCtx | null,
  canvasW: number,
  canvasH: number,
): PixelPt {
  if (session) {
    if (hostId != null && session.frozenHostPx.has(hostId)) {
      return scaleFrozen(
        session.frozenHostPx.get(hostId)!,
        session.startW,
        session.startH,
        canvasW,
        canvasH,
      );
    }
    if (splitKey && session.frozenSplitPx.has(splitKey)) {
      return scaleFrozen(
        session.frozenSplitPx.get(splitKey)!,
        session.startW,
        session.startH,
        canvasW,
        canvasH,
      );
    }
  }
  return normToCanvas(src, canvasW, canvasH);
}

export function computeIndexedMorph(
  source: SourceSnapshot,
  target: ZoneSnapshot,
  morphT: number,
  canvasW: number,
  canvasH: number,
  session: MorphSessionCtx | null = null,
): IndexedMorphFrame {
  const pairs = buildHostMorphPairs(source, target);
  const departureRanks = buildDepartureRanks(pairs);
  const pairCount = pairs.length;
  const dots = new Map<number, MorphDotState>();

  for (const pair of pairs) {
    if (!pair.src && !pair.tgt) continue;

    const rank = departureRanks.get(pair.slot) ?? 0;
    const seed = pair.hostId ?? pair.slot;
    const travelU = morphDotTravelU(morphT, rank, pairCount, seed);

    const tgtPx = pair.tgt ? normToCanvas(pair.tgt, canvasW, canvasH) : null;
    const srcPx = pair.src
      ? resolveStartPx(pair.hostId, pair.splitKey, pair.src, session, canvasW, canvasH)
      : null;

    if (pair.src && pair.tgt && srcPx && tgtPx) {
      // Po krótkim holdzie ukryj kropki czekające na start — nie zostawiaj autobusu na ekranie.
      if (travelU <= 0 && morphT > SOURCE_HOLD_T) continue;

      const pos = travelU >= 1 ? tgtPx : travelPt(srcPx, tgtPx, travelU);
      dots.set(pair.slot, {
        x: pos.x,
        y: pos.y,
        alpha: DOT_ALPHA,
        scale: DOT_SCALE,
        settle: travelU >= 1 ? 1 : travelU,
      });
    } else if (pair.src && srcPx && !pair.tgt) {
      if (travelU <= 0) {
        if (morphT <= SOURCE_HOLD_T) {
          dots.set(pair.slot, {
            x: srcPx.x,
            y: srcPx.y,
            alpha: DOT_ALPHA,
            scale: DOT_SCALE,
            settle: 0,
          });
        }
      } else {
        const exit = { x: srcPx.x, y: srcPx.y - 40 };
        const pos = travelPt(srcPx, exit, Math.min(1, travelU));
        const alpha = DOT_ALPHA * (1 - travelU);
        if (alpha > 0.02) {
          dots.set(pair.slot, {
            x: pos.x,
            y: pos.y,
            alpha,
            scale: DOT_SCALE,
            settle: travelU,
          });
        }
      }
    } else if (!pair.src && pair.tgt && tgtPx) {
      if (travelU <= 0) continue;
      const from = {
        x: tgtPx.x + (tgtPx.x - canvasW * 0.5) * 0.1,
        y: tgtPx.y + (tgtPx.y - canvasH * 0.48) * 0.1,
      };
      const pos = travelU >= 1 ? tgtPx : travelPt(from, tgtPx, travelU);
      dots.set(pair.slot, {
        x: pos.x,
        y: pos.y,
        alpha: DOT_ALPHA,
        scale: DOT_SCALE,
        settle: travelU >= 1 ? 1 : travelU,
      });
    }
  }

  return {
    dots,
    hostRanks: hostRanksFromPairs(pairs, 'tgt'),
    sourceHostRanks: hostRanksFromPairs(pairs, 'src'),
  };
}

export function averageSettle(indexedDots: Map<number, MorphDotState>): number {
  if (indexedDots.size === 0) return 0;
  let sum = 0;
  for (const [, dot] of indexedDots) sum += dot.settle;
  return sum / indexedDots.size;
}

export function hostSettleFromIndexed(
  hostRanks: Map<number, number>,
  indexedDots: Map<number, MorphDotState>,
): Map<number, number> {
  const out = new Map<number, number>();
  for (const [hostId, slot] of hostRanks) {
    const dot = indexedDots.get(slot);
    if (dot) out.set(hostId, dot.settle);
  }
  return out;
}

export function supplementPositionsFromIndexed(
  snapshot: SourceSnapshot | ZoneSnapshot,
  indexedDots: Map<number, MorphDotState>,
): Map<string, PixelPt> {
  const out = new Map<string, PixelPt>();
  for (const [hostId, pts] of snapshot.splits) {
    pts.forEach((_, i) => {
      const slot = 1_000_000 + hostId * 32 + i;
      const state = indexedDots.get(slot);
      if (state && state.alpha > 0.05) {
        out.set(`${hostId}:${i}`, { x: state.x, y: state.y });
      }
    });
  }
  return out;
}

export function hostPositionsFromIndexed(
  hostRanks: Map<number, number>,
  indexedDots: Map<number, MorphDotState>,
): Map<number, PixelPt> {
  const out = new Map<number, PixelPt>();
  for (const [hostId, slot] of hostRanks) {
    const dot = indexedDots.get(slot);
    if (dot && dot.alpha > 0.05) out.set(hostId, { x: dot.x, y: dot.y });
  }
  return out;
}

export function settledPositions(
  snapshot: ZoneSnapshot,
  w: number,
  h: number,
): Map<number, PixelPt> {
  const out = new Map<number, PixelPt>();
  for (const [id, goal] of snapshot.goals) {
    out.set(id, { x: goal.nx * w, y: goal.ny * h });
  }
  return out;
}

export function splitPositions(
  snapshot: ZoneSnapshot,
  w: number,
  h: number,
): Map<string, PixelPt> {
  const out = new Map<string, PixelPt>();
  for (const [hostId, pts] of snapshot.splits) {
    pts.forEach((goal, i) => {
      out.set(`${hostId}:${i}`, { x: goal.nx * w, y: goal.ny * h });
    });
  }
  return out;
}

/** @deprecated */
export function computeMorphPositions(
  source: SourceSnapshot,
  target: ZoneSnapshot,
  morphT: number,
  canvasW: number,
  canvasH: number,
): Map<number, PixelPt> {
  const frame = computeIndexedMorph(source, target, morphT, canvasW, canvasH);
  return hostPositionsFromIndexed(frame.hostRanks, frame.dots);
}

/** Zamrożenie pikseli źródła z tego co było na ekranie. */
export function freezeMorphSession(
  source: SourceSnapshot,
  canvasW: number,
  canvasH: number,
): MorphSessionCtx {
  const frozenHostPx = new Map<number, PixelPt>();
  for (const [hostId, norm] of source.goals) {
    frozenHostPx.set(hostId, { x: norm.nx * canvasW, y: norm.ny * canvasH });
  }
  const frozenSplitPx = new Map<string, PixelPt>();
  for (const [hostId, pts] of source.splits) {
    pts.forEach((norm, i) => {
      frozenSplitPx.set(`${hostId}:${i}`, {
        x: norm.nx * canvasW,
        y: norm.ny * canvasH,
      });
    });
  }
  return { startW: canvasW, startH: canvasH, frozenHostPx, frozenSplitPx };
}
