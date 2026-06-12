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

globalThis.XMLSerializer = class XMLSerializer {
  serializeToString(node) {
    return node.outerHTML ?? node.toString();
  }
};

const { parseFaceMesh } = await import('../src/components/animation/mesh/faceMesh.ts');
const { parseSvgMesh } = await import('../src/components/animation/mesh/svgMesh.ts');
const { parsePaletteSvgMesh } = await import('../src/components/animation/mesh/parsePaletteMesh.ts');
const { buildDotAtlas } = await import('../src/components/animation/mesh/meshDotAtlas.ts');
const { snapshotFromZoneLayout } = await import('../src/components/animation/mesh/morph/zoneSnapshot.ts');
const { ZONE_ORDER } = await import('../src/hooks/meshScrollEngine.ts');
const { MESH_ASSETS } = await import('../src/data/meshAssets.ts');

function zoneDotCount(snap) {
  let count = snap.mappedIds.size;
  for (const pts of snap.splits.values()) count += pts.length;
  return count;
}

/** Strefy z osobnym SVG (hero = faceMesh z Group 5). */
const ZONE_SOURCES = {
  palette: MESH_ASSETS.palette,
  bus: MESH_ASSETS.bus,
  fork: MESH_ASSETS.fork,
  spray: MESH_ASSETS.spray,
  loupe: MESH_ASSETS.loupe,
  ring: MESH_ASSETS.ring,
};

function readSvg(rel) {
  const path = join(publicDir, decodeURIComponent(rel.split('?')[0].replace(/^\//, '')));
  return readFileSync(path, 'utf8');
}

const faceMesh = parseFaceMesh(readSvg(MESH_ASSETS.hero));

const zoneMeshes = {};
for (const [zone, rel] of Object.entries(ZONE_SOURCES)) {
  const svg = readSvg(rel);
  zoneMeshes[zone] = zone === 'palette'
    ? parsePaletteSvgMesh(svg)
    : parseSvgMesh(svg, { strictLineSnap: zone !== 'fork' });
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

console.log('\nLiczba kropek per strefa (hosty + supplementy):\n');
for (const row of rows) {
  console.log(`  ${row.zone.padEnd(12)} ${row.count}`);
}
console.log(`\n  max          ${max}  → morph pary #1..#${max}\n`);
