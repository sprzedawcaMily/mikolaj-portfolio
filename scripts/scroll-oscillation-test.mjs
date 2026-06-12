/**
 * Test scrolla przy szybkiej zmianie kierunku (góra/dół) w strefie morphu.
 * Wymaga: bun run dev
 * Uruchom: bun scripts/scroll-oscillation-test.mjs
 */
import { chromium } from 'playwright';

const URL = process.env.PERF_URL ?? 'http://localhost:5173/';
const MORPH_SCROLL_Y = 900;
const OSCILLATIONS = 24;
const WHEEL_DELTA = 120;

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true, timeout: 60_000 });
  } catch {
    browser = await chromium.launch({ headless: true, timeout: 60_000 });
  }

  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  await page.addInitScript(() => {
    window.__scrollProbe = {
      wheelEvents: 0,
      scrollEvents: 0,
      positions: [],
      longTasks: [],
    };
    window.addEventListener('wheel', () => { window.__scrollProbe.wheelEvents += 1; }, { passive: true });
    window.addEventListener('scroll', () => {
      window.__scrollProbe.scrollEvents += 1;
      window.__scrollProbe.positions.push({
        t: performance.now(),
        y: window.scrollY,
      });
    }, { passive: true });
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          if (e.duration >= 48) {
            window.__scrollProbe.longTasks.push({
              ms: e.duration,
              start: e.startTime,
            });
          }
        }
      }).observe({ type: 'longtask', buffered: true });
    } catch { /* ignore */ }
  });

  console.log(`\n=== Scroll oscillation test: ${URL} ===\n`);

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForTimeout(2000);

  await page.evaluate((y) => window.scrollTo(0, y), MORPH_SCROLL_Y);
  await page.waitForTimeout(800);

  const before = await page.evaluate(() => ({
    y: window.scrollY,
    mesh: window.__meshPerf?.stats?.() ?? null,
    probe: window.__scrollProbe,
  }));

  console.log(`Pozycja przed oscylacją: ${before.y}px`);
  if (before.mesh) {
    console.log(`  zone=${before.mesh.zone} morphFlying=${before.mesh.morphFlying} morphBuildT=${before.mesh.morphBuildT?.toFixed?.(2)}`);
    console.log(`  tick=${before.mesh.meshTickMs?.toFixed?.(1)}ms raf=${before.mesh.rafWorkMs?.toFixed?.(1)}ms`);
  }

  // Reset probe counters after initial scroll
  await page.evaluate(() => {
    window.__scrollProbe.wheelEvents = 0;
    window.__scrollProbe.scrollEvents = 0;
    window.__scrollProbe.positions = [];
    window.__scrollProbe.longTasks = [];
  });

  const t0 = Date.now();
  for (let i = 0; i < OSCILLATIONS; i += 1) {
    const delta = i % 2 === 0 ? WHEEL_DELTA : -WHEEL_DELTA;
    await page.mouse.wheel(0, delta);
    await page.waitForTimeout(32);
  }
  const elapsed = Date.now() - t0;

  await page.waitForTimeout(400);

  const after = await page.evaluate(() => {
    const positions = window.__scrollProbe.positions;
    let maxGap = 0;
    for (let i = 1; i < positions.length; i += 1) {
      maxGap = Math.max(maxGap, positions[i].t - positions[i - 1].t);
    }
    const yDelta = positions.length >= 2
      ? Math.abs(positions[positions.length - 1].y - positions[0].y)
      : 0;

    return {
      scrollY: window.scrollY,
      wheelEvents: window.__scrollProbe.wheelEvents,
      scrollEvents: window.__scrollProbe.scrollEvents,
      maxScrollEventGapMs: maxGap,
      scrollYDeltaDuringTest: yDelta,
      longTasks: window.__scrollProbe.longTasks,
      mesh: window.__meshPerf?.stats?.() ?? null,
      spikes: window.__meshPerf?.spikes?.()?.slice?.(-8) ?? [],
      morphLock: document.documentElement.className,
    };
  });

  console.log(`\n--- Wynik oscylacji (${OSCILLATIONS}× wheel, ${elapsed}ms) ---`);
  console.log(`  scrollY końcowy: ${after.scrollY}px`);
  console.log(`  wheel events: ${after.wheelEvents}`);
  console.log(`  scroll events: ${after.scrollEvents}`);
  console.log(`  ΔscrollY podczas testu: ${after.scrollYDeltaDuringTest.toFixed(0)}px`);
  console.log(`  max przerwa między scroll events: ${after.maxScrollEventGapMs.toFixed(0)}ms`);

  if (after.mesh) {
    console.log(`  zone=${after.mesh.zone} morphFlying=${after.mesh.morphFlying} morphBuildT=${after.mesh.morphBuildT?.toFixed?.(2)}`);
    console.log(`  fps=${after.mesh.fps} tick=${after.mesh.meshTickMs?.toFixed?.(1)}ms frameGap=${after.mesh.frameGapMs?.toFixed?.(1)}ms`);
  }

  console.log(`\n  Long tasks (≥48ms): ${after.longTasks.length}`);
  for (const lt of after.longTasks.slice(0, 6)) {
    console.log(`    - ${lt.ms.toFixed(0)}ms @ ${lt.start.toFixed(0)}`);
  }

  if (after.spikes.length) {
    console.log('\n  Mesh spikes:');
    for (const sp of after.spikes) {
      console.log(`    - [${sp.kind}] ${sp.ms.toFixed(0)}ms ${sp.label} scroll=${sp.scrolling}`);
    }
  }

  const blocked = after.wheelEvents > 4 && after.scrollYDeltaDuringTest < 20;
  const janky = after.maxScrollEventGapMs > 80 || after.longTasks.length >= 3;

  console.log('\n--- Diagnoza ---');
  if (blocked) {
    console.log('  ❌ SCROLL ZABLOKOWANY — wheel bez ruchu scrollY (wątek główny zajęty)');
  } else if (janky) {
    console.log('  ⚠️  SCROLL ZACINA SIĘ — duże przerwy / long tasks przy zmianie kierunku');
  } else {
    console.log('  ✓ Scroll reaguje na oscylację (w headless może różnić się od myszy)');
  }

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
