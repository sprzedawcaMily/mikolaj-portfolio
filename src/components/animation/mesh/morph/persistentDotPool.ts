import {
  buildDepartureRanks,
  buildHostMorphPairs,
} from './dotCatalog';
import { dotTravelDuration, travelPt } from './morphPath';
import type { MorphDotState } from './computePositions';
import type { NormPt, PixelPt, SourceSnapshot, ZoneSnapshot } from './types';

type DotLayoutSnapshot = Pick<
  ZoneSnapshot,
  'goals' | 'mappedIds' | 'splits' | 'layoutScale'
>;

export type PoolDot = {
  id: string;
  slot: number;
  hostId: number | null;
  splitKey: string | null;
  el: HTMLSpanElement;
  x: number;
  y: number;
  alpha: number;
  tgtNorm: NormPt | null;
  flightSrc: PixelPt;
  departureRank: number;
  durationSeed: number;
  flightStartMs: number;
  flightSpanMs: number;
  mode: 'travel' | 'exit' | 'spawn' | 'idle';
};

const FLIGHT_BASE_MS = 4500;
const DEPARTURE_STAGGER_MS = 3600;

export type DotPool = {
  dots: Map<string, PoolDot>;
  pairCount: number;
  layoutScale: number;
  sessionW: number;
  sessionH: number;
  bootstrapped: boolean;
};

function splitSlot(hostId: number, idx: number) {
  return 1_000_000 + hostId * 32 + idx;
}

function dotId(hostId: number | null, splitKey: string | null) {
  if (hostId != null) return `h:${hostId}`;
  if (splitKey) return `s:${splitKey}`;
  return 'unknown';
}

function normToPx(norm: NormPt, w: number, h: number): PixelPt {
  return { x: norm.nx * w, y: norm.ny * h };
}

function scalePx(
  px: PixelPt,
  fromW: number,
  fromH: number,
  toW: number,
  toH: number,
): PixelPt {
  return {
    x: fromW > 0 ? px.x * (toW / fromW) : px.x,
    y: fromH > 0 ? px.y * (toH / fromH) : px.y,
  };
}

export function createDotPool(): DotPool {
  return {
    dots: new Map(),
    pairCount: 0,
    layoutScale: 1,
    sessionW: 0,
    sessionH: 0,
    bootstrapped: false,
  };
}

function ensureDot(
  pool: DotPool,
  layer: HTMLElement,
  slot: number,
  hostId: number | null,
  splitKey: string | null,
  dotRadius: number,
): PoolDot {
  const id = dotId(hostId, splitKey);
  let dot = pool.dots.get(id);
  if (dot) return dot;

  const size = dotRadius * 2;
  const el = document.createElement('span');
  el.dataset.dotId = id;
  el.className = 'meshPoolDot';
  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.opacity = '0';
  layer.appendChild(el);

  dot = {
    id,
    slot,
    hostId,
    splitKey,
    el,
    x: 0,
    y: 0,
    alpha: 0,
    tgtNorm: null,
    flightSrc: { x: 0, y: 0 },
    departureRank: 0,
    durationSeed: hostId ?? slot,
    flightStartMs: 0,
    flightSpanMs: 900,
    mode: 'idle',
  };
  pool.dots.set(id, dot);
  return dot;
}

function applyDotToDom(dot: PoolDot, r: number) {
  dot.el.style.opacity = dot.alpha <= 0.03 ? '0' : String(dot.alpha);
  dot.el.style.transform = `translate(${dot.x - r}px, ${dot.y - r}px)`;
}

/** Jednorazowy start — kropki od razu na hero (jedyna inicjalizacja bez lotu). */
export function bootstrapPool(
  pool: DotPool,
  layer: HTMLElement,
  snapshot: DotLayoutSnapshot,
  w: number,
  h: number,
  dotClassName: string,
) {
  if (pool.bootstrapped) return;
  pool.layoutScale = snapshot.layoutScale;
  pool.sessionW = w;
  pool.sessionH = h;
  const r = Math.max(1.4, 4.5 * pool.layoutScale);

  for (const id of snapshot.mappedIds) {
    const norm = snapshot.goals.get(id);
    if (!norm) continue;
    const px = normToPx(norm, w, h);
    const dot = ensureDot(pool, layer, id, id, null, r);
    dot.el.className = dotClassName;
    dot.x = px.x;
    dot.y = px.y;
    dot.flightSrc = { ...px };
    dot.tgtNorm = norm;
    dot.alpha = 0.92;
    dot.mode = 'idle';
    applyDotToDom(dot, r);
  }

  for (const [hostId, pts] of snapshot.splits) {
    pts.forEach((norm, i) => {
      const slot = splitSlot(hostId, i);
      const px = normToPx(norm, w, h);
      const dot = ensureDot(pool, layer, slot, null, `${hostId}:${i}`, r);
      dot.el.className = dotClassName;
      dot.x = px.x;
      dot.y = px.y;
      dot.flightSrc = { ...px };
      dot.tgtNorm = norm;
      dot.alpha = 0.92;
      dot.mode = 'idle';
      applyDotToDom(dot, r);
    });
  }

  pool.bootstrapped = true;
  pool.pairCount = pool.dots.size;
}

/**
 * Nowe cele — src zawsze z bieżącej pozycji kropki (zero teleportu).
 */
function flightTiming(rank: number, pairCount: number, seed: number, nowMs: number) {
  const departMs = (rank / Math.max(pairCount - 1, 1)) * DEPARTURE_STAGGER_MS;
  const spanMs = dotTravelDuration(seed) * FLIGHT_BASE_MS;
  return { flightStartMs: nowMs + departMs, flightSpanMs: spanMs };
}

export function assignFlightTargets(
  pool: DotPool,
  layer: HTMLElement,
  dotClassName: string,
  source: SourceSnapshot,
  target: ZoneSnapshot,
  w: number,
  h: number,
  nowMs: number,
) {
  const pairs = buildHostMorphPairs(source, target);
  const ranks = buildDepartureRanks(pairs);
  pool.sessionW = w;
  pool.sessionH = h;
  pool.layoutScale = target.layoutScale;
  pool.pairCount = pairs.length;

  const activeIds = new Set<string>();

  for (const pair of pairs) {
    const id = dotId(pair.hostId, pair.splitKey);
    activeIds.add(id);
    const rank = ranks.get(pair.slot) ?? 0;
    const seed = pair.hostId ?? pair.slot;
    const r = Math.max(1.4, 4.5 * pool.layoutScale);

    const timing = flightTiming(rank, pairs.length, seed, nowMs);

    if (pair.src && pair.tgt) {
      const dot = ensureDot(pool, layer, pair.slot, pair.hostId, pair.splitKey, r);
      dot.el.className = dotClassName;
      dot.flightSrc = { x: dot.x, y: dot.y };
      dot.tgtNorm = pair.tgt;
      dot.departureRank = rank;
      dot.durationSeed = seed;
      dot.flightStartMs = timing.flightStartMs;
      dot.flightSpanMs = timing.flightSpanMs;
      dot.mode = 'travel';
      dot.alpha = 0.92;
    } else if (pair.src && !pair.tgt) {
      const dot = ensureDot(pool, layer, pair.slot, pair.hostId, pair.splitKey, r);
      dot.el.className = dotClassName;
      dot.flightSrc = { x: dot.x, y: dot.y };
      dot.tgtNorm = { nx: dot.x / w, ny: (dot.y - 40) / h };
      dot.departureRank = rank;
      dot.durationSeed = seed;
      dot.flightStartMs = timing.flightStartMs;
      dot.flightSpanMs = timing.flightSpanMs;
      dot.mode = 'exit';
      dot.alpha = 0.92;
    } else if (!pair.src && pair.tgt) {
      const dot = ensureDot(pool, layer, pair.slot, pair.hostId, pair.splitKey, r);
      dot.el.className = dotClassName;
      dot.flightSrc = { x: dot.x, y: dot.y };
      dot.tgtNorm = pair.tgt;
      dot.departureRank = rank;
      dot.durationSeed = seed;
      dot.flightStartMs = timing.flightStartMs;
      dot.flightSpanMs = timing.flightSpanMs;
      dot.mode = 'spawn';
      dot.alpha = dot.alpha > 0.03 ? dot.alpha : 0;
    }
  }

  for (const [id, dot] of pool.dots) {
    if (!activeIds.has(id)) {
      dot.mode = 'idle';
      dot.tgtNorm = { nx: dot.x / w, ny: dot.y / h };
    }
  }
}

function travelUForDot(dot: PoolDot, nowMs: number) {
  if (dot.mode === 'idle') return 1;
  const elapsed = nowMs - dot.flightStartMs;
  if (elapsed <= 0) return 0;
  return Math.min(1, elapsed / Math.max(dot.flightSpanMs, 1));
}

export function poolFlightActive(pool: DotPool, nowMs: number) {
  for (const dot of pool.dots.values()) {
    if (dot.mode === 'idle') continue;
    if (travelUForDot(dot, nowMs) < 1) return true;
  }
  return false;
}

export type PoolTickResult = {
  dots: Map<number, MorphDotState>;
  hostRanks: Map<number, number>;
  positions: Map<number, PixelPt>;
  splitDots: Map<string, PixelPt>;
  hostSettle: Map<number, number>;
};

export function tickDotPool(
  pool: DotPool,
  nowMs: number,
  w: number,
  h: number,
): PoolTickResult {
  const indexed = new Map<number, MorphDotState>();
  const positions = new Map<number, PixelPt>();
  const splitDots = new Map<string, PixelPt>();
  const hostRanks = new Map<number, number>();
  const hostSettle = new Map<number, number>();
  const r = Math.max(1.4, 4.5 * pool.layoutScale);

  for (const dot of pool.dots.values()) {
    if (dot.mode === 'idle' && dot.tgtNorm) {
      const px = normToPx(dot.tgtNorm, w, h);
      dot.x = px.x;
      dot.y = px.y;
      applyDotToDom(dot, r);
      if (dot.hostId != null && dot.alpha > 0.03) {
        positions.set(dot.hostId, { x: dot.x, y: dot.y });
        hostRanks.set(dot.hostId, dot.slot);
        hostSettle.set(dot.hostId, 1);
        indexed.set(dot.slot, { x: dot.x, y: dot.y, alpha: dot.alpha, scale: 1, settle: 1 });
      } else if (dot.splitKey && dot.alpha > 0.03) {
        splitDots.set(dot.splitKey, { x: dot.x, y: dot.y });
        indexed.set(dot.slot, { x: dot.x, y: dot.y, alpha: dot.alpha, scale: 1, settle: 1 });
      }
      continue;
    }

    const travelU = travelUForDot(dot, nowMs);

    const srcPx = scalePx(dot.flightSrc, pool.sessionW, pool.sessionH, w, h);
    const tgtPx = dot.tgtNorm ? normToPx(dot.tgtNorm, w, h) : srcPx;

    if (dot.mode === 'travel') {
      if (travelU <= 0) {
        dot.el.style.opacity = '0';
        continue;
      }
      const pos = travelU >= 1 ? tgtPx : travelPt(srcPx, tgtPx, travelU);
      dot.x = pos.x;
      dot.y = pos.y;
      dot.alpha = 0.92;
      const settle = travelU >= 1 ? 1 : travelU;
      applyDotToDom(dot, r);
      indexed.set(dot.slot, { x: pos.x, y: pos.y, alpha: dot.alpha, scale: 1, settle });
      if (dot.hostId != null) {
        positions.set(dot.hostId, pos);
        hostRanks.set(dot.hostId, dot.slot);
        hostSettle.set(dot.hostId, settle);
      } else if (dot.splitKey) {
        splitDots.set(dot.splitKey, pos);
      }
    } else if (dot.mode === 'exit') {
      if (travelU <= 0) {
        dot.el.style.opacity = '0';
      } else {
        const pos = travelPt(srcPx, tgtPx, Math.min(1, travelU));
        dot.x = pos.x;
        dot.y = pos.y;
        dot.alpha = 0.92 * (1 - travelU);
        applyDotToDom(dot, r);
        if (dot.alpha <= 0.03) dot.mode = 'idle';
      }
    } else if (dot.mode === 'spawn') {
      if (travelU <= 0) continue;
      const pos = travelU >= 1 ? tgtPx : travelPt(srcPx, tgtPx, travelU);
      dot.x = pos.x;
      dot.y = pos.y;
      dot.alpha = 0.92;
      const settle = travelU >= 1 ? 1 : travelU;
      applyDotToDom(dot, r);
      indexed.set(dot.slot, { x: pos.x, y: pos.y, alpha: dot.alpha, scale: 1, settle });
      if (dot.hostId != null) {
        positions.set(dot.hostId, pos);
        hostRanks.set(dot.hostId, dot.slot);
        hostSettle.set(dot.hostId, settle);
      } else if (dot.splitKey) {
        splitDots.set(dot.splitKey, pos);
      }
      if (travelU >= 1) dot.mode = 'idle';
    }
  }

  for (const dot of pool.dots.values()) {
    if (dot.mode !== 'idle' && travelUForDot(dot, nowMs) >= 1) {
      dot.mode = 'idle';
    }
  }

  return { dots: indexed, hostRanks, positions, splitDots, hostSettle };
}
