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

const { EYE_VIEWBOX, EYE_CENTER } = await import('../src/components/animation/parseKamochiEyeSvg.ts');

const svg = readFileSync(join(root, 'public/images/experience/oko2.svg'), 'utf8');
const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
const path = doc.querySelector('path[fill="#D9D9D9"]');
const d = path?.getAttribute('d') ?? '';
const nums = [...d.matchAll(/[-+]?\d*\.?\d+/g)].map((m) => Number(m[0]));
const xs = [];
const ys = [];
for (let i = 0; i < nums.length - 1; i += 2) {
  xs.push(nums[i]);
  ys.push(nums[i + 1]);
}
const pathBox = {
  minX: Math.min(...xs),
  maxX: Math.max(...xs),
  minY: Math.min(...ys),
  maxY: Math.max(...ys),
  w: Math.max(...xs) - Math.min(...xs),
  h: Math.max(...ys) - Math.min(...ys),
};

const circles = [...doc.querySelectorAll('circle[fill="#D9D9D9"]')];
let cminX = Infinity;
let cmaxX = -Infinity;
let cminY = Infinity;
let cmaxY = -Infinity;
for (const c of circles) {
  const cx = Number(c.getAttribute('cx'));
  const cy = Number(c.getAttribute('cy'));
  const r = Number(c.getAttribute('r') ?? 6.5);
  cminX = Math.min(cminX, cx - r);
  cmaxX = Math.max(cmaxX, cx + r);
  cminY = Math.min(cminY, cy - r);
  cmaxY = Math.max(cmaxY, cy + r);
}
const dotBox = {
  minX: cminX,
  maxX: cmaxX,
  minY: cminY,
  maxY: cmaxY,
  w: cmaxX - cminX,
  h: cmaxY - cminY,
};

const { parseSvgMesh } = await import('../src/components/animation/mesh/svgMesh.ts');
const { layoutMeshOnCanvas } = await import('../src/components/animation/mesh/svgMesh.ts');
const { pointInEyeIris, segmentMidpointInEyeIris } = await import('../src/components/animation/parseKamochiEyeSvg.ts');

function parseEyeMesh(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  doc.querySelector('path[fill="#D9D9D9"]')?.remove();
  for (const el of doc.querySelectorAll(
    'circle[fill="#FF0000"], circle[fill="#00FF62"], circle[fill="#ff0000"], circle[fill="#00ff62"]',
  )) el.remove();
  for (const el of doc.querySelectorAll('line[stroke="#FF0000"], line[stroke="#ff0000"]')) el.remove();
  for (const el of doc.querySelectorAll('path[fill="#FF0000"], path[fill="#00FF62"]')) el.remove();
  for (const el of doc.querySelectorAll('circle[fill="#D9D9D9"]')) {
    const cx = Number(el.getAttribute('cx'));
    const cy = Number(el.getAttribute('cy'));
    if (Number.isFinite(cx) && Number.isFinite(cy) && pointInEyeIris(cx, cy)) el.remove();
  }
  for (const el of doc.querySelectorAll('line')) {
    const x1 = Number(el.getAttribute('x1'));
    const y1 = Number(el.getAttribute('y1'));
    const x2 = Number(el.getAttribute('x2'));
    const y2 = Number(el.getAttribute('y2'));
    if ([x1, y1, x2, y2].every(Number.isFinite) && segmentMidpointInEyeIris(x1, y1, x2, y2, 1.05)) el.remove();
  }
  const svg = doc.querySelector('svg');
  return parseSvgMesh(svg.outerHTML, { strictLineSnap: true });
}

const eyeMesh = parseEyeMesh(svg);
let nminX = Infinity, nmaxX = -Infinity, nminY = Infinity, nmaxY = -Infinity;
for (const id of eyeMesh.visibleNodeIds) {
  const n = eyeMesh.nodes[id];
  if (!n) continue;
  nminX = Math.min(nminX, n.x);
  nmaxX = Math.max(nmaxX, n.x);
  nminY = Math.min(nminY, n.y);
  nmaxY = Math.max(nmaxY, n.y);
}
const meshNodeBox = { minX: nminX, maxX: nmaxX, minY: nminY, maxY: nmaxY, w: nmaxX - nminX, h: nmaxY - nminY };

const canvasW = 420;
const canvasH = 520;
const fit = 0.96;
const layout = layoutMeshOnCanvas(eyeMesh, canvasW, canvasH, fit);

console.log({
  pathBox,
  dotBox,
  meshNodeBox,
  pathVsDots: { wRatio: pathBox.w / dotBox.w, hRatio: pathBox.h / dotBox.h },
  pathVsMeshNodes: { wRatio: pathBox.w / meshNodeBox.w, hRatio: pathBox.h / meshNodeBox.h },
  layout,
  EYE_CENTER,
  meshCenter: { x: EYE_VIEWBOX.w / 2, y: EYE_VIEWBOX.h * 0.46 },
});
