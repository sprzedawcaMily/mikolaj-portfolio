import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
globalThis.DOMParser = class DOMParser {
  parseFromString(markup) {
    return parseHTML(markup).document;
  }
};

const { EYE_CENTER, PUPIL_IRIS, RED_IRIS } = await import('../src/components/animation/parseKamochiEyeSvg.ts');

const svg = readFileSync(join(root, 'public/images/experience/oko2.svg'), 'utf8');
const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
const d = doc.querySelector('path[fill="#D9D9D9"]')?.getAttribute('d') ?? '';
const nums = [...d.matchAll(/[-+]?\d*\.?\d+/g)].map((m) => Number(m[0]));
const pts = [];
for (let i = 0; i < nums.length - 1; i += 2) pts.push({ x: nums[i], y: nums[i + 1] });

function segIntersectY(ax, ay, bx, by, y) {
  if ((ay < y && by < y) || (ay > y && by > y)) return [];
  if (ay === by) return ay === y ? [ax, bx] : [];
  const t = (y - ay) / (by - ay);
  if (t < 0 || t > 1) return [];
  return [ax + t * (bx - ax)];
}

function whiteSpanAt(y) {
  const hits = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    hits.push(...segIntersectY(a.x, a.y, b.x, b.y, y));
  }
  if (!hits.length) return null;
  return { left: Math.min(...hits), right: Math.max(...hits) };
}

for (const y of [477, 450, 500, 420, 530]) {
  const span = whiteSpanAt(y);
  if (!span) continue;
  const maxLeft = EYE_CENTER.x - span.left - PUPIL_IRIS.rx;
  const maxRight = span.right - EYE_CENTER.x - PUPIL_IRIS.rx;
  console.log(`y=${y}`, span, { maxTrackLeft: maxLeft, maxTrackRight: maxRight });
}

const span = whiteSpanAt(EYE_CENTER.y);
const maxTrackLeft = EYE_CENTER.x - span.left - PUPIL_IRIS.rx;
const maxTrackRight = span.right - EYE_CENTER.x - PUPIL_IRIS.rx;
const irisBeyondRight = RED_IRIS.rx - maxTrackRight - (span.right - EYE_CENTER.x);
const irisBeyondLeft = RED_IRIS.rx - maxTrackLeft - (EYE_CENTER.x - span.left);
function whiteSpanAtX(x) {
  const hits = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    if ((a.x < x && b.x < x) || (a.x > x && b.x > x)) continue;
    if (a.x === b.x) {
      if (a.x === x) hits.push(a.y, b.y);
      continue;
    }
    const t = (x - a.x) / (b.x - a.x);
    if (t < 0 || t > 1) continue;
    hits.push(a.y + t * (b.y - a.y));
  }
  if (!hits.length) return null;
  return { top: Math.min(...hits), bottom: Math.max(...hits) };
}

const vspan = whiteSpanAtX(EYE_CENTER.x);
const maxTrackUp = EYE_CENTER.y - vspan.top - PUPIL_IRIS.ry;
const maxTrackDown = vspan.bottom - EYE_CENTER.y - PUPIL_IRIS.ry;
console.log('at eye center', {
  maxTrackLeft,
  maxTrackRight,
  maxTrackUp,
  maxTrackDown,
  vspan,
});
