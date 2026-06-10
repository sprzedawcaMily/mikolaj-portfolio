import { clamp01, easeSmoothStep, layoutMeshOnCanvas, type SvgMesh } from '@/components/animation/mesh/svgMesh';

/** Te same progi co twarz → strzałka w AnimatedNeonPortrait. */
export const MORPH_WIRE_TARGET_START = 0.12;
export const MORPH_WIRE_SOURCE_FADE_END = 0.26;
export const MORPH_ACTIVE = 0.001;

export interface Point2 {
  x: number;
  y: number;
}

export type MorphReflector = {
  targetId: number;
  hostId: number;
  x: number;
  y: number;
  r: number;
  phase: number;
};

export interface PrimaryMorphMaps {
  cluster: Point2;
  sources: Map<number, Point2>;
  targets: Map<number, Point2>;
  mappedPrimary: Set<number>;
  mergeTarget: Map<number, number>;
  targetEdges: { a: number; b: number }[];
  accentTargets: Map<number, Point2>;
  accentNodeIds: Set<number>;
  /** Czerwone kropki SVG → reflektory (pozycja docelowa + host do kreski). */
  reflectors: MorphReflector[];
  layoutScale: number;
  targetLayoutScale: number;
  /** Węzły autobusu bez pary w strzałce (np. dach) — canvas coords. */
  supplementNodes: Map<number, Point2>;
  /** Krawędzie autobusu z udziałem supplementNodes (bus node ids). */
  supplementEdges: { a: number; b: number }[];
  targetToPrimary: Map<number, number>;
}

export interface BuildPrimaryMorphOptions {
  layoutFit?: number;
  centerRatioY?: number;
  targetLayoutFit?: number;
  targetCenterRatioY?: number;
  mapSourcePoint?: (x: number, y: number, mesh: SvgMesh) => Point2;
  mapTargetPoint?: (x: number, y: number, mesh: SvgMesh) => Point2;
}

function bodyNodeIds(mesh: SvgMesh) {
  return [...mesh.visibleNodeIds].filter((id) => mesh.nodes[id]?.group === 'body');
}

function meshCenter(mesh: SvgMesh, ratioY = 0.52) {
  return { x: mesh.width / 2, y: mesh.height * ratioY };
}

/** Stała kolejność primary w każdej strefie — te same hostId budują bus i widelec. */
function sortBodyNodesStable(mesh: SvgMesh, ids: number[], center: Point2) {
  return [...ids].sort((a, b) => {
    const na = mesh.nodes[a];
    const nb = mesh.nodes[b];
    if (!na || !nb) return a - b;
    const aa = Math.atan2(na.y - center.y, na.x - center.x);
    const ab = Math.atan2(nb.y - center.y, nb.x - center.x);
    if (Math.abs(aa - ab) > 1e-9) return aa - ab;
    return a - b;
  });
}

/** Bijection: iteracja po primary (jak twarz), dopasowanie target. */
export function buildPrimaryTargetBijection(
  primaryMesh: SvgMesh,
  targetMesh: SvgMesh,
  sortedPrimary: number[],
  sortedTarget: number[],
  targetCenter: Point2,
  mapPrimaryPoint?: (x: number, y: number, mesh: SvgMesh) => Point2,
) {
  const primaryToTarget = new Map<number, number>();
  const usedTarget = new Set<number>();

  for (const primaryId of sortedPrimary) {
    const primaryNode = primaryMesh.nodes[primaryId];
    const mapped = mapPrimaryPoint
      ? mapPrimaryPoint(primaryNode.x, primaryNode.y, primaryMesh)
      : { x: primaryNode.x, y: primaryNode.y };
    const px = (mapped.x - targetCenter.x) / targetMesh.width;
    const py = (mapped.y - targetCenter.y) / targetMesh.height;

    let bestTarget = -1;
    let bestScore = Infinity;

    for (const targetId of sortedTarget) {
      if (usedTarget.has(targetId)) continue;
      const targetNode = targetMesh.nodes[targetId];
      const tx = (targetNode.x - targetCenter.x) / targetMesh.width;
      const ty = (targetNode.y - targetCenter.y) / targetMesh.height;
      const score = Math.hypot(px - tx, py - ty);
      if (score < bestScore) {
        bestScore = score;
        bestTarget = targetId;
      }
    }

    if (bestTarget >= 0) {
      usedTarget.add(bestTarget);
      primaryToTarget.set(primaryId, bestTarget);
    }
  }

  return primaryToTarget;
}

/** Primary mesh = źródło kropek (strzałka / twarz). Target = kształt docelowy. */
export function buildPrimaryMorphMaps(
  primaryMesh: SvgMesh,
  targetMesh: SvgMesh,
  canvasWidth: number,
  canvasHeight: number,
  options: BuildPrimaryMorphOptions = {},
): PrimaryMorphMaps {
  const layoutFit = options.layoutFit ?? 0.86;
  const centerRatioY = options.centerRatioY ?? 0.52;
  const targetLayoutFit = options.targetLayoutFit ?? layoutFit;
  const targetCenterRatioY = options.targetCenterRatioY ?? centerRatioY;
  const mapSource = options.mapSourcePoint;

  const primaryLayout = layoutMeshOnCanvas(primaryMesh, canvasWidth, canvasHeight, layoutFit);
  const targetLayout = layoutMeshOnCanvas(
    targetMesh,
    canvasWidth,
    canvasHeight,
    targetLayoutFit,
  );

  const primaryCenter = meshCenter(primaryMesh, centerRatioY);
  const targetCenter = meshCenter(targetMesh, targetCenterRatioY);

  const sortedPrimary = sortBodyNodesStable(
    primaryMesh,
    bodyNodeIds(primaryMesh),
    primaryCenter,
  );

  const sortedTarget = sortBodyNodesStable(
    targetMesh,
    bodyNodeIds(targetMesh),
    targetCenter,
  );

  const primaryToTarget = buildPrimaryTargetBijection(
    primaryMesh,
    targetMesh,
    sortedPrimary,
    sortedTarget,
    targetCenter,
    mapSource,
  );

  const targetToPrimary = new Map<number, number>();
  for (const [primaryId, targetId] of primaryToTarget) {
    targetToPrimary.set(targetId, primaryId);
  }

  const mappedPrimary = new Set<number>(primaryToTarget.keys());

  const sources = new Map<number, Point2>();
  for (const primaryId of primaryMesh.visibleNodeIds) {
    const node = primaryMesh.nodes[primaryId];
    if (!node) continue;
    sources.set(primaryId, {
      x: primaryLayout.offsetX + node.x * primaryLayout.scale,
      y: primaryLayout.offsetY + node.y * primaryLayout.scale,
    });
  }

  const targetByTargetId = new Map<number, Point2>();
  for (const targetId of targetMesh.visibleNodeIds) {
    const node = targetMesh.nodes[targetId];
    if (!node) continue;
    targetByTargetId.set(targetId, {
      x: targetLayout.offsetX + node.x * targetLayout.scale,
      y: targetLayout.offsetY + node.y * targetLayout.scale,
    });
  }

  const cluster = { x: canvasWidth * 0.5, y: canvasHeight * 0.48 };

  const targets = new Map<number, Point2>();
  for (const [primaryId, targetId] of primaryToTarget) {
    const point = targetByTargetId.get(targetId);
    if (point) targets.set(primaryId, { ...point });
  }

  const mergeTarget = new Map<number, number>();
  const mergeLeaderTaken = new Set<number>();
  const mergeCandidates: { memberId: number; leaderId: number; dist: number }[] = [];

  for (const primaryId of sortedPrimary) {
    if (mappedPrimary.has(primaryId)) continue;
    const node = primaryMesh.nodes[primaryId];
    if (!node) continue;
    let bestMapped = -1;
    let bestDist = Infinity;
    for (const mappedId of mappedPrimary) {
      const mappedNode = primaryMesh.nodes[mappedId];
      if (!mappedNode) continue;
      const dist = Math.hypot(node.x - mappedNode.x, node.y - mappedNode.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestMapped = mappedId;
      }
    }
    if (bestMapped >= 0) {
      mergeCandidates.push({ memberId: primaryId, leaderId: bestMapped, dist: bestDist });
    }
  }

  mergeCandidates.sort((a, b) => a.dist - b.dist);
  for (const { memberId, leaderId } of mergeCandidates) {
    if (mergeLeaderTaken.has(leaderId) || mergeTarget.has(memberId)) continue;
    mergeTarget.set(memberId, leaderId);
    mergeLeaderTaken.add(leaderId);
  }

  for (const primaryId of primaryMesh.visibleNodeIds) {
    if (targets.has(primaryId)) continue;
    const mergeId = mergeTarget.get(primaryId);
    const mergePoint = mergeId != null ? targets.get(mergeId) : null;
    targets.set(primaryId, mergePoint ? { ...mergePoint } : { ...cluster });
  }

  const targetEdges: { a: number; b: number }[] = [];
  for (const edge of targetMesh.edges) {
    const primaryA = targetToPrimary.get(edge.a);
    const primaryB = targetToPrimary.get(edge.b);
    if (primaryA == null || primaryB == null || primaryA === primaryB) continue;
    targetEdges.push({ a: primaryA, b: primaryB });
  }

  const accentTargets = new Map<number, Point2>();
  const accentNodeIds = new Set<number>();
  const reflectors: MorphReflector[] = [];
  for (const targetId of targetMesh.visibleNodeIds) {
    const node = targetMesh.nodes[targetId];
    if (!node || node.group !== 'light') continue;
    const lightPos = targetByTargetId.get(targetId);
    if (!lightPos) continue;

    let bestPrimary = -1;
    let bestDist = Infinity;
    for (const [primaryId, bodyTarget] of targets) {
      const dist = Math.hypot(lightPos.x - bodyTarget.x, lightPos.y - bodyTarget.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestPrimary = primaryId;
      }
    }

    if (bestPrimary >= 0) {
      accentNodeIds.add(bestPrimary);
      accentTargets.set(bestPrimary, { ...lightPos });
      reflectors.push({
        targetId,
        hostId: bestPrimary,
        x: lightPos.x,
        y: lightPos.y,
        r: node.r * targetLayout.scale,
        phase: node.phase,
      });
    }
  }

  const supplementNodes = new Map<number, Point2>();
  for (const targetId of bodyNodeIds(targetMesh)) {
    if (targetToPrimary.has(targetId)) continue;
    const point = targetByTargetId.get(targetId);
    if (point) supplementNodes.set(targetId, { ...point });
  }

  const supplementEdges: { a: number; b: number }[] = [];
  for (const edge of targetMesh.edges) {
    if (edge.group !== 'body') continue;
    if (!supplementNodes.has(edge.a) && !supplementNodes.has(edge.b)) continue;
    if (!targetByTargetId.has(edge.a) || !targetByTargetId.has(edge.b)) continue;
    supplementEdges.push({ a: edge.a, b: edge.b });
  }

  return {
    cluster,
    sources,
    targets,
    mappedPrimary,
    mergeTarget,
    targetEdges,
    accentTargets,
    accentNodeIds,
    reflectors,
    layoutScale: primaryLayout.scale,
    targetLayoutScale: targetLayout.scale,
    supplementNodes,
    supplementEdges,
    targetToPrimary,
  };
}

export function sourceWireVisibility(morph: number) {
  if (morph <= MORPH_ACTIVE) return 1;
  if (morph >= 0.16) return 0;
  return 1 - easeSmoothStep(clamp01(morph / 0.16));
}

export function targetWireVisibility(morph: number) {
  if (morph <= 0.14) return 0;
  if (morph >= MORPH_WIRE_SOURCE_FADE_END) return 1;
  return easeSmoothStep(clamp01((morph - 0.14) / (MORPH_WIRE_SOURCE_FADE_END - 0.14)));
}

/** Jak applyArrowMorph — liniowy lerp, te same kropki. */
export function projectPrimaryMorphPoint(
  primaryId: number,
  morph: number,
  maps: PrimaryMorphMaps,
  fallback: Point2,
) {
  const source = maps.sources.get(primaryId) ?? fallback;
  const t = clamp01(morph);

  if (t <= 0.001) return { x: source.x, y: source.y };

  let target = maps.targets.get(primaryId) ?? source;

  if (maps.accentNodeIds.has(primaryId) && morph > 0.78) {
    const light = maps.accentTargets.get(primaryId);
    if (light) {
      const lt = clamp01((morph - 0.78) / 0.22);
      target = {
        x: target.x + (light.x - target.x) * lt,
        y: target.y + (light.y - target.y) * lt,
      };
    }
  }

  return {
    x: source.x + (target.x - source.x) * t,
    y: source.y + (target.y - source.y) * t,
  };
}

export interface PositionedMorphNode {
  id: number;
  px: number;
  py: number;
  pr: number;
  phase: number;
  group: 'body' | 'light';
}

export function buildPrimaryMorphPositions(
  primaryMesh: SvgMesh,
  morph: number,
  maps: PrimaryMorphMaps,
): PositionedMorphNode[] {
  const positions: PositionedMorphNode[] = [];

  for (const id of primaryMesh.visibleNodeIds) {
    const node = primaryMesh.nodes[id];
    if (!node) continue;
    const fallback = maps.sources.get(id) ?? { x: 0, y: 0 };
    const point = projectPrimaryMorphPoint(id, morph, maps, fallback);
    positions[id] = {
      id,
      px: point.x,
      py: point.y,
      pr: Math.max(1.6, node.r * maps.layoutScale),
      phase: node.phase,
      group: node.group,
    };
  }

  return positions;
}

export function drawMorphEdges(
  ctx: CanvasRenderingContext2D,
  edges: { a: number; b: number }[],
  positions: PositionedMorphNode[],
  alpha: number,
) {
  if (alpha <= 0.02 || edges.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = alpha * 0.88;
  ctx.beginPath();

  for (const edge of edges) {
    const a = positions[edge.a];
    const b = positions[edge.b];
    if (!a || !b) continue;
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
  }

  ctx.stroke();
  ctx.restore();
}

export function drawMorphDots(
  ctx: CanvasRenderingContext2D,
  primaryMesh: SvgMesh,
  positions: PositionedMorphNode[],
  skipIds: Set<number>,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const id of primaryMesh.visibleNodeIds) {
    if (skipIds.has(id)) continue;
    const node = positions[id];
    if (!node) continue;

    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(node.px, node.py, node.pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export interface PaintPrimaryMorphFrameOptions {
  accentAlphaForMorph?: (morph: number) => number;
  drawAccent?: (
    ctx: CanvasRenderingContext2D,
    node: PositionedMorphNode,
    alpha: number,
    now: number,
  ) => void;
}

export function paintPrimaryMorphFrame(
  ctx: CanvasRenderingContext2D,
  primaryMesh: SvgMesh,
  maps: PrimaryMorphMaps,
  morph: number,
  now: number,
  options: PaintPrimaryMorphFrameOptions = {},
) {
  const positions = buildPrimaryMorphPositions(primaryMesh, morph, maps);
  const sourceVis = sourceWireVisibility(morph);
  const targetVis = targetWireVisibility(morph);
  const accentAlpha = options.accentAlphaForMorph?.(morph) ?? 0;
  const accentSkip = new Set<number>();

  drawMorphEdges(ctx, primaryMesh.edges, positions, sourceVis);
  drawMorphEdges(ctx, maps.targetEdges, positions, targetVis);

  if (options.drawAccent && accentAlpha > 0.02) {
    for (const id of maps.accentNodeIds) {
      accentSkip.add(id);
      const node = positions[id];
      if (!node) continue;
      options.drawAccent(ctx, node, accentAlpha, now);
    }
  }

  drawMorphDots(ctx, primaryMesh, positions, accentSkip);
}

/** Obrót strzałki pionowej do ramy poziomej autobusu — tylko do mapowania węzłów. */
export function rotateArrowToBusFrame(x: number, y: number, mesh: SvgMesh): Point2 {
  const cx = mesh.width * 0.5;
  const cy = mesh.height * 0.5;
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx + dy, y: cy - dx };
}

/** Obrót autobusu poziomego do ramy pionowej widelca — tylko do mapowania węzłów. */
export function rotateBusToForkFrame(x: number, y: number, mesh: SvgMesh): Point2 {
  const cx = mesh.width * 0.5;
  const cy = mesh.height * 0.44;
  const dx = x - cx;
  const dy = y - cy;
  return { x: cx - dy, y: cy + dx };
}
