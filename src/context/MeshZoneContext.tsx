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
} from '@/hooks/meshScrollEngine';
import { currentMeshFrameId, subscribeMeshFrame } from '@/hooks/meshAnimationLoop';
import {
  isMeshScrolling,
  publishMeshZone,
  readMeshZone,
  subscribeMeshZone,
} from '@/hooks/meshZoneStore';

type MeshZoneContextValue = {
  zone: MeshZone;
};

const MeshZoneContext = createContext<MeshZoneContextValue>({
  zone: 'hero',
});

export function MeshZoneProvider({ children }: { children: ReactNode }) {
  const [zone, setZone] = useState<MeshZone>('hero');

  useLayoutEffect(() => {
    let active = true;

    const unsubscribeFrame = subscribeMeshFrame(() => {
      if (!active || document.hidden) return;
      if (isMeshScrolling()) return;
      const frame = computeScrollFrame(currentMeshFrameId());
      if (!frame) return;

      const prev = readMeshZone();

      if (frame.zone !== 'palette' || !frame.paletteAim) {
        if (prev.paletteAim !== frame.paletteAim) {
          publishMeshZone({ zone: prev.zone, paletteAim: frame.paletteAim });
        }
        return;
      }

      const next = frame.paletteAim;
      const cur = prev.paletteAim;
      if (
        cur
        && Math.round(cur.x * 4) === Math.round(next.x * 4)
        && Math.round(cur.y * 4) === Math.round(next.y * 4)
      ) {
        return;
      }

      publishMeshZone({ zone: frame.zone, paletteAim: next });
    });

    const unsubscribeZone = subscribeMeshZone(() => {
      if (!active) return;
      setZone(readMeshZone().zone);
    });

    return () => {
      active = false;
      unsubscribeFrame();
      unsubscribeZone();
    };
  }, []);

  return (
    <MeshZoneContext.Provider value={{ zone }}>
      {children}
    </MeshZoneContext.Provider>
  );
}

export function useMeshZone() {
  return useContext(MeshZoneContext);
}
