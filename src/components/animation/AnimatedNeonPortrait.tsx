import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import type { MeshZone } from '@/hooks/meshScrollEngine';
import { ZONE_ORDER } from '@/hooks/meshScrollEngine';
import type { PortraitAimPoint, PortraitMorphTick } from '@/hooks/usePortraitScrollMorph';
import type { MeshPinState } from '@/hooks/meshScrollEngine';
import { accentHairStyle } from '@/components/animation/mesh/faceMesh';
import { ensureAtlas, scaleAim } from '@/components/animation/mesh/morph/atlasCache';
import {
  buildHostMorphPairs,
  logMorphPairing,
  zoneDotCount,
  logZoneCatalog,
  logZoneDotCounts,
} from '@/components/animation/mesh/morph/dotCatalog';
import { loadMeshBundle } from '@/components/animation/mesh/morph/loadMeshBundle';
import { paintMorphFrame } from '@/components/animation/mesh/morph/paintFrame';
import {
  assignFlightTargets,
  bootstrapPool,
  createDotPool,
  poolFlightActive,
  tickDotPool,
  type DotPool,
} from '@/components/animation/mesh/morph/persistentDotPool';
import type { MeshBundle, SourceSnapshot, ZoneSnapshot } from '@/components/animation/mesh/morph/types';
import {
  captureSourceFromSnapshot,
  edgeGroupLookup,
  heroSnapshot,
  layoutEdges,
  snapshotFromZoneLayout,
} from '@/components/animation/mesh/morph/zoneSnapshot';
import styles from './AnimatedNeonPortrait.module.css';

const FRAME_IDLE_MS = 1000 / 30;

interface AnimatedNeonPortraitProps {
  zoneRef: RefObject<MeshZone>;
  aimPointRef: RefObject<PortraitAimPoint | null>;
  morphTickRef: RefObject<PortraitMorphTick>;
  morphTRef: RefObject<number>;
  restartMorphRef: RefObject<(now: number) => void>;
  pinEndRef: RefObject<MeshPinState | null>;
  pinSessionEndRef: RefObject<MeshPinState | null>;
}

function layoutFromPin(pin: MeshPinState | null, fallbackW: number, fallbackH: number) {
  if (!pin) return { w: fallbackW, h: fallbackH };
  return {
    w: Math.max(180, Math.round(pin.stageW)),
    h: Math.max(96, Math.round(pin.stageH)),
  };
}

export function AnimatedNeonPortrait({
  zoneRef,
  aimPointRef,
  morphTickRef,
  morphTRef,
  restartMorphRef,
  pinEndRef,
  pinSessionEndRef,
}: AnimatedNeonPortraitProps) {
  const { accent } = useTheme();
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dotLayerRef = useRef<HTMLDivElement>(null);
  const dotPoolRef = useRef<DotPool>(createDotPool());
  const atlasCache = useRef<{ key: string; atlas: import('@/components/animation/mesh/meshDotAtlas').DotAtlas | null }>({
    key: '',
    atlas: null,
  });
  const activeSnapshotRef = useRef<ZoneSnapshot | null>(null);
  const morphSourceRef = useRef<SourceSnapshot | null>(null);
  const morphTargetRef = useRef<ZoneSnapshot | null>(null);
  const catalogLoggedRef = useRef(false);
  const latchedAimKeyRef = useRef('');
  const hairStyleRef = useRef(accentHairStyle(accent));
  hairStyleRef.current = accentHairStyle(accent);

  const [bundle, setBundle] = useState<MeshBundle | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadMeshBundle().then((b) => {
      if (!cancelled) setBundle(b);
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    if (!bundle) return;
    const meshBundle = bundle;

    let frame = 0;
    let lastFrame = 0;
    const { faceMesh } = meshBundle;
    const heroEdges = layoutEdges(faceMesh.edges, edgeGroupLookup(faceMesh));

    function resizeCanvas(w: number, h: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    function beginFlight(
      fromZone: MeshZone | null,
      prevLayout: { w: number; h: number },
      targetLayout: { w: number; h: number },
      goalZone: MeshZone,
      needsPaletteAim: boolean,
      canvasLayout: { w: number; h: number },
      nowMs: number,
    ) {
      const layer = dotLayerRef.current;
      const pool = dotPoolRef.current;
      if (!layer) return;

      const prev = activeSnapshotRef.current;
      if (prev) {
        morphSourceRef.current = captureSourceFromSnapshot(prev);
      } else if (fromZone && fromZone !== 'hero') {
        const zoneAtlas = ensureAtlas(meshBundle, atlasCache.current, prevLayout.w, prevLayout.h, null);
        const snap = snapshotFromZoneLayout(fromZone, zoneAtlas, faceMesh, prevLayout.w, prevLayout.h);
        if (snap) morphSourceRef.current = captureSourceFromSnapshot(snap);
      } else if (fromZone === 'hero' || fromZone === null) {
        const heroAtlas = ensureAtlas(meshBundle, atlasCache.current, prevLayout.w, prevLayout.h, null);
        const snap = heroSnapshot(heroAtlas, faceMesh, prevLayout.w, prevLayout.h);
        if (snap) morphSourceRef.current = captureSourceFromSnapshot(snap);
      }

      const targetAtlas = ensureAtlas(
        meshBundle,
        atlasCache.current,
        targetLayout.w,
        targetLayout.h,
        needsPaletteAim && aimPointRef.current
          ? scaleAim(aimPointRef.current, targetLayout.w, targetLayout.h)
          : null,
      );
      morphTargetRef.current = snapshotFromZoneLayout(
        goalZone,
        targetAtlas,
        faceMesh,
        targetLayout.w,
        targetLayout.h,
      );

      if (!pool.bootstrapped && morphSourceRef.current) {
        bootstrapPool(pool, layer, morphSourceRef.current, canvasLayout.w, canvasLayout.h, styles.morphDot);
      }

      if (morphSourceRef.current && morphTargetRef.current) {
        assignFlightTargets(
          pool,
          layer,
          styles.morphDot,
          morphSourceRef.current,
          morphTargetRef.current,
          canvasLayout.w,
          canvasLayout.h,
          nowMs,
        );
      }

      if (import.meta.env.DEV && morphSourceRef.current && morphTargetRef.current) {
        if (!catalogLoggedRef.current) {
          catalogLoggedRef.current = true;
          const zoneRows = ZONE_ORDER.map((zone) => ({
            zone,
            snapshot: snapshotFromZoneLayout(
              zone,
              targetAtlas,
              faceMesh,
              targetLayout.w,
              targetLayout.h,
            ),
          }));
          logZoneDotCounts(zoneRows);
          for (const row of zoneRows) {
            if (row.snapshot) logZoneCatalog(row.zone, row.snapshot);
          }
        }
        const pairs = buildHostMorphPairs(morphSourceRef.current, morphTargetRef.current);
        logMorphPairing(
          fromZone ?? 'src',
          goalZone,
          pairs,
          zoneDotCount(morphSourceRef.current),
          zoneDotCount(morphTargetRef.current),
        );
      }
    }

    function finishFlight() {
      if (!morphTargetRef.current || morphTargetRef.current.zone !== zoneRef.current) return;
      activeSnapshotRef.current = morphTargetRef.current;
      morphSourceRef.current = null;
      morphTargetRef.current = null;
    }

    function applyFrame(now: number) {
      const root = rootRef.current;
      const canvas = canvasRef.current;
      const layer = dotLayerRef.current;
      if (!root || !canvas || !layer) return;

      const w = Math.max(180, root.clientWidth);
      const h = Math.max(96, root.clientHeight);
      if (w <= 0 || h <= 0) return;

      const goalZone = zoneRef.current;
      const needsPaletteAim = goalZone === 'palette';
      const pool = dotPoolRef.current;

      if (canvas.width !== w || canvas.height !== h) resizeCanvas(w, h);

      const flightBusy = poolFlightActive(pool, now) || Boolean(morphTargetRef.current);

      if (
        morphTargetRef.current
        && !poolFlightActive(pool, now)
        && morphTargetRef.current.zone === goalZone
      ) {
        finishFlight();
      }

      const activeZone = activeSnapshotRef.current?.zone ?? null;
      const prevAtlasKey = atlasCache.current.key;
      const morphActive = flightBusy;

      const scaledAim =
        needsPaletteAim && aimPointRef.current
          ? scaleAim(aimPointRef.current, w, h)
          : null;

      if (morphActive || needsPaletteAim) {
        ensureAtlas(meshBundle, atlasCache.current, w, h, scaledAim);
      }

      const paletteAimShifted =
        goalZone === 'palette'
        && atlasCache.current.key !== prevAtlasKey
        && !morphActive;

      const needsFlight =
        !poolFlightActive(pool, now)
        && activeZone !== goalZone
        && morphTargetRef.current?.zone !== goalZone;

      let morphRestarted = false;

      if (needsFlight && activeZone !== null) {
        const prevLayout = activeSnapshotRef.current
          ? { w: activeSnapshotRef.current.layoutW, h: activeSnapshotRef.current.layoutH }
          : { w, h };
        const targetLayout = layoutFromPin(
          pinSessionEndRef.current ?? pinEndRef.current,
          w,
          h,
        );
        beginFlight(activeZone, prevLayout, targetLayout, goalZone, needsPaletteAim, { w, h }, now);
        restartMorphRef.current(now);
        morphRestarted = true;
        latchedAimKeyRef.current = atlasCache.current.key;
      } else if (needsFlight && activeZone === null && goalZone !== 'hero') {
        const targetLayout = layoutFromPin(
          pinSessionEndRef.current ?? pinEndRef.current,
          w,
          h,
        );
        beginFlight(null, { w, h }, targetLayout, goalZone, needsPaletteAim, { w, h }, now);
        restartMorphRef.current(now);
        morphRestarted = true;
        latchedAimKeyRef.current = atlasCache.current.key;
      } else if (paletteAimShifted) {
        const snap = snapshotFromZoneLayout(goalZone, atlasCache.current.atlas!, faceMesh, w, h);
        if (snap && activeSnapshotRef.current) {
          morphSourceRef.current = captureSourceFromSnapshot(activeSnapshotRef.current);
          morphTargetRef.current = snap;
          assignFlightTargets(pool, layer, styles.morphDot, morphSourceRef.current, snap, w, h, now);
          restartMorphRef.current(now);
          morphRestarted = true;
        }
        latchedAimKeyRef.current = atlasCache.current.key;
      }

      const morphT = morphRestarted ? 0 : morphTRef.current;
      const inFlight = poolFlightActive(pool, now) || Boolean(morphTargetRef.current);

      if (!pool.bootstrapped && goalZone === 'hero') {
        const atlas = ensureAtlas(meshBundle, atlasCache.current, w, h, null);
        const snap = heroSnapshot(atlas, faceMesh, w, h);
        if (snap) {
          bootstrapPool(pool, layer, snap, w, h, styles.morphDot);
          activeSnapshotRef.current = snap;
        }
      }

      const ticked = tickDotPool(pool, now, w, h);
      const layoutScale = pool.layoutScale || activeSnapshotRef.current?.layoutScale || 1;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      paintMorphFrame({
        ctx,
        w,
        h,
        now,
        morphT,
        goalZone,
        heroIdle: goalZone === 'hero' && !inFlight,
        faceMesh,
        hairStyle: hairStyleRef.current,
        positions: ticked.positions,
        splitDots: ticked.splitDots,
        indexedDots: ticked.dots,
        hostSettle: ticked.hostSettle,
        layoutScale,
        heroEdges,
        source: inFlight ? morphSourceRef.current : null,
        target: inFlight ? morphTargetRef.current : activeSnapshotRef.current,
        dotsOnDom: true,
      });
    }

    function tick(now: number) {
      if (document.hidden) {
        frame = requestAnimationFrame(tick);
        return;
      }
      frame = requestAnimationFrame(tick);
      morphTickRef.current(now, 0);
      const interval = poolFlightActive(dotPoolRef.current, now) ? 0 : FRAME_IDLE_MS;
      if (interval > 0 && now - lastFrame < interval) return;
      lastFrame = now;
      applyFrame(now);
    }

    function onScroll() {
      morphTickRef.current(performance.now(), 0);
    }

    applyFrame(performance.now());
    setReady(true);
    frame = requestAnimationFrame(tick);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      setReady(false);
    };
  }, [bundle, zoneRef, aimPointRef, morphTickRef, morphTRef, restartMorphRef, pinEndRef, pinSessionEndRef]);

  return (
    <div ref={rootRef} className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.meshCanvas}
        aria-label="Mesh portrait"
        style={{ visibility: ready ? 'visible' : 'hidden' }}
      />
      <div
        ref={dotLayerRef}
        className={styles.morphDotLayer}
        aria-hidden="true"
      />
    </div>
  );
}
