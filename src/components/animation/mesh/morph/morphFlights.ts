import {
  buildDepartureRanks,
  buildHostMorphPairs,
  hostRanksFromPairs,
  type HostMorphPair,
} from './dotCatalog';
import { morphDotTravelU, travelPt } from './morphPath';
import type { MorphDotState } from './computePositions';
import type { NormPt, PixelPt, SourceSnapshot, ZoneSnapshot } from './types';

export type MorphDotFlight = {
  id: string;
  slot: number;
  hostId: number | null;
  splitKey: string | null;
  mode: 'travel' | 'exit' | 'spawn';
  src: PixelPt;
  tgtNorm: NormPt;
  departureRank: number;
  durationSeed: number;
};

export type MorphFlightSession = {
  startW: number;
  startH: number;
  pairCount: number;
  flights: MorphDotFlight[];
  pairs: HostMorphPair[];
};

function normToCanvas(norm: NormPt, w: number, h: number): PixelPt {
  return { x: norm.nx * w, y: norm.ny * h };
}

function scalePx(
  px: PixelPt,
  startW: number,
  startH: number,
  w: number,
  h: number,
): PixelPt {
  return {
    x: startW > 0 ? px.x * (w / startW) : px.x,
    y: startH > 0 ? px.y * (h / startH) : px.y,
  };
}

function flightId(pair: { hostId: number | null; splitKey: string | null }) {
  if (pair.hostId != null) return `h:${pair.hostId}`;
  if (pair.splitKey) return `s:${pair.splitKey}`;
  return 'unknown';
}

export function buildMorphFlights(
  source: SourceSnapshot,
  target: ZoneSnapshot,
  canvasW: number,
  canvasH: number,
): MorphFlightSession {
  const pairs = buildHostMorphPairs(source, target);
  const departureRanks = buildDepartureRanks(pairs);
  const flights: MorphDotFlight[] = [];

  for (const pair of pairs) {
    const rank = departureRanks.get(pair.slot) ?? 0;
    const seed = pair.hostId ?? pair.slot;
    const id = flightId(pair);

    if (pair.src && pair.tgt) {
      flights.push({
        id,
        slot: pair.slot,
        hostId: pair.hostId,
        splitKey: pair.splitKey,
        mode: 'travel',
        src: normToCanvas(pair.src, canvasW, canvasH),
        tgtNorm: pair.tgt,
        departureRank: rank,
        durationSeed: seed,
      });
    } else if (pair.src && !pair.tgt) {
      const src = normToCanvas(pair.src, canvasW, canvasH);
      flights.push({
        id,
        slot: pair.slot,
        hostId: pair.hostId,
        splitKey: pair.splitKey,
        mode: 'exit',
        src,
        tgtNorm: { nx: src.x / canvasW, ny: (src.y - 40) / canvasH },
        departureRank: rank,
        durationSeed: seed,
      });
    } else if (!pair.src && pair.tgt) {
      const tgt = pair.tgt;
      flights.push({
        id,
        slot: pair.slot,
        hostId: pair.hostId,
        splitKey: pair.splitKey,
        mode: 'spawn',
        src: normToCanvas(
          { nx: tgt.nx + (tgt.nx - 0.5) * 0.1, ny: tgt.ny + (tgt.ny - 0.48) * 0.1 },
          canvasW,
          canvasH,
        ),
        tgtNorm: tgt,
        departureRank: rank,
        durationSeed: seed,
      });
    }
  }

  return {
    startW: canvasW,
    startH: canvasH,
    pairCount: flights.length,
    flights,
    pairs,
  };
}

const DOT_ALPHA = 0.92;
const SOURCE_HOLD_T = 0.05;

export type MorphTickResult = {
  dots: Map<number, MorphDotState>;
  hostRanks: Map<number, number>;
  sourceHostRanks: Map<number, number>;
};

export function tickMorphFlights(
  session: MorphFlightSession,
  morphT: number,
  canvasW: number,
  canvasH: number,
): MorphTickResult {
  const dots = new Map<number, MorphDotState>();

  for (const flight of session.flights) {
    const travelU = morphDotTravelU(
      morphT,
      flight.departureRank,
      session.pairCount,
      flight.durationSeed,
    );

    const srcPx = scalePx(flight.src, session.startW, session.startH, canvasW, canvasH);
    const tgtPx = normToCanvas(flight.tgtNorm, canvasW, canvasH);

    if (flight.mode === 'travel') {
      if (travelU <= 0 && morphT > SOURCE_HOLD_T) continue;
      const pos = travelU >= 1 ? tgtPx : travelPt(srcPx, tgtPx, travelU);
      dots.set(flight.slot, {
        x: pos.x,
        y: pos.y,
        alpha: DOT_ALPHA,
        scale: 1,
        settle: travelU >= 1 ? 1 : travelU,
      });
    } else if (flight.mode === 'exit') {
      if (travelU <= 0) {
        if (morphT <= SOURCE_HOLD_T) {
          dots.set(flight.slot, {
            x: srcPx.x,
            y: srcPx.y,
            alpha: DOT_ALPHA,
            scale: 1,
            settle: 0,
          });
        }
      } else {
        const pos = travelPt(srcPx, tgtPx, Math.min(1, travelU));
        const alpha = DOT_ALPHA * (1 - travelU);
        if (alpha > 0.02) {
          dots.set(flight.slot, {
            x: pos.x,
            y: pos.y,
            alpha,
            scale: 1,
            settle: travelU,
          });
        }
      }
    } else if (flight.mode === 'spawn') {
      if (travelU <= 0) continue;
      const pos = travelU >= 1 ? tgtPx : travelPt(srcPx, tgtPx, travelU);
      dots.set(flight.slot, {
        x: pos.x,
        y: pos.y,
        alpha: DOT_ALPHA,
        scale: 1,
        settle: travelU >= 1 ? 1 : travelU,
      });
    }
  }

  return {
    dots,
    hostRanks: hostRanksFromPairs(session.pairs, 'tgt'),
    sourceHostRanks: hostRanksFromPairs(session.pairs, 'src'),
  };
}
