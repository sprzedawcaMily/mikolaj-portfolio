import { hexToHsl, normalizeHex } from '@/theme/paletteEngine';

export type FaceGroup = 'face' | 'hair';

export interface FaceNode {
  id: number;
  x: number;
  y: number;
  r: number;
  group: FaceGroup;
  phase: number;
}

export interface FaceEdge {
  a: number;
  b: number;
  group: FaceGroup;
}

export interface FaceMesh {
  width: number;
  height: number;
  nodes: FaceNode[];
  edges: FaceEdge[];
  visibleNodeIds: Set<number>;
  faceIndices: number[];
}

export interface PositionedFaceNode extends FaceNode {
  px: number;
  py: number;
  pr: number;
  fear: number;
  reveal: number;
}

interface ParseOptions {
  strictLineSnap?: boolean;
}

function numberAttr(el: Element, name: string, fallback = 0) {
  const value = el.getAttribute(name);
  return value ? Number.parseFloat(value) : fallback;
}

function colorGroup(color: string | null): FaceGroup | null {
  if (!color) return null;
  const normalized = color.toLowerCase();
  if (normalized.includes('red') || normalized === '#ff0000' || normalized === '#f00') return 'hair';
  if (normalized.includes('white') || normalized === '#d9d9d9' || normalized === '#fff' || normalized === '#ffffff') {
    return 'face';
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
  return { x: a * cx + c * cy + e, y: b * cx + d * cy + f };
}

function transformedPoint(el: Element, x: number, y: number) {
  const transform = el.getAttribute('transform') ?? '';
  const matrix = transform.match(/matrix\(([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\s+([-0-9.]+)\)/);
  if (!matrix) return { x, y };
  const [, a, b, c, d, e, f] = matrix.map(Number);
  return { x: a * x + c * y + e, y: b * x + d * y + f };
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
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

function snapToNode(nodes: FaceNode[], x: number, y: number, maxDistance: number) {
  let best: FaceNode | null = null;
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

function nearestNode(nodes: FaceNode[], x: number, y: number, group: FaceGroup) {
  let best: FaceNode | null = null;
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

const HAIR_SNAP_PX = 32;
const HAIR_PAIR_SNAP_PX = 54;

function hairEndpointCandidates(nodes: FaceNode[], x: number, y: number, maxD: number) {
  return nodes
    .filter((node) => node.group === 'hair')
    .map((node) => ({ node, d: Math.hypot(node.x - x, node.y - y) }))
    .filter((entry) => entry.d <= maxD)
    .sort((a, b) => a.d - b.d);
}

/** Gdy oba końce linii wpadają na tę samą kropkę — wybierz parę kandydatów osobno. */
function resolveHairLineEndpoints(
  nodes: FaceNode[],
  start: { x: number; y: number },
  end: { x: number; y: number },
) {
  let startCands = hairEndpointCandidates(nodes, start.x, start.y, HAIR_PAIR_SNAP_PX);
  let endCands = hairEndpointCandidates(nodes, end.x, end.y, HAIR_PAIR_SNAP_PX);

  if (startCands.length === 0) {
    startCands = [{ node: ensureLineNode(nodes, start.x, start.y, 'hair'), d: 0 }];
  }
  if (endCands.length === 0) {
    endCands = [{ node: ensureLineNode(nodes, end.x, end.y, 'hair'), d: 0 }];
  }

  let best: { a: FaceNode; b: FaceNode; score: number } | null = null;
  for (const ca of startCands) {
    for (const cb of endCands) {
      if (ca.node.id === cb.node.id) continue;
      const score = ca.d + cb.d;
      if (!best || score < best.score) {
        best = { a: ca.node, b: cb.node, score };
      }
    }
  }
  return best ? { a: best.a, b: best.b } : null;
}

function pushEdge(
  edges: FaceEdge[],
  edgeKeys: Set<string>,
  a: number,
  b: number,
  group: FaceGroup,
) {
  if (a === b) return;
  const key = a < b ? `${a}:${b}` : `${b}:${a}`;
  if (edgeKeys.has(key)) return;
  edgeKeys.add(key);
  edges.push({ a, b, group });
}

function resolveLineEndpoint(
  nodes: FaceNode[],
  x: number,
  y: number,
  group: FaceGroup,
  strictLineSnap: boolean,
) {
  if (strictLineSnap) return nearestNode(nodes, x, y, group);
  const snapPx = group === 'hair' ? HAIR_SNAP_PX : 28;
  return (
    snapToNode(
      nodes.filter((node) => node.group === group),
      x,
      y,
      snapPx,
    ) ?? ensureLineNode(nodes, x, y, group)
  );
}

function ensureLineNode(nodes: FaceNode[], x: number, y: number, group: FaceGroup) {
  const existing = snapToNode(
    nodes.filter((node) => node.group === group),
    x,
    y,
    24,
  );
  if (existing) return existing;
  const node: FaceNode = {
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

function supplementHairEdgesFromSvg(
  nodes: FaceNode[],
  edges: FaceEdge[],
  edgeKeys: Set<string>,
  doc: Document,
) {
  if (nodes.every((node) => node.group !== 'hair')) return;

  for (const line of doc.querySelectorAll('line')) {
    if (colorGroup(line.getAttribute('stroke')) !== 'hair') continue;
    const { start, end } = lineEndpoints(line);
    const svgLen = Math.hypot(end.x - start.x, end.y - start.y);
    if (svgLen < 8) continue;

    const startCands = hairEndpointCandidates(nodes, start.x, start.y, HAIR_PAIR_SNAP_PX).slice(0, 5);
    const endCands = hairEndpointCandidates(nodes, end.x, end.y, HAIR_PAIR_SNAP_PX).slice(0, 5);
    if (startCands.length === 0 || endCands.length === 0) continue;

    for (const ca of startCands) {
      let matched = false;
      for (const cb of endCands) {
        if (ca.node.id === cb.node.id) continue;
        const meshLen = Math.hypot(ca.node.x - cb.node.x, ca.node.y - cb.node.y);
        if (meshLen > Math.max(svgLen * 1.38, svgLen + 18)) continue;
        const key =
          ca.node.id < cb.node.id
            ? `${ca.node.id}:${cb.node.id}`
            : `${cb.node.id}:${ca.node.id}`;
        if (edgeKeys.has(key)) {
          matched = true;
          break;
        }
        pushEdge(edges, edgeKeys, ca.node.id, cb.node.id, 'hair');
        matched = true;
        break;
      }
      if (matched) break;
    }
  }
}

export function parseFaceMesh(svgText: string, options: ParseOptions = {}): FaceMesh {
  const { strictLineSnap = false } = options;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 1263, 1628];
  const width = viewBox[2] || numberAttr(svg as Element, 'width', 1263);
  const height = viewBox[3] || numberAttr(svg as Element, 'height', 1628);
  const nodes: FaceNode[] = [];

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
  const edges: FaceEdge[] = [];

  for (const line of doc.querySelectorAll('line')) {
    const group = colorGroup(line.getAttribute('stroke'));
    if (!group) continue;
    const { start, end } = lineEndpoints(line);
    let a = resolveLineEndpoint(nodes, start.x, start.y, group, strictLineSnap);
    let b = resolveLineEndpoint(nodes, end.x, end.y, group, strictLineSnap);
    if (!a || !b) continue;
    if (a.id === b.id && group === 'hair' && !strictLineSnap) {
      const pair = resolveHairLineEndpoints(nodes, start, end);
      if (!pair) continue;
      a = pair.a;
      b = pair.b;
    }
    if (a.id === b.id) continue;
    pushEdge(edges, edgeKeys, a.id, b.id, group);
  }

  supplementHairEdgesFromSvg(nodes, edges, edgeKeys, doc);

  const visibleNodeIds = new Set<number>();
  for (const edge of edges) {
    visibleNodeIds.add(edge.a);
    visibleNodeIds.add(edge.b);
  }

  const faceIndices: number[] = [];
  for (const id of visibleNodeIds) {
    if (nodes[id]?.group === 'face') faceIndices.push(id);
  }

  return { width, height, nodes, edges, visibleNodeIds, faceIndices };
}

export function layoutFaceOnCanvas(mesh: FaceMesh, canvasW: number, canvasH: number, fit = 0.82) {
  const scale = Math.min(canvasW / mesh.width, canvasH / mesh.height) * fit;
  const offsetX = (canvasW - mesh.width * scale) / 2;
  const offsetY = (canvasH - mesh.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeOutBack(value: number) {
  const t = clamp01(value);
  const c1 = 1.55;
  const c3 = c1 + 1;
  return 1 + c3 * ((t - 1) ** 3) + c1 * ((t - 1) ** 2);
}

function sparkleForNode(node: FaceNode, now: number) {
  const seed = (Math.sin(node.id * 91.17) + 1) * 0.5;

  if (node.group === 'face') {
    const breath = Math.sin(now * 0.00034 + node.phase * 0.35) * 0.5 + 0.5;
    const baseGlow = Math.pow(breath, 2) * 0.28;
    const wave = Math.sin(now * (0.0004 + seed * 0.00014) + node.phase * 1.8) * 0.5 + 0.5;
    const twinkle = Math.pow(wave, 2.8) * (0.22 + seed * 0.18);
    const period = 11000 + seed * 12000;
    const phase = (now + seed * period) % period;
    const peak = period * (0.34 + seed * 0.28);
    const dist = (phase - peak) / 240;
    const coronation = Math.exp(-(dist * dist)) * (seed > 0.84 ? 0.7 : seed > 0.62 ? 0.22 : 0);
    return Math.min(1, baseGlow + twinkle + coronation);
  }

  const softTwinkle = Math.pow(
    Math.sin(now * (0.00045 + seed * 0.00018) + node.phase * 1.7) * 0.5 + 0.5,
    4,
  );
  const period = 10500 + seed * 14500;
  const phase = (now + seed * period) % period;
  const center = 380 + seed * 920;
  const distance = (phase - center) / 260;
  const starBlink = Math.exp(-(distance * distance)) * (seed > 0.955 ? 0.54 : 0);
  return (softTwinkle * (0.08 + seed * 0.12) + starBlink) * 0.82;
}

function drawFaceSparkleFlare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sparkle: number,
  pr: number,
) {
  const flare = clamp01((sparkle - 0.38) / 0.62);
  if (flare <= 0) return;
  const arm = pr + 1 + flare * 3.2;
  ctx.save();
  ctx.globalAlpha = flare * 0.72;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
  ctx.restore();
}

export function drawFaceSparkleOverlay(
  ctx: CanvasRenderingContext2D,
  positions: PositionedFaceNode[],
  faceIndices: number[],
  now: number,
) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = '#ffffff';
  ctx.lineCap = 'round';

  for (const id of faceIndices) {
    const node = positions[id];
    if (!node || node.reveal < 0.12 || node.fear > 0.2) continue;
    const sparkle = sparkleForNode(node, now);
    if (sparkle < 0.28) continue;
    const intensity = sparkle * node.reveal;
    const coreR = Math.max(1.2, node.pr * (0.5 + sparkle * 0.45));
    ctx.globalAlpha = intensity * 0.55;
    ctx.beginPath();
    ctx.arc(node.px, node.py, coreR, 0, Math.PI * 2);
    ctx.fill();
    if (sparkle > 0.52) {
      drawFaceSparkleFlare(ctx, node.px, node.py, sparkle, coreR);
    }
  }

  ctx.restore();
}

export function revealFaceNode(
  node: PositionedFaceNode,
  now: number,
  revealStartedAt: number,
  canvasW: number,
  canvasH: number,
): PositionedFaceNode {
  if (revealStartedAt < 0 || now - revealStartedAt > 2900) return node;

  const originX = canvasW * 0.53;
  const originY = canvasH * 0.48;
  const dx = node.px - originX;
  const dy = node.py - originY;
  const distance = Math.hypot(dx, dy);
  const maxDistance = Math.hypot(canvasW * 0.56, canvasH * 0.56);
  const distanceDelay = (distance / Math.max(maxDistance, 1)) * 0.58;
  const revealProgress = (now - revealStartedAt) / 2200;
  const local = clamp01((revealProgress - distanceDelay) / 0.72);
  const expansion = easeOutBack(local);
  const swirl = (1 - local) * local * 0.38;
  const cos = Math.cos(swirl);
  const sin = Math.sin(swirl);
  const stretchedX = dx * cos - dy * sin;
  const stretchedY = dx * sin + dy * cos;

  return {
    ...node,
    px: originX + stretchedX * expansion,
    py: originY + stretchedY * expansion,
    pr: node.pr * (0.18 + local * 0.82),
    reveal: local,
  };
}

export interface HairStyle {
  hue: number;
  sat: number;
  light: number;
}

export function accentHairStyle(hex: string): HairStyle {
  const { h, s } = hexToHsl(normalizeHex(hex));
  const hue = Number.isFinite(h) ? h : 271;
  return {
    hue,
    sat: Math.max(58, Math.min(90, s + 6)),
    light: 68,
  };
}

export function neonHairColor(now: number, style: HairStyle, alpha = 1, hoverMix = 0) {
  const mix = Math.min(1, Math.max(0, hoverMix));
  const breatheHue = Math.sin(now * 0.0015) * 4;
  const breatheLight = Math.sin(now * 0.002 + 0.8) * 3;
  const hue = (style.hue + breatheHue + mix * 10) % 360;
  const sat = Math.max(48, Math.min(92, style.sat * (0.92 + mix * 0.08)));
  const light = Math.max(54, Math.min(76, style.light + breatheLight + mix * 6));
  return `hsla(${Math.round(hue)}, ${Math.round(sat)}%, ${Math.round(light)}%, ${alpha})`;
}

function bloodMixFromFear(fear: number, redPulse: number) {
  return Math.min(1, fear * (0.75 + redPulse * 0.25));
}

function hairLocalMix(
  px: number,
  py: number,
  width: number,
  height: number,
  pointer: { x: number; y: number; active: boolean },
) {
  if (!pointer.active || width <= 0 || height <= 0) return 0;
  const pointerX = width * (0.5 + pointer.x);
  const pointerY = height * (0.5 + pointer.y);
  const dist = Math.hypot(px - pointerX, py - pointerY);
  const radius = Math.min(width, height) * 0.2;
  if (dist >= radius) return 0;
  return Math.pow(1 - dist / radius, 2);
}

export type FaceCanvasLayout = ReturnType<typeof layoutFaceOnCanvas>;

/** Tylko odsunięcie od kursora + panic shake — różnica anim−rest przy pointer.active. */
export function facePointerOffset(
  mesh: FaceMesh,
  node: FaceNode,
  layout: FaceCanvasLayout,
  canvasW: number,
  canvasH: number,
  now: number,
  pointer: { x: number; y: number; active: boolean },
  liveMotion: number,
): { dx: number; dy: number } {
  if (!pointer.active || liveMotion <= 0) return { dx: 0, dy: 0 };

  const { scale, offsetX, offsetY } = layout;
  const baseX = offsetX + node.x * scale;
  const baseY = offsetY + node.y * scale;
  const pointerX = canvasW * (0.5 + pointer.x);
  const pointerY = canvasH * (0.5 + pointer.y);
  const dx = baseX - pointerX;
  const dy = baseY - pointerY;
  const distance = Math.hypot(dx, dy);
  const radius = node.group === 'hair' ? 200 : 160;
  if (distance >= radius) return { dx: 0, dy: 0 };

  const faceLive = node.group === 'face' ? liveMotion : 1;
  const hairLive = node.group === 'hair' ? liveMotion : 1;
  const force = (1 - distance / radius) ** 2 * (node.group === 'face' ? faceLive : hairLive);
  const nx = dx / Math.max(distance, 1);
  const ny = dy / Math.max(distance, 1);

  let hairAnchor = 1;
  if (node.group === 'hair') {
    const centerOffset = (node.x - mesh.width / 2) / mesh.width;
    const hairOuter = Math.min(1, Math.max(0.18, (Math.abs(centerOffset) - 0.08) / 0.34));
    hairAnchor = 0.18 + hairOuter * 0.82;
  }
  const mousePush = node.group === 'hair' ? 10 * hairAnchor : 5;
  const panic = force * (node.group === 'hair' ? 1 : 0.75);
  const panicShakeX =
    Math.sin(now * 0.026 + node.phase * 7.1) * panic * (node.group === 'hair' ? 5.2 * hairAnchor : 2.1);
  const panicShakeY =
    Math.cos(now * 0.031 + node.phase * 5.9) * panic * (node.group === 'hair' ? 4.4 * hairAnchor : 1.8);

  return {
    dx: nx * force * mousePush + panicShakeX,
    dy: ny * force * mousePush + panicShakeY,
  };
}

export function projectFaceNode(
  mesh: FaceMesh,
  node: FaceNode,
  canvasW: number,
  canvasH: number,
  now: number,
  pointer: { x: number; y: number; active: boolean },
  blinkStartedAt: number,
  liveMotion = 1,
  layout?: FaceCanvasLayout,
): PositionedFaceNode {
  const { scale, offsetX, offsetY } = layout ?? layoutFaceOnCanvas(mesh, canvasW, canvasH, 0.88);
  const baseX = offsetX + node.x * scale;
  const baseY = offsetY + node.y * scale;
  const faceLive = node.group === 'face' ? liveMotion : 1;
  const hairLive = node.group === 'hair' ? liveMotion : 1;

  const pointerX = canvasW * (0.5 + pointer.x);
  const pointerY = canvasH * (0.5 + pointer.y);
  const dx = baseX - pointerX;
  const dy = baseY - pointerY;
  const distance = Math.hypot(dx, dy);
  const radius = node.group === 'hair' ? 200 : 160;
  const force =
    pointer.active && distance < radius && liveMotion > 0
      ? (1 - distance / radius) ** 2 * (node.group === 'face' ? faceLive : hairLive)
      : 0;
  const nx = dx / Math.max(distance, 1);
  const ny = dy / Math.max(distance, 1);

  const centerOffset = (node.x - mesh.width / 2) / mesh.width;
  const vertical = node.y / mesh.height;
  const eyeCenterX = node.x < mesh.width / 2 ? mesh.width * 0.335 : mesh.width * 0.665;
  const eyeCenterY = mesh.height * 0.57;
  const eyeDx = Math.abs(node.x - eyeCenterX) / (mesh.width * 0.12);
  const eyeDy = Math.abs(node.y - eyeCenterY) / (mesh.height * 0.065);
  const eyeMask = node.group === 'face' ? Math.max(0, 1 - (eyeDx * eyeDx + eyeDy * eyeDy)) : 0;
  const blinkDistance = (now - blinkStartedAt - 120) / 75;
  const blink = liveMotion ? Math.exp(-(blinkDistance * blinkDistance)) * eyeMask : 0;
  const blinkX = (eyeCenterX - node.x) * scale * 0.1 * blink;
  const blinkY = (eyeCenterY - node.y) * scale * 0.82 * blink;
  const faceBreath = Math.sin(now * 0.00125 + vertical * 7) * 0.9 * faceLive;
  const faceMicroX = Math.cos(now * 0.0017 + node.phase) * 0.45 * faceLive;
  const faceMicroY = Math.sin(now * 0.0015 + node.phase) * 0.55 * faceLive;
  const hairRootWave = Math.sin(now * 0.002 + vertical * 10);
  const hairTipWave = Math.sin(now * 0.0028 + vertical * 16 + centerOffset * 5);
  const hairSide = Math.sign(centerOffset || 1);
  const hairOuter = Math.min(1, Math.max(0.18, (Math.abs(centerOffset) - 0.08) / 0.34));
  const hairAnchor = 0.18 + hairOuter * 0.82;
  const hairSideSway = Math.max(-1.2, Math.min(8, hairRootWave * 4.8 + hairTipWave * 3.1));
  const hairFlowX = node.group === 'hair' ? hairSideSway * hairSide * hairAnchor * hairLive : 0;
  const hairFlowY =
    node.group === 'hair'
      ? Math.cos(now * 0.0022 + vertical * 13 + Math.abs(centerOffset) * 4) * 4.2 * hairAnchor * hairLive
      : 0;
  const mousePush = node.group === 'hair' ? 10 * hairAnchor : 5;
  const panic = force * (node.group === 'hair' ? 1 : 0.75);
  const panicShakeX =
    Math.sin(now * 0.026 + node.phase * 7.1) * panic * (node.group === 'hair' ? 5.2 * hairAnchor : 2.1);
  const panicShakeY =
    Math.cos(now * 0.031 + node.phase * 5.9) * panic * (node.group === 'hair' ? 4.4 * hairAnchor : 1.8);

  return {
    ...node,
    px:
      baseX +
      nx * force * mousePush +
      panicShakeX +
      blinkX +
      (node.group === 'hair' ? hairFlowX : faceMicroX),
    py:
      baseY +
      ny * force * mousePush +
      panicShakeY +
      blinkY +
      (node.group === 'hair' ? hairFlowY : faceBreath + faceMicroY),
    pr: node.r * scale * (1 + panic * (node.group === 'hair' ? 0.35 : 0.28) - blink * 0.16),
    fear: panic,
    reveal: 1,
  };
}

export function paintFaceMesh(
  ctx: CanvasRenderingContext2D,
  mesh: FaceMesh,
  positions: PositionedFaceNode[],
  now: number,
  hairStyle: HairStyle,
  pointer: { x: number; y: number; active: boolean },
  hairVis: number,
  faceWireVis: number,
) {
  const hairColor = neonHairColor(now, hairStyle, 0.98, 0);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (const edge of mesh.edges) {
    const a = positions[edge.a];
    const b = positions[edge.b];
    if (!a || !b || a.reveal < 0.02 || b.reveal < 0.02) continue;
    if (edge.group === 'hair' && hairVis <= 0.02) continue;
    if (edge.group === 'face' && faceWireVis <= 0.02) continue;
    const fear = Math.max(a.fear, b.fear);
    const reveal = Math.min(a.reveal, b.reveal);
    const redPulse = Math.sin(now * 0.03 + a.phase + b.phase) * 0.5 + 0.5;
    const bloodMix = bloodMixFromFear(fear, redPulse);
    const hairMix =
      edge.group === 'hair'
        ? Math.max(
            hairLocalMix(a.px, a.py, ctx.canvas.width, ctx.canvas.height, pointer),
            hairLocalMix(b.px, b.py, ctx.canvas.width, ctx.canvas.height, pointer),
          )
        : 0;
    ctx.globalAlpha =
      edge.group === 'hair'
        ? (0.86 + hairMix * 0.1) * reveal * hairVis
        : (0.78 + fear * 0.12) * reveal * (edge.group === 'face' ? faceWireVis : 1);
    ctx.lineWidth = edge.group === 'hair' ? 0.85 + fear * 0.18 : 0.75 + fear * 0.18;
    ctx.strokeStyle =
      edge.group === 'hair'
        ? neonHairColor(now, hairStyle, 0.95, hairMix)
        : fear > 0.05
          ? `rgb(${Math.round(255 - bloodMix * 105)}, ${Math.round(255 - bloodMix * 255)}, ${Math.round(255 - bloodMix * 255)})`
          : '#ffffff';
    ctx.beginPath();
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
    ctx.stroke();
  }

  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const id of mesh.visibleNodeIds) {
    const node = positions[id];
    if (!node || node.reveal < 0.02) continue;
    if (node.group === 'face') {
      const nodePulse = Math.sin(now * 0.038 + node.phase * 4) * 0.5 + 0.5;
      const bloodMix = bloodMixFromFear(node.fear, nodePulse);
      ctx.globalAlpha = (0.88 + node.fear * 0.1) * node.reveal * faceWireVis;
      ctx.fillStyle =
        node.fear > 0.08
          ? `rgb(${Math.round(217 - bloodMix * 67)}, ${Math.round(217 - bloodMix * 217)}, ${Math.round(217 - bloodMix * 217)})`
          : '#d9d9d9';
      ctx.beginPath();
      ctx.arc(node.px, node.py, Math.max(1.6, node.pr), 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    if (hairVis <= 0.02) continue;
    const hairMix = hairLocalMix(node.px, node.py, ctx.canvas.width, ctx.canvas.height, pointer);
    const sparkle = sparkleForNode(node, now);
    ctx.globalAlpha = (0.9 + hairMix * 0.1 + sparkle * 0.08) * node.reveal * hairVis;
    ctx.fillStyle = hairMix > 0.02 ? neonHairColor(now, hairStyle, 0.98, hairMix) : hairColor;
    ctx.beginPath();
    ctx.arc(node.px, node.py, Math.max(1.6, node.pr + sparkle * 1.35), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function hairVisibilityFromBlend(blendT: number, fromHero: boolean) {
  if (!fromHero) return 0;
  return clamp01(1 - blendT * 3.2);
}

export function faceWireVisibilityFromBlend(blendT: number, fromHero: boolean) {
  if (!fromHero) return 1;
  return clamp01(1 - blendT * 2.4);
}
