import type { MeshZone } from '@/hooks/meshScrollEngine';
import {
  neonHairColor,
  type FaceMesh,
  type HairStyle,
} from '@/components/animation/mesh/faceMesh';
import { clamp01 } from '@/components/animation/mesh/svgMesh';
import {
  edgeSettleAlpha,
  edgeWithinCanvas,
} from './morphPath';
import type { MorphEdge, NormPt, PixelPt, SourceSnapshot, ZoneSnapshot } from './types';
import type { MorphDotState } from './computePositions';

const HAIR_FADE_END = 0.3;


function hairAlpha(morphT: number, goalZone: MeshZone, heroLive: boolean) {
  if (goalZone !== 'hero') return 0;
  if (heroLive) return 1;
  return clamp01(morphT / HAIR_FADE_END);
}

function filterEdges(edges: MorphEdge[], allowed: Set<number>) {
  return edges.filter((e) => allowed.has(e.a) && allowed.has(e.b));
}

function partitionHairEdges(edges: MorphEdge[]) {
  const hair: MorphEdge[] = [];
  const body: MorphEdge[] = [];
  for (const edge of edges) {
    if (edge.group === 'hair') hair.push(edge);
    else body.push(edge);
  }
  return { hair, body };
}

function drawEdges(
  ctx: CanvasRenderingContext2D,
  edges: MorphEdge[],
  positions: Map<number, PixelPt>,
  alpha: number,
  w: number,
  h: number,
  allowed: Set<number>,
  now: number,
  hairStyle: HairStyle,
  neonHair: boolean,
  morphT: number,
  goalZone: MeshZone,
  heroLive: boolean,
  maxLenRatio = 0.36,
  hostSettle?: Map<number, number>,
) {
  if (alpha <= 0.02) return;

  for (const edge of edges) {
    if (!allowed.has(edge.a) || !allowed.has(edge.b)) continue;
    const a = positions.get(edge.a);
    const b = positions.get(edge.b);
    if (!a || !b) continue;
    if (!edgeWithinCanvas(a, b, w, h, maxLenRatio)) continue;

    const isHair = edge.group === 'hair';
    if (isHair && !heroLive && hairAlpha(morphT, goalZone, heroLive) < 0.04) continue;

    let edgeAlpha = alpha;
    if (hostSettle) {
      const sa = hostSettle.get(edge.a) ?? 0;
      const sb = hostSettle.get(edge.b) ?? 0;
      edgeAlpha = edgeSettleAlpha(sa, sb, alpha);
    }
    if (edgeAlpha <= 0.02) continue;

    ctx.globalAlpha = edgeAlpha * (isHair && !heroLive ? hairAlpha(morphT, goalZone, heroLive) : 1);
    ctx.strokeStyle = neonHair && isHair
      ? neonHairColor(now, hairStyle, 0.95, 0)
      : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
}

function drawSplitBridgeEdges(
  ctx: CanvasRenderingContext2D,
  snapshot: { splits: Map<number, NormPt[]> },
  hostPositions: Map<number, PixelPt>,
  splitDots: Map<string, PixelPt>,
  alpha: number,
  w: number,
  h: number,
) {
  if (alpha <= 0.02 || snapshot.splits.size === 0) return;

  for (const [hostId, pts] of snapshot.splits) {
    const host = hostPositions.get(hostId);
    if (!host) continue;
    pts.forEach((_, i) => {
      const split = splitDots.get(`${hostId}:${i}`);
      if (!split) return;
      if (!edgeWithinCanvas(host, split, w, h, 0.55)) return;
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(host.x, host.y);
      ctx.lineTo(split.x, split.y);
      ctx.stroke();
    });
  }
}

export type PaintInput = {
  ctx: CanvasRenderingContext2D;
  w: number;
  h: number;
  now: number;
  morphT: number;
  goalZone: MeshZone;
  heroIdle: boolean;
  faceMesh: FaceMesh;
  hairStyle: HairStyle;
  positions: Map<number, PixelPt>;
  splitDots: Map<string, PixelPt>;
  sourcePositions?: Map<number, PixelPt>;
  sourceSplitDots?: Map<string, PixelPt>;
  indexedDots?: Map<number, MorphDotState>;
  hostSettle?: Map<number, number>;
  layoutScale: number;
  heroEdges: MorphEdge[];
  source: SourceSnapshot | null;
  target: ZoneSnapshot | null;
  /** Kropki morphu renderowane jako HTML — canvas tylko krawędzie. */
  dotsOnDom?: boolean;
};

export function paintMorphFrame(input: PaintInput) {
  const {
    ctx,
    w,
    h,
    now,
    morphT,
    goalZone,
    heroIdle,
    faceMesh,
    hairStyle,
    positions,
    splitDots,
    sourcePositions: _sourcePositions,
    sourceSplitDots: _sourceSplitDots,
    indexedDots,
    hostSettle,
    layoutScale,
    heroEdges,
    source,
    target,
    dotsOnDom = false,
  } = input;

  const heroLive = heroIdle;

  ctx.clearRect(0, 0, w, h);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.75;

  const allowed = heroLive
    ? new Set(faceMesh.visibleNodeIds)
    : target?.mappedIds ?? new Set<number>();

  const morphing = Boolean(source && target && !heroLive && indexedDots && indexedDots.size > 0);

  if (heroIdle) {
    drawEdges(
      ctx, heroEdges, positions, 1, w, h, allowed,
      now, hairStyle, true, morphT, goalZone, true,
    );
  } else if (morphing) {
    const hostAllowed = new Set(positions.keys());
    const lenCap = 0.72;
    const edgeAlpha = 0.86;

    // Tylko krawędzie celu — gdy obie kropki dotarły (settle ≥ 0.98). Bez siatki źródła.
    const tgtParts = partitionHairEdges(filterEdges(target!.edges, hostAllowed));
    drawEdges(
      ctx, tgtParts.body, positions, edgeAlpha, w, h, hostAllowed,
      now, hairStyle, false, morphT, goalZone, false, lenCap, hostSettle,
    );
    if (goalZone === 'hero') {
      drawEdges(
        ctx, tgtParts.hair, positions, edgeAlpha, w, h, hostAllowed,
        now, hairStyle, true, morphT, goalZone, true, lenCap, hostSettle,
      );
    } else {
      drawEdges(
        ctx, tgtParts.hair, positions, edgeAlpha, w, h, hostAllowed,
        now, hairStyle, false, morphT, goalZone, false, lenCap, hostSettle,
      );
    }
    drawEdges(
      ctx, filterEdges(target!.supplementHostEdges, hostAllowed), positions, edgeAlpha * 0.9, w, h, hostAllowed,
      now, hairStyle, false, morphT, goalZone, false, lenCap, hostSettle,
    );
    if (splitDots.size > 0) {
      drawSplitBridgeEdges(ctx, target!, positions, splitDots, edgeAlpha * 0.85, w, h);
    }
  } else if (target) {
    const iconLen = 0.72;
    drawEdges(
      ctx, filterEdges(target.edges, allowed), positions, 0.88, w, h, allowed,
      now, hairStyle, false, morphT, goalZone, false, iconLen,
    );
    drawEdges(
      ctx, filterEdges(target.supplementHostEdges, allowed), positions, 0.88, w, h, allowed,
      now, hairStyle, false, morphT, goalZone, false, iconLen,
    );
    drawSplitBridgeEdges(
      ctx, target, positions, splitDots, 0.88, w, h,
    );
  }

  const scale = layoutScale;
  const dotRBase = Math.max(1.6, 4.5 * scale);

  if (!dotsOnDom && morphing && indexedDots) {
    for (const [, dot] of indexedDots) {
      if (dot.alpha <= 0.03) continue;
      if (dot.x < -4 || dot.x > w + 4 || dot.y < -4 || dot.y > h + 4) continue;
      const r = Math.max(1.4, dotRBase * dot.scale);
      ctx.fillStyle = '#d9d9d9';
      ctx.globalAlpha = dot.alpha;
      ctx.beginPath();
      ctx.arc(dot.x, dot.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (!dotsOnDom) {
    for (const id of allowed) {
      const node = faceMesh.nodes[id];
      const pt = positions.get(id);
      if (!node || !pt) continue;

      const isHair = node.group === 'hair';
      if (isHair && !heroLive) {
        if (goalZone !== 'hero') continue;
        const alpha = hairAlpha(morphT, goalZone, heroLive);
        if (alpha < 0.04) continue;
        ctx.globalAlpha = alpha;
      } else {
        ctx.globalAlpha = 1;
      }

      const r = Math.max(1.6, (node.r ?? 4.5) * scale);
      ctx.fillStyle = heroIdle && isHair
        ? neonHairColor(now, hairStyle, 0.98, 0)
        : '#d9d9d9';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const [, pt] of splitDots) {
      if (pt.x < -4 || pt.x > w + 4 || pt.y < -4 || pt.y > h + 4) continue;
      ctx.globalAlpha = 1;
      ctx.fillStyle = '#d9d9d9';
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, dotRBase, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}
