/**
 * Diagnostyka splatów palety — uruchom: bun scripts/debug-palette-splats.mjs
 */
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
globalThis.XMLSerializer = class XMLSerializer {
  serializeToString(doc) {
    return doc.documentElement?.outerHTML ?? '';
  }
};

const { parseFaceMesh } = await import('../src/components/animation/mesh/faceMesh.ts');
const { parsePaletteSvgMesh } = await import('../src/components/animation/mesh/parsePaletteMesh.ts');
const { buildDotAtlas } = await import('../src/components/animation/mesh/meshDotAtlas.ts');

const faceSvg = readFileSync(join(publicDir, 'images/profile/Group 5.svg'), 'utf8');
const paletteSvg = readFileSync(join(publicDir, 'images/profile/paleta.svg'), 'utf8');

const faceMesh = parseFaceMesh(faceSvg);
const paletteMesh = parsePaletteSvgMesh(paletteSvg);

const byTone = {};
for (const n of paletteMesh.nodes) {
  const t = n.paletteTone ?? 'none';
  byTone[t] = (byTone[t] ?? 0) + 1;
}
console.log('palette nodes by tone:', byTone);

const w = 1200;
const h = 900;
const atlas = buildDotAtlas(faceMesh, { palette: paletteMesh }, w, h, null);
const layout = atlas.zones.palette;

console.log('paletteSplats count:', layout?.paletteSplats?.length ?? 0);
const splatByTone = {};
for (const s of layout?.paletteSplats ?? []) {
  splatByTone[s.tone] = (splatByTone[s.tone] ?? 0) + 1;
}
console.log('splats by tone:', splatByTone);

const pink = (layout?.paletteSplats ?? []).filter((s) => s.tone === 'pink');
if (pink.length > 0) {
  const xs = pink.map((s) => s.x);
  const ys = pink.map((s) => s.y);
  console.log('pink splat bbox canvas:', {
    minX: Math.min(...xs).toFixed(1),
    maxX: Math.max(...xs).toFixed(1),
    minY: Math.min(...ys).toFixed(1),
    maxY: Math.max(...ys).toFixed(1),
    count: pink.length,
  });
  console.log('sample pink splats:', pink.slice(0, 3));
}

// nodes tagged pink but maybe not in splats?
const pinkNodes = paletteMesh.nodes.filter((n) => n.paletteTone === 'pink');
console.log('pink nodes in mesh:', pinkNodes.length);
const missing = pinkNodes.filter((n) => !layout?.paletteSplats?.some((s) => s.id === `p:${n.id}`));
console.log('pink nodes missing from splats:', missing.length);
