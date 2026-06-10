import type { PortraitAimPoint } from '@/hooks/usePortraitScrollMorph';
import { buildDotAtlas, type DotAtlas } from '@/components/animation/mesh/meshDotAtlas';
import type { MeshBundle } from './types';

export function atlasCacheKey(w: number, h: number, aim: PortraitAimPoint | null) {
  if (!aim) return `${w}x${h}`;
  return `${w}x${h}:${Math.round(aim.x)}:${Math.round(aim.y)}:${Math.round(aim.centerX ?? 0)}`;
}

export function scaleAim(aim: PortraitAimPoint, canvasW: number, canvasH: number): PortraitAimPoint {
  if (aim.stageW <= 0 || aim.stageH <= 0) return aim;
  const sx = canvasW / aim.stageW;
  const sy = canvasH / aim.stageH;
  return {
    x: aim.x * sx,
    y: aim.y * sy,
    centerX: aim.centerX * sx,
    stageW: canvasW,
    stageH: canvasH,
  };
}

export function ensureAtlas(
  bundle: MeshBundle,
  cache: { key: string; atlas: DotAtlas | null },
  w: number,
  h: number,
  aim: PortraitAimPoint | null,
): DotAtlas {
  const key = atlasCacheKey(w, h, aim);
  if (key === cache.key && cache.atlas) return cache.atlas;
  cache.key = key;
  cache.atlas = buildDotAtlas(bundle.faceMesh, bundle.zoneMeshes, w, h, aim);
  return cache.atlas;
}
