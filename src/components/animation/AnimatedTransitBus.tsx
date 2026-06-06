import { useMemo } from 'react';
import { PrimaryMeshMorphCanvas } from '@/components/animation/mesh/PrimaryMeshMorphCanvas';
import {
  rotateArrowToBusFrame,
  type BuildPrimaryMorphOptions,
  type PaintPrimaryMorphFrameOptions,
} from '@/components/animation/mesh/primaryMeshMorphSystem';
import { clamp01, easeSmoothStep } from '@/components/animation/mesh/svgMesh';

const ARROW_SOURCE = '/images/profile/Group%201.svg?v=arrow-mesh-4';
const BUS_SOURCE = '/images/transitrank/autobus.svg?v=bus-mesh-12';

interface AnimatedTransitBusProps {
  morphProgress?: number;
}

function drawWhiteHeadlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  now: number,
  phase: number,
) {
  const pulse = 0.86 + Math.sin(now * 0.0024 + phase * 2.5) * 0.14;
  const glowR = Math.max(8, r * (2.8 + pulse * 0.6));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const bloom = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  bloom.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95 * pulse})`);
  bloom.addColorStop(0.35, `rgba(255, 255, 255, ${alpha * 0.35 * pulse})`);
  bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * pulse;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2.2, r * 1.15), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function AnimatedTransitBus({ morphProgress = 0 }: AnimatedTransitBusProps) {
  const mapOptions = useMemo<BuildPrimaryMorphOptions>(
    () => ({
      layoutFit: 0.82,
      centerRatioY: 0.5,
      targetLayoutFit: 0.74,
      targetCenterRatioY: 0.44,
      mapSourcePoint: (x, y, mesh) => rotateArrowToBusFrame(x, y, mesh),
    }),
    [],
  );

  const paintOptions = useMemo<PaintPrimaryMorphFrameOptions>(
    () => ({
      accentAlphaForMorph: (morph) => easeSmoothStep(clamp01((morph - 0.78) / 0.22)),
      drawAccent: (ctx, node, alpha, now) => {
        drawWhiteHeadlight(ctx, node.px, node.py, node.pr, alpha, now, node.phase);
      },
    }),
    [],
  );

  return (
    <PrimaryMeshMorphCanvas
      sourceUrl={ARROW_SOURCE}
      targetUrl={BUS_SOURCE}
      morphProgress={morphProgress}
      ariaLabel="Animowany morph strzałki w autobus TransitRank"
      mapOptions={mapOptions}
      paintOptions={paintOptions}
    />
  );
}
