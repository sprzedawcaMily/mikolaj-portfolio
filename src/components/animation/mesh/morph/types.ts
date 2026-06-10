import type { MeshZone } from '@/hooks/meshScrollEngine';
import type { FaceMesh } from '@/components/animation/mesh/faceMesh';
import type { SvgMesh } from '@/components/animation/mesh/svgMesh';

export type NormPt = { nx: number; ny: number };
export type PixelPt = { x: number; y: number };

export type MorphEdge = {
  a: number;
  b: number;
  group: 'face' | 'hair' | 'reflector' | 'palette';
};

export type MeshBundle = {
  faceMesh: FaceMesh;
  zoneMeshes: Partial<Record<MeshZone, SvgMesh>>;
};

/** Stan strefy po zatrzymaniu morphu lub na hero. */
export type ZoneSnapshot = {
  zone: MeshZone;
  goals: Map<number, NormPt>;
  mappedIds: Set<number>;
  edges: MorphEdge[];
  supplementHostEdges: MorphEdge[];
  splits: Map<number, NormPt[]>;
  layoutScale: number;
  layoutW: number;
  layoutH: number;
};

/** Snapshot źródła na start sesji morphu. */
export type SourceSnapshot = {
  goals: Map<number, NormPt>;
  mappedIds: Set<number>;
  edges: MorphEdge[];
  supplementHostEdges: MorphEdge[];
  splits: Map<number, NormPt[]>;
  layoutScale: number;
  layoutW: number;
  layoutH: number;
};

/** @deprecated użyj MorphFlightSession */
export type MorphSessionCtx = {
  startW: number;
  startH: number;
  frozenHostPx: Map<number, PixelPt>;
  frozenSplitPx: Map<string, PixelPt>;
};

export type DotBody = { x: number; y: number; vx: number; vy: number };
