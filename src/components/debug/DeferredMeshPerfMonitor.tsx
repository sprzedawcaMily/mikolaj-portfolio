import { lazy, Suspense, useEffect, useState } from 'react';

const MeshPerfMonitor = lazy(() =>
  import('@/components/debug/MeshPerfMonitor').then((m) => ({
    default: m.MeshPerfMonitor,
  })),
);

export function DeferredMeshPerfMonitor() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId = 0;

    const mount = () => {
      if (!cancelled) setReady(true);
    };

    if (typeof requestIdleCallback === 'function') {
      idleId = requestIdleCallback(mount, { timeout: 4000 });
    } else {
      const t = window.setTimeout(mount, 500);
      return () => {
        cancelled = true;
        window.clearTimeout(t);
      };
    }

    return () => {
      cancelled = true;
      if (idleId && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
    };
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <MeshPerfMonitor />
    </Suspense>
  );
}
