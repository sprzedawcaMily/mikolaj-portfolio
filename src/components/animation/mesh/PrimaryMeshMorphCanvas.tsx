import { useEffect, useRef } from 'react';
import {
  buildPrimaryMorphMaps,
  paintPrimaryMorphFrame,
  type BuildPrimaryMorphOptions,
  type PaintPrimaryMorphFrameOptions,
  type PrimaryMorphMaps,
} from '@/components/animation/mesh/primaryMeshMorphSystem';
import { parseSvgMesh, type SvgMesh } from '@/components/animation/mesh/svgMesh';
import styles from './PrimaryMeshMorphCanvas.module.css';

const FRAME_MS = 1000 / 30;
const MORPH_FRAME_MS = 1000 / 60;
const MORPH_ACTIVE = 0.001;

export interface PrimaryMeshMorphCanvasProps {
  sourceUrl: string;
  targetUrl: string;
  morphProgress?: number;
  ariaLabel: string;
  mapOptions?: BuildPrimaryMorphOptions;
  paintOptions?: PaintPrimaryMorphFrameOptions;
}

export function PrimaryMeshMorphCanvas({
  sourceUrl,
  targetUrl,
  morphProgress: externalMorph = 0,
  ariaLabel,
  mapOptions,
  paintOptions,
}: PrimaryMeshMorphCanvasProps) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const externalMorphRef = useRef(externalMorph);
  const mapOptionsRef = useRef(mapOptions);
  const paintOptionsRef = useRef(paintOptions);

  useEffect(() => {
    externalMorphRef.current = externalMorph;
  }, [externalMorph]);

  useEffect(() => {
    mapOptionsRef.current = mapOptions;
  }, [mapOptions]);

  useEffect(() => {
    paintOptionsRef.current = paintOptions;
  }, [paintOptions]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const stageEl = stage;
    const canvasEl = canvas;
    const context = canvas.getContext('2d');
    if (!context) return;

    const ctx = context;
    let primaryMesh: SvgMesh | null = null;
    let targetMesh: SvgMesh | null = null;
    let morphMaps: PrimaryMorphMaps | null = null;
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let running = true;

    function rebuildMorphMaps() {
      if (!primaryMesh || !targetMesh || width <= 0 || height <= 0) return;
      morphMaps = buildPrimaryMorphMaps(
        primaryMesh,
        targetMesh,
        width,
        height,
        mapOptionsRef.current,
      );
    }

    function resize(force = false) {
      const rect = stageEl.getBoundingClientRect();
      const nextWidth = Math.max(160, Math.round(rect.width));
      const nextHeight = Math.max(120, Math.round(rect.height));
      if (!force && nextWidth === width && nextHeight === height) return;

      width = nextWidth;
      height = nextHeight;
      canvasEl.width = nextWidth;
      canvasEl.height = nextHeight;
      rebuildMorphMaps();
      if (primaryMesh) paintFrame(performance.now(), true);
    }

    function paintFrame(now: number, force = false) {
      const morph = externalMorphRef.current;
      const morphing = morph > MORPH_ACTIVE;
      if (!force && now - lastFrame < (morphing ? MORPH_FRAME_MS : FRAME_MS)) return;
      lastFrame = now;

      ctx.clearRect(0, 0, width, height);
      if (!primaryMesh || !morphMaps) return;

      paintPrimaryMorphFrame(ctx, primaryMesh, morphMaps, morph, now, paintOptionsRef.current);
    }

    function render(now: number) {
      if (!running) return;
      frame = requestAnimationFrame(render);
      paintFrame(now);
    }

    async function loadMeshes() {
      try {
        const [sourceRes, targetRes] = await Promise.all([
          fetch(sourceUrl),
          fetch(targetUrl),
        ]);
        if (!sourceRes.ok || !targetRes.ok) return;

        const [sourceSvg, targetSvg] = await Promise.all([sourceRes.text(), targetRes.text()]);
        primaryMesh = parseSvgMesh(sourceSvg, { strictLineSnap: true });
        targetMesh = parseSvgMesh(targetSvg, { strictLineSnap: true });
        rebuildMorphMaps();
        frame = requestAnimationFrame(render);
      } catch {
        /* ignore */
      }
    }

    resize(true);
    void loadMeshes();

    let resizeRaf = 0;
    const sizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resize();
      });
    });
    sizeObserver.observe(stageEl);

    return () => {
      running = false;
      sizeObserver.disconnect();
      cancelAnimationFrame(resizeRaf);
      cancelAnimationFrame(frame);
    };
  }, [sourceUrl, targetUrl]);

  return (
    <div ref={stageRef} className={styles.stage}>
      <canvas ref={canvasRef} className={styles.canvas} aria-label={ariaLabel} />
    </div>
  );
}
