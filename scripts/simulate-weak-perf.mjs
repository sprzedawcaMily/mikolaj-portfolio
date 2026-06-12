/**
 * Symulacja słabego komputera — Playwright + CPU throttle + ?slow=1
 * Uruchom: bun run dev, potem: bun scripts/simulate-weak-perf.mjs
 */
import { chromium } from 'playwright';

const BASE = process.env.PERF_URL?.replace(/\?.*$/, '') ?? 'http://localhost:5173';
const URL = `${BASE}/?slow=1`;

async function main() {
  const browser = await chromium.launch({
    headless: true,
    channel: 'msedge',
    timeout: 45_000,
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });

  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
  await page.waitForTimeout(3000);

  const samples = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => window.scrollBy({ top: window.innerHeight * 0.85, behavior: 'instant' }));
    await page.waitForTimeout(700);
    const snap = await page.evaluate(() => {
      const s = window.__meshPerf?.stats?.() ?? null;
      return s
        ? {
            fps: s.fps,
            frameGap: s.frameGapMs,
            raf: s.rafWorkMs,
            tick: s.meshTickMs,
            zone: s.zone,
            domPaints: s.domPaints,
            canvasDots: s.canvasDots,
            spikes: s.spikes?.length ?? 0,
          }
        : null;
    });
    if (snap) samples.push(snap);
  }

  console.log('\n=== Symulacja słabego PC (?slow=1, CPU 6×) ===\n');
  for (const [i, s] of samples.entries()) {
    console.log(
      `scroll ${i + 1}: fps=${s.fps} gap=${s.frameGap.toFixed(1)}ms raf=${s.raf.toFixed(1)}ms `
      + `tick=${s.tick.toFixed(1)}ms zone=${s.zone} DOM=${s.domPaints} canvas=${s.canvasDots} spikes=${s.spikes}`,
    );
  }

  const spikes = await page.evaluate(() =>
    (window.__meshPerf?.spikes?.() ?? []).slice(0, 8).map((s) => ({
      kind: s.kind,
      ms: +s.ms.toFixed(1),
      label: s.label,
      zone: s.zone,
    })),
  );

  if (spikes.length) {
    console.log('\nOstatnie spike’y:');
    for (const s of spikes) console.log(`  [${s.kind}] ${s.ms}ms ${s.label} @ ${s.zone}`);
  }

  await browser.close();
  console.log('\nGotowe.\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
