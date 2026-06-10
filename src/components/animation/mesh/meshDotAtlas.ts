import type { MeshZone } from '@/hooks/meshScrollEngine';
import {
  buildPrimaryMorphMaps,
  rotateArrowToBusFrame,
  rotateBusToForkFrame,
  type Point2,
} from '@/components/animation/mesh/primaryMeshMorphSystem';
import type { SvgMesh } from '@/components/animation/mesh/svgMesh';
import type { FaceMesh } from '@/components/animation/mesh/faceMesh';
import { layoutFaceOnCanvas } from '@/components/animation/mesh/faceMesh';

export type NormGoal = { nx: number; ny: number };

export type MeshReflector = {
  targetId: number;
  hostId: number;
  nx: number;
  ny: number;
  r: number;
  phase: number;
};

export interface ZoneLayout {
  positions: Map<number, Point2>;
  edges: { a: number; b: number }[];
  /** Krawędzie autobusu łączące hosty przez supplement — rysować dopiero po rozjechaniu splitów. */
  supplementHostEdges: { a: number; b: number }[];
  /** Czerwone reflektory SVG — osobne cele lotu. */
  reflectors: MeshReflector[];
  /** hostId → reflector targetId (kreska przyłączenia). */
  reflectorEdges: { a: number; b: number }[];
  layoutScale: number;
  /** Kropki z bezpośrednim mapowaniem na kształt strefy (nie cluster / merge). */
  mappedIds: Set<number>;
  /** Host primary → dodatkowe cele (1 kropka rozpada się na kilka). */
  splits: Map<number, NormGoal[]>;
  /** Członek grupy → lider (kilka kropek łączy się w jedną). */
  mergeMembers: Map<number, number>;
}

export interface DotAtlas {
  masterIds: number[];
  zones: Partial<Record<MeshZone, ZoneLayout>>;
  cluster: Point2;
}

const ARROW_LAYOUT_FIT = 0.72;
export const PALETTE_ARROW_BASE_GAP = 38;
/** Odstęp czubka od środka kółka pickera (0 = w środek). */
const ARROW_DOT_GAP = 0;
const ARROW_MAX_LEAN_RAD = (76 * Math.PI) / 180;
/** Domykanie celu po obrocie — na skrajach głównie większy kąt, mało przesuwu w bok. */
const ARROW_AIM_BLEND_MIN_X = 0.22;
const ARROW_AIM_BLEND_MAX_X = 0.36;
const ARROW_AIM_BLEND_MIN_Y = 0.12;
const ARROW_AIM_BLEND_MAX_Y = 0.42;
const ARROW_AIM_LATERAL_FULL_BLEND_PX = 120;
const ARROW_AIM_VERTICAL_FULL_BLEND_PX = 80;

const palettePaddedLayoutCache = new Map<string, ZoneLayout>();

export function clearPaletteLayoutCache() {
  palettePaddedLayoutCache.clear();
}

function cloneZoneLayout(src: ZoneLayout): ZoneLayout {
  const positions = new Map<number, Point2>();
  for (const [id, p] of src.positions) positions.set(id, { x: p.x, y: p.y });
  return {
    positions,
    edges: src.edges,
    supplementHostEdges: src.supplementHostEdges,
    reflectors: src.reflectors.map((r) => ({ ...r })),
    reflectorEdges: src.reflectorEdges.map((e) => ({ ...e })),
    layoutScale: src.layoutScale,
    mappedIds: new Set(src.mappedIds),
    splits: new Map(src.splits),
    mergeMembers: new Map(src.mergeMembers),
  };
}

export function faceMeshToSvgMesh(face: FaceMesh): SvgMesh {
  const nodes = face.nodes.map((node) => ({
    ...node,
    group: node.group === 'face' ? ('body' as const) : ('light' as const),
  }));
  const edges = face.edges.map((edge) => ({
    ...edge,
    group: edge.group === 'face' ? ('body' as const) : ('light' as const),
  }));
  return {
    width: face.width,
    height: face.height,
    nodes,
    edges,
    visibleNodeIds: face.visibleNodeIds,
  };
}

function hostForPoint(
  maps: ReturnType<typeof buildPrimaryMorphMaps>,
  point: Point2,
): number {
  let bestHost = -1;
  let bestDist = Number.POSITIVE_INFINITY;
  for (const id of maps.mappedPrimary) {
    const anchor = maps.targets.get(id);
    if (!anchor) continue;
    const dist = Math.hypot(point.x - anchor.x, point.y - anchor.y);
    if (dist < bestDist) {
      bestDist = dist;
      bestHost = id;
    }
  }
  return bestHost;
}

function layoutFromMorphMaps(
  maps: ReturnType<typeof buildPrimaryMorphMaps>,
  canvasW: number,
  canvasH: number,
): ZoneLayout {
  // Tylko kropki z kształtu (mappedPrimary) — bez clusteru w środku.
  const positions = new Map<number, Point2>();
  for (const id of maps.mappedPrimary) {
    const pt = maps.targets.get(id);
    if (pt) positions.set(id, { ...pt });
  }
  const mappedIds = new Set<number>(positions.keys());
  const edges = maps.targetEdges.filter(
    ({ a, b }) => mappedIds.has(a) && mappedIds.has(b),
  );

  const supplementHostEdges: { a: number; b: number }[] = [];
  for (const edge of maps.supplementEdges) {
    const ptA = maps.supplementNodes.get(edge.a);
    const ptB = maps.supplementNodes.get(edge.b);
    if (!ptA || !ptB) continue;
    const hostA = hostForPoint(maps, ptA);
    const hostB = hostForPoint(maps, ptB);
    if (hostA < 0 || hostB < 0 || hostA === hostB) continue;
    supplementHostEdges.push({ a: hostA, b: hostB });
  }

  const splits = new Map<number, NormGoal[]>();
  for (const [, point] of maps.supplementNodes) {
    const host = hostForPoint(maps, point);
    if (host < 0) continue;
    const list = splits.get(host) ?? [];
    list.push({ nx: point.x / canvasW, ny: point.y / canvasH });
    splits.set(host, list);
  }

  const mergeMembers = new Map<number, number>();
  for (const [memberId, leaderId] of maps.mergeTarget) {
    mergeMembers.set(memberId, leaderId);
  }

  const reflectors: MeshReflector[] = maps.reflectors.map((ref) => ({
    targetId: ref.targetId,
    hostId: ref.hostId,
    nx: ref.x / canvasW,
    ny: ref.y / canvasH,
    r: ref.r,
    phase: ref.phase,
  }));
  const reflectorEdges = reflectors.map((ref) => ({
    a: ref.hostId,
    b: ref.targetId,
  }));

  return {
    positions,
    edges,
    supplementHostEdges,
    reflectors,
    reflectorEdges,
    layoutScale: maps.targetLayoutScale,
    mappedIds,
    splits,
    mergeMembers,
  };
}

function buildHeroLayout(master: FaceMesh, canvasW: number, canvasH: number): ZoneLayout {
  const layout = layoutFaceOnCanvas(master, canvasW, canvasH, 0.88);
  const positions = new Map<number, Point2>();
  const mappedIds = new Set<number>();
  for (const id of master.visibleNodeIds) {
    const node = master.nodes[id];
    if (!node) continue;
    positions.set(id, {
      x: layout.offsetX + node.x * layout.scale,
      y: layout.offsetY + node.y * layout.scale,
    });
    mappedIds.add(id);
  }
  return {
    positions,
    edges: master.edges.map((e) => ({ a: e.a, b: e.b })),
    supplementHostEdges: [],
    reflectors: [],
    reflectorEdges: [],
    layoutScale: layout.scale,
    mappedIds,
    splits: new Map(),
    mergeMembers: new Map(),
  };
}

function rotateAroundPivot(x: number, y: number, pivotX: number, pivotY: number, rad: number) {
  const dx = x - pivotX;
  const dy = y - pivotY;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: pivotX + dx * cos - dy * sin,
    y: pivotY + dx * sin + dy * cos,
  };
}

function layoutCentroid(layout: ZoneLayout) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const p of layout.positions.values()) {
    sumX += p.x;
    sumY += p.y;
    count += 1;
  }
  if (count === 0) return { x: 0, y: 0, count: 0 };
  return { x: sumX / count, y: sumY / count, count };
}

function applyToMapped(layout: ZoneLayout, fn: (p: Point2) => Point2) {
  for (const id of layout.mappedIds) {
    const p = layout.positions.get(id);
    if (!p) continue;
    layout.positions.set(id, fn(p));
  }
}

function normalizeAngleRad(v: number) {
  let a = v;
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

function arrowTip(layout: ZoneLayout) {
  let tipX = 0;
  let tipY = -Infinity;
  for (const p of layout.positions.values()) {
    if (p.y > tipY) {
      tipY = p.y;
      tipX = p.x;
    }
  }
  return { tipX, tipY };
}

function arrowRoot(layout: ZoneLayout) {
  let rootX = 0;
  let rootY = Infinity;
  for (const p of layout.positions.values()) {
    if (p.y < rootY) {
      rootY = p.y;
      rootX = p.x;
    }
  }
  return { rootX, rootY };
}

function fitArrowPadding(
  layout: ZoneLayout,
  canvasW: number,
  canvasH: number,
) {
  if (layout.positions.size === 0) return;

  const pad = { top: 28, right: 36, bottom: 32, left: 20 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of layout.positions.values()) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }

  let dx = 0;
  let dy = 0;
  if (maxX > canvasW - pad.right) dx = canvasW - pad.right - maxX;
  if (minX + dx < pad.left) dx += pad.left - (minX + dx);
  if (maxY > canvasH - pad.bottom) dy = canvasH - pad.bottom - maxY;
  if (minY + dy < pad.top) dy += pad.top - (minY + dy);

  applyToMapped(layout, (p) => ({ x: p.x + dx, y: p.y + dy }));
}

function centerArrowHorizontally(layout: ZoneLayout, canvasW: number) {
  const { x: cx } = layoutCentroid(layout);
  const dx = canvasW * 0.5 - cx;
  if (Math.abs(dx) < 0.5) return;
  applyToMapped(layout, (p) => ({ x: p.x + dx, y: p.y }));
}

function clampLeanRad(v: number) {
  return Math.max(-ARROW_MAX_LEAN_RAD, Math.min(ARROW_MAX_LEAN_RAD, v));
}

function aimMissBlend(missPx: number, min: number, max: number, fullPx: number) {
  const t = Math.min(1, Math.max(0, missPx / fullPx));
  return min + (max - min) * t;
}

function fitArrowAim(
  layout: ZoneLayout,
  canvasW: number,
  _canvasH: number,
  aimPoint: { x: number; y: number; centerX?: number },
) {
  const pad = { top: 28, right: 36, bottom: 32, left: 20 };

  // SVG patrzy w górę (grot = min Y) — obrót 180° żeby celować w dół na picker.
  let { x: cx, y: cy } = layoutCentroid(layout);
  applyToMapped(layout, (p) => ({
    x: cx + (cx - p.x),
    y: cy + (cy - p.y),
  }));

  const { rootY } = arrowRoot(layout);
  const pivotX = canvasW * 0.5;
  const pivotY = rootY;

  let { tipX, tipY } = arrowTip(layout);
  const currentAngle = Math.atan2(tipY - pivotY, tipX - pivotX);
  const targetAngle = Math.atan2(aimPoint.y - pivotY, aimPoint.x - pivotX);
  const leanRad = clampLeanRad(normalizeAngleRad(targetAngle - currentAngle));
  applyToMapped(layout, (p) => rotateAroundPivot(p.x, p.y, pivotX, pivotY, leanRad));

  ({ tipX, tipY } = arrowTip(layout));
  const resX = aimPoint.x - tipX;
  const resY = aimPoint.y - ARROW_DOT_GAP - tipY;
  const blendX = aimMissBlend(
    Math.abs(resX),
    ARROW_AIM_BLEND_MIN_X,
    ARROW_AIM_BLEND_MAX_X,
    ARROW_AIM_LATERAL_FULL_BLEND_PX,
  );
  const blendY = aimMissBlend(
    Math.abs(resY),
    ARROW_AIM_BLEND_MIN_Y,
    ARROW_AIM_BLEND_MAX_Y,
    ARROW_AIM_VERTICAL_FULL_BLEND_PX,
  );
  applyToMapped(layout, (p) => ({
    x: p.x + resX * blendX,
    y: p.y + resY * blendY,
  }));

  let minYAfter = Infinity;
  for (const p of layout.positions.values()) minYAfter = Math.min(minYAfter, p.y);
  if (minYAfter < pad.top) {
    const fix = pad.top - minYAfter;
    applyToMapped(layout, (p) => ({ x: p.x, y: p.y + fix }));
  }
}

function buildPalettePaddedLayout(
  primary: SvgMesh,
  paletteMesh: SvgMesh,
  canvasW: number,
  canvasH: number,
): ZoneLayout {
  const key = `${canvasW}x${canvasH}`;
  const cached = palettePaddedLayoutCache.get(key);
  if (cached) return cloneZoneLayout(cached);

  const maps = buildPrimaryMorphMaps(primary, paletteMesh, canvasW, canvasH, {
    layoutFit: ARROW_LAYOUT_FIT,
    targetLayoutFit: ARROW_LAYOUT_FIT,
    centerRatioY: 0.5,
    targetCenterRatioY: 0.48,
  });
  const layout = layoutFromMorphMaps(maps, canvasW, canvasH);
  fitArrowPadding(layout, canvasW, canvasH);
  centerArrowHorizontally(layout, canvasW);
  palettePaddedLayoutCache.set(key, cloneZoneLayout(layout));
  if (palettePaddedLayoutCache.size > 8) palettePaddedLayoutCache.clear();
  return cloneZoneLayout(layout);
}

export function buildDotAtlas(
  master: FaceMesh,
  zoneMeshes: Partial<Record<MeshZone, SvgMesh>>,
  canvasW: number,
  canvasH: number,
  aimPoint?: { x: number; y: number; centerX?: number } | null,
): DotAtlas {
  const primary = faceMeshToSvgMesh(master);
  const zones: Partial<Record<MeshZone, ZoneLayout>> = {};
  zones.hero = buildHeroLayout(master, canvasW, canvasH);

  if (zoneMeshes.palette) {
    const palette = buildPalettePaddedLayout(primary, zoneMeshes.palette, canvasW, canvasH);
    if (aimPoint) fitArrowAim(palette, canvasW, canvasH, aimPoint);
    zones.palette = palette;
  }

  if (zoneMeshes.bus) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.bus, canvasW, canvasH, {
      layoutFit: 0.82,
      centerRatioY: 0.5,
      targetLayoutFit: 0.74,
      targetCenterRatioY: 0.44,
      mapSourcePoint: rotateArrowToBusFrame,
    });
    zones.bus = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  if (zoneMeshes.fork) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.fork, canvasW, canvasH, {
      layoutFit: 0.74,
      centerRatioY: 0.44,
      targetLayoutFit: 0.96,
      targetCenterRatioY: 0.46,
      mapSourcePoint: rotateBusToForkFrame,
    });
    zones.fork = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  if (zoneMeshes.spray) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.spray, canvasW, canvasH, {
      layoutFit: 0.96,
      centerRatioY: 0.46,
      targetLayoutFit: 0.96,
      targetCenterRatioY: 0.46,
    });
    zones.spray = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  if (zoneMeshes.loupe) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.loupe, canvasW, canvasH, {
      layoutFit: 0.96,
      centerRatioY: 0.46,
      targetLayoutFit: 0.96,
      targetCenterRatioY: 0.46,
    });
    zones.loupe = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  if (zoneMeshes.ring) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.ring, canvasW, canvasH, {
      layoutFit: 0.96,
      centerRatioY: 0.46,
      targetLayoutFit: 0.96,
      targetCenterRatioY: 0.46,
    });
    zones.ring = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  const eyeLayoutOpts = {
    layoutFit: 1,
    centerRatioY: 0.46,
    targetLayoutFit: 1.04,
    targetCenterRatioY: 0.5,
  } as const;

  if (zoneMeshes.careerEye) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.careerEye, canvasW, canvasH, eyeLayoutOpts);
    zones.careerEye = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  if (zoneMeshes.skillsEye) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.skillsEye, canvasW, canvasH, eyeLayoutOpts);
    zones.skillsEye = layoutFromMorphMaps(maps, canvasW, canvasH);
  }

  return {
    masterIds: [...master.visibleNodeIds],
    zones,
    cluster: { x: canvasW * 0.5, y: canvasH * 0.48 },
  };
}

export function zoneLayout(atlas: DotAtlas, zone: MeshZone): ZoneLayout | undefined {
  return atlas.zones[zone];
}

/** Cele kropek z blendu scrolla — każda leci w swoje miejsce, bez wspólnej fazy morphu. */
export function blendZoneLayouts(
  from: ZoneLayout | undefined,
  to: ZoneLayout | undefined,
  t: number,
): ZoneLayout | undefined {
  if (!from && !to) return undefined;
  if (!from || t <= 0) return from;
  if (!to || t >= 1) return to;

  const positions = new Map<number, Point2>();
  const ids = new Set<number>([
    ...from.positions.keys(),
    ...to.positions.keys(),
  ]);

  for (const id of ids) {
    const a = from.positions.get(id);
    const b = to.positions.get(id);
    if (a && b) {
      positions.set(id, {
        x: a.x + (b.x - a.x) * t,
        y: a.y + (b.y - a.y) * t,
      });
    } else if (b) {
      positions.set(id, { ...b });
    } else if (a) {
      positions.set(id, { ...a });
    }
  }

  const edges = t >= 0.5 ? to.edges : from.edges;
  const supplementHostEdges = t >= 0.5 ? to.supplementHostEdges : from.supplementHostEdges;
  const reflectors = t >= 0.5 ? to.reflectors : from.reflectors;
  const reflectorEdges = t >= 0.5 ? to.reflectorEdges : from.reflectorEdges;
  const layoutScale = from.layoutScale + (to.layoutScale - from.layoutScale) * t;

  return {
    positions,
    edges,
    supplementHostEdges,
    reflectors: reflectors.map((r) => ({ ...r })),
    reflectorEdges: reflectorEdges.map((e) => ({ ...e })),
    layoutScale,
    mappedIds: new Set(positions.keys()),
    splits: t >= 0.5 ? new Map(to.splits) : new Map(from.splits),
    mergeMembers: t >= 0.5 ? new Map(to.mergeMembers) : new Map(from.mergeMembers),
  };
}
