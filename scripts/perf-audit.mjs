/**
 * Audyt wydajności strony — Playwright + Performance API.
 * Uruchom: bun run dev (osobny terminal), potem: bun run perf:audit
 */
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const LOG_DIR = path.join(process.cwd(), 'logs');
const REPORT_PATH = path.join(LOG_DIR, 'mesh-perf-audit.json');

const URL = process.env.PERF_URL ?? 'http://localhost:5173/';
const SCROLL_STEPS = 12;
const SCROLL_PAUSE_MS = 400;
const SETTLE_MS = 2500;

function percentile(sorted, p) {
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

async function collectFrameMetrics(page, label, durationMs = 3000) {
  return page.evaluate(
  async ({ label, durationMs }) => {
    const gaps = [];
    const rafWork = [];
    let last = performance.now();
    let frames = 0;
    const start = performance.now();

    await new Promise((resolve) => {
      function tick(now) {
        const gap = now - last;
        last = now;
        gaps.push(gap);
        frames += 1;
        if (now - start < durationMs) requestAnimationFrame(tick);
        else resolve();
      }
      requestAnimationFrame(tick);
    });

    gaps.sort((a, b) => a - b);
    const meshStats = window.__meshPerf?.stats?.() ?? null;

    return {
      label,
      frames,
      durationMs: performance.now() - start,
      gapP50: gaps[Math.floor(gaps.length * 0.5)] ?? 0,
      gapP95: gaps[Math.floor(gaps.length * 0.95)] ?? 0,
      gapMax: gaps[gaps.length - 1] ?? 0,
      fps: frames / ((performance.now() - start) / 1000),
      meshStats,
      rafWork,
    };
  },
  { label, durationMs },
  );
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    timeout: 120_000,
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();

  const longTasks = [];
  await page.addInitScript(() => {
    try {
      const obs = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          window.__longTasks = window.__longTasks || [];
          window.__longTasks.push({ name: e.name, duration: e.duration, start: e.startTime });
        }
      });
      obs.observe({ type: 'longtask', buffered: true });
    } catch {
      /* ignore */
    }
  });

  console.log(`\n=== Perf audit: ${URL} ===\n`);

  const navStart = Date.now();
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 60000 });
  const loadMs = Date.now() - navStart;
  console.log(`Load (networkidle): ${loadMs} ms`);

  await page.waitForTimeout(SETTLE_MS);

  const heroMetrics = await collectFrameMetrics(page, 'hero-idle', 3500);
  console.log('\n--- Hero (idle, 3.5s) ---');
  console.log(`  FPS (rAF): ${heroMetrics.fps.toFixed(1)}`);
  console.log(`  Frame gap p50/p95/max: ${heroMetrics.gapP50.toFixed(1)} / ${heroMetrics.gapP95.toFixed(1)} / ${heroMetrics.gapMax.toFixed(1)} ms`);

  if (heroMetrics.meshStats) {
    const s = heroMetrics.meshStats;
    console.log(`  Mesh monitor: fps=${s.fps} activeDots=${s.activeDots} visible=${s.visibleDots}`);
    console.log(`  RAF work: ${s.rafWorkMs?.toFixed?.(1) ?? '?'} ms  tick: ${s.meshTickMs?.toFixed?.(1) ?? '?'} ms`);
    console.log(`  Paint: DOM=${s.domPaints} canvas=${s.canvasDots} wires=${s.wireEdges}`);
    console.log(`  Phases: atlas=${s.phases?.atlasBuild?.toFixed?.(1)} sync=${s.phases?.sync?.toFixed?.(1)} paint=${((s.phases?.paintDots ?? 0) + (s.phases?.paintWires ?? 0)).toFixed(1)}`);
    console.log(`  Prewarm: ${s.prewarmDone ? 'done' : 'pending'}`);
    if (s.spikes?.length) {
      console.log('  Recent spikes:');
      for (const sp of s.spikes.slice(0, 5)) {
        console.log(`    - [${sp.kind}] ${sp.ms.toFixed(0)}ms ${sp.label} (${sp.zone})`);
      }
    }
  }

  // Scroll through page
  console.log('\n--- Scroll stress ---');
  const scrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const step = scrollHeight / SCROLL_STEPS;

  for (let i = 1; i <= SCROLL_STEPS; i++) {
    await page.evaluate((y) => window.scrollTo({ top: y, behavior: 'instant' }), step * i);
    await page.waitForTimeout(SCROLL_PAUSE_MS);
  }

  const scrollMetrics = await collectFrameMetrics(page, 'post-scroll', 3000);
  console.log(`  FPS after scroll: ${scrollMetrics.fps.toFixed(1)}`);
  console.log(`  Frame gap p95: ${scrollMetrics.gapP95.toFixed(1)} ms  max: ${scrollMetrics.gapMax.toFixed(1)} ms`);

  const meshAfterScroll = scrollMetrics.meshStats;
  if (meshAfterScroll) {
    console.log(`  Zone: ${meshAfterScroll.zone}  morphFlying: ${meshAfterScroll.morphFlying}`);
    console.log(`  activeDots: ${meshAfterScroll.activeDots}  tick: ${meshAfterScroll.meshTickMs?.toFixed?.(1)} ms`);
  }

  const longTaskData = await page.evaluate(() => window.__longTasks ?? []);
  const tasksOver50 = longTaskData.filter((t) => t.duration >= 50);
  console.log(`\n--- Long tasks (>=50ms): ${tasksOver50.length} ---`);
  const sorted = [...tasksOver50].sort((a, b) => b.duration - a.duration).slice(0, 8);
  for (const t of sorted) {
    console.log(`  ${t.duration.toFixed(0)} ms @ ${t.start.toFixed(0)}ms  ${t.name}`);
  }

  const domStats = await page.evaluate(() => {
    const dots = document.querySelectorAll('[class*="dot"]').length;
    const spans = document.querySelectorAll('span').length;
    const canvases = document.querySelectorAll('canvas').length;
    const blurEls = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return (s.backdropFilter && s.backdropFilter !== 'none') || (s.filter && s.filter !== 'none');
    }).length;
    return { dots, spans, canvases, blurEls, nodes: document.querySelectorAll('*').length };
  });
  console.log('\n--- DOM ---');
  console.log(`  Nodes: ${domStats.nodes}  spans: ${domStats.spans}  canvases: ${domStats.canvases}`);
  console.log(`  Elements with filter/backdrop-filter: ${domStats.blurEls}`);

  const resources = await page.evaluate(() =>
    performance.getEntriesByType('resource').map((r) => ({
      name: r.name.split('/').pop()?.slice(0, 60) ?? r.name,
      type: r.initiatorType,
      size: r.transferSize,
      duration: r.duration,
    })).filter((r) => r.size > 0).sort((a, b) => b.size - a.size).slice(0, 15),
  );
  console.log('\n--- Top resources by transfer size ---');
  for (const r of resources) {
    console.log(`  ${(r.size / 1024).toFixed(1)} KB  ${r.duration.toFixed(0)}ms  [${r.type}] ${r.name}`);
  }

  const spikeDump = await page.evaluate(() => {
    if (!window.__meshPerf?.spikes) return [];
    return window.__meshPerf.spikes().slice(0, 15).map((s) => ({
      kind: s.kind,
      ms: +s.ms.toFixed(1),
      label: s.label,
      zone: s.zone,
      scrolling: s.scrolling,
      phases: s.phases,
    }));
  });
  if (spikeDump.length) {
    console.log('\n--- Mesh spike log (top 15) ---');
    for (const s of spikeDump) {
      console.log(`  [${s.kind}] ${s.ms}ms ${s.label} zone=${s.zone} scroll=${s.scrolling}`);
    }
  }

  const fullReport = await page.evaluate(() => {
    if (!window.__meshPerf?.report) return null;
    return window.__meshPerf.report();
  });

  const auditReport = {
    generatedAt: new Date().toISOString(),
    url: URL,
    loadMs,
    heroMetrics,
    scrollMetrics,
    longTasks: sorted,
    domStats,
    spikeDump,
    meshReport: fullReport,
  };

  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(auditReport, null, 2)}\n`, 'utf8');
  console.log(`\n--- Zapisano raport: ${path.relative(process.cwd(), REPORT_PATH)} ---`);

  await browser.close();
  console.log('\n=== Done ===\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
