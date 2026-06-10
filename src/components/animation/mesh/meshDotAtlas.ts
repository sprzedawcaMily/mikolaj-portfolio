import type { PaletteTone } from '@/components/animation/mesh/parsePaletteMesh';
import { layoutMeshOnCanvas } from '@/components/animation/mesh/svgMesh';
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
  /** hostId → ton kropki palety (kolory z motywu). */
  paletteTones?: Map<number, PaletteTone>;
  /** Pełna warstwa kropek palety (wire + kolory) w pozycjach SVG. */
  paletteOverlay?: PaletteOverlay;
  /** hostId → dokładna pozycja plamy farby w układzie stage (px). */
  paletteToneAnchors?: Map<number, Point2>;
}

export interface PaletteSplat {
  id: string;
  nodeId: number;
  x: number;
  y: number;
  tone: PaletteTone;
  r: number;
}

export interface PaletteOverlay {
  dots: PaletteSplat[];
  edges: { a: number; b: number }[];
  dotR: number;
}

export interface DotAtlas {
  masterIds: number[];
  zones: Partial<Record<MeshZone, ZoneLayout>>;
  cluster: Point2;
}

const PALETTE_LAYOUT_FIT = 1.72;
const PALETTE_LAYOUT_OFFSET_X = 0.14;
/** Maks. odległość (px) hosta od kolorowej kropki SVG, żeby dostać ton. */
const PALETTE_EXACT_SNAP_PX = 12;
export const PALETTE_ARROW_BASE_GAP = 38;

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
    paletteTones: src.paletteTones ? new Map(src.paletteTones) : undefined,
    paletteOverlay: src.paletteOverlay
      ? {
          dotR: src.paletteOverlay.dotR,
          edges: src.paletteOverlay.edges.map((e) => ({ ...e })),
          dots: src.paletteOverlay.dots.map((splat) => ({ ...splat })),
        }
      : undefined,
    paletteToneAnchors: src.paletteToneAnchors
      ? new Map(src.paletteToneAnchors)
      : undefined,
  };
}

function layoutShift(
  maps: ReturnType<typeof buildPrimaryMorphMaps>,
  layout: ZoneLayout,
): Point2 {
  for (const hostId of maps.mappedPrimary) {
    const post = layout.positions.get(hostId);
    const pre = maps.targets.get(hostId);
    if (post && pre) {
      return { x: post.x - pre.x, y: post.y - pre.y };
    }
  }
  return { x: 0, y: 0 };
}

function paletteToneMarkers(
  paletteMesh: SvgMesh,
  canvasW: number,
  canvasH: number,
  shift: Point2,
): { tone: PaletteTone; x: number; y: number }[] {
  const targetLayout = layoutMeshOnCanvas(paletteMesh, canvasW, canvasH, PALETTE_LAYOUT_FIT);
  const markers: { tone: PaletteTone; x: number; y: number }[] = [];

  for (const node of paletteMesh.nodes) {
    if (!node.paletteTone || node.paletteTone === 'wire') continue;
    markers.push({
      tone: node.paletteTone,
      x: targetLayout.offsetX + node.x * targetLayout.scale + shift.x,
      y: targetLayout.offsetY + node.y * targetLayout.scale + shift.y,
    });
  }
  return markers;
}

function stagePointForNode(
  node: { x: number; y: number },
  shift: Point2,
  targetLayout: ReturnType<typeof layoutMeshOnCanvas>,
) {
  return {
    x: targetLayout.offsetX + node.x * targetLayout.scale + shift.x,
    y: targetLayout.offsetY + node.y * targetLayout.scale + shift.y,
  };
}

function buildPaletteTonesFromLayout(
  layout: ZoneLayout,
  maps: ReturnType<typeof buildPrimaryMorphMaps>,
  paletteMesh: SvgMesh,
  canvasW: number,
  canvasH: number,
  _overlay?: PaletteOverlay,
): { tones: Map<number, PaletteTone>; anchors: Map<number, Point2> } {
  const shift = layoutShift(maps, layout);
  const targetLayout = layoutMeshOnCanvas(paletteMesh, canvasW, canvasH, PALETTE_LAYOUT_FIT);
  const markers = paletteToneMarkers(paletteMesh, canvasW, canvasH, shift);
  const nodeById = new Map(paletteMesh.nodes.map((node) => [node.id, node] as const));
  const exactSnap = Math.max(8, PALETTE_EXACT_SNAP_PX * maps.targetLayoutScale);
  const tones = new Map<number, PaletteTone>();
  const anchors = new Map<number, Point2>();

  const primaryToTarget = new Map<number, number>();
  for (const [targetId, primaryId] of maps.targetToPrimary) {
    primaryToTarget.set(primaryId, targetId);
  }

  for (const hostId of layout.mappedIds) {
    tones.set(hostId, 'wire');
  }

  for (const hostId of layout.mappedIds) {
    const targetId = primaryToTarget.get(hostId);
    const node = targetId != null ? nodeById.get(targetId) : undefined;
    if (node?.paletteTone && node.paletteTone !== 'wire') {
      tones.set(hostId, node.paletteTone);
      anchors.set(hostId, stagePointForNode(node, shift, targetLayout));
    }
  }

  const claimed = new Set<number>();
  for (const [hostId, tone] of tones) {
    if (tone !== 'wire') claimed.add(hostId);
  }

  for (const marker of markers) {
    let bestHost = -1;
    let bestDist = exactSnap;
    for (const hostId of layout.mappedIds) {
      if (claimed.has(hostId)) continue;
      const point = layout.positions.get(hostId);
      if (!point) continue;
      const dist = Math.hypot(point.x - marker.x, point.y - marker.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestHost = hostId;
      }
    }
    if (bestHost >= 0) {
      tones.set(bestHost, marker.tone);
      anchors.set(bestHost, { x: marker.x, y: marker.y });
      claimed.add(bestHost);
    }
  }

  return { tones, anchors };
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

function fitPaletteCentered(layout: ZoneLayout, canvasW: number, canvasH: number) {
  fitArrowPadding(layout, canvasW, canvasH);
  const { x: cx, y: cy } = layoutCentroid(layout);
  const targetX = canvasW * (0.5 + PALETTE_LAYOUT_OFFSET_X);
  const targetY = canvasH * 0.5;
  applyToMapped(layout, (p) => ({
    x: p.x + (targetX - cx),
    y: p.y + (targetY - cy),
  }));
}

function buildPaletteOverlay(
  paletteMesh: SvgMesh,
  maps: ReturnType<typeof buildPrimaryMorphMaps>,
  layout: ZoneLayout,
  canvasW: number,
  canvasH: number,
): PaletteOverlay {
  const shift = layoutShift(maps, layout);
  const targetLayout = layoutMeshOnCanvas(paletteMesh, canvasW, canvasH, PALETTE_LAYOUT_FIT);
  const dotR = Math.max(1.4, 4.5 * maps.targetLayoutScale);
  const dots: PaletteSplat[] = [];
  const nodeIds = new Set<number>();

  for (const node of paletteMesh.nodes) {
    const x = targetLayout.offsetX + node.x * targetLayout.scale + shift.x;
    const y = targetLayout.offsetY + node.y * targetLayout.scale + shift.y;
    nodeIds.add(node.id);
    dots.push({
      id: `p:${node.id}`,
      nodeId: node.id,
      x,
      y,
      tone: node.paletteTone ?? 'wire',
      r: dotR,
    });
  }

  const edges = paletteMesh.edges.filter((edge) => nodeIds.has(edge.a) && nodeIds.has(edge.b));

  return { dots, edges, dotR };
}

function buildPalettePaddedLayout(
  primary: SvgMesh,
  paletteMesh: SvgMesh,
  canvasW: number,
  canvasH: number,
): ZoneLayout {
  const key = `v11:${canvasW}x${canvasH}`;
  const cached = palettePaddedLayoutCache.get(key);
  if (cached) return cloneZoneLayout(cached);

  const maps = buildPrimaryMorphMaps(primary, paletteMesh, canvasW, canvasH, {
    layoutFit: PALETTE_LAYOUT_FIT,
    targetLayoutFit: PALETTE_LAYOUT_FIT,
    centerRatioY: 0.5,
    targetCenterRatioY: 0.48,
  });
  const layout = layoutFromMorphMaps(maps, canvasW, canvasH);
  fitPaletteCentered(layout, canvasW, canvasH);
  const overlay = buildPaletteOverlay(paletteMesh, maps, layout, canvasW, canvasH);
  layout.paletteOverlay = overlay;
  const paletteToneMaps = buildPaletteTonesFromLayout(
    layout,
    maps,
    paletteMesh,
    canvasW,
    canvasH,
    overlay,
  );
  layout.paletteTones = paletteToneMaps.tones;
  layout.paletteToneAnchors = paletteToneMaps.anchors;
  palettePaddedLayoutCache.set(key, cloneZoneLayout(layout));
  if (palettePaddedLayoutCache.size > 8) palettePaddedLayoutCache.clear();
  return cloneZoneLayout(layout);
}

export function buildDotAtlas(
  master: FaceMesh,
  zoneMeshes: Partial<Record<MeshZone, SvgMesh>>,
  canvasW: number,
  canvasH: number,
  _aimPoint?: { x: number; y: number; centerX?: number } | null,
): DotAtlas {
  const primary = faceMeshToSvgMesh(master);
  const zones: Partial<Record<MeshZone, ZoneLayout>> = {};
  zones.hero = buildHeroLayout(master, canvasW, canvasH);

  if (zoneMeshes.palette) {
    zones.palette = buildPalettePaddedLayout(primary, zoneMeshes.palette, canvasW, canvasH);
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

  if (zoneMeshes.contactArrow) {
    const maps = buildPrimaryMorphMaps(primary, zoneMeshes.contactArrow, canvasW, canvasH, {
      layoutFit: 1.04,
      centerRatioY: 0.5,
      targetLayoutFit: 0.92,
      targetCenterRatioY: 0.94,
    });
    zones.contactArrow = layoutFromMorphMaps(maps, canvasW, canvasH);
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

/** Kropki + kreski palety w układzie kotwicy (px względem slotu mesha). */
export function computePaletteOverlay(
  faceMesh: FaceMesh,
  paletteMesh: SvgMesh,
  canvasW: number,
  canvasH: number,
): PaletteOverlay {
  const layout = buildPalettePaddedLayout(
    faceMeshToSvgMesh(faceMesh),
    paletteMesh,
    canvasW,
    canvasH,
  );
  return layout.paletteOverlay ?? { dots: [], edges: [], dotR: 4.5 };
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
    paletteTones: t >= 0.5 ? to.paletteTones : from.paletteTones,
    paletteOverlay: t >= 0.5 ? to.paletteOverlay : from.paletteOverlay,
  };
}
