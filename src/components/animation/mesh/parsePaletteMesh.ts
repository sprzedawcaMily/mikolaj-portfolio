import { parseSvgMesh, type MeshNode, type SvgMesh } from '@/components/animation/mesh/svgMesh';

export type PaletteTone =
  | 'wire'
  | 'shadow'
  | 'pink'
  | 'green'
  | 'accent'
  | 'yellow'
  | 'blue';

const FILL_TONE: Record<string, PaletteTone> = {
  '#d9d9d9': 'wire',
  '#ffffff': 'wire',
  '#fff': 'wire',
  white: 'wire',
  '#4a2626': 'shadow',
  '#ff415a': 'pink',
  '#e939dd': 'pink',
  '#00ff37': 'green',
  '#ff0000': 'accent',
  '#f00': 'accent',
  '#ffc404': 'yellow',
  '#044bff': 'blue',
};

type ToneMarker = { x: number; y: number; tone: PaletteTone };

function normalizeFill(fill: string | null): string | null {
  if (!fill) return null;
  return fill.trim().toLowerCase();
}

function paletteToneFromFill(fill: string | null): PaletteTone | null {
  const key = normalizeFill(fill);
  if (!key) return null;
  return FILL_TONE[key] ?? null;
}

function pathDotCenter(path: Element) {
  const d = path.getAttribute('d') ?? '';
  const values = [...d.matchAll(/[-+]?\d*\.?\d+/g)].map((match) => Number.parseFloat(match[0]));
  if (values.length < 4) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < values.length - 1; i += 2) {
    xs.push(values[i]);
    ys.push(values[i + 1]);
  }

  return {
    x: (Math.min(...xs) + Math.max(...xs)) / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function collectToneMarkers(doc: Document): ToneMarker[] {
  const markers: ToneMarker[] = [];

  for (const circle of doc.querySelectorAll('circle[fill]')) {
    const tone = paletteToneFromFill(circle.getAttribute('fill'));
    if (!tone) continue;
    const x = Number.parseFloat(circle.getAttribute('cx') ?? '');
    const y = Number.parseFloat(circle.getAttribute('cy') ?? '');
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    markers.push({ x, y, tone });
  }

  for (const path of doc.querySelectorAll('path[fill]')) {
    const tone = paletteToneFromFill(path.getAttribute('fill'));
    if (!tone) continue;
    const center = pathDotCenter(path);
    if (!center) continue;
    markers.push({ x: center.x, y: center.y, tone });
  }

  return markers;
}

function coordKey(x: number, y: number) {
  return `${x.toFixed(1)}:${y.toFixed(1)}`;
}

function toneLookupFromMarkers(markers: ToneMarker[]) {
  const byCoord = new Map<string, PaletteTone>();
  for (const marker of markers) {
    byCoord.set(coordKey(marker.x, marker.y), marker.tone);
  }
  return byCoord;
}

function nearestTone(markers: ToneMarker[], x: number, y: number): PaletteTone {
  let best: PaletteTone = 'wire';
  let bestDist = 32;
  for (const marker of markers) {
    const dist = Math.hypot(marker.x - x, marker.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = marker.tone;
    }
  }
  return best;
}

/** Paleta kolorów — kropki w tonach mapowanych na motyw z suwaka. */
export function parsePaletteSvgMesh(svgText: string): SvgMesh {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const markers = collectToneMarkers(doc);
  const toneByCoord = toneLookupFromMarkers(markers);

  for (const el of doc.querySelectorAll('circle[fill], path[fill]')) {
    const tone = paletteToneFromFill(el.getAttribute('fill'));
    if (!tone) continue;
    el.setAttribute('fill', '#D9D9D9');
  }

  const mesh = parseSvgMesh(new XMLSerializer().serializeToString(doc), { strictLineSnap: true });
  const nodes: MeshNode[] = mesh.nodes.map((node) => ({
    ...node,
    group: 'body' as const,
    paletteTone: toneByCoord.get(coordKey(node.x, node.y)) ?? nearestTone(markers, node.x, node.y),
  }));

  const visibleNodeIds = new Set<number>();
  for (const node of nodes) visibleNodeIds.add(node.id);
  for (const edge of mesh.edges) {
    visibleNodeIds.add(edge.a);
    visibleNodeIds.add(edge.b);
  }

  return {
    ...mesh,
    nodes,
    visibleNodeIds,
  };
}
