export type EyeCircle = { cx: number; cy: number; r: number };
export type EyeLine = { x1: number; y1: number; x2: number; y2: number };

export type KamochiEyeData = {
  back: string;
  white: string;
  /** Białe linie poza tęczówką — pełna obramówka bez wewnętrznej siatki (irisOnly). */
  whiteOutline: string;
  /** Ścieżka strefy widoczności czerwieni (z oko2.svg) — nie renderowana, tylko clip. */
  redZonePath: string | null;
  redCircles: EyeCircle[];
  redLines: EyeLine[];
  pupilCircles: EyeCircle[];
  /** Biała siatka między kropkami źrenicy. */
  pupilLines: EyeLine[];
  /** Białe kreski łączące źrenicę (zielone) z tęczówką (czerwone linie SVG). */
  pupilBridgeLines: EyeLine[];
  pupilClip: { rx: number; ry: number };
};

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
      redZonePath: null,
      redCircles: [],
      redLines: [],
      pupilCircles: [],
      pupilLines: [],
      pupilBridgeLines: [],
      pupilClip: { ...PUPIL_IRIS },
    };
  }

  const back: string[] = [];
  const white: string[] = [];
  const whiteOutline: string[] = [];
  const redCircles: EyeCircle[] = [];
  const irisRedLines: EyeLine[] = [];
  const greenAll: EyeCircle[] = [];
  let redZonePath: string | null = null;

  for (const child of Array.from(root.children)) {
    if (child.tagName.toLowerCase() === 'path') {
      const d = child.getAttribute('d');
      if (d && !redZonePath) redZonePath = d;
      continue;
    }

    const layer = layerOf(child);

    if (layer === 'red') {
      const circle = parseCircle(child);
      if (circle) {
        redCircles.push({ ...circle, r: 7.25 });
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

  const pupilCircles = greenAll;
  const annulusGreens = greenAll.filter(
    (g) => pointInEyeIris(g.cx, g.cy) && !pointInEyePupil(g.cx, g.cy),
  );
  const pupilBridgeLines = splitPupilBridgeLines(irisRedLines, annulusGreens);
  // Różowe linie zostają w całości — wcześniejsze wycinanie usuwało środkową siatkę tęczówki.
  const redLines = irisRedLines;

  return {
    back: back.join(''),
    white: white.join(''),
    whiteOutline: whiteOutline.join(''),
    redZonePath,
    redCircles,
    redLines,
    pupilCircles,
    pupilLines: buildPupilMeshLines(pupilCircles),
    pupilBridgeLines,
    pupilClip: pupilClipFromCircles(pupilCircles),
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
  let rx = PUPIL_IRIS.rx;
  let ry = PUPIL_IRIS.ry;
  for (const c of circles) {
    rx = Math.max(rx, Math.abs(c.cx - EYE_CENTER.x) + c.r + 2);
    ry = Math.max(ry, Math.abs(c.cy - EYE_CENTER.y) + c.r + 2);
  }
  return { rx, ry };
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

export const EYE_VIEWBOX = { w: 1408, h: 867 };
export const EYE_CENTER = { x: 685.5, y: 477 };
export const RED_IRIS = { rx: 296, ry: 286 };
/** Wewnętrzna źrenica — tylko środkowe zielone kropki z SVG, nie pierścień. */
export const PUPIL_IRIS = { rx: 102, ry: 98 };

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
