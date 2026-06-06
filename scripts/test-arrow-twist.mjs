import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.env.PREVIEW_URL ?? 'http://localhost:5174';
const OUT = join(process.cwd(), 'scripts', 'arrow-twist-shots');

async function aimAngle(page) {
  return page.evaluate(() => {
    const thumb = document.getElementById('palette-color-thumb');
    const section = document.getElementById('studio-palety');
    const portal = document.getElementById('mesh-portal-root');
    const stage = portal?.querySelector('[class*="meshBackground"]');
    if (!thumb || !section || !stage) return null;

    const t = thumb.getBoundingClientRect();
    const s = stage.getBoundingClientRect();
    const c = section.getBoundingClientRect();
    const aimX = t.left + t.width / 2 - s.left;
    const aimY = t.top - 18 - s.top;
    const centerX = c.left + c.width / 2 - s.left;
    const pivotY = s.height * 0.1;
    const edgeT = Math.min(1, Math.abs(aimX - centerX) / Math.max(s.width * 0.34, 80));
    const pivotFollow = Math.max(0.1, 0.42 - edgeT * 0.3);
    const pivotX = centerX + (aimX - centerX) * pivotFollow;
    const aimAngle = Math.atan2(aimY - pivotY, aimX - pivotX);
    return {
      leanDeg: Math.abs(((aimAngle * 180) / Math.PI) - 90),
      edgeT,
      pivotFollow,
    };
  });
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });
  await page.goto(BASE, { waitUntil: 'networkidle' });

  await page.locator('#studio-palety').scrollIntoViewIfNeeded();
  await page.waitForTimeout(1200);

  const track = page.locator('#palette-color-track');
  const box = await track.boundingBox();
  if (!box) throw new Error('track not found');

  const positions = [
    { name: 'left', x: 8 },
    { name: 'center', x: box.width * 0.5 },
    { name: 'right', x: box.width - 8 },
  ];

  const results = [];
  for (const pos of positions) {
    await track.click({ position: { x: pos.x, y: box.height / 2 } });
    await page.waitForTimeout(500);
    const data = await aimAngle(page);
    await page.screenshot({ path: join(OUT, `${pos.name}.png`) });
    results.push({ pos: pos.name, ...data });
  }

  console.log(JSON.stringify(results, null, 2));

  const center = results.find((r) => r.pos === 'center');
  const right = results.find((r) => r.pos === 'right');
  const left = results.find((r) => r.pos === 'left');

  const edgeLeanOk = right.leanDeg > center.leanDeg + 4 && left.leanDeg > center.leanDeg + 4;
  const edgePivotOk = right.pivotFollow < center.pivotFollow - 0.15;

  if (!edgeLeanOk || !edgePivotOk) {
    console.error('Edge twist test FAILED', { edgeLeanOk, edgePivotOk });
    process.exitCode = 1;
  } else {
    console.log('Edge twist test PASSED');
  }

  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
