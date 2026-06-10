import {
  createContext,
  useContext,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  computeScrollFrame,
  type MeshZone,
  type ScrollAimPoint,
} from '@/hooks/meshScrollEngine';
import { currentMeshFrameId, subscribeMeshFrame } from '@/hooks/meshAnimationLoop';

type MeshZoneContextValue = {
  zone: MeshZone;
  paletteAim: ScrollAimPoint | null;
};

const MeshZoneContext = createContext<MeshZoneContextValue>({
  zone: 'hero',
  paletteAim: null,
});

export function MeshZoneProvider({ children }: { children: ReactNode }) {
  const [value, setValue] = useState<MeshZoneContextValue>({
    zone: 'hero',
    paletteAim: null,
  });

  useLayoutEffect(() => {
    let active = true;

    const unsubscribe = subscribeMeshFrame(() => {
      if (!active || document.hidden) return;
      const frame = computeScrollFrame(currentMeshFrameId());
      if (!frame) return;

      setValue((prev) => {
        if (prev.zone !== frame.zone) {
          return { zone: frame.zone, paletteAim: frame.paletteAim };
        }
        if (frame.zone !== 'palette' || !frame.paletteAim) {
          if (prev.paletteAim === frame.paletteAim) return prev;
          return { zone: frame.zone, paletteAim: frame.paletteAim };
        }
        const next = frame.paletteAim;
        const cur = prev.paletteAim;
        if (
          cur
          && Math.round(cur.x * 4) === Math.round(next.x * 4)
          && Math.round(cur.y * 4) === Math.round(next.y * 4)
        ) {
          return prev;
        }
        return { zone: frame.zone, paletteAim: next };
      });
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return (
    <MeshZoneContext.Provider value={value}>
      {children}
    </MeshZoneContext.Provider>
  );
}

export function useMeshZone() {
  return useContext(MeshZoneContext);
}
