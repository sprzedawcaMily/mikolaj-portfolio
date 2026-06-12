import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = join(process.cwd(), 'scripts', 'screenshots');
mkdirSync(OUT, { recursive: true });

const PORTS = [5174, 5175, 5173];

async function resolveBaseUrl(page) {
  for (const port of PORTS) {
    try {
      const url = `http://localhost:${port}/`;
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 4000 });
      if (res && res.ok()) return url;
    } catch {
      /* try next port */
    }
  }
  throw new Error(`Dev server not found on ports ${PORTS.join(', ')}`);
}

async function readAnchorCenterY(page) {
  return page.evaluate(() => {
    const rect = document.getElementById('transit-rank-mesh-anchor')?.getBoundingClientRect();
    return rect ? rect.top + rect.height * 0.5 : null;
  });
}

async function scrollToCenterY(page, targetCenterY) {
  for (let i = 0; i < 50; i++) {
    const centerY = await readAnchorCenterY(page);
    if (centerY == null) return null;
    if (Math.abs(centerY - targetCenterY) < 24) return centerY;
    await page.mouse.wheel(0, centerY < targetCenterY ? -55 : 55);
    await page.waitForTimeout(100);
  }
  return readAnchorCenterY(page);
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const baseUrl = await resolveBaseUrl(page);
  console.log('Using', baseUrl);

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  await page.locator('#transit-rank-mesh-anchor').scrollIntoViewIfNeeded();
  await page.waitForTimeout(700);

  const viewH = 900;
  await scrollToCenterY(page, viewH * 0.74);
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT, 'tr-01-transit-start.png'), fullPage: false });

  await scrollToCenterY(page, viewH * 0.56);
  await page.waitForTimeout(900);
  await page.screenshot({ path: join(OUT, 'tr-02-transit-mid.png'), fullPage: false });

  await scrollToCenterY(page, viewH * 0.38);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'tr-03-transit-bus.png'), fullPage: false });

  const checks = await page.evaluate(() => {
    const anchor = document.getElementById('transit-rank-mesh-anchor');
    const rect = anchor?.getBoundingClientRect();
    const layer = document.getElementById('mesh-flying-layer');
    const canvas = document.getElementById('flying-mesh-canvas');
    const layerRect = layer?.getBoundingClientRect();
    return {
      meshLayerPresent: !!layer,
      meshCanvasPresent: !!canvas,
      meshRightOfCard: layerRect && rect ? layerRect.left <= rect.right + 24 : false,
    };
  });
  console.log('Checks:', JSON.stringify(checks, null, 2));

  if (!checks.meshLayerPresent || !checks.meshCanvasPresent) {
    console.error('FAIL: brak warstwy FlyingMeshDots (#mesh-flying-layer / #flying-mesh-canvas)');
    process.exitCode = 1;
  }
  if (checks.meshCanvases !== 1) {
    console.error('FAIL: oczekiwany dokladnie jeden canvas');
    process.exitCode = 1;
  }

  await browser.close();
}

main();
