export type EyeCircle = { cx: number; cy: number; r: number };
export type EyeLine = { x1: number; y1: number; x2: number; y2: number };
export type EyeIrisTrackMax = { left: number; right: number; y: number };

export type KamochiEyeData = {
  back: string;
  white: string;
  /** Białe linie poza tęczówką — pełna obramówka bez wewnętrznej siatki (irisOnly). */
  whiteOutline: string;
  /** Wypełnienie białego tła (#D9D9D9) z oko2.svg — clip tęczówki i źrenicy. */
  whiteZonePath: string | null;
  redCircles: EyeCircle[];
  redLines: EyeLine[];
  pupilCircles: EyeCircle[];
  /** Biała siatka między kropkami źrenicy. */
  pupilLines: EyeLine[];
  /** Białe kreski łączące źrenicę (zielone) z tęczówką (czerwone linie SVG). */
  pupilBridgeLines: EyeLine[];
  pupilClip: { rx: number; ry: number };
  /** Maks. przesunięcie tęczówki — źrenica dochodzi do krawędzi białego tła, nadmiar tęczówki w clipie. */
  irisTrackMax: EyeIrisTrackMax;
};

export const EYE_VIEWBOX = { w: 1408, h: 867 };
export const EYE_CENTER = { x: 685.5, y: 477 };
/** Te same wartości co layout oka w meshDotAtlas (careerEye / skillsEye). */
export const EYE_MESH_LAYOUT_FIT = 1;
export const EYE_MESH_CENTER_RATIO_Y = 0.46;
export const EYE_MESH_STAGE_INSET = 0;
export const RED_IRIS = { rx: 296, ry: 286 };
/** Wewnętrzna źrenica — tylko środkowe zielone kropki z SVG, nie pierścień. */
export const PUPIL_IRIS = { rx: 102, ry: 98 };
/** Ułamek zasięgu do krawędzi białego tła — tylko oś X. */
export const EYE_TRACK_HORIZONTAL_RATIO = 0.58;
/** Lekki clip tęczówki (irisOnly) — elipsa zamiast ciężkiego path #D9D9D9. */
export const EYE_WHITE_CLIP = { cx: EYE_CENTER.x, cy: EYE_CENTER.y, rx: 593, ry: 310 };

/** Wewnętrzna siatka tęczówki — wykluczana z obramówki w irisOnly. */
const IRIS_INTERIOR_SCALE = 0.92;

const GREEN = new Set(['#00FF62', '#00FF2F', '#0DFF00']);
const RED = '#FF0000';

function parseCircle(el: Element): EyeCircle | null {
  if (el.tagName.toLowerCase() !== 'circle') return null;
  const cx = Number(el.getAttribute('cx'));
  const cy = Number(el.getAttribute('cy'));
  const r = Number(el.getAttribute('r') ?? 6.5);
  if (!Number.isFinite(cx) || !Number.isFinite(cy)) return null;
  return { cx, cy, r };
}

function parseLine(el: Element): EyeLine | null {
  if (el.tagName.toLowerCase() !== 'line') return null;
  const x1 = Number(el.getAttribute('x1'));
  const y1 = Number(el.getAttribute('y1'));
  const x2 = Number(el.getAttribute('x2'));
  const y2 = Number(el.getAttribute('y2'));
  if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
  return { x1, y1, x2, y2 };
}

function layerOf(el: Element): 'back' | 'white' | 'red' | 'green' {
  const fill = el.getAttribute('fill')?.toUpperCase();
  const stroke = el.getAttribute('stroke')?.toUpperCase();
  if ((fill && GREEN.has(fill)) || (stroke && GREEN.has(stroke))) return 'green';
  if (fill === RED || stroke === RED) return 'red';
  if (stroke?.toLowerCase() === 'white') return 'white';
  return 'back';
}

export function parseKamochiEyeSvg(svgText: string): KamochiEyeData {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const root = doc.querySelector('svg');
  if (!root) {
    return {
      back: '',
      white: '',
      whiteOutline: '',
      whiteZonePath: null,
      redCircles: [],
      redLines: [],
      pupilCircles: [],
      pupilLines: [],
      pupilBridgeLines: [],
      pupilClip: { ...PUPIL_IRIS },
      irisTrackMax: defaultIrisTrackMax(),
    };
  }

  const back: string[] = [];
  const white: string[] = [];
  const whiteOutline: string[] = [];
  const redCircles: EyeCircle[] = [];
  const irisRedLines: EyeLine[] = [];
  const greenAll: EyeCircle[] = [];
  let whiteZonePath: string | null = null;

  for (const child of Array.from(root.children)) {
    if (child.tagName.toLowerCase() === 'path') {
      const d = child.getAttribute('d');
      const fill = child.getAttribute('fill')?.toUpperCase() ?? '';
      if (d && !whiteZonePath && (fill === '#D9D9D9' || fill === 'D9D9D9')) {
        whiteZonePath = d;
      }
      continue;
    }

    const layer = layerOf(child);

    if (layer === 'red') {
      const circle = parseCircle(child);
      if (circle) {
        redCircles.push({ ...circle, r: circle.r });
        continue;
      }
      const line = parseLine(child);
      if (line) {
        irisRedLines.push(line);
        continue;
      }
    }

    if (layer === 'back') back.push(child.outerHTML);
    else if (layer === 'white') {
      white.push(child.outerHTML);
      const line = parseLine(child);
      if (line) {
        if (!lineInEyeInterior(line, IRIS_INTERIOR_SCALE)) {
          whiteOutline.push(child.outerHTML);
        }
      } else {
        whiteOutline.push(child.outerHTML);
      }
    } else if (layer === 'green') {
      const circle = parseCircle(child);
      if (circle && pointInEyeIris(circle.cx, circle.cy)) {
        greenAll.push(circle);
      }
    }
  }

  const annulusGreens = greenAll.filter(
    (g) => pointInEyeIris(g.cx, g.cy) && !pointInEyePupil(g.cx, g.cy),
  );
  /** Wszystkie zielone kropki w tęczówce — środek + pierścień źrenicy (bez wewnętrznego clipu). */
  const pupilCircles = greenAll;
  const pupilBridgeLines = splitPupilBridgeLines(irisRedLines, annulusGreens);
  // Różowe linie zostają w całości — wcześniejsze wycinanie usuwało środkową siatkę tęczówki.
  const redLines = irisRedLines;

  return {
    back: back.join(''),
    white: white.join(''),
    whiteOutline: whiteOutline.join(''),
    whiteZonePath,
    redCircles,
    redLines,
    pupilCircles,
    pupilLines: buildPupilMeshLines(pupilCircles),
    pupilBridgeLines,
    pupilClip: pupilClipFromCircles(pupilCircles),
    irisTrackMax: computeIrisTrackMax(whiteZonePath),
  };
}

const WHITE_DOT_SNAP_PX = 14;
const WHITE_LINE_SNAP_PX = 18;
const MESH_DOT_SNAP_PX = 12;

function nearestWhiteDotIndex(
  x: number,
  y: number,
  dots: EyeCircle[],
  snap = WHITE_DOT_SNAP_PX,
): number {
  let best = -1;
  let bestD = snap;
  for (let i = 0; i < dots.length; i += 1) {
    const d = Math.hypot(dots[i]!.cx - x, dots[i]!.cy - y);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Białe kropki i kreski obrysu — poza tęczówką. */
export function extractEyeWhiteBody(svgText: string) {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const dots: EyeCircle[] = [];
  for (const el of doc.querySelectorAll('circle[fill="#D9D9D9"]')) {
    const circle = parseCircle(el);
    if (circle && !pointInEyeIris(circle.cx, circle.cy)) {
      dots.push(circle);
    }
  }

  const wireLines: { a: number; b: number }[] = [];
  const wireKeys = new Set<string>();
  for (const el of doc.querySelectorAll('line')) {
    if (el.getAttribute('stroke')?.toLowerCase() !== 'white') continue;
    const line = parseLine(el);
    if (!line || lineInEyeInterior(line)) continue;
    const a = nearestWhiteDotIndex(line.x1, line.y1, dots, WHITE_LINE_SNAP_PX);
    const b = nearestWhiteDotIndex(line.x2, line.y2, dots, WHITE_LINE_SNAP_PX);
    if (a < 0 || b < 0 || a === b) continue;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const key = `${lo}:${hi}`;
    if (wireKeys.has(key)) continue;
    wireKeys.add(key);
    wireLines.push({ a: lo, b: hi });
  }

  return { dots, wireLines };
}

/** Kropki SVG → najbliższy węzeł mesha oka. */
export function mapEyeDotsToMeshNodes(
  dots: EyeCircle[],
  nodes: ReadonlyArray<{ x: number; y: number }>,
): number[] {
  return dots.map((dot) => {
    let best = -1;
    let bestD = MESH_DOT_SNAP_PX;
    for (let i = 0; i < nodes.length; i += 1) {
      const n = nodes[i]!;
      const d = Math.hypot(n.x - dot.cx, n.y - dot.cy);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  });
}

export function buildEyeWhiteHull(
  whiteZonePath: string,
  dots: EyeCircle[],
  wireLines: { a: number; b: number }[],
  dotNodeIds: number[],
) {
  const points = parseWhiteZonePathPoints(whiteZonePath);
  const hullDotIndices = points.map((p) => nearestWhiteDotIndex(p.x, p.y, dots));
  return {
    path: whiteZonePath,
    points,
    dots,
    wireLines,
    hullDotIndices,
    dotNodeIds,
  };
}

/** Polygon z live wierzchołków — zsynchronizowany z kropkami mesha. */
export function buildHullPathFromVerts(verts: ReadonlyArray<{ x: number; y: number }>): string {
  if (!verts.length) return '';
  const head = verts[0]!;
  const parts = [`M${head.x} ${head.y}`];
  for (let i = 1; i < verts.length; i += 1) {
    const p = verts[i]!;
    parts.push(`L${p.x} ${p.y}`);
  }
  parts.push('Z');
  return parts.join('');
}

export function parseWhiteZonePathPoints(d: string) {
  const nums = [...d.matchAll(/[-+]?\d*\.?\d+/g)].map((m) => Number(m[0]));
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i < nums.length - 1; i += 2) {
    if (Number.isFinite(nums[i]) && Number.isFinite(nums[i + 1])) {
      pts.push({ x: nums[i]!, y: nums[i + 1]! });
    }
  }
  return pts;
}

/** Przesuwa wierzchołki ścieżki #D9D9D9 razem z kropkami obrysu. */
export function buildWarpedWhiteZonePath(
  basePath: string,
  offsets: ReadonlyArray<{ dx: number; dy: number }>,
): string {
  const pts = parseWhiteZonePathPoints(basePath);
  if (!pts.length || offsets.length !== pts.length) return basePath;
  const head = pts[0]!;
  const off0 = offsets[0]!;
  const parts = [`M${head.x + off0.dx} ${head.y + off0.dy}`];
  for (let i = 1; i < pts.length; i += 1) {
    const p = pts[i]!;
    const o = offsets[i]!;
    parts.push(`L${p.x + o.dx} ${p.y + o.dy}`);
  }
  parts.push('Z');
  return parts.join('');
}

function whiteSpanAtY(pts: { x: number; y: number }[], y: number) {
  const hits: number[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    if ((a.y < y && b.y < y) || (a.y > y && b.y > y)) continue;
    if (a.y === b.y) {
      if (a.y === y) hits.push(a.x, b.x);
      continue;
    }
    const t = (y - a.y) / (b.y - a.y);
    if (t < 0 || t > 1) continue;
    hits.push(a.x + t * (b.x - a.x));
  }
  if (!hits.length) return null;
  return { left: Math.min(...hits), right: Math.max(...hits) };
}

function whiteSpanAtX(pts: { x: number; y: number }[], x: number) {
  const hits: number[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
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

function defaultIrisTrackMax(): EyeIrisTrackMax {
  return {
    left: Math.max(48, RED_IRIS.rx - PUPIL_IRIS.rx),
    right: Math.max(48, RED_IRIS.rx - PUPIL_IRIS.rx),
    y: Math.max(20, RED_IRIS.ry - PUPIL_IRIS.ry),
  };
}

/** Źrenica przy krawędzi #D9D9D9; pierścień tęczówki wychodzi poza clip. */
export function computeIrisTrackMax(whiteZonePath: string | null): EyeIrisTrackMax {
  if (!whiteZonePath) return defaultIrisTrackMax();
  const pts = parseWhiteZonePathPoints(whiteZonePath);
  if (pts.length < 3) return defaultIrisTrackMax();

  const hSpan = whiteSpanAtY(pts, EYE_CENTER.y);
  const vSpan = whiteSpanAtX(pts, EYE_CENTER.x);
  if (!hSpan || !vSpan) return defaultIrisTrackMax();

  const edgeLeft = Math.max(0, EYE_CENTER.x - hSpan.left - PUPIL_IRIS.rx);
  const edgeRight = Math.max(0, hSpan.right - EYE_CENTER.x - PUPIL_IRIS.rx);
  const hScale = EYE_TRACK_HORIZONTAL_RATIO;

  return {
    left: edgeLeft * hScale,
    right: edgeRight * hScale,
    y: Math.max(0, Math.min(
      EYE_CENTER.y - vSpan.top - PUPIL_IRIS.ry,
      vSpan.bottom - EYE_CENTER.y - PUPIL_IRIS.ry,
    )),
  };
}

const GREEN_SNAP_PX = 14;

function nearCircle(x: number, y: number, circle: EyeCircle, snap = GREEN_SNAP_PX) {
  return Math.hypot(x - circle.cx, y - circle.cy) <= snap;
}

function findGreenAt(x: number, y: number, greens: EyeCircle[]) {
  return greens.find((g) => nearCircle(x, y, g));
}

/** Czerwone linie dotykające pierścienia zielonych → białe mosty źrenica↔tęczówka. */
function splitPupilBridgeLines(redLines: EyeLine[], greens: EyeCircle[]): EyeLine[] {
  const bridges: EyeLine[] = [];
  const keys = new Set<string>();

  for (const line of redLines) {
    const g1 = findGreenAt(line.x1, line.y1, greens);
    const g2 = findGreenAt(line.x2, line.y2, greens);
    if (!g1 && !g2) continue;

    let bridge: EyeLine | null = null;
    if (g1 && !g2) {
      bridge = { x1: g1.cx, y1: g1.cy, x2: line.x2, y2: line.y2 };
    } else if (g2 && !g1) {
      bridge = { x1: g2.cx, y1: g2.cy, x2: line.x1, y2: line.y1 };
    } else if (g1 && g2) {
      bridge = { x1: g1.cx, y1: g1.cy, x2: g2.cx, y2: g2.cy };
    }
    if (!bridge) continue;

    const key = lineKey(bridge);
    if (keys.has(key)) continue;
    keys.add(key);
    bridges.push(bridge);
  }

  return bridges;
}

function lineKey(line: EyeLine) {
  const a = `${Math.round(line.x1)}:${Math.round(line.y1)}`;
  const b = `${Math.round(line.x2)}:${Math.round(line.y2)}`;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function pupilClipFromCircles(circles: EyeCircle[]) {
  let rx = PUPIL_IRIS.rx * 0.96;
  let ry = PUPIL_IRIS.ry * 0.96;
  for (const c of circles) {
    rx = Math.max(rx, Math.abs(c.cx - EYE_CENTER.x) + c.r * 0.82);
    ry = Math.max(ry, Math.abs(c.cy - EYE_CENTER.y) + c.r * 0.82);
  }
  return {
    rx: Math.min(rx, PUPIL_IRIS.rx * 1.02),
    ry: Math.min(ry, PUPIL_IRIS.ry * 1.02),
  };
}

/** Siatka źrenicy — najbliżsi sąsiedzi (jak w mesh SVG, bez linii przez środek). */
function buildPupilMeshLines(circles: EyeCircle[]): EyeLine[] {
  if (circles.length < 2) return [];

  const maxDist = 108;
  const maxNeighbors = 5;
  const minDist = 5;
  const edgeKeys = new Set<string>();
  const lines: EyeLine[] = [];

  for (let i = 0; i < circles.length; i += 1) {
    const a = circles[i]!;
    const neighbors = circles
      .map((b, j) => ({
        j,
        d: Math.hypot(b.cx - a.cx, b.cy - a.cy),
      }))
      .filter((n) => n.j !== i && n.d >= minDist && n.d <= maxDist)
      .sort((x, y) => x.d - y.d)
      .slice(0, maxNeighbors);

    for (const { j } of neighbors) {
      const lo = Math.min(i, j);
      const hi = Math.max(i, j);
      const key = `${lo}:${hi}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      const b = circles[j]!;
      lines.push({ x1: a.cx, y1: a.cy, x2: b.cx, y2: b.cy });
    }
  }

  return lines;
}

/** Elipsa tęczówki — do wycinania wnętrza z mesha (irisOnly). scale < 1 = ciaśniejszy clip. */
export function pointInEyeIris(x: number, y: number, scale = 1): boolean {
  const dx = (x - EYE_CENTER.x) / (RED_IRIS.rx * scale);
  const dy = (y - EYE_CENTER.y) / (RED_IRIS.ry * scale);
  return dx * dx + dy * dy <= 1;
}

export function pointInEyePupil(x: number, y: number, scale = 1): boolean {
  const dx = (x - EYE_CENTER.x) / (PUPIL_IRIS.rx * scale);
  const dy = (y - EYE_CENTER.y) / (PUPIL_IRIS.ry * scale);
  return dx * dx + dy * dy <= 1;
}

export function segmentMidpointInEyePupil(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  scale = 1,
): boolean {
  return pointInEyePupil((x1 + x2) * 0.5, (y1 + y2) * 0.5, scale);
}

export function segmentMidpointInEyeIris(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  scale = 0.9,
): boolean {
  return pointInEyeIris((x1 + x2) * 0.5, (y1 + y2) * 0.5, scale);
}

export function lineInEyeInterior(line: EyeLine, scale = IRIS_INTERIOR_SCALE): boolean {
  if (segmentMidpointInEyeIris(line.x1, line.y1, line.x2, line.y2, scale)) return true;
  return pointInEyeIris(line.x1, line.y1, scale) && pointInEyeIris(line.x2, line.y2, scale);
}
