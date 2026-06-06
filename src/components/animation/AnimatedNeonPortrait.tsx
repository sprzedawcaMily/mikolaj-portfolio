import { useEffect, useRef } from 'react';
import { useTheme } from '@/theme/ThemeProvider';
import { hexToHsl, normalizeHex } from '@/theme/paletteEngine';
import {
  buildPrimaryMorphMaps,
  sourceWireVisibility,
  targetWireVisibility,
  rotateArrowToBusFrame,
  rotateBusToForkFrame,
  type Point2,
  type PrimaryMorphMaps,
} from '@/components/animation/mesh/primaryMeshMorphSystem';
import {
  clamp01 as meshClamp01,
  easeSmoothStep as meshEase,
  layoutMeshOnCanvas as layoutSvgMeshOnCanvas,
  parseSvgMesh,
  type SvgMesh,
} from '@/components/animation/mesh/svgMesh';
import styles from './AnimatedNeonPortrait.module.css';

const SOURCE = '/images/profile/Group%205.svg?v=svg-mesh-2';
const ARROW_SOURCE = '/images/profile/Group%201.svg?v=arrow-mesh-2';
const BUS_SOURCE = '/images/transitrank/autobus.svg?v=bus-mesh-12';
const FORK_SOURCE = '/images/forkfull/widelec.svg?v=fork-mesh-2';
const SPRAY_SOURCE = '/images/kamochi/sprej.svg?v=spray-mesh-1';
/** Marker dziubka w sprej.svg — czerwona kropka (grupa light, niewidoczna w mesh). */
const SPRAY_NOZZLE_SVG = { x: 222.5, y: 45.5 };
const SPRAY_BURST_DURATION_MS = 4000;
const SPRAY_BURST_INTERVAL_MIN_MS = 4200;
const SPRAY_BURST_INTERVAL_MAX_MS = 7200;
const SPRAY_BURST_TRAVEL_MULTIPLIER = 2;

interface SprayBurstPalette {
  stroke: string;
  fill: string;
}

const SPRAY_BURST_PALETTES: SprayBurstPalette[] = [
  { stroke: '#ffffff', fill: '#d9d9d9' },
  { stroke: '#e9d5ff', fill: '#c084fc' },
  { stroke: '#a5f3fc', fill: '#22d3ee' },
  { stroke: '#fbcfe8', fill: '#f472b6' },
  { stroke: '#bbf7d0', fill: '#4ade80' },
  { stroke: '#fde68a', fill: '#fbbf24' },
  { stroke: '#bfdbfe', fill: '#60a5fa' },
  { stroke: '#fecdd3', fill: '#fb7185' },
];

function pickSprayBurstPalette(): SprayBurstPalette {
  return SPRAY_BURST_PALETTES[Math.floor(Math.random() * SPRAY_BURST_PALETTES.length)]!;
}

function sprayBurstCanvasPad(meshW: number, meshH: number) {
  return {
    left: Math.round(meshW * 1.25),
    top: Math.round(meshH * 0.28),
    right: Math.round(meshW * 0.12),
    bottom: Math.round(meshH * 0.28),
  };
}
/** Na ekranie: w lewo + 5° w górę (kompensacja obrotu canvasu spreju). */
const SPRAY_CANVAS_ROTATE_DEG = 15;
const SPRAY_BURST_SCREEN_TILT_UP_DEG = 5;
const SPRAY_BURST_AIM_RAD =
  Math.PI +
  (SPRAY_BURST_SCREEN_TILT_UP_DEG * Math.PI) / 180 -
  (SPRAY_CANVAS_ROTATE_DEG * Math.PI) / 180;

function resolveSprayNozzleSvg(_sprayMesh: SvgMesh): { x: number; y: number } {
  return SPRAY_NOZZLE_SVG;
}

function sprayNozzleCanvasPoint(
  sprayMesh: SvgMesh,
  width: number,
  height: number,
): { x: number; y: number; layout: ReturnType<typeof layoutSvgMeshOnCanvas> } {
  const layout = layoutSvgMeshOnCanvas(sprayMesh, width, height, 0.96);
  const nozzleSvg = resolveSprayNozzleSvg(sprayMesh);
  return {
    layout,
    x: layout.offsetX + nozzleSvg.x * layout.scale,
    y: layout.offsetY + nozzleSvg.y * layout.scale,
  };
}
const FRAME_MS = 1000 / 30;
const MORPH_FRAME_MS = 1000 / 60;

type Group = 'face' | 'hair';

interface NodePoint {
  id: number;
  x: number;
  y: number;
  r: number;
  group: Group;
  phase: number;
}

interface Edge {
  a: number;
  b: number;
  group: Group;
}

interface Mesh {
  width: number;
  height: number;
  nodes: NodePoint[];
  edges: Edge[];
  visibleNodeIds: Set<number>;
  faceIndices: number[];
}

interface MorphMaps {
  cluster: { x: number; y: number };
  pivot: { x: number; y: number };
  targets: Map<number, { x: number; y: number }>;
  targetsNorm: Map<number, { x: number; y: number }>;
  arrowToFace: Map<number, number>;
  mappedFaces: Set<number>;
  faceToMergeTarget: Map<number, number>;
  morphEdges: { a: number; b: number }[];
  canvasW: number;
  canvasH: number;
}

function translateTargets(
  targets: Map<number, { x: number; y: number }>,
  dx: number,
  dy: number,
) {
  for (const [id, point] of targets) {
    targets.set(id, { x: point.x + dx, y: point.y + dy });
  }
}

function findTailTip(targets: Map<number, { x: number; y: number }>) {
  let tail = { x: 0, y: -Infinity };
  let tip = { x: 0, y: Infinity };
  for (const point of targets.values()) {
    if (point.y > tail.y) tail = point;
    if (point.y < tip.y) tip = point;
  }
  return { tail, tip };
}

const PIVOT_Y_RATIO = 0.1;
const CENTER_PULL = 0.16;
const PIVOT_FOLLOW_X = 0.42;
const PIVOT_FOLLOW_EDGE_DROP = 0.3;
const ARROW_CANVAS_PAD = { top: 10, right: 36, bottom: 18, left: 20 };
const ARROW_LAYOUT_FIT = 0.72;
const ARROW_SHAFT_RATIO = 0.72;
const MORPH_IDLE = 0.0005;
const MORPH_ACTIVE = 0.001;
const HAIR_FADE_END = 0.3;
const ARROW_WIRE_START = 0.12;
const FACE_WIRE_FADE_END = 0.26;

function hairVisibility(morph: number) {
  if (morph <= MORPH_ACTIVE) return 1;
  if (morph >= HAIR_FADE_END) return 0;
  const t = clamp01(morph / HAIR_FADE_END);
  return 1 - easeSmoothStep(t);
}

function faceWireVisibility(morph: number) {
  if (morph <= MORPH_ACTIVE) return 1;
  if (morph >= FACE_WIRE_FADE_END) return 0;
  const t = clamp01(morph / FACE_WIRE_FADE_END);
  return 1 - easeSmoothStep(t);
}

function arrowWireVisibility(morph: number) {
  if (morph <= ARROW_WIRE_START) return 0;
  if (morph >= FACE_WIRE_FADE_END) return 1;
  const t = clamp01((morph - ARROW_WIRE_START) / (FACE_WIRE_FADE_END - ARROW_WIRE_START));
  return easeSmoothStep(t);
}

function aimEdgeFactor(aimPoint: { x: number; centerX?: number }, canvasWidth: number) {
  const centerX = aimPoint.centerX ?? canvasWidth * 0.5;
  const offset = Math.abs(aimPoint.x - centerX);
  const range = Math.max(canvasWidth * 0.34, 80);
  return easeSmoothStep(Math.min(1, offset / range));
}

interface ParseSvgOptions {
  strictLineSnap?: boolean;
}

function numberAttr(el: Element, name: string, fallback = 0) {
  const value = el.getAttribute(name);
  return value ? Number.parseFloat(value) : fallback;
}

function colorGroup(color: string | null): Group | null {
  if (!color) return null;
  const normalized = color.toLowerCase();
  if (normalized.includes('red') || normalized === '#ff0000' || normalized === '#f00') return 'hair';
  if (normalized.includes('white') || normalized === '#d9d9d9' || normalized === '#fff' || normalized === '#ffffff') return 'face';
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

interface PositionedNode extends NodePoint {
  px: number;
  py: number;
  pr: number;
  fear: number;
  reveal: number;
}

function snapToCircleNode(nodes: NodePoint[], x: number, y: number, maxDistance: number) {
  let best: NodePoint | null = null;
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

function nearestCircleNode(nodes: NodePoint[], x: number, y: number, group: Group) {
  let best: NodePoint | null = null;
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
  nodes: NodePoint[],
  x: number,
  y: number,
  group: Group,
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
      group === 'hair' ? 7 : 28,
    ) ?? ensureLineNode(nodes, x, y, group)
  );
}

function ensureLineNode(nodes: NodePoint[], x: number, y: number, group: Group) {
  const existing = snapToCircleNode(
    nodes.filter((node) => node.group === group),
    x,
    y,
    group === 'hair' ? 7 : 24,
  );
  if (existing) return existing;

  const node: NodePoint = {
    id: nodes.length,
    x,
    y,
    r: group === 'hair' ? 3.2 : 4.8,
    group,
    phase: (x * 0.021 + y * 0.037) % (Math.PI * 2),
  };
  nodes.push(node);
  return node;
}

function parseSvg(svgText: string, options: ParseSvgOptions = {}): Mesh {
  const { strictLineSnap = false } = options;
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const svg = doc.querySelector('svg');
  const viewBox = svg?.getAttribute('viewBox')?.split(/\s+/).map(Number) ?? [0, 0, 1263, 1628];
  const width = viewBox[2] || numberAttr(svg as Element, 'width', 1263);
  const height = viewBox[3] || numberAttr(svg as Element, 'height', 1628);
  const nodes: NodePoint[] = [];

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
  const edges: Edge[] = [];

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

  const faceIndices: number[] = [];
  for (const id of visibleNodeIds) {
    if (nodes[id]?.group === 'face') faceIndices.push(id);
  }

  return { width, height, nodes, edges, visibleNodeIds, faceIndices };
}

function sparkleForNode(node: NodePoint, now: number) {
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
    const coronation = Math.exp(-(dist * dist))
      * (seed > 0.84 ? 0.7 : seed > 0.62 ? 0.22 : 0);

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

function drawFaceSparkleOverlay(
  ctx: CanvasRenderingContext2D,
  positions: PositionedNode[],
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

interface HairStyle {
  hue: number;
  sat: number;
  light: number;
}

/** Te same proporcje co token --dot w paletteEngine. */
function accentHairStyle(hex: string): HairStyle {
  const { h, s } = hexToHsl(normalizeHex(hex));
  const hue = Number.isFinite(h) ? h : 271;
  return {
    hue,
    sat: Math.max(58, Math.min(90, s + 6)),
    light: 68,
  };
}

function neonHairColor(
  now: number,
  style: HairStyle,
  alpha = 1,
  hoverMix = 0,
) {
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

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function easeOutBack(value: number) {
  const t = clamp01(value);
  const c1 = 1.55;
  const c3 = c1 + 1;
  return 1 + c3 * ((t - 1) ** 3) + c1 * ((t - 1) ** 2);
}

function easeSmoothStep(value: number) {
  const t = clamp01(value);
  return t * t * (3 - 2 * t);
}

function easeOutCubic(value: number) {
  const t = clamp01(value);
  return 1 - Math.pow(1 - t, 3);
}

function rotatePoint(cx: number, cy: number, x: number, y: number, angle: number) {
  const dx = x - cx;
  const dy = y - cy;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return {
    x: cx + dx * cos - dy * sin,
    y: cy + dx * sin + dy * cos,
  };
}

function fitMappedTargetsToCanvas(
  targets: Map<number, { x: number; y: number }>,
  canvasWidth: number,
  canvasHeight: number,
  pad = ARROW_CANVAS_PAD,
) {
  if (targets.size === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const point of targets.values()) {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  }

  const minBoundX = pad.left;
  const minBoundY = pad.top;
  const maxBoundX = canvasWidth - pad.right;
  const maxBoundY = canvasHeight - pad.bottom;

  let dx = 0;
  let dy = 0;
  if (maxX > maxBoundX) dx = maxBoundX - maxX;
  if (minX + dx < minBoundX) dx += minBoundX - (minX + dx);
  if (maxY > maxBoundY) dy = maxBoundY - maxY;
  if (minY + dy < minBoundY) dy += minBoundY - (minY + dy);

  if (dx !== 0 || dy !== 0) {
    for (const [id, point] of targets) {
      targets.set(id, { x: point.x + dx, y: point.y + dy });
    }
  }
}

function layoutMeshOnCanvas(
  mesh: Mesh,
  canvasWidth: number,
  canvasHeight: number,
  fit = 0.82,
) {
  const scale = Math.min(canvasWidth / mesh.width, canvasHeight / mesh.height) * fit;
  const offsetX = (canvasWidth - mesh.width * scale) / 2;
  const offsetY = (canvasHeight - mesh.height * scale) / 2;
  return { scale, offsetX, offsetY };
}

function buildFaceArrowBijection(
  faceMesh: Mesh,
  arrowMesh: Mesh,
  sortedFace: number[],
  sortedArrow: number[],
) {
  const arrowToFace = new Map<number, number>();
  const usedFace = new Set<number>();
  const faceCx = faceMesh.width / 2;
  const faceCy = faceMesh.height * 0.52;
  const arrowCx = arrowMesh.width / 2;
  const arrowCy = arrowMesh.height / 2;

  for (const arrowId of sortedArrow) {
    const arrowNode = arrowMesh.nodes[arrowId];
    const ax = (arrowNode.x - arrowCx) / arrowMesh.width;
    const ay = (arrowNode.y - arrowCy) / arrowMesh.height;

    let bestFace = -1;
    let bestScore = Infinity;

    for (const faceId of sortedFace) {
      if (usedFace.has(faceId)) continue;
      const faceNode = faceMesh.nodes[faceId];
      const fx = (faceNode.x - faceCx) / faceMesh.width;
      const fy = (faceNode.y - faceCy) / faceMesh.height;
      const score = Math.hypot(fx - ax, fy - ay);
      if (score < bestScore) {
        bestScore = score;
        bestFace = faceId;
      }
    }

    if (bestFace >= 0) {
      usedFace.add(bestFace);
      arrowToFace.set(arrowId, bestFace);
    }
  }

  return arrowToFace;
}

function buildMorphMaps(
  faceMesh: Mesh,
  arrowMesh: Mesh,
  canvasWidth: number,
  canvasHeight: number,
  aimPoint?: { x: number; y: number; centerX?: number } | null,
): MorphMaps {
  const arrowLayout = layoutMeshOnCanvas(
    arrowMesh,
    canvasWidth,
    canvasHeight,
    aimPoint ? ARROW_LAYOUT_FIT : 0.82,
  );
  const faceCx = faceMesh.width / 2;
  const faceCy = faceMesh.height * 0.52;
  const arrowCx = arrowMesh.width / 2;
  const arrowCy = arrowMesh.height / 2;

  const sortedFace = [...faceMesh.faceIndices].sort((a, b) => {
    const na = faceMesh.nodes[a];
    const nb = faceMesh.nodes[b];
    return (
      Math.atan2(na.y - faceCy, na.x - faceCx) -
      Math.atan2(nb.y - faceCy, nb.x - faceCx)
    );
  });

  const arrowIds = arrowMesh.faceIndices.length > 0
    ? arrowMesh.faceIndices
    : [...arrowMesh.visibleNodeIds];

  const sortedArrow = [...arrowIds].sort((a, b) => {
    const na = arrowMesh.nodes[a];
    const nb = arrowMesh.nodes[b];
    return (
      Math.atan2(na.y - arrowCy, na.x - arrowCx) -
      Math.atan2(nb.y - arrowCy, nb.x - arrowCx)
    );
  });

  const targets = new Map<number, { x: number; y: number }>();
  const arrowToFace = buildFaceArrowBijection(faceMesh, arrowMesh, sortedFace, sortedArrow);
  const mappedFaces = new Set<number>(arrowToFace.values());

  for (const [arrowId, faceId] of arrowToFace) {
    const arrowNode = arrowMesh.nodes[arrowId];
    targets.set(faceId, {
      x: arrowLayout.offsetX + arrowNode.x * arrowLayout.scale,
      y: arrowLayout.offsetY + arrowNode.y * arrowLayout.scale,
    });
  }

  const cluster = {
    x: canvasWidth * 0.5,
    y: canvasHeight * 0.48,
  };

  for (const faceId of sortedFace) {
    if (!targets.has(faceId)) {
      targets.set(faceId, { ...cluster });
    }
  }

  const centerX = aimPoint?.centerX ?? canvasWidth * 0.5;
  const edgeT = aimPoint ? aimEdgeFactor(aimPoint, canvasWidth) : 0;
  const pivotFollow = Math.max(0.1, PIVOT_FOLLOW_X - edgeT * PIVOT_FOLLOW_EDGE_DROP);
  const pivot = {
    x: aimPoint ? centerX + (aimPoint.x - centerX) * pivotFollow : centerX,
    y: canvasHeight * PIVOT_Y_RATIO,
  };

  if (aimPoint && mappedFaces.size > 0) {
    const mappedTargets = new Map<number, { x: number; y: number }>();
    for (const faceId of mappedFaces) {
      const point = targets.get(faceId);
      if (point) mappedTargets.set(faceId, { ...point });
    }

    const { tail } = findTailTip(mappedTargets);
    translateTargets(mappedTargets, pivot.x - tail.x, pivot.y - tail.y);

    const { tip: anchoredTip } = findTailTip(mappedTargets);
    const shaft = Math.hypot(anchoredTip.x - pivot.x, anchoredTip.y - pivot.y);
    const targetShaft = canvasHeight * ARROW_SHAFT_RATIO;
    if (shaft > 1 && Math.abs(targetShaft - shaft) > 1) {
      const scale = targetShaft / shaft;
      for (const [id, point] of mappedTargets) {
        mappedTargets.set(id, {
          x: pivot.x + (point.x - pivot.x) * scale,
          y: pivot.y + (point.y - pivot.y) * scale,
        });
      }
    }

    const { tip } = findTailTip(mappedTargets);
    const aimAngle = Math.atan2(aimPoint.y - pivot.y, aimPoint.x - pivot.x);
    const pullCenterX = aimPoint.centerX ?? canvasWidth * 0.5;
    const centerAngle = Math.atan2(aimPoint.y - pivot.y, pullCenterX - pivot.x);
    let centerDelta = centerAngle - aimAngle;
    while (centerDelta > Math.PI) centerDelta -= Math.PI * 2;
    while (centerDelta < -Math.PI) centerDelta += Math.PI * 2;
    const defaultAngle = Math.atan2(tip.y - pivot.y, tip.x - pivot.x);
    const centerPull = CENTER_PULL * (1 - edgeT);
    const rotation = aimAngle + centerDelta * centerPull - defaultAngle;
    for (const [id, point] of mappedTargets) {
      mappedTargets.set(id, rotatePoint(pivot.x, pivot.y, point.x, point.y, rotation));
    }

    fitMappedTargetsToCanvas(mappedTargets, canvasWidth, canvasHeight);

    for (const [id, point] of mappedTargets) {
      targets.set(id, point);
    }
  }

  const morphEdges: { a: number; b: number }[] = [];
  for (const edge of arrowMesh.edges) {
    const faceA = arrowToFace.get(edge.a);
    const faceB = arrowToFace.get(edge.b);
    if (faceA == null || faceB == null || faceA === faceB) continue;
    morphEdges.push({ a: faceA, b: faceB });
  }

  const faceToMergeTarget = new Map<number, number>();
  for (const faceId of sortedFace) {
    if (mappedFaces.has(faceId)) continue;
    const node = faceMesh.nodes[faceId];
    let bestMapped = -1;
    let bestDist = Infinity;
    for (const mappedId of mappedFaces) {
      const mappedNode = faceMesh.nodes[mappedId];
      const dist = Math.hypot(node.x - mappedNode.x, node.y - mappedNode.y);
      if (dist < bestDist) {
        bestDist = dist;
        bestMapped = mappedId;
      }
    }
    if (bestMapped >= 0) faceToMergeTarget.set(faceId, bestMapped);
  }

  const targetsNorm = new Map<number, { x: number; y: number }>();
  for (const [id, point] of targets) {
    targetsNorm.set(id, {
      x: point.x / canvasWidth,
      y: point.y / canvasHeight,
    });
  }

  return { cluster, pivot, targets, targetsNorm, arrowToFace, mappedFaces, faceToMergeTarget, morphEdges, canvasW: canvasWidth, canvasH: canvasHeight };
}

function drawMorphEdges(
  ctx: CanvasRenderingContext2D,
  morphEdges: { a: number; b: number }[],
  positions: PositionedNode[],
  alpha: number,
) {
  if (alpha <= 0.02 || morphEdges.length === 0) return;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = '#ffffff';
  ctx.lineCap = 'round';
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = alpha * 0.88;
  ctx.beginPath();

  for (const edge of morphEdges) {
    const a = positions[edge.a];
    const b = positions[edge.b];
    if (!a || !b || a.reveal < 0.02 || b.reveal < 0.02) continue;
    ctx.moveTo(a.px, a.py);
    ctx.lineTo(b.px, b.py);
  }

  ctx.stroke();
  ctx.restore();
}

function applyHairMorph(
  node: PositionedNode,
  morph: number,
  cluster: { x: number; y: number },
) {
  if (morph <= 0) return node;

  const t = easeSmoothStep(clamp01(morph / HAIR_FADE_END));
  node.px += (cluster.x - node.px) * t;
  node.py += (cluster.y - node.py) * t;
  return node;
}

function resolveMorphTarget(
  maps: MorphMaps,
  faceId: number,
  canvasW: number,
  canvasH: number,
) {
  const norm = maps.targetsNorm.get(faceId);
  if (!norm) return maps.targets.get(faceId) ?? null;

  if (maps.canvasW === canvasW && maps.canvasH === canvasH) {
    return maps.targets.get(faceId) ?? null;
  }

  return { x: norm.x * canvasW, y: norm.y * canvasH };
}

function scaleAimToCanvas(
  aim: { x: number; y: number; centerX?: number; stageW?: number; stageH?: number },
  canvasW: number,
  canvasH: number,
) {
  const refW = aim.stageW ?? canvasW;
  const refH = aim.stageH ?? canvasH;
  if (refW <= 0 || refH <= 0) {
    return {
      x: aim.x,
      y: aim.y,
      centerX: aim.centerX ?? canvasW * 0.5,
    };
  }

  const sx = canvasW / refW;
  const sy = canvasH / refH;
  return {
    x: aim.x * sx,
    y: aim.y * sy,
    centerX: (aim.centerX ?? refW * 0.5) * sx,
  };
}

function applyArrowMorph(
  node: PositionedNode,
  morph: number,
  maps: MorphMaps,
  canvasW: number,
  canvasH: number,
) {
  if (node.group !== 'face') return node;

  const t = clamp01(morph);
  if (t <= 0) return node;

  const faceX = node.px;
  const faceY = node.py;

  if (!maps.mappedFaces.has(node.id)) {
    const mergeId = maps.faceToMergeTarget.get(node.id);
    const mergeTarget = mergeId != null
      ? resolveMorphTarget(maps, mergeId, canvasW, canvasH)
      : null;
    if (!mergeTarget) return node;

    node.px = faceX + (mergeTarget.x - faceX) * t;
    node.py = faceY + (mergeTarget.y - faceY) * t;
    return node;
  }

  const target = resolveMorphTarget(maps, node.id, canvasW, canvasH);
  if (!target) return node;

  node.px = faceX + (target.x - faceX) * t;
  node.py = faceY + (target.y - faceY) * t;
  return node;
}

interface AnimatedNeonPortraitProps {
  morphArrow?: boolean;
  morphProgress?: number;
  busMorphProgress?: number;
  busRenderActive?: boolean;
  forkMorphProgress?: number;
  forkRenderActive?: boolean;
  sprayMorphProgress?: number;
  sprayRenderActive?: boolean;
  aimPoint?: {
    x: number;
    y: number;
    centerX?: number;
    stageW?: number;
    stageH?: number;
  } | null;
}

function drawWhiteHeadlight(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  alpha: number,
  now: number,
  phase: number,
) {
  const pulse = 0.86 + Math.sin(now * 0.0024 + phase * 2.5) * 0.14;
  const glowR = Math.max(8, r * (2.8 + pulse * 0.6));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  const bloom = ctx.createRadialGradient(x, y, 0, x, y, glowR);
  bloom.addColorStop(0, `rgba(255, 255, 255, ${alpha * 0.95 * pulse})`);
  bloom.addColorStop(0.35, `rgba(255, 255, 255, ${alpha * 0.35 * pulse})`);
  bloom.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(x, y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * pulse;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x, y, Math.max(2.2, r * 1.15), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function resolveBusNodePoint(
  busNodeId: number,
  arrowBusMaps: PrimaryMorphMaps,
  facePositions: PositionedNode[],
  morphMaps: MorphMaps,
  supplementT: number,
  holdSupplementPosition = false,
): Point2 | null {
  const supplement = arrowBusMaps.supplementNodes.get(busNodeId);
  if (supplement) {
    const cluster = arrowBusMaps.cluster;
    const posT = holdSupplementPosition ? 1 : supplementT;
    return {
      x: cluster.x + (supplement.x - cluster.x) * posT,
      y: cluster.y + (supplement.y - cluster.y) * posT,
    };
  }

  const arrowId = arrowBusMaps.targetToPrimary.get(busNodeId);
  if (arrowId == null) return null;
  const faceId = morphMaps.arrowToFace.get(arrowId);
  if (faceId == null) return null;
  const facePos = facePositions[faceId];
  if (!facePos) return null;
  return { x: facePos.px, y: facePos.py };
}

function busSupplementPresenceT(busMorph: number, reverse: boolean) {
  const t = clamp01(busMorph);
  if (!reverse) {
    return easeSmoothStep(clamp01((t - 0.35) / 0.65));
  }
  // Demorph autobus→strzałka: zanikają w połowie morphu, bez zwijania do cluster
  return easeSmoothStep(clamp01((t - 0.5) / 0.5));
}

function paintBusSupplementGeometry(
  ctx: CanvasRenderingContext2D,
  arrowBusMaps: PrimaryMorphMaps,
  facePositions: PositionedNode[],
  morphMaps: MorphMaps,
  busMorph: number,
  targetVis: number,
  reverse = false,
) {
  if (arrowBusMaps.supplementNodes.size === 0) return;

  const presenceT = busSupplementPresenceT(busMorph, reverse);
  if (presenceT <= 0.02) return;

  const alpha = targetVis * presenceT;
  const dotR = Math.max(1.6, 6.5 * arrowBusMaps.targetLayoutScale * (reverse ? presenceT : 1));

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = alpha * 0.88;
  ctx.beginPath();

  for (const edge of arrowBusMaps.supplementEdges) {
    const a = resolveBusNodePoint(
      edge.a,
      arrowBusMaps,
      facePositions,
      morphMaps,
      presenceT,
      reverse,
    );
    const b = resolveBusNodePoint(
      edge.b,
      arrowBusMaps,
      facePositions,
      morphMaps,
      presenceT,
      reverse,
    );
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();

  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = '#d9d9d9';

  for (const busNodeId of arrowBusMaps.supplementNodes.keys()) {
    const point = resolveBusNodePoint(
      busNodeId,
      arrowBusMaps,
      facePositions,
      morphMaps,
      presenceT,
      reverse,
    );
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function busSourceForFace(
  faceId: number,
  faceToArrow: Map<number, number>,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  fallback: Point2,
): Point2 {
  const arrowId = faceToArrow.get(faceId);
  if (arrowId != null) {
    const busTarget = arrowBusMaps.targets.get(arrowId);
    if (busTarget) return busTarget;
  }

  const mergeId = morphMaps.faceToMergeTarget.get(faceId);
  if (mergeId != null) {
    const mergeArrow = faceToArrow.get(mergeId);
    const mergeBus = mergeArrow != null ? arrowBusMaps.targets.get(mergeArrow) : null;
    if (mergeBus) return mergeBus;
  }

  return fallback;
}

function busNodeToFace(
  busNodeId: number,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
): number | undefined {
  const arrowId = arrowBusMaps.targetToPrimary.get(busNodeId);
  if (arrowId == null) return undefined;
  return morphMaps.arrowToFace.get(arrowId);
}

function forkSourceForFace(
  faceId: number,
  faceToArrow: Map<number, number>,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  busForkMaps: PrimaryMorphMaps,
  fallback: Point2,
): Point2 {
  const arrowToBus = new Map<number, number>();
  for (const [busId, arrowId] of arrowBusMaps.targetToPrimary) {
    arrowToBus.set(arrowId, busId);
  }

  const arrowId = faceToArrow.get(faceId);
  if (arrowId != null) {
    const busId = arrowToBus.get(arrowId);
    const forkTarget = busId != null ? busForkMaps.targets.get(busId) : null;
    if (forkTarget) return forkTarget;
  } else {
    const mergeId = morphMaps.faceToMergeTarget.get(faceId);
    if (mergeId != null) {
      const mergeArrow = faceToArrow.get(mergeId);
      const mergeBus = mergeArrow != null ? arrowToBus.get(mergeArrow) : null;
      const mergeFork = mergeBus != null ? busForkMaps.targets.get(mergeBus) : null;
      if (mergeFork) return mergeFork;
    }
  }

  return busSourceForFace(faceId, faceToArrow, morphMaps, arrowBusMaps, fallback);
}

function forkNodeToFace(
  forkNodeId: number,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  busForkMaps: PrimaryMorphMaps,
): number | undefined {
  const busId = busForkMaps.targetToPrimary.get(forkNodeId);
  if (busId == null) return undefined;
  return busNodeToFace(busId, morphMaps, arrowBusMaps);
}

function paintTargetSupplementGeometry(
  ctx: CanvasRenderingContext2D,
  supplementMaps: PrimaryMorphMaps,
  resolvePoint: (targetNodeId: number, posT: number) => Point2 | null,
  morph: number,
  targetVis: number,
  supplementStart = 0.35,
) {
  if (supplementMaps.supplementNodes.size === 0) return;

  const supplementSpan = Math.max(0.2, 1 - supplementStart);
  const presenceT = easeSmoothStep(clamp01((morph - supplementStart) / supplementSpan));
  if (presenceT <= 0.02) return;

  const alpha = targetVis * presenceT;
  const dotR = Math.max(1.6, 6.5 * supplementMaps.targetLayoutScale);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.75;
  ctx.globalAlpha = alpha * 0.88;
  ctx.beginPath();

  for (const edge of supplementMaps.supplementEdges) {
    const a = resolvePoint(edge.a, presenceT);
    const b = resolvePoint(edge.b, presenceT);
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();

  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = '#d9d9d9';

  for (const targetNodeId of supplementMaps.supplementNodes.keys()) {
    const point = resolvePoint(targetNodeId, presenceT);
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, dotR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Pełny widelec z SVG — wszystkie kropki i krawędzie (w tym rękojeść). */
function paintFullForkMesh(
  ctx: CanvasRenderingContext2D,
  forkMesh: SvgMesh,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0.02) return;

  const layout = layoutSvgMeshOnCanvas(forkMesh, width, height, 0.96);
  const points: Array<{ x: number; y: number; r: number } | undefined> = [];

  for (const id of forkMesh.visibleNodeIds) {
    const node = forkMesh.nodes[id];
    if (!node || node.group !== 'body') continue;
    points[id] = {
      x: layout.offsetX + node.x * layout.scale,
      y: layout.offsetY + node.y * layout.scale,
      r: Math.max(2.2, node.r * layout.scale * 1.15),
    };
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();

  for (const edge of forkMesh.edges) {
    if (edge.group !== 'body') continue;
    const a = points[edge.a];
    const b = points[edge.b];
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();

  ctx.globalAlpha = alpha * 0.96;
  ctx.fillStyle = '#d9d9d9';

  for (const id of forkMesh.visibleNodeIds) {
    const node = forkMesh.nodes[id];
    if (!node || node.group !== 'body') continue;
    const point = points[id];
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Pełna puszka spreju z SVG — wszystkie kropki i krawędzie. */
function paintFullSprayMesh(
  ctx: CanvasRenderingContext2D,
  sprayMesh: SvgMesh,
  width: number,
  height: number,
  alpha: number,
) {
  if (alpha <= 0.02) return;

  const layout = layoutSvgMeshOnCanvas(sprayMesh, width, height, 0.96);
  const points: Array<{ x: number; y: number; r: number } | undefined> = [];

  for (const id of sprayMesh.visibleNodeIds) {
    const node = sprayMesh.nodes[id];
    if (!node || node.group !== 'body') continue;
    points[id] = {
      x: layout.offsetX + node.x * layout.scale,
      y: layout.offsetY + node.y * layout.scale,
      r: Math.max(2.2, node.r * layout.scale * 1.15),
    };
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();

  for (const edge of sprayMesh.edges) {
    if (edge.group !== 'body') continue;
    const a = points[edge.a];
    const b = points[edge.b];
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();

  ctx.globalAlpha = alpha * 0.96;
  ctx.fillStyle = '#d9d9d9';

  for (const id of sprayMesh.visibleNodeIds) {
    const node = sprayMesh.nodes[id];
    if (!node || node.group !== 'body') continue;
    const point = points[id];
    if (!point) continue;
    ctx.beginPath();
    ctx.arc(point.x, point.y, point.r, 0, Math.PI * 2);
    ctx.fill();
  }

  const nozzle = resolveSprayNozzleSvg(sprayMesh);
  const nozzleX = layout.offsetX + nozzle.x * layout.scale;
  const nozzleY = layout.offsetY + nozzle.y * layout.scale;
  ctx.globalAlpha = alpha * 0.92;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(nozzleX, nozzleY, Math.max(2.4, layout.scale * 2.8), 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

interface SprayBurstParticle {
  ox: number;
  oy: number;
  r: number;
}

interface SprayConstellationBurst {
  startedAt: number;
  duration: number;
  reach: number;
  dirX: number;
  dirY: number;
  palette: SprayBurstPalette;
  particles: SprayBurstParticle[];
  edges: { a: number; b: number }[];
}

function buildSprayConstellationBurst(
  sprayMesh: SvgMesh,
  width: number,
  height: number,
  now: number,
): SprayConstellationBurst | null {
  const { layout } = sprayNozzleCanvasPoint(sprayMesh, width, height);
  const nozzleSvg = resolveSprayNozzleSvg(sprayMesh);
  const reach = Math.min(width * 0.52, height * 0.38, layout.scale * 175);

  const dirX = Math.cos(SPRAY_BURST_AIM_RAD);
  const dirY = Math.sin(SPRAY_BURST_AIM_RAD);
  const rot = SPRAY_BURST_AIM_RAD + Math.PI / 2;
  const cosR = Math.cos(rot);
  const sinR = Math.sin(rot);

  const ranked: { id: number; dist: number }[] = [];
  for (const id of sprayMesh.visibleNodeIds) {
    const node = sprayMesh.nodes[id];
    if (!node || node.group !== 'body') continue;
    if (node.y > 340) continue;
    const dist = Math.hypot(node.x - nozzleSvg.x, node.y - nozzleSvg.y);
    if (dist > 220 || dist < 6) continue;
    ranked.push({ id, dist });
  }
  ranked.sort((a, b) => a.dist - b.dist);

  const selected = new Set<number>();
  for (const entry of ranked.slice(0, 18)) {
    selected.add(entry.id);
  }
  for (const edge of sprayMesh.edges) {
    if (edge.group !== 'body') continue;
    if (!selected.has(edge.a) && !selected.has(edge.b)) continue;
    selected.add(edge.a);
    selected.add(edge.b);
    if (selected.size >= 26) break;
  }
  for (const entry of ranked) {
    if (selected.size >= 26) break;
    selected.add(entry.id);
  }

  if (selected.size < 4) return null;

  const idToIdx = new Map<number, number>();
  const particles: SprayBurstParticle[] = [];

  for (const id of selected) {
    const node = sprayMesh.nodes[id];
    if (!node) continue;
    const dx = node.x - nozzleSvg.x;
    const dy = node.y - nozzleSvg.y;
    const rdx = dx * cosR - dy * sinR;
    const rdy = dx * sinR + dy * cosR;
    idToIdx.set(id, particles.length);
    particles.push({
      ox: rdx * layout.scale,
      oy: rdy * layout.scale,
      r: Math.max(2.2, node.r * layout.scale * 1.15),
    });
  }

  let maxExtent = 0;
  for (const p of particles) {
    maxExtent = Math.max(maxExtent, Math.hypot(p.ox, p.oy));
  }
  if (maxExtent > 0) {
    const norm = reach / maxExtent;
    for (const p of particles) {
      p.ox *= norm;
      p.oy *= norm;
    }
  }

  anchorSprayBurstAtNozzle(particles, dirX, dirY);

  const edges: { a: number; b: number }[] = [];
  const edgeKeys = new Set<string>();
  for (const edge of sprayMesh.edges) {
    if (edge.group !== 'body') continue;
    const ai = idToIdx.get(edge.a);
    const bi = idToIdx.get(edge.b);
    if (ai == null || bi == null || ai === bi) continue;
    const key = ai < bi ? `${ai}:${bi}` : `${bi}:${ai}`;
    if (edgeKeys.has(key)) continue;
    edgeKeys.add(key);
    edges.push({ a: ai, b: bi });
  }

  return {
    startedAt: now,
    duration: SPRAY_BURST_DURATION_MS,
    reach,
    dirX,
    dirY,
    palette: pickSprayBurstPalette(),
    particles,
    edges,
  };
}

/** Kotwica w dyszy — tylna krawędź chmury w czerwonej kropce, rozszerzenie w stronę lotu. */
function anchorSprayBurstAtNozzle(
  particles: SprayBurstParticle[],
  dirX: number,
  dirY: number,
) {
  if (particles.length === 0) return;

  let minAlong = Infinity;
  for (const p of particles) {
    const along = p.ox * dirX + p.oy * dirY;
    minAlong = Math.min(minAlong, along);
  }

  let perpX = 0;
  let perpY = 0;
  for (const p of particles) {
    const along = p.ox * dirX + p.oy * dirY;
    perpX += p.ox - dirX * along;
    perpY += p.oy - dirY * along;
  }
  perpX /= particles.length;
  perpY /= particles.length;

  for (const p of particles) {
    p.ox -= dirX * minAlong + perpX;
    p.oy -= dirY * minAlong + perpY;
  }
}

function sprayCloudMotion(
  age: number,
  duration: number,
  nozzleX: number,
  reach: number,
) {
  const flightT = clamp01(age / (duration * 0.82));
  const baseTravel = Math.max(120, nozzleX + reach * 0.62);
  const maxTravel = baseTravel * SPRAY_BURST_TRAVEL_MULTIPLIER;
  const travel = easeOutCubic(flightT) * maxTravel;

  return { travel, maxTravel };
}

function sprayBurstAlpha(age: number, duration: number) {
  const fadeStart = duration * 0.48;
  if (age > fadeStart) {
    return 0.92 * (1 - easeSmoothStep(clamp01((age - fadeStart) / (duration - fadeStart))));
  }
  return 0.92;
}

function sprayBurstGrowScale(travel: number, maxTravel: number) {
  const progress = clamp01(travel / Math.max(1, maxTravel));
  return easeSmoothStep(progress) * 2.15;
}

function sprayBurstPositions(
  burst: SprayConstellationBurst,
  travel: number,
  growScale: number,
  nozzleX: number,
  nozzleY: number,
) {
  const latT = easeSmoothStep(clamp01(growScale / 0.3));

  return burst.particles.map((p) => {
    const along = p.ox * burst.dirX + p.oy * burst.dirY;
    const px = p.ox - burst.dirX * along;
    const py = p.oy - burst.dirY * along;
    const forward = travel + Math.max(0, along) * growScale;

    return {
      x: nozzleX + burst.dirX * forward + px * growScale * latT,
      y: nozzleY + burst.dirY * forward + py * growScale * latT,
      r: p.r * Math.max(growScale, 0.04),
    };
  });
}

function paintSprayConstellationBurst(
  ctx: CanvasRenderingContext2D,
  burst: SprayConstellationBurst,
  sprayMesh: SvgMesh,
  width: number,
  height: number,
  now: number,
) {
  const age = now - burst.startedAt;
  if (age >= burst.duration) return;

  const { x: nozzleX, y: nozzleY } = sprayNozzleCanvasPoint(sprayMesh, width, height);

  const { travel, maxTravel } = sprayCloudMotion(
    age,
    burst.duration,
    nozzleX,
    burst.reach,
  );

  const growScale = sprayBurstGrowScale(travel, maxTravel);
  const alpha = sprayBurstAlpha(age, burst.duration);
  if (alpha <= 0.02) return;

  const positions = sprayBurstPositions(burst, travel, growScale, nozzleX, nozzleY);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.strokeStyle = burst.palette.stroke;
  ctx.lineWidth = 0.8;
  ctx.globalAlpha = alpha * 0.9;
  ctx.beginPath();

  for (const edge of burst.edges) {
    const a = positions[edge.a];
    const b = positions[edge.b];
    if (!a || !b) continue;
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
  }

  ctx.stroke();

  ctx.globalAlpha = alpha * 0.96;
  ctx.fillStyle = burst.palette.fill;
  for (const pos of positions) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, pos.r, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Te same kropki — morph widelca w puszkę spreju. */
function paintFaceToSprayMorph(
  ctx: CanvasRenderingContext2D,
  faceMesh: Mesh,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  busForkMaps: PrimaryMorphMaps,
  forkSprayMaps: PrimaryMorphMaps,
  sprayMorph: number,
  width: number,
  height: number,
  sprayDemorph = false,
) {
  const t = clamp01(sprayMorph);
  const sourceVis = sourceWireVisibility(t);
  const targetVis = targetWireVisibility(t);
  const unmappedFadeT = easeSmoothStep(clamp01((t - 0.45) / 0.48));

  const faceToArrow = new Map<number, number>();
  for (const [arrowId, faceId] of morphMaps.arrowToFace) {
    faceToArrow.set(faceId, arrowId);
  }

  const arrowToBus = new Map<number, number>();
  for (const [busId, arrowId] of arrowBusMaps.targetToPrimary) {
    arrowToBus.set(arrowId, busId);
  }

  const busToForkNode = new Map<number, number>();
  for (const [forkNodeId, busId] of busForkMaps.targetToPrimary) {
    busToForkNode.set(busId, forkNodeId);
  }

  const positions: PositionedNode[] = [];

  for (const faceId of faceMesh.faceIndices) {
    const node = faceMesh.nodes[faceId];
    if (!node) continue;

    const fallback = resolveMorphTarget(morphMaps, faceId, width, height) ?? { x: 0, y: 0 };
    const source = forkSourceForFace(
      faceId,
      faceToArrow,
      morphMaps,
      arrowBusMaps,
      busForkMaps,
      fallback,
    );
    let target = source;

    const arrowId = faceToArrow.get(faceId);
    if (arrowId != null) {
      const busId = arrowToBus.get(arrowId);
      const forkNodeId = busId != null ? busToForkNode.get(busId) : null;
      const sprayTarget = forkNodeId != null ? forkSprayMaps.targets.get(forkNodeId) : null;
      if (sprayTarget) target = sprayTarget;
    } else {
      const mergeId = morphMaps.faceToMergeTarget.get(faceId);
      if (mergeId != null) {
        const mergeArrow = faceToArrow.get(mergeId);
        const mergeBus = mergeArrow != null ? arrowToBus.get(mergeArrow) : null;
        const mergeForkNode = mergeBus != null ? busToForkNode.get(mergeBus) : null;
        const mergeSpray =
          mergeForkNode != null ? forkSprayMaps.targets.get(mergeForkNode) : null;
        if (mergeSpray) target = mergeSpray;
      }
    }

    const isMapped = morphMaps.mappedFaces.has(faceId);
    let px: number;
    let py: number;
    let reveal = 1;

    if (sprayDemorph && !isMapped) {
      px = source.x;
      py = source.y;
      reveal = unmappedFadeT;
      if (reveal <= 0.02) continue;
    } else {
      px = source.x + (target.x - source.x) * t;
      py = source.y + (target.y - source.y) * t;
    }

    positions[faceId] = {
      ...node,
      px,
      py,
      pr: Math.max(1.6, node.r * forkSprayMaps.layoutScale),
      fear: 0,
      reveal,
    };
  }

  const forkFaceEdges: { a: number; b: number }[] = [];
  for (const edge of busForkMaps.targetEdges) {
    const faceA = forkNodeToFace(edge.a, morphMaps, arrowBusMaps, busForkMaps);
    const faceB = forkNodeToFace(edge.b, morphMaps, arrowBusMaps, busForkMaps);
    if (faceA != null && faceB != null && faceA !== faceB) {
      forkFaceEdges.push({ a: faceA, b: faceB });
    }
  }

  const faceTargetEdges: { a: number; b: number }[] = [];
  for (const edge of forkSprayMaps.targetEdges) {
    const faceA = forkNodeToFace(edge.a, morphMaps, arrowBusMaps, busForkMaps);
    const faceB = forkNodeToFace(edge.b, morphMaps, arrowBusMaps, busForkMaps);
    if (faceA != null && faceB != null && faceA !== faceB) {
      faceTargetEdges.push({ a: faceA, b: faceB });
    }
  }

  drawMorphEdges(ctx, forkFaceEdges, positions, sourceVis);
  drawMorphEdges(ctx, faceTargetEdges, positions, targetVis);

  const forkHandleMorph = clamp01(1 - t);
  paintTargetSupplementGeometry(
    ctx,
    busForkMaps,
    (targetNodeId, posT) => {
      const supplement = busForkMaps.supplementNodes.get(targetNodeId);
      if (supplement) {
        const cluster = busForkMaps.cluster;
        const layoutT = sprayDemorph ? 1 : posT;
        return {
          x: cluster.x + (supplement.x - cluster.x) * layoutT,
          y: cluster.y + (supplement.y - cluster.y) * layoutT,
        };
      }

      const faceId = forkNodeToFace(targetNodeId, morphMaps, arrowBusMaps, busForkMaps);
      if (faceId == null) return null;
      const facePos = positions[faceId];
      if (!facePos) return null;
      return { x: facePos.px, y: facePos.py };
    },
    forkHandleMorph,
    targetWireVisibility(forkHandleMorph),
    0.08,
  );

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const faceId of faceMesh.faceIndices) {
    const node = positions[faceId];
    if (!node) continue;
    ctx.globalAlpha = 0.9 * node.reveal;
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(node.px, node.py, node.pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Te same kropki — morph autobusu (po strzałce) w widelec. */
function paintFaceToForkMorph(
  ctx: CanvasRenderingContext2D,
  faceMesh: Mesh,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  busForkMaps: PrimaryMorphMaps,
  forkMorph: number,
  width: number,
  height: number,
  forkDemorph = false,
) {
  const t = clamp01(forkMorph);
  const sourceVis = sourceWireVisibility(t);
  const targetVis = targetWireVisibility(t);
  const unmappedFadeT = easeSmoothStep(clamp01((t - 0.45) / 0.48));

  const faceToArrow = new Map<number, number>();
  for (const [arrowId, faceId] of morphMaps.arrowToFace) {
    faceToArrow.set(faceId, arrowId);
  }

  const arrowToBus = new Map<number, number>();
  for (const [busId, arrowId] of arrowBusMaps.targetToPrimary) {
    arrowToBus.set(arrowId, busId);
  }

  const positions: PositionedNode[] = [];

  for (const faceId of faceMesh.faceIndices) {
    const node = faceMesh.nodes[faceId];
    if (!node) continue;

    const fallback = resolveMorphTarget(morphMaps, faceId, width, height) ?? { x: 0, y: 0 };
    const source = busSourceForFace(faceId, faceToArrow, morphMaps, arrowBusMaps, fallback);
    let target = source;

    const arrowId = faceToArrow.get(faceId);
    if (arrowId != null) {
      const busId = arrowToBus.get(arrowId);
      const forkTarget = busId != null ? busForkMaps.targets.get(busId) : null;
      if (forkTarget) target = forkTarget;
    } else {
      const mergeId = morphMaps.faceToMergeTarget.get(faceId);
      if (mergeId != null) {
        const mergeArrow = faceToArrow.get(mergeId);
        const mergeBus = mergeArrow != null ? arrowToBus.get(mergeArrow) : null;
        const mergeFork = mergeBus != null ? busForkMaps.targets.get(mergeBus) : null;
        if (mergeFork) target = mergeFork;
      }
    }

    const isMapped = morphMaps.mappedFaces.has(faceId);
    let px: number;
    let py: number;
    let reveal = 1;

    if (forkDemorph && !isMapped) {
      px = target.x;
      py = target.y;
      reveal = unmappedFadeT;
      if (reveal <= 0.02) continue;
    } else {
      px = source.x + (target.x - source.x) * t;
      py = source.y + (target.y - source.y) * t;
    }

    positions[faceId] = {
      ...node,
      px,
      py,
      pr: Math.max(1.6, node.r * busForkMaps.layoutScale),
      fear: 0,
      reveal,
    };
  }

  const busFaceEdges: { a: number; b: number }[] = [];
  for (const edge of arrowBusMaps.targetEdges) {
    const faceA = morphMaps.arrowToFace.get(edge.a);
    const faceB = morphMaps.arrowToFace.get(edge.b);
    if (faceA != null && faceB != null && faceA !== faceB) {
      busFaceEdges.push({ a: faceA, b: faceB });
    }
  }

  const faceTargetEdges: { a: number; b: number }[] = [];
  for (const edge of busForkMaps.targetEdges) {
    const faceA = busNodeToFace(edge.a, morphMaps, arrowBusMaps);
    const faceB = busNodeToFace(edge.b, morphMaps, arrowBusMaps);
    if (faceA != null && faceB != null && faceA !== faceB) {
      faceTargetEdges.push({ a: faceA, b: faceB });
    }
  }

  drawMorphEdges(ctx, busFaceEdges, positions, sourceVis);
  drawMorphEdges(ctx, faceTargetEdges, positions, targetVis);

  const busRoofMorph = clamp01(1 - t);
  paintBusSupplementGeometry(
    ctx,
    arrowBusMaps,
    positions,
    morphMaps,
    busRoofMorph,
    targetWireVisibility(busRoofMorph),
    !forkDemorph,
  );

  paintTargetSupplementGeometry(
    ctx,
    busForkMaps,
    (targetNodeId, posT) => {
      const supplement = busForkMaps.supplementNodes.get(targetNodeId);
      if (supplement) {
        const cluster = busForkMaps.cluster;
        const layoutT = forkDemorph ? 1 : posT;
        return {
          x: cluster.x + (supplement.x - cluster.x) * layoutT,
          y: cluster.y + (supplement.y - cluster.y) * layoutT,
        };
      }

      const faceId = busNodeToFace(targetNodeId, morphMaps, arrowBusMaps);
      if (faceId == null) return null;
      const facePos = positions[faceId];
      if (!facePos) return null;
      return { x: facePos.px, y: facePos.py };
    },
    t,
    targetVis,
    0.08,
  );

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const faceId of faceMesh.faceIndices) {
    const node = positions[faceId];
    if (!node) continue;
    ctx.globalAlpha = 0.9 * node.reveal;
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(node.px, node.py, node.pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

/** Te same kropki co twarz→strzałka — morph strzałki (morph=1) w autobus. */
function paintFaceToBusMorph(
  ctx: CanvasRenderingContext2D,
  faceMesh: Mesh,
  morphMaps: MorphMaps,
  arrowBusMaps: PrimaryMorphMaps,
  busMorph: number,
  width: number,
  height: number,
  now: number,
  busDemorph = false,
) {
  const t = clamp01(busMorph);
  const sourceVis = sourceWireVisibility(t);
  const targetVis = targetWireVisibility(t);
  const unmappedFadeT = easeSmoothStep(clamp01((t - 0.45) / 0.48));
  const accentAlpha = busDemorph
    ? meshEase(meshClamp01((t - 0.44) / 0.34))
    : meshEase(meshClamp01((t - 0.78) / 0.22));
  const busEdgeVis = busDemorph
    ? targetVis * easeSmoothStep(clamp01((t - 0.4) / 0.45))
    : targetVis;

  const faceToArrow = new Map<number, number>();
  for (const [arrowId, faceId] of morphMaps.arrowToFace) {
    faceToArrow.set(faceId, arrowId);
  }

  const positions: PositionedNode[] = [];

  for (const faceId of faceMesh.faceIndices) {
    const node = faceMesh.nodes[faceId];
    if (!node) continue;

    const source = resolveMorphTarget(morphMaps, faceId, width, height) ?? { x: 0, y: 0 };
    let target = source;

    const arrowId = faceToArrow.get(faceId);
    if (arrowId != null) {
      const busTarget = arrowBusMaps.targets.get(arrowId);
      if (busTarget) target = busTarget;
    } else {
      const mergeId = morphMaps.faceToMergeTarget.get(faceId);
      if (mergeId != null) {
        const mergeArrow = faceToArrow.get(mergeId);
        const mergeBus = mergeArrow != null ? arrowBusMaps.targets.get(mergeArrow) : null;
        if (mergeBus) target = mergeBus;
      }
    }

    const isMapped = morphMaps.mappedFaces.has(faceId);
    let px: number;
    let py: number;
    let reveal = 1;

    if (busDemorph && !isMapped) {
      // Niemapowane kropki twarzy — bez lotu do cluster, zanik na miejscu autobusu
      px = target.x;
      py = target.y;
      reveal = unmappedFadeT;
      if (reveal <= 0.02) continue;
    } else {
      px = source.x + (target.x - source.x) * t;
      py = source.y + (target.y - source.y) * t;
    }

    positions[faceId] = {
      ...node,
      px,
      py,
      pr: Math.max(1.6, node.r * arrowBusMaps.layoutScale),
      fear: 0,
      reveal,
    };
  }

  const faceTargetEdges: { a: number; b: number }[] = [];
  for (const edge of arrowBusMaps.targetEdges) {
    const faceA = morphMaps.arrowToFace.get(edge.a);
    const faceB = morphMaps.arrowToFace.get(edge.b);
    if (faceA != null && faceB != null && faceA !== faceB) {
      if (busDemorph && (!morphMaps.mappedFaces.has(faceA) || !morphMaps.mappedFaces.has(faceB))) {
        continue;
      }
      faceTargetEdges.push({ a: faceA, b: faceB });
    }
  }

  drawMorphEdges(ctx, morphMaps.morphEdges, positions, sourceVis);
  drawMorphEdges(ctx, faceTargetEdges, positions, busEdgeVis);
  paintBusSupplementGeometry(ctx, arrowBusMaps, positions, morphMaps, t, targetVis, busDemorph);

  const accentFaceIds = new Set<number>();
  if (accentAlpha > 0.02) {
    for (const arrowId of arrowBusMaps.accentNodeIds) {
      const faceId = morphMaps.arrowToFace.get(arrowId);
      if (faceId == null) continue;
      accentFaceIds.add(faceId);
      const node = positions[faceId];
      if (!node) continue;
      drawWhiteHeadlight(ctx, node.px, node.py, node.pr, accentAlpha, now, node.phase);
    }
  }

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const faceId of faceMesh.faceIndices) {
    if (accentFaceIds.has(faceId)) continue;
    const node = positions[faceId];
    if (!node) continue;
    ctx.globalAlpha = 0.9 * node.reveal;
    ctx.fillStyle = '#d9d9d9';
    ctx.beginPath();
    ctx.arc(node.px, node.py, node.pr, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

export function AnimatedNeonPortrait({
  morphArrow = false,
  morphProgress: externalMorph = 0,
  busMorphProgress: externalBusMorph = 0,
  busRenderActive = false,
  forkMorphProgress: externalForkMorph = 0,
  forkRenderActive = false,
  sprayMorphProgress: externalSprayMorph = 0,
  sprayRenderActive = false,
  aimPoint = null,
}: AnimatedNeonPortraitProps) {
  const { accent } = useTheme();
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0, tx: 0, ty: 0, active: false });
  const hairStyleRef = useRef(accentHairStyle(accent));
  const morphArrowRef = useRef(morphArrow);
  const externalMorphRef = useRef(externalMorph);
  const externalBusMorphRef = useRef(externalBusMorph);
  const busRenderActiveRef = useRef(busRenderActive);
  const externalForkMorphRef = useRef(externalForkMorph);
  const forkRenderActiveRef = useRef(forkRenderActive);
  const externalSprayMorphRef = useRef(externalSprayMorph);
  const sprayRenderActiveRef = useRef(sprayRenderActive);
  const aimPointRef = useRef(aimPoint);

  useEffect(() => {
    hairStyleRef.current = accentHairStyle(accent);
  }, [accent]);

  useEffect(() => {
    morphArrowRef.current = morphArrow;
  }, [morphArrow]);

  useEffect(() => {
    externalMorphRef.current = externalMorph;
  }, [externalMorph]);

  useEffect(() => {
    externalBusMorphRef.current = externalBusMorph;
  }, [externalBusMorph]);

  useEffect(() => {
    busRenderActiveRef.current = busRenderActive;
  }, [busRenderActive]);

  useEffect(() => {
    externalForkMorphRef.current = externalForkMorph;
  }, [externalForkMorph]);

  useEffect(() => {
    forkRenderActiveRef.current = forkRenderActive;
  }, [forkRenderActive]);

  useEffect(() => {
    externalSprayMorphRef.current = externalSprayMorph;
  }, [externalSprayMorph]);

  useEffect(() => {
    sprayRenderActiveRef.current = sprayRenderActive;
  }, [sprayRenderActive]);

  useEffect(() => {
    aimPointRef.current = aimPoint;
  }, [aimPoint]);

  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;

    const context = canvas.getContext('2d');
    if (!context) return;

    const stageEl = stage;
    const canvasEl = canvas;
    const ctx = context;
    let canvasPadLeft = 0;
    let canvasPadTop = 0;
    let mesh: Mesh | null = null;
    let arrowMesh: Mesh | null = null;
    let arrowSvgMesh: SvgMesh | null = null;
    let busMesh: SvgMesh | null = null;
    let forkMesh: SvgMesh | null = null;
    let sprayMesh: SvgMesh | null = null;
    let busMorphMaps: PrimaryMorphMaps | null = null;
    let forkMorphMaps: PrimaryMorphMaps | null = null;
    let sprayMorphMaps: PrimaryMorphMaps | null = null;
    let busLayoutKey = '';
    let forkLayoutKey = '';
    let sprayLayoutKey = '';
    let frame = 0;
    let lastFrame = 0;
    let width = 0;
    let height = 0;
    let nextBlinkAt = 12000 + Math.random() * 18000;
    let blinkStartedAt = -1000;
    let revealStartedAt = -1;
    let running = true;
    let morphProgress = 0;
    let prevForkMorph = 1;
    let prevSprayMorph = 1;
    let prevBusMorph = 0;
    let morphMaps: MorphMaps = {
      cluster: { x: 0, y: 0 },
      pivot: { x: 0, y: 0 },
      targets: new Map(),
      targetsNorm: new Map(),
      arrowToFace: new Map(),
      mappedFaces: new Set(),
      faceToMergeTarget: new Map(),
      morphEdges: [],
      canvasW: 0,
      canvasH: 0,
    };

    let lastLayoutKey = '';
    let morphSession: { aimKey: string; layoutKey: string } | null = null;
    let sprayBurst: SprayConstellationBurst | null = null;
    let nextSprayBurstAt = 0;
    let lastStableAim: {
      x: number;
      y: number;
      centerX?: number;
      stageW?: number;
      stageH?: number;
    } | null = null;

    function aimForMaps() {
      const aim = aimPointRef.current;
      if (aim) lastStableAim = aim;

      const source = aim ?? (morphProgress > MORPH_IDLE ? lastStableAim : null);
      if (source && width > 0 && height > 0) {
        return scaleAimToCanvas(source, width, height);
      }

      if (morphProgress <= MORPH_IDLE) lastStableAim = null;
      return null;
    }

    function rebuildMorphMaps() {
      if (!mesh || !arrowMesh || width <= 0 || height <= 0) {
        morphMaps = {
          cluster: { x: width * 0.5, y: height * 0.48 },
          pivot: { x: width * 0.5, y: height * PIVOT_Y_RATIO },
          targets: new Map(),
          targetsNorm: new Map(),
          arrowToFace: new Map(),
          mappedFaces: new Set(),
          faceToMergeTarget: new Map(),
          morphEdges: [],
          canvasW: width,
          canvasH: height,
        };
        return;
      }
      morphMaps = buildMorphMaps(mesh, arrowMesh, width, height, aimForMaps());
    }

    function rebuildBusMorphMaps() {
      if (!arrowSvgMesh || !busMesh || width <= 0 || height <= 0) return;
      busMorphMaps = buildPrimaryMorphMaps(arrowSvgMesh, busMesh, width, height, {
        layoutFit: 0.82,
        centerRatioY: 0.5,
        targetLayoutFit: 0.74,
        targetCenterRatioY: 0.44,
        mapSourcePoint: (x, y, mesh) => rotateArrowToBusFrame(x, y, mesh),
      });
      busLayoutKey = `${width}:${height}`;
    }

    function rebuildForkMorphMaps() {
      if (!busMesh || !forkMesh || width <= 0 || height <= 0) return;
      forkMorphMaps = buildPrimaryMorphMaps(busMesh, forkMesh, width, height, {
        layoutFit: 0.74,
        centerRatioY: 0.44,
        targetLayoutFit: 0.96,
        targetCenterRatioY: 0.46,
        mapSourcePoint: (x, y, mesh) => rotateBusToForkFrame(x, y, mesh),
      });
      forkLayoutKey = `${width}:${height}`;
    }

    function rebuildSprayMorphMaps() {
      if (!forkMesh || !sprayMesh || width <= 0 || height <= 0) return;
      sprayMorphMaps = buildPrimaryMorphMaps(forkMesh, sprayMesh, width, height, {
        layoutFit: 0.96,
        centerRatioY: 0.46,
        targetLayoutFit: 0.96,
        targetCenterRatioY: 0.46,
      });
      sprayLayoutKey = `${width}:${height}`;
    }

    function resize(force = false) {
      const nextWidth = Math.max(180, stageEl.clientWidth);
      const nextHeight = Math.max(96, stageEl.clientHeight);
      const useSprayPad =
        sprayRenderActiveRef.current && externalSprayMorphRef.current > 0.55;
      const pad = useSprayPad
        ? sprayBurstCanvasPad(nextWidth, nextHeight)
        : { left: 0, top: 0, right: 0, bottom: 0 };
      const nextCanvasW = nextWidth + pad.left + pad.right;
      const nextCanvasH = nextHeight + pad.top + pad.bottom;

      if (
        !force &&
        nextWidth === width &&
        nextHeight === height &&
        pad.left === canvasPadLeft &&
        pad.top === canvasPadTop
      ) {
        return;
      }

      width = nextWidth;
      height = nextHeight;
      canvasPadLeft = pad.left;
      canvasPadTop = pad.top;
      canvasEl.width = nextCanvasW;
      canvasEl.height = nextCanvasH;
      if (pad.left > 0 || pad.top > 0) {
        canvasEl.style.left = `${-pad.left}px`;
        canvasEl.style.top = `${-pad.top}px`;
        canvasEl.style.width = `${nextCanvasW}px`;
        canvasEl.style.height = `${nextCanvasH}px`;
      } else {
        canvasEl.style.left = '';
        canvasEl.style.top = '';
        canvasEl.style.width = '';
        canvasEl.style.height = '';
      }

      morphSession = null;
      sprayBurst = null;
      nextSprayBurstAt = 0;
      rebuildMorphMaps();
      rebuildBusMorphMaps();
      rebuildForkMorphMaps();
      rebuildSprayMorphMaps();

      if (mesh) {
        paintFrame(performance.now(), true);
      }
    }

    function onWindowResize() {
      resize();
    }

    function project(node: NodePoint, now: number, morph: number): PositionedNode {
      if (!mesh) return { ...node, px: node.x, py: node.y, pr: node.r, fear: 0, reveal: 1 };

      const scale = Math.min(width / mesh.width, height / mesh.height);
      const offsetX = (width - mesh.width * scale) / 2;
      const offsetY = (height - mesh.height * scale) / 2;
      const baseX = offsetX + node.x * scale;
      const baseY = offsetY + node.y * scale;
      const morphLive = morph <= MORPH_ACTIVE;
      const liveMotion = morphLive ? 1 : 0;
      const faceLive = node.group === 'face' ? liveMotion : 1;
      const hairLive = node.group === 'hair' ? liveMotion : 1;

      const pointerX = width * (0.5 + pointerRef.current.x);
      const pointerY = height * (0.5 + pointerRef.current.y);
      const dx = baseX - pointerX;
      const dy = baseY - pointerY;
      const distance = Math.hypot(dx, dy);
      const radius = node.group === 'hair' ? 320 : 255;
      const force = pointerRef.current.active && distance < radius && liveMotion > 0
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
      const eyeMask = node.group === 'face'
        ? Math.max(0, 1 - (eyeDx * eyeDx + eyeDy * eyeDy))
        : 0;
      const blinkDistance = (now - blinkStartedAt - 120) / 75;
      const blink = morphLive
        ? Math.exp(-(blinkDistance * blinkDistance)) * eyeMask
        : 0;
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
      const hairFlowX = node.group === 'hair'
        ? hairSideSway * hairSide * hairAnchor * hairLive
        : 0;
      const hairFlowY = node.group === 'hair'
        ? Math.cos(now * 0.0022 + vertical * 13 + Math.abs(centerOffset) * 4) * 4.2 * hairAnchor * hairLive
        : 0;
      const mousePush = node.group === 'hair' ? 15 * hairAnchor : 8;
      const mouseFollowX = pointerRef.current.x * (node.group === 'hair' ? 5 * hairAnchor : 1.6) * faceLive;
      const mouseFollowY = pointerRef.current.y * (node.group === 'hair' ? 3.2 * hairAnchor : 0.9) * faceLive;
      const panic = force * (node.group === 'hair' ? 1 : 0.75);
      const panicShakeX =
        Math.sin(now * 0.026 + node.phase * 7.1) *
        panic *
        (node.group === 'hair' ? 5.2 * hairAnchor : 2.1);
      const panicShakeY =
        Math.cos(now * 0.031 + node.phase * 5.9) *
        panic *
        (node.group === 'hair' ? 4.4 * hairAnchor : 1.8);

      return {
        ...node,
        px:
          baseX +
          nx * force * mousePush +
          mouseFollowX +
          panicShakeX +
          blinkX +
          (node.group === 'hair' ? hairFlowX : faceMicroX),
        py:
          baseY +
          ny * force * mousePush +
          mouseFollowY +
          panicShakeY +
          blinkY +
          (node.group === 'hair' ? hairFlowY : faceBreath + faceMicroY),
        pr: node.r * scale * (1 + panic * (node.group === 'hair' ? 0.35 : 0.28) - blink * 0.16),
        fear: panic,
        reveal: 1,
      };
    }

    function revealNode(node: PositionedNode, now: number): PositionedNode {
      if (revealStartedAt < 0 || now - revealStartedAt > 2900) return node;

      const originX = width * 0.53;
      const originY = height * 0.48;
      const dx = node.px - originX;
      const dy = node.py - originY;
      const distance = Math.hypot(dx, dy);
      const maxDistance = Math.hypot(width * 0.56, height * 0.56);
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

    function paintFrame(now: number, force = false) {
      pointerRef.current.x += (pointerRef.current.tx - pointerRef.current.x) * 0.08;
      pointerRef.current.y += (pointerRef.current.ty - pointerRef.current.y) * 0.08;

      const morphTarget = morphArrowRef.current ? 1 : externalMorphRef.current;
      const morphing = morphTarget > MORPH_ACTIVE || morphProgress > MORPH_ACTIVE;
      if (!force && now - lastFrame < (morphing ? MORPH_FRAME_MS : FRAME_MS)) return false;
      lastFrame = now;

      if (now >= nextBlinkAt) {
        blinkStartedAt = now;
        nextBlinkAt = now + 24000 + Math.random() * 12000;
      }

      morphProgress = morphArrowRef.current
        ? morphProgress + (1 - morphProgress) * 0.055
        : (() => {
            const ext = externalMorphRef.current;
            const gap = ext - morphProgress;
            if (Math.abs(gap) < 0.002) return ext;
            const follow = gap < 0 ? 0.11 : 0.16;
            return morphProgress + gap * follow;
          })();
      if (Math.abs(morphProgress - externalMorphRef.current) < 0.002 && !morphArrowRef.current) {
        morphProgress = externalMorphRef.current;
      }

      const layoutKey = `${width}:${height}`;
      const inMorphSession = morphProgress > MORPH_IDLE;

      function currentAimKey() {
        const liveAim = aimForMaps();
        return liveAim
          ? `${Math.round(liveAim.x / 4)}:${Math.round(liveAim.y / 4)}:${Math.round((liveAim.centerX ?? 0) / 4)}`
          : 'none';
      }

      if (inMorphSession) {
        const aimKey = currentAimKey();
        if (
          !morphSession
          || aimKey !== morphSession.aimKey
          || layoutKey !== morphSession.layoutKey
        ) {
          rebuildMorphMaps();
          morphSession = { aimKey, layoutKey };
        }
      } else {
        morphSession = null;
        if (layoutKey !== lastLayoutKey || morphMaps.targets.size === 0) {
          lastLayoutKey = layoutKey;
          rebuildMorphMaps();
        }
      }

      const faceWireVis = faceWireVisibility(morphProgress);
      const arrowWireVis = arrowWireVisibility(morphProgress);
      const hairVis = hairVisibility(morphProgress);
      const morphingNow = morphProgress > MORPH_ACTIVE;
      const busMorph = externalBusMorphRef.current;
      const busRender = busRenderActiveRef.current;
      const forkMorph = externalForkMorphRef.current;
      const forkRender = forkRenderActiveRef.current;
      const sprayMorph = externalSprayMorphRef.current;
      const sprayRender = sprayRenderActiveRef.current;

      if (sprayRender && sprayMorph > 0.54 && (canvasPadLeft === 0 && canvasPadTop === 0)) {
        resize(true);
      } else if ((!sprayRender || sprayMorph <= 0.54) && (canvasPadLeft > 0 || canvasPadTop > 0)) {
        resize(true);
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
      if (canvasPadLeft || canvasPadTop) {
        ctx.translate(canvasPadLeft, canvasPadTop);
      }

      if (
        (sprayRender || forkRender) &&
        sprayMorphMaps &&
        forkMorphMaps &&
        busMorphMaps &&
        mesh &&
        morphMaps.targets.size > 0 &&
        sprayMorph > MORPH_ACTIVE
      ) {
        if (sprayLayoutKey !== `${width}:${height}`) {
          rebuildSprayMorphMaps();
        }
        if (sprayMorphMaps && forkMorphMaps && busMorphMaps) {
          const sprayDemorphing = sprayMorph < prevSprayMorph - 0.0008;
          paintFaceToSprayMorph(
            ctx,
            mesh,
            morphMaps,
            busMorphMaps,
            forkMorphMaps,
            sprayMorphMaps,
            sprayMorph,
            width,
            height,
            sprayDemorphing,
          );
          if (sprayMesh) {
            const fullOverlay = sprayDemorphing
              ? 0
              : easeSmoothStep(clamp01((sprayMorph - 0.78) / 0.22));
            paintFullSprayMesh(ctx, sprayMesh, width, height, fullOverlay);

            if (fullOverlay > 0.55 && !sprayDemorphing) {
              if (sprayBurst && now - sprayBurst.startedAt >= sprayBurst.duration) {
                sprayBurst = null;
              }
              if (!sprayBurst && now >= nextSprayBurstAt) {
                sprayBurst = buildSprayConstellationBurst(sprayMesh, width, height, now);
                nextSprayBurstAt =
                  now +
                  SPRAY_BURST_INTERVAL_MIN_MS +
                  Math.random() * (SPRAY_BURST_INTERVAL_MAX_MS - SPRAY_BURST_INTERVAL_MIN_MS);
              }
              if (sprayBurst) {
                paintSprayConstellationBurst(ctx, sprayBurst, sprayMesh, width, height, now);
              }
            } else {
              sprayBurst = null;
            }
          }
        }
        prevSprayMorph = sprayMorph;
        return true;
      }

      prevSprayMorph = sprayMorph;

      const forkPaintMorph =
        sprayRender && sprayMorph <= MORPH_ACTIVE
          ? clamp01(Math.max(forkMorph, 1 - sprayMorph))
          : forkMorph;

      if (
        (forkRender || sprayRender) &&
        forkMorphMaps &&
        busMorphMaps &&
        mesh &&
        morphMaps.targets.size > 0 &&
        forkPaintMorph > MORPH_ACTIVE
      ) {
        if (forkLayoutKey !== `${width}:${height}`) {
          rebuildForkMorphMaps();
        }
        if (forkMorphMaps && busMorphMaps) {
          const forkDemorphing = forkPaintMorph < prevForkMorph - 0.0008;
          paintFaceToForkMorph(
            ctx,
            mesh,
            morphMaps,
            busMorphMaps,
            forkMorphMaps,
            forkPaintMorph,
            width,
            height,
            forkDemorphing,
          );
          if (forkMesh) {
            const fullOverlay = forkDemorphing
              ? 0
              : easeSmoothStep(clamp01((forkPaintMorph - 0.78) / 0.22));
            paintFullForkMesh(ctx, forkMesh, width, height, fullOverlay);
          }
        }
        prevForkMorph = forkPaintMorph;
        return true;
      }

      prevForkMorph = forkPaintMorph;

      const busPaintMorph =
        (forkRender || sprayRender) && forkPaintMorph <= MORPH_ACTIVE
          ? clamp01(Math.max(busMorph, 1 - forkPaintMorph))
          : busMorph;
      const busDemorph = busPaintMorph < prevBusMorph - 0.0008;

      if (
        (busRender || forkRender || sprayRender) &&
        busMorphMaps &&
        mesh &&
        morphMaps.targets.size > 0 &&
        busPaintMorph > MORPH_ACTIVE
      ) {
        if (busLayoutKey !== `${width}:${height}`) {
          rebuildBusMorphMaps();
        }
        if (busMorphMaps) {
          paintFaceToBusMorph(
            ctx,
            mesh,
            morphMaps,
            busMorphMaps,
            busPaintMorph,
            width,
            height,
            now,
            busDemorph,
          );
        }
        prevBusMorph = busPaintMorph;
        return true;
      }

      prevBusMorph = busPaintMorph;

      if (!mesh) return true;

      const revealAge = revealStartedAt >= 0 ? now - revealStartedAt : Infinity;
      const positions: PositionedNode[] = [];
      for (const id of mesh.visibleNodeIds) {
        positions[id] = revealNode(project(mesh.nodes[id], now, morphProgress), now);
      }
      if (morphProgress > MORPH_ACTIVE) {
        const { cluster } = morphMaps;
        for (const id of mesh.visibleNodeIds) {
          const base = mesh.nodes[id];
          if (base.group === 'hair' && positions[id] && hairVis > 0.02) {
            positions[id] = applyHairMorph(positions[id], morphProgress, cluster);
          }
        }
      }
      if (morphProgress > MORPH_IDLE && morphMaps.targets.size > 0) {
        for (const id of mesh.faceIndices) {
          if (positions[id]) {
            positions[id] = applyArrowMorph(
              positions[id],
              morphProgress,
              morphMaps,
              width,
              height,
            );
          }
        }
      }
      const pointer = pointerRef.current;
      const hairColor = neonHairColor(now, hairStyleRef.current, 0.98, 0);

      if (revealAge < 2100 && !morphingNow) {
        const originX = width * 0.53;
        const originY = height * 0.48;
        const core = clamp01(1 - revealAge / 2100);
        const gradient = ctx.createRadialGradient(originX, originY, 0, originX, originY, 130 * (1 - core * 0.35));
        gradient.addColorStop(0, `rgba(0, 0, 0, ${0.88 * core})`);
        gradient.addColorStop(0.34, `rgba(124, 60, 255, ${0.3 * core})`);
        gradient.addColorStop(1, 'rgba(124, 60, 255, 0)');
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(originX, originY, 130 * (1 - core * 0.35), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

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
        const hairMix = edge.group === 'hair' && !morphingNow
          ? Math.max(
              hairLocalMix(a.px, a.py, width, height, pointer),
              hairLocalMix(b.px, b.py, width, height, pointer),
            )
          : 0;
        ctx.globalAlpha = edge.group === 'hair'
          ? (0.86 + hairMix * 0.1) * reveal * hairVis
          : (0.78 + fear * 0.12) * reveal * (edge.group === 'face' ? faceWireVis : 1);
        ctx.lineWidth = edge.group === 'hair'
          ? 0.85 + fear * 0.18 + (1 - reveal) * 0.55
          : 0.75 + fear * 0.18 + (1 - reveal) * 0.4;
        ctx.strokeStyle = edge.group === 'hair'
          ? neonHairColor(now, hairStyleRef.current, 0.95, hairMix)
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

        const isFace = node.group === 'face';
        if (!isFace && hairVis <= 0.02) continue;
        if (isFace) {
          if (node.reveal < 0.02) continue;
          const nodePulse = Math.sin(now * 0.038 + node.phase * 4) * 0.5 + 0.5;
          const bloodMix = bloodMixFromFear(node.fear, nodePulse);
          ctx.globalAlpha = (0.88 + node.fear * 0.1) * node.reveal;
          ctx.fillStyle = node.fear > 0.08
            ? `rgb(${Math.round(217 - bloodMix * 67)}, ${Math.round(217 - bloodMix * 217)}, ${Math.round(217 - bloodMix * 217)})`
            : '#d9d9d9';
          ctx.beginPath();
          ctx.arc(
            node.px,
            node.py,
            Math.max(1.6, node.pr),
            0,
            Math.PI * 2,
          );
          ctx.fill();
          continue;
        }

        const sparkle = morphingNow ? 0 : sparkleForNode(node, now);
        const hairMix = morphingNow ? 0 : hairLocalMix(node.px, node.py, width, height, pointer);
        ctx.globalAlpha = (0.9 + hairMix * 0.1 + sparkle * 0.08) * node.reveal * hairVis;
        ctx.fillStyle = hairMix > 0.02
          ? neonHairColor(now, hairStyleRef.current, 0.98, hairMix)
          : hairColor;
        ctx.beginPath();
        ctx.arc(node.px, node.py, Math.max(1.6, node.pr + sparkle * 1.35), 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();

      if (arrowWireVis > 0.02 && morphMaps.morphEdges.length > 0) {
        drawMorphEdges(
          ctx,
          morphMaps.morphEdges,
          positions,
          arrowWireVis,
        );
      }

      if (faceWireVis > 0.5 && !morphingNow) {
        drawFaceSparkleOverlay(ctx, positions, mesh.faceIndices, now);
      }

      return true;
    }

    function render(now: number) {
      if (!running) return;
      frame = requestAnimationFrame(render);
      paintFrame(now);
    }

    function updatePointer(event: PointerEvent) {
      const rect = stageEl.getBoundingClientRect();
      const pad = 48;
      const inside =
        event.clientX >= rect.left - pad &&
        event.clientX <= rect.right + pad &&
        event.clientY >= rect.top - pad &&
        event.clientY <= rect.bottom + pad;

      pointerRef.current.active = inside;
      if (!inside) {
        pointerRef.current.tx = 0;
        pointerRef.current.ty = 0;
        return;
      }

      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;
      pointerRef.current.tx = Math.max(-0.75, Math.min(0.75, x));
      pointerRef.current.ty = Math.max(-0.75, Math.min(0.75, y));
    }

    resize();
    Promise.all([
      fetch(SOURCE).then((response) => response.text()),
      fetch(ARROW_SOURCE)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null),
      fetch(BUS_SOURCE)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null),
      fetch(FORK_SOURCE)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null),
      fetch(SPRAY_SOURCE)
        .then((response) => (response.ok ? response.text() : null))
        .catch(() => null),
    ])
      .then(([faceSvg, arrowSvg, busSvg, forkSvg, spraySvg]) => {
        mesh = parseSvg(faceSvg);
        if (arrowSvg) {
          arrowMesh = parseSvg(arrowSvg, { strictLineSnap: true });
          arrowSvgMesh = parseSvgMesh(arrowSvg, { strictLineSnap: true });
        }
        if (busSvg) {
          busMesh = parseSvgMesh(busSvg, { strictLineSnap: true });
        }
        if (forkSvg) {
          forkMesh = parseSvgMesh(forkSvg, { strictLineSnap: false });
        }
        if (spraySvg) {
          sprayMesh = parseSvgMesh(spraySvg, { strictLineSnap: true });
        }
        rebuildMorphMaps();
        rebuildBusMorphMaps();
        rebuildForkMorphMaps();
        rebuildSprayMorphMaps();
        revealStartedAt = performance.now();
        frame = requestAnimationFrame(render);
      });

    function onPointerLeaveWindow() {
      pointerRef.current.active = false;
      pointerRef.current.tx = 0;
      pointerRef.current.ty = 0;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        const wasRunning = running;
        running = entry.isIntersecting;
        if (running && !wasRunning && mesh) {
          frame = requestAnimationFrame(render);
        }
      },
      { rootMargin: '80px', threshold: 0.02 },
    );
    observer.observe(stageEl);

    let resizeRaf = 0;
    const sizeObserver = new ResizeObserver(() => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      resizeRaf = requestAnimationFrame(() => {
        resizeRaf = 0;
        resize();
      });
    });
    sizeObserver.observe(stageEl);

    window.addEventListener('resize', onWindowResize, { passive: true });
    window.addEventListener('pointermove', updatePointer, { passive: true });
    document.addEventListener('pointerleave', onPointerLeaveWindow);

    return () => {
      running = false;
      observer.disconnect();
      sizeObserver.disconnect();
      cancelAnimationFrame(resizeRaf);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onWindowResize);
      window.removeEventListener('pointermove', updatePointer);
      document.removeEventListener('pointerleave', onPointerLeaveWindow);
    };
  }, []);

  return (
    <div ref={stageRef} className={styles.stage}>
      <canvas
        ref={canvasRef}
        className={styles.meshCanvas}
        aria-label="Animowany mesh SVG twarzy"
      />
    </div>
  );
}
