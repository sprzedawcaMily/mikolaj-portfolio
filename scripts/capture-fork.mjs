import { chromium } from 'playwright';
import { join } from 'path';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:5174/';

async function scrollToCenterY(page, anchorId, targetCenterY) {
  for (let i = 0; i < 60; i++) {
    const centerY = await page.evaluate((id) => {
      const rect = document.getElementById(id)?.getBoundingClientRect();
      return rect ? rect.top + rect.height * 0.5 : null;
    }, anchorId);
    if (centerY == null) return null;
    if (Math.abs(centerY - targetCenterY) < 28) return centerY;
    await page.mouse.wheel(0, centerY < targetCenterY ? -60 : 60);
    await page.waitForTimeout(90);
  }
  return null;
}


const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(600);

// palette morph
await page.locator('#studio-palety').scrollIntoViewIfNeeded();
await page.waitForTimeout(1200);

// transit bus
await page.locator('#transit-rank-mesh-anchor').scrollIntoViewIfNeeded();
await scrollToCenterY(page, 'transit-rank-mesh-anchor', 900 * 0.5);
await page.waitForTimeout(1400);

// fork
await page.locator('#forkfull-mesh-anchor').scrollIntoViewIfNeeded();
await scrollToCenterY(page, 'forkfull-mesh-anchor', 900 * 0.5);
await page.waitForTimeout(1600);

const state = await page.evaluate(() => {
  const canvas = document.querySelector('#mesh-portal-root canvas');
  const anchor = document.getElementById('forkfull-mesh-anchor')?.getBoundingClientRect();
  const wrap = document.querySelector('#mesh-portal-root > div')?.getBoundingClientRect();
  let bright = 0;
  if (canvas?.width) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 3; i < d.length; i += 32) if (d[i] > 12) bright++;
  }
  return {
    canvas: canvas ? [canvas.width, canvas.height] : null,
    brightSamples: bright,
    anchor,
    wrap,
    forkRender: window.__forkDebug ?? null,
  };
});

console.log(JSON.stringify(state, null, 2));
await browser.close();
