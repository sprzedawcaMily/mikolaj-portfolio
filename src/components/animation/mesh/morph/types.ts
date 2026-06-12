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

export type EyeWhiteHull = {
  path: string;
  points: { x: number; y: number }[];
};

export type MeshBundle = {
  faceMesh: FaceMesh;
  zoneMeshes: Partial<Record<MeshZone, SvgMesh>>;
  /** Ścieżka wypełnienia #D9D9D9 — deformacja z dryfem kropek obrysu. */
  eyeWhiteHull: EyeWhiteHull | null;
  /** Pozostałe strefy (projekty, oko, strzałka) — parsowane w tle po starcie. */
  zonesReady?: boolean;
  onZonesExpanded?: (fn: () => void) => () => void;
};

/** Snapshot strefy — mapowanie atlasu na cele morphu. */
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
