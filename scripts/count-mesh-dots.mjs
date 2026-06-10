/**
 * Liczy kropki mesh per strefa (hosty + supplementy).
 * Uruchom: bun scripts/count-mesh-dots.mjs
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const publicDir = join(root, 'public');

globalThis.DOMParser = class DOMParser {
  parseFromString(markup, mime) {
    const { document } = parseHTML(markup);
    return document;
  }
};

const { parseFaceMesh } = await import('../src/components/animation/mesh/faceMesh.ts');
const { parseSvgMesh } = await import('../src/components/animation/mesh/svgMesh.ts');
const { buildDotAtlas } = await import('../src/components/animation/mesh/meshDotAtlas.ts');
const { snapshotFromZoneLayout } = await import('../src/components/animation/mesh/morph/zoneSnapshot.ts');
const { zoneDotCount } = await import('../src/components/animation/mesh/morph/dotCatalog.ts');
const { ZONE_ORDER } = await import('../src/hooks/meshScrollEngine.ts');

const SOURCES = {
  hero: null,
  palette: '/images/profile/Group%201.svg?v=arrow-mesh-5',
  bus: '/images/transitrank/autobus.svg?v=bus-mesh-15',
  fork: '/images/forkfull/widelec.svg?v=fork-mesh-5',
  spray: '/images/kamochi/sprej.svg?v=spray-mesh-4',
  loupe: '/images/kamochi/lupa.svg?v=loupe-mesh-5',
  ring: '/images/kamochi/pierscionek.svg?v=ring-mesh-4',
};

function readSvg(rel) {
  const path = join(publicDir, decodeURIComponent(rel.split('?')[0].replace(/^\//, '')));
  return readFileSync(path, 'utf8');
}

const faceSvg = readSvg('/images/profile/Group%205.svg?v=svg-mesh-5');
const faceMesh = parseFaceMesh(faceSvg);

const zoneMeshes = {};
for (const [zone, rel] of Object.entries(SOURCES)) {
  if (!rel || zone === 'hero') continue;
  const strict = zone !== 'fork';
  zoneMeshes[zone] = parseSvgMesh(readSvg(rel), { strictLineSnap: strict });
}

const canvasW = 420;
const canvasH = 520;
const atlas = buildDotAtlas(faceMesh, zoneMeshes, canvasW, canvasH, null);

const rows = [];
for (const zone of ZONE_ORDER) {
  const snap = snapshotFromZoneLayout(zone, atlas, faceMesh, canvasW, canvasH);
  rows.push({ zone, count: snap ? zoneDotCount(snap) : 0 });
}

rows.sort((a, b) => b.count - a.count);
const max = rows[0]?.count ?? 0;

console.log('\nLiczba kropek per obrazek (hosty + supplementy, numeracja od góry):\n');
for (const row of rows) {
  console.log(`  ${row.zone.padEnd(8)} ${row.count}`);
}
console.log(`\n  max      ${max}  → morph pary #1..#${max}\n`);
