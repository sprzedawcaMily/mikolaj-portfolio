import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

globalThis.DOMParser = class DOMParser {
  parseFromString(markup) {
    return parseHTML(markup).document;
  }
};

const { parseFaceMesh } = await import('../src/components/animation/mesh/faceMesh.ts');
const { parseSvgMesh } = await import('../src/components/animation/mesh/svgMesh.ts');
const { buildDotAtlas } = await import('../src/components/animation/mesh/meshDotAtlas.ts');
const { snapshotFromZoneLayout } = await import('../src/components/animation/mesh/morph/zoneSnapshot.ts');
const { pointInEyeIris, segmentMidpointInEyeIris } = await import('../src/components/animation/parseKamochiEyeSvg.ts');

function zoneDotCount(snap) {
  let count = snap.mappedIds.size;
  for (const pts of snap.splits.values()) count += pts.length;
  return count;
}

function readSvg(rel) {
  return readFileSync(join(publicDir, rel.replace(/^\//, '')), 'utf8');
}

function parseEyeMesh(svgText) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  doc.querySelector('path[fill="#D9D9D9"]')?.remove();
  for (const el of doc.querySelectorAll(
    'circle[fill="#FF0000"], circle[fill="#00FF62"], circle[fill="#ff0000"], circle[fill="#00ff62"]',
  )) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('line[stroke="#FF0000"], line[stroke="#ff0000"]')) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('path[fill="#FF0000"], path[fill="#00FF62"]')) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('circle[fill="#D9D9D9"]')) {
    const cx = Number(el.getAttribute('cx'));
    const cy = Number(el.getAttribute('cy'));
    if (Number.isFinite(cx) && Number.isFinite(cy) && pointInEyeIris(cx, cy)) {
      el.remove();
    }
  }
  for (const el of doc.querySelectorAll('line')) {
    const x1 = Number(el.getAttribute('x1'));
    const y1 = Number(el.getAttribute('y1'));
    const x2 = Number(el.getAttribute('x2'));
    const y2 = Number(el.getAttribute('y2'));
    if ([x1, y1, x2, y2].every(Number.isFinite) && segmentMidpointInEyeIris(x1, y1, x2, y2, 1.05)) {
      el.remove();
    }
  }
  const svg = doc.querySelector('svg');
  if (!svg) throw new Error('eye svg root missing');
  return parseSvgMesh(svg.outerHTML, { strictLineSnap: true });
}

const faceMesh = parseFaceMesh(readSvg('images/profile/Group 5.svg'));
const eyeMesh = parseEyeMesh(readSvg('images/experience/oko2.svg'));
const ringMesh = parseSvgMesh(readSvg('images/stylerank/pierscionek.svg'), { strictLineSnap: true });

console.log('eye visibleNodeIds:', eyeMesh.visibleNodeIds.size);
console.log('ring visibleNodeIds:', ringMesh.visibleNodeIds.size);

const zoneMeshes = { ring: ringMesh, careerEye: eyeMesh, skillsEye: eyeMesh };
const atlas = buildDotAtlas(faceMesh, zoneMeshes, 420, 520, null);

for (const zone of ['ring', 'careerEye', 'skillsEye']) {
  const snap = snapshotFromZoneLayout(zone, atlas, faceMesh, 420, 520);
  console.log(`${zone}:`, snap ? `${zoneDotCount(snap)} dots` : 'NULL LAYOUT');
}
