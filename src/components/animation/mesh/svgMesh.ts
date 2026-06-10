import type { PaletteTone } from '@/components/animation/mesh/parsePaletteMesh';

export type MeshGroup = 'body' | 'light';

export interface MeshNode {
  id: number;
  x: number;
  y: number;
  r: number;
  group: MeshGroup;
  phase: number;
  paletteTone?: PaletteTone;
}

export interface MeshEdge {
  a: number;
  b: number;
  group: MeshGroup;
}

export interface SvgMesh {
  width: number;
  height: number;
  nodes: MeshNode[];
  edges: MeshEdge[];
  visibleNodeIds: Set<number>;
}

interface ParseSvgOptions {
  strictLineSnap?: boolean;
}

function numberAttr(el: Element, name: string, fallback = 0) {
  const value = el.getAttribute(name);
  return value ? Number.parseFloat(value) : fallback;
}

function colorGroup(color: string | null): MeshGroup | null {
  if (!color) return null;
  const normalized = color.toLowerCase();
  if (normalized.includes('red') || normalized === '#ff0000' || normalized === '#f00') return 'light';
  if (normalized === '#00ff62') return 'body';
  if (normalized.includes('white') || normalized === '#d9d9d9' || normalized === '#fff' || normalized === '#ffffff') {
    return 'body';
  }
  return null;
}

function transformedCircleCenter(circle: Element) {
  const cx = numberAttr(circle, 'cx');
  const cy = numberAttr(circle, 'cy');
  const transform = circle.getAttribute('transform') ?? '';
  const matrix = transform.match(/matrix\(([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\)/);

  if (!matrix) return { x: cx, y: cy };

  const [, a, b, c, d, e, f] = matrix.map(Number);
  return {
    x: a * cx + c * cy + e,
    y: b * cx + d * cy + f,
  };
}

function transformedPoint(el: Element, x: number, y: number) {
  const transform = el.getAttribute('transform') ?? '';
  const matrix = transform.match(/matrix\(([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\)/);

  if (!matrix) return { x, y };

  const [, a, b, c, d, e, f] = matrix.map(Number);
  return {
    x: a * x + c * y + e,
    y: b * x + d * y + f,
  };
}

function lineEndpoints(line: Element) {
  return {
    start: transformedPoint(line, numberAttr(line, 'x1'), numberAttr(line, 'y1')),
    end: transformedPoint(line, numberAttr(line, 'x2'), numberAttr(line, 'y2')),
  };
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

function snapToCircleNode(nodes: MeshNode[], x: number, y: number, maxDistance: number) {
  let best: MeshNode | null = null;
  let bestDistance = maxDistance;

  for (const node of nodes) {
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }

  return best;
}

function nearestCircleNode(nodes: MeshNode[], x: number, y: number, group: MeshGroup) {
  let best: MeshNode | null = null;
  let bestDistance = Infinity;

  for (const node of nodes) {
    if (node.group !== group) continue;
    const distance = Math.hypot(node.x - x, node.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = node;
    }
  }

  return best;
}

function resolveLineEndpoint(
  nodes: MeshNode[],
  x: number,
  y: number,
  group: MeshGroup,
  strictLineSnap: boolean,
) {
  if (strictLineSnap) {
    return nearestCircleNode(nodes, x, y, group);
  }

  return (
    snapToCircleNode(
      nodes.filter((node) => node.group === group),
      x,
      y,
      28,
    ) ?? ensureLineNode(nodes, x, y, group)
  );
}

function ensureLineNode(nodes: MeshNode[], x: number, y: number, group: MeshGroup) {
  const existing = snapToCircleNode(
    nodes.filter((node) => node.group === group),
    x,
    y,
    24,
  );
  if (existing) return existing;

  const node: MeshNode = {
    id: nodes.length,
    x,
    y,
    r: 4.8,
    group,
    phase: (x * 0.021 + y * 0.037) % (Math.PI * 2),
  };
  nodes.push(node);
  return node;
}

export function parseSvgMesh(svgText: string, options: ParseSvgOptions = {}): SvgMesh {
  const { strictLineSnap = true } = options;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 1200, 900];
  const width = viewBox[2] || numberAttr(svg as Element, 'width', 1200);
  const height = viewBox[3] || numberAttr(svg as Element, 'height', 900);
  const nodes: MeshNode[] = [];

  for (const circle of doc.querySelectorAll('circle')) {
    const group = colorGroup(circle.getAttribute('fill'));
    if (!group) continue;
    const center = transformedCircleCenter(circle);
    nodes.push({
      id: nodes.length,
      x: center.x,
      y: center.y,
      r: numberAttr(circle, 'r', 4.5),
      group,
      phase: (center.x * 0.021 + center.y * 0.037) % (Math.PI * 2),
    });
  }

  for (const path of doc.querySelectorAll('path[fill]')) {
    const group = colorGroup(path.getAttribute('fill'));
    if (!group) continue;
    const center = pathDotCenter(path);
    if (!center) continue;
    nodes.push({
      id: nodes.length,
      x: center.x,
      y: center.y,
      r: 5.5,
      group,
      phase: (center.x * 0.021 + center.y * 0.037) % (Math.PI * 2),
    });
  }

  const edgeKeys = new Set<string>();
  const edges: MeshEdge[] = [];

  for (const line of doc.querySelectorAll('line')) {
    const group = colorGroup(line.getAttribute('stroke'));
    if (!group) continue;

    const { start, end } = lineEndpoints(line);
    const a = resolveLineEndpoint(nodes, start.x, start.y, group, strictLineSnap);
    const b = resolveLineEndpoint(nodes, end.x, end.y, group, strictLineSnap);
    if (!a || !b || a.id === b.id) continue;

    const key = a.id < b.id ? `${a.id}:${b.id}` : `${b.id}:${a.id}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ a: a.id, b: b.id, group });
  }

  const visibleNodeIds = new Set<number>();
  for (const edge of edges) {
    visibleNodeIds.add(edge.a);
    visibleNodeIds.add(edge.b);
  }
  for (const node of nodes) {
    if (node.group === 'light') visibleNodeIds.add(node.id);
  }

  return { width, height, nodes, edges, visibleNodeIds };
}

export function layoutMeshOnCanvas(
  mesh: SvgMesh,
  canvasWidth: number,
  canvasHeight: number,
  fit = 0.82,
) {
  const scale = Math.min(canvasWidth / mesh.width, canvasHeight / mesh.height) * fit;
  const offsetX = (canvasWidth - mesh.width * scale) / 2;
  const offsetY = (canvasHeight - mesh.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function easeSmoothStep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}
