import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import type { MeshZone } from '@/hooks/meshScrollEngine';
import { buildDotAtlas } from '@/components/animation/mesh/meshDotAtlas';
import { loadMeshBundle } from '@/components/animation/mesh/morph/loadMeshBundle';
import type { MeshBundle } from '@/components/animation/mesh/morph/types';
import { snapshotFromZoneLayout } from '@/components/animation/mesh/morph/zoneSnapshot';
import { scaleAim } from '@/components/animation/mesh/morph/atlasCache';
import { useMeshZone } from '@/context/MeshZoneContext';
import styles from './ZoneMeshDots.module.css';

type ZoneMeshDotsProps = {
  zone: MeshZone;
  rotateDeg?: number;
};

export function ZoneMeshDots({ zone, rotateDeg = 0 }: ZoneMeshDotsProps) {
  const { zone: activeZone, paletteAim } = useMeshZone();
  const { accent } = useTheme();
  const stageRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const [bundle, setBundle] = useState<MeshBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMeshBundle().then((b) => {
      if (!cancelled) setBundle(b);
    });
    return () => { cancelled = true; };
  }, []);

  useLayoutEffect(() => {
    const stage = stageRef.current;
    if (!stage || !bundle) return;

    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (w < 24 || h < 24) return;

    const scaledAim =
      zone === 'palette' && paletteAim
        ? scaleAim(
            {
              x: paletteAim.x,
              y: paletteAim.y,
              centerX: paletteAim.centerX,
              stageW: paletteAim.stageW,
              stageH: paletteAim.stageH,
            },
            w,
            h,
          )
        : null;

    const atlas = buildDotAtlas(
      bundle.faceMesh,
      bundle.zoneMeshes,
      w,
      h,
      scaledAim,
    );
    const snap = snapshotFromZoneLayout(zone, atlas, bundle.faceMesh, w, h);
    if (!snap) return;

    const r = Math.max(1.4, 4.5 * snap.layoutScale);
    const size = r * 2;
    const hairIds = new Set(
      [...bundle.faceMesh.visibleNodeIds].filter(
        (id: number) => bundle.faceMesh.nodes[id]?.group === 'hair',
      ),
    );

    if (!mountedRef.current) {
      stage.replaceChildren();

      for (const id of snap.mappedIds) {
        const norm = snap.goals.get(id);
        if (!norm) continue;
        const dot = document.createElement('span');
        dot.className = hairIds.has(id) && zone === 'hero'
          ? `${styles.dot} ${styles.dotHair}`
          : styles.dot;
        if (hairIds.has(id) && zone === 'hero') {
          dot.style.background = accent;
        }
        dot.dataset.hostId = String(id);
        dot.style.width = `${size}px`;
        dot.style.height = `${size}px`;
        dot.style.left = `calc(${norm.nx * 100}% - ${r}px)`;
        dot.style.top = `calc(${norm.ny * 100}% - ${r}px)`;
        stage.appendChild(dot);
      }

      for (const [hostId, pts] of snap.splits) {
        pts.forEach((norm) => {
          const dot = document.createElement('span');
          dot.className = styles.dot;
          dot.dataset.hostId = String(hostId);
          dot.style.width = `${size}px`;
          dot.style.height = `${size}px`;
          dot.style.left = `calc(${norm.nx * 100}% - ${r}px)`;
          dot.style.top = `calc(${norm.ny * 100}% - ${r}px)`;
          stage.appendChild(dot);
        });
      }

      mountedRef.current = true;
      return;
    }

    let i = 0;
    const dots = stage.querySelectorAll('span');
    for (const id of snap.mappedIds) {
      const norm = snap.goals.get(id);
      const el = dots[i] as HTMLElement | undefined;
      i += 1;
      if (!norm || !el) continue;
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.left = `calc(${norm.nx * 100}% - ${r}px)`;
      el.style.top = `calc(${norm.ny * 100}% - ${r}px)`;
    }
    for (const [, pts] of snap.splits) {
      pts.forEach((norm) => {
        const el = dots[i] as HTMLElement | undefined;
        i += 1;
        if (!el) return;
        el.style.width = `${size}px`;
        el.style.height = `${size}px`;
        el.style.left = `calc(${norm.nx * 100}% - ${r}px)`;
        el.style.top = `calc(${norm.ny * 100}% - ${r}px)`;
      });
    }
  }, [bundle, zone, paletteAim, accent]);

  const visible = activeZone === zone;

  return (
    <div
      ref={stageRef}
      className={styles.stage}
      style={{
        opacity: visible ? 0.92 : 0,
        visibility: visible ? 'visible' : 'hidden',
        transform: rotateDeg ? `rotate(${rotateDeg}deg)` : undefined,
        transformOrigin: '50% 50%',
      }}
      aria-hidden={!visible}
    />
  );
}
