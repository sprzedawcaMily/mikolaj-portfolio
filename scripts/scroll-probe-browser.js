/**
 * Wklej w konsoli DevTools (F12) podczas scrolla w strefie morphu.
 * Po 5 s wypisze czy scroll reaguje na zmianę kierunku.
 */
(function scrollProbe() {
  const probe = {
    wheels: 0,
    scrolls: 0,
    positions: [],
    longTasks: [],
    t0: performance.now(),
  };

  const onWheel = () => { probe.wheels += 1; };
  const onScroll = () => {
    probe.scrolls += 1;
    probe.positions.push({ t: performance.now() - probe.t0, y: scrollY });
  };

  window.addEventListener('wheel', onWheel, { passive: true });
  window.addEventListener('scroll', onScroll, { passive: true });

  let obs;
  try {
    obs = new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (e.duration >= 48) {
          probe.longTasks.push({ ms: +e.duration.toFixed(1), at: +(performance.now() - probe.t0).toFixed(0) });
        }
      }
    });
    obs.observe({ type: 'longtask', buffered: true });
  } catch { /* ignore */ }

  console.info('[scroll-probe] START — przez 5 s kręć kółkiem góra/dół w strefie morphu');

  setTimeout(() => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScroll);
    obs?.disconnect();

    let maxGap = 0;
    for (let i = 1; i < probe.positions.length; i += 1) {
      maxGap = Math.max(maxGap, probe.positions[i].t - probe.positions[i - 1].t);
    }
    const yRange = probe.positions.length >= 2
      ? Math.abs(probe.positions.at(-1).y - probe.positions[0].y)
      : 0;
    const mesh = window.__meshPerf?.stats?.();

    console.info('[scroll-probe] WYNIK', {
      wheels: probe.wheels,
      scrollEvents: probe.scrolls,
      scrollYRangePx: Math.round(yRange),
      maxGapBetweenScrollEventsMs: +maxGap.toFixed(0),
      longTasks48msPlus: probe.longTasks,
      meshZone: mesh?.zone,
      morphFlying: mesh?.morphFlying,
      morphBuildT: mesh?.morphBuildT,
      fps: mesh?.fps,
      tickMs: mesh?.meshTickMs,
      frameGapMs: mesh?.frameGapMs,
    });

    if (probe.wheels > 3 && yRange < 24) {
      console.warn('[scroll-probe] ❌ Scroll zablokowany — wheel bez ruchu scrollY');
    } else if (maxGap > 100 || probe.longTasks.length >= 2) {
      console.warn('[scroll-probe] ⚠️ Zacinanie — long task lub przerwa >100ms');
    } else {
      console.info('[scroll-probe] ✓ Scroll reaguje');
    }
  }, 5000);

  return probe;
})();
