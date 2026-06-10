import type { MeshZone } from '@/hooks/meshScrollEngine';
import type { FaceMesh } from '@/components/animation/mesh/faceMesh';
import { zoneLayout, type DotAtlas } from '@/components/animation/mesh/meshDotAtlas';
import type { MorphEdge, NormPt, SourceSnapshot, ZoneSnapshot } from './types';

export function edgeGroupLookup(faceMesh: FaceMesh) {
  const map = new Map<number, 'face' | 'hair'>();
  for (const edge of faceMesh.edges) {
    map.set(edge.a, edge.group);
    map.set(edge.b, edge.group);
  }
  return map;
}

export function layoutEdges(
  edges: { a: number; b: number }[],
  edgeGroupById: Map<number, 'face' | 'hair'>,
): MorphEdge[] {
  return edges.map((edge) => ({
    ...edge,
    group: edgeGroupById.get(edge.a) ?? 'face',
  }));
}

export function snapshotFromZoneLayout(
  zone: MeshZone,
  atlas: DotAtlas,
  faceMesh: FaceMesh,
  layoutW: number,
  layoutH: number,
): ZoneSnapshot | null {
  const layout = zoneLayout(atlas, zone);
  if (!layout) return null;

  const edgeGroupById = edgeGroupLookup(faceMesh);
  const goals = new Map<number, NormPt>();
  for (const [id, pt] of layout.positions) {
    goals.set(id, { nx: pt.x / layoutW, ny: pt.y / layoutH });
  }

  const splits = new Map<number, NormPt[]>();
  for (const [hostId, pts] of layout.splits) {
    splits.set(hostId, pts.map((p) => ({ nx: p.nx, ny: p.ny })));
  }

  return {
    zone,
    goals,
    mappedIds: new Set(layout.mappedIds),
    edges: layoutEdges(layout.edges, edgeGroupById),
    supplementHostEdges: layoutEdges(layout.supplementHostEdges, edgeGroupById),
    splits,
    layoutScale: layout.layoutScale,
    layoutW,
    layoutH,
  };
}

export function heroSnapshot(
  atlas: DotAtlas,
  faceMesh: FaceMesh,
  layoutW: number,
  layoutH: number,
): ZoneSnapshot | null {
  return snapshotFromZoneLayout('hero', atlas, faceMesh, layoutW, layoutH);
}

export function captureSourceFromSnapshot(prev: ZoneSnapshot): SourceSnapshot {
  return {
    goals: new Map(prev.goals),
    mappedIds: new Set(prev.mappedIds),
    edges: prev.edges,
    supplementHostEdges: prev.supplementHostEdges,
    splits: new Map(
      [...prev.splits.entries()].map(([id, pts]) => [id, pts.map((p) => ({ ...p }))]),
    ),
    layoutScale: prev.layoutScale,
    layoutW: prev.layoutW,
    layoutH: prev.layoutH,
  };
}
