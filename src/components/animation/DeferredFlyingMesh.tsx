import { lazy, Suspense, useEffect, useState } from 'react';

const FlyingMeshDots = lazy(() =>
  import('@/components/animation/FlyingMeshDots').then((m) => ({
    default: m.FlyingMeshDots,
  })),
);

/**
 * Mesh ładuje się po pierwszym paint (rAF + idle), żeby nie blokować LCP.
 * HeroMeshPlaceholder zostaje do setMeshReady — mechanika scroll/morph bez zmian.
 */
export function DeferredFlyingMesh() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let idleId = 0;
    let timeoutId = 0;

    const mount = () => {
      if (!cancelled) setReady(true);
    };

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        if (typeof requestIdleCallback === 'function') {
          idleId = requestIdleCallback(mount, { timeout: 1800 });
        } else {
          timeoutId = window.setTimeout(mount, 48);
        }
      });
    });

    return () => {
      cancelled = true;
      if (idleId && typeof cancelIdleCallback === 'function') cancelIdleCallback(idleId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <FlyingMeshDots />
    </Suspense>
  );
}
