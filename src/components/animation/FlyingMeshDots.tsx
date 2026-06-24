import { useEffect, useRef, useState } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { loadMeshBundle } from '@/components/animation/mesh/morph/loadMeshBundle';
import type { MeshBundle } from '@/components/animation/mesh/morph/types';
import {
  createFlyingPool,
  isMeshMorphBusy,
  isMorphSettled,
  prewarmMeshLayouts,
  stashScrollZoneIntent,
  tickFlyingDots,
  type FacePointer,
} from '@/components/animation/flyingDotEngine';
import { setMeshReady, setMeshMorphing, setMeshScrolling, setMorphZoneLock } from '@/hooks/meshZoneStore';
import {
  invalidateZonePinsCache,
  resolveScrollTargetZone,
  HERO_MESH_ANCHOR_ID,
  FLYING_MESH_CANVAS_ID,
  MESH_LAYER_ID,
} from '@/hooks/meshScrollEngine';
import { currentMeshFrameId, subscribeMeshFrame } from '@/hooks/meshAnimationLoop';
import { isMeshFullFps, isMeshLiteMode, isMeshReducedMotion, isMeshSlowMode } from '@/hooks/meshPerfMode';
import { attachScrollIntentTracking, markScrollActivity } from '@/hooks/meshPerfStats';
import { attachScrollRevealTracking } from '@/hooks/scrollRevealBatch';
import { readMeshZone } from '@/hooks/meshZoneStore';
import styles from './FlyingMeshDots.module.css';

const SCROLL_IDLE_MS = 80;
let prewarmScheduled = false;

export function FlyingMeshDots() {
  const { accent } = useTheme();
  const slow = isMeshSlowMode();
  const lite = isMeshLiteMode();
  const reducedMotion = isMeshReducedMotion();
  const layerRef = useRef<HTMLDivElement>(null);
  const wireRef = useRef<HTMLCanvasElement>(null);
  const poolRef = useRef(createFlyingPool());
  const bundleRef = useRef<MeshBundle | null>(null);
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
  const catchUpRef = useRef(false);
  const [bundle, setBundle] = useState<MeshBundle | null>(null);

  accentRef.current = accent;
  bundleRef.current = bundle;

  useEffect(() => {
    let cancelled = false;
    loadMeshBundle().then((b) => {
      if (!cancelled) setBundle(b);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!bundle || prewarmScheduled) return;
    prewarmScheduled = true;

    let cancelled = false;
    const prewarm = () => {
      if (!cancelled) prewarmMeshLayouts(bundle);
    };

    const unsubExpand = bundle.onZonesExpanded?.(() => {
      if (!cancelled) prewarmMeshLayouts(bundle);
    });

    if (bundle.zonesReady) {
      prewarm();
      return () => {
        cancelled = true;
        unsubExpand?.();
      };
    }

    if (typeof requestIdleCallback === 'function') {
      const id = requestIdleCallback(prewarm, { timeout: 3000 });
      return () => {
        cancelled = true;
        unsubExpand?.();
        cancelIdleCallback(id);
      };
    }

    const timer = setTimeout(prewarm, 0);
    return () => {
      cancelled = true;
      unsubExpand?.();
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
    let layerHeightFrame = 0;
    let scrollIdleTimer = 0;
    let paintedOnce = false;

    function onUserScrollIntent() {
      markScrollActivity();
      catchUpRef.current = false;
      scrollPausedRef.current = true;
      setMeshScrolling(true);
      setMorphZoneLock(null);
      stashScrollZoneIntent(poolRef.current, resolveScrollTargetZone());
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrollPausedRef.current = false;
        setMeshScrolling(false);
        catchUpRef.current = true;
        invalidateZonePinsCache();
      }, SCROLL_IDLE_MS);
    }

    attachScrollIntentTracking();
    attachScrollRevealTracking();
    window.addEventListener('scroll', onUserScrollIntent, { passive: true });
    window.addEventListener('wheel', onUserScrollIntent, { passive: true });
    window.addEventListener('touchmove', onUserScrollIntent, { passive: true });

    const unsubscribe = subscribeMeshFrame((_ts, dt) => {
      if (document.hidden) return;

      const scrolling = scrollPausedRef.current;
      const meshFrameId = currentMeshFrameId();

      const b = bundleRef.current;
      const layer = layerRef.current;
      if (!b || !layer) return;

      const pool = poolRef.current;
      const morphBusy = isMeshMorphBusy(pool);
      const activeZone = pool.activeZone ?? readMeshZone().zone;
      const scrollTarget = pool.pendingScrollZone ?? resolveScrollTargetZone();
      const paletteMorph =
        pool.morphCommitZone != null
        || pool.zoneSyncPending?.zone === 'palette'
        || activeZone === 'palette'
        || scrollTarget === 'palette';
      const onScreenMorphZone =
        activeZone === 'hero'
        || activeZone === 'palette'
        || morphBusy
        || pool.zoneSyncPending != null
        || paletteMorph;
      if (scrolling && meshFrameId % 2 !== 0 && !onScreenMorphZone) {
        return;
      }
      const catchUp = !scrolling && catchUpRef.current;
      if (
        catchUp
        && isMorphSettled(pool)
        && !pool.zoneSyncPending
        && (pool.morphCommitZone == null || pool.activeZone === pool.morphCommitZone)
      ) {
        catchUpRef.current = false;
      }

      layerHeightFrame += 1;
      if (!scrolling || layerHeightFrame % 8 === 0) {
        const nextH = Math.max(
          document.documentElement.scrollHeight,
          document.body.scrollHeight,
        );
        if (Math.abs(nextH - layerHeight) > 2) {
          layerHeight = nextH;
          layer.style.height = `${nextH}px`;
        }
      }

      const unlimitedFps = isMeshFullFps();
      const wireStride = unlimitedFps
        ? 1
        : morphBusy && !scrolling
          ? 2
          : !scrolling
            ? 1
            : slow
              ? 6
              : lite
                ? 6
                : reducedMotion
                  ? 5
                  : 4;

      tickFlyingDots(
        pool,
        layer,
        wireRef.current,
        b,
        readMeshZone().paletteAim,
        styles.dot,
        styles.dotHair,
        hairIdsRef.current,
        accentRef.current,
        dt,
        pointerRef.current,
        slow ? '' : styles.dotFlight,
        slow ? '' : styles.dotSettleBloom,
        slow ? '' : styles.dotStar,
        slow ? '' : styles.dotReflector,
        slow ? '' : styles.dotDiamond,
        {
          scrolling,
          scrollLite: scrolling,
          catchUp,
          meshFrameId,
          wireFrame: meshFrameId,
          wireStride,
          reducedMotion,
        },
      );

      setMeshMorphing(morphBusy);

      if (!paintedOnce) {
        paintedOnce = true;
        setMeshReady(true);
      }
    });

    return () => {
      window.clearTimeout(scrollIdleTimer);
      window.removeEventListener('scroll', onUserScrollIntent);
      window.removeEventListener('wheel', onUserScrollIntent);
      window.removeEventListener('touchmove', onUserScrollIntent);
      unsubscribe();
      setMorphZoneLock(null);
      setMeshScrolling(false);
      setMeshMorphing(false);
    };
  }, [bundle, slow, lite, reducedMotion]);

  return (
    <div
      id={MESH_LAYER_ID}
      ref={layerRef}
      className={styles.layer}
      aria-hidden="true"
    >
      <canvas
        id={FLYING_MESH_CANVAS_ID}
        ref={wireRef}
        className={styles.wires}
        aria-hidden="true"
      />
    </div>
  );
}
