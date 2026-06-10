import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { loadMeshBundle } from '@/components/animation/mesh/morph/loadMeshBundle';
import type { MeshBundle } from '@/components/animation/mesh/morph/types';
import { useMeshZone } from '@/context/MeshZoneContext';
import {
  createFlyingPool,
  prewarmMeshLayouts,
  tickFlyingDots,
  type FacePointer,
} from '@/components/animation/flyingDotEngine';
import { HERO_MESH_ANCHOR_ID } from '@/hooks/meshScrollEngine';
import { currentMeshFrameId, subscribeMeshFrame } from '@/hooks/meshAnimationLoop';
import { markScrollActivity } from '@/hooks/meshPerfStats';
import { useMeshMotionState } from '@/hooks/meshMotionState';
import styles from './FlyingMeshDots.module.css';

const SCROLL_IDLE_MS = 120;

export function FlyingMeshDots() {
  const { paletteAim, zone } = useMeshZone();
  const { morphSettled } = useMeshMotionState();
  const { accent } = useTheme();
  const layerRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef(createFlyingPool());
  const bundleRef = useRef<MeshBundle | null>(null);
  const paletteAimRef = useRef(paletteAim);
  const accentRef = useRef(accent);
  const hairIdsRef = useRef<Set<number>>(new Set());
  const pointerRef = useRef<FacePointer>({
    x: 0,
    y: 0,
    active: false,
    screenX: 0,
    screenY: 0,
    screenActive: false,
  });
  const scrollPausedRef = useRef(false);
  const zoneRef = useRef(zone);
  const morphSettledRef = useRef(morphSettled);
  const [bundle, setBundle] = useState<MeshBundle | null>(null);

  paletteAimRef.current = paletteAim;
  accentRef.current = accent;
  bundleRef.current = bundle;
  zoneRef.current = zone;
  morphSettledRef.current = morphSettled;

  useEffect(() => {
    let cancelled = false;
    loadMeshBundle().then((b) => {
      if (!cancelled) setBundle(b);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!bundle) return;

    let cancelled = false;
    const run = () => {
      if (!cancelled) prewarmMeshLayouts(bundle);
    };

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(run, { timeout: 2200 });
      return () => {
        cancelled = true;
        cancelIdleCallback(id);
      };
    }

    const timer = setTimeout(run, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [bundle]);

  useEffect(() => {
    function aimFromEvent(clientX: number, clientY: number): FacePointer {
      const anchor = document.getElementById(HERO_MESH_ANCHOR_ID);
      let x = 0;
      let y = 0;
      let active = false;
      if (anchor) {
        const rect = anchor.getBoundingClientRect();
        if (rect.width >= 8 && rect.height >= 8) {
          const inside =
            clientX >= rect.left &&
            clientX <= rect.right &&
            clientY >= rect.top &&
            clientY <= rect.bottom;
          if (inside) {
            x = (clientX - (rect.left + rect.width * 0.5)) / rect.width;
            y = (clientY - (rect.top + rect.height * 0.5)) / rect.height;
            active = true;
          }
        }
      }
      return {
        x,
        y,
        active,
        screenX: clientX,
        screenY: clientY,
        screenActive: true,
      };
    }

    function onPointerMove(e: PointerEvent) {
      pointerRef.current = aimFromEvent(e.clientX, e.clientY);
    }

    function onPointerLeave() {
      pointerRef.current = {
        x: 0,
        y: 0,
        active: false,
        screenX: 0,
        screenY: 0,
        screenActive: false,
      };
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', onPointerLeave);
    };
  }, []);

  useEffect(() => {
    if (!bundle) return;

    hairIdsRef.current = new Set(
      [...bundle.faceMesh.visibleNodeIds].filter(
        (id: number) => bundle.faceMesh.nodes[id]?.group === 'hair',
      ),
    );

    let layerHeight = 0;
    let scrollIdleTimer = 0;

    function onScroll() {
      markScrollActivity();
      scrollPausedRef.current = true;
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrollPausedRef.current = false;
      }, SCROLL_IDLE_MS);
    }

    window.addEventListener('scroll', onScroll, { passive: true });

    const unsubscribe = subscribeMeshFrame((_ts, dt) => {
      if (document.hidden) return;

      const b = bundleRef.current;
      const layer = layerRef.current;
      if (!b || !layer) return;

      const pool = poolRef.current;
      const scrolling = scrollPausedRef.current;

      const nextH = Math.max(
        document.documentElement.scrollHeight,
        document.body.scrollHeight,
      );
      if (Math.abs(nextH - layerHeight) > 2) {
        layerHeight = nextH;
        layer.style.height = `${nextH}px`;
      }

      const meshFrameId = currentMeshFrameId();

      tickFlyingDots(
        pool,
        layer,
        wireRef.current,
        b,
        paletteAimRef.current,
        styles.dot,
        styles.dotHair,
        hairIdsRef.current,
        accentRef.current,
        dt,
        pointerRef.current,
        styles.dotFlight,
        styles.dotSettleBloom,
        styles.dotStar,
        styles.dotReflector,
        styles.dotDiamond,
        {
          scrolling,
          meshFrameId,
          wireStride: zoneRef.current === 'hero' && !morphSettledRef.current ? 2 : 1,
          wireFrame: meshFrameId,
        },
      );
    });

    return () => {
      window.clearTimeout(scrollIdleTimer);
      window.removeEventListener('scroll', onScroll);
      unsubscribe();
    };
  }, [bundle]);

  return (
    <div
      ref={layerRef}
      className={styles.layer}
      aria-hidden="true"
    >
      <canvas ref={wireRef} className={styles.wires} aria-hidden="true" />
    </div>
  );
}
