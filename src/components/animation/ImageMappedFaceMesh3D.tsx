import { useEffect, useRef } from 'react';
import styles from './ImageMappedFaceMesh3D.module.css';

interface Vertex {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  feature: number;
}

interface Edge {
  a: number;
  b: number;
  alpha: number;
}

interface Mesh {
  vertices: Vertex[];
  edges: Edge[];
}

const SOURCE = '/images/profile/face-cutout.png';
const DPR = 1;
const FRAME_INTERVAL = 1000 / 30;
const FACE_ROWS = 34;
const MASK_THRESHOLD = 34;
const FACE_SOURCE_CROP = {
  x: 0.1,
  y: 0.17,
  width: 0.8,
  height: 0.55,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function luminance(data: Uint8ClampedArray, index: number) {
  return 0.2126 * (data[index] ?? 0) + 0.7152 * (data[index + 1] ?? 0) + 0.0722 * (data[index + 2] ?? 0);
}

function isForeground(data: Uint8ClampedArray, index: number) {
  const alpha = data[index + 3] ?? 255;
  return alpha > 18 && luminance(data, index) > MASK_THRESHOLD;
}

function findMaskBounds(data: Uint8ClampedArray, width: number, height: number) {
  let minX = width;
  let minY = height;
  let maxX = 0;
  let maxY = 0;

  for (let y = 0; y < height; y += 2) {
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      if (!isForeground(data, i)) continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { minX, minY, maxX, maxY };
}

function addFeaturePath(
  vertices: Vertex[],
  edges: Edge[],
  points: Array<[number, number, number]>,
  feature = 0.75,
  size = 3,
) {
  let previous = -1;
  for (const [x, y, z] of points) {
    const index = vertices.length;
    vertices.push({ x, y, z, size, alpha: 0.95, feature });
    if (previous >= 0) edges.push({ a: previous, b: index, alpha: 0.82 });
    previous = index;
  }
}

function ellipsePath(cx: number, cy: number, rx: number, ry: number, z: number, count: number, start = 0, end = Math.PI * 2) {
  return Array.from({ length: count }, (_, index) => {
    const t = start + (index / Math.max(1, count - 1)) * (end - start);
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, z] as [number, number, number];
  });
}

function createImageMesh(image: HTMLImageElement, width: number, height: number): Mesh {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { vertices: [], edges: [] };

  const sx = image.naturalWidth * FACE_SOURCE_CROP.x;
  const sy = image.naturalHeight * FACE_SOURCE_CROP.y;
  const sw = image.naturalWidth * FACE_SOURCE_CROP.width;
  const sh = image.naturalHeight * FACE_SOURCE_CROP.height;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);

  const { data } = ctx.getImageData(0, 0, width, height);
  const detectedBounds = findMaskBounds(data, width, height);
  const detectedWidth = Math.max(1, detectedBounds.maxX - detectedBounds.minX);
  const detectedHeight = Math.max(1, detectedBounds.maxY - detectedBounds.minY);
  const centerX = detectedBounds.minX + detectedWidth * 0.5;
  const centerY = detectedBounds.minY + detectedHeight * 0.48;
  const radiusX = detectedWidth * 0.39;
  const radiusY = detectedHeight * 0.43;

  const vertices: Vertex[] = [];
  const grid = new Map<string, number>();

  for (let row = 0; row <= FACE_ROWS; row += 1) {
    const ny = -1 + (row / FACE_ROWS) * 2;
    const rowWidth = Math.sqrt(Math.max(0, 1 - Math.abs(ny) ** 2.15));
    const jawTaper = ny > 0.38 ? 1 - (ny - 0.38) * 0.32 : 1;
    const templeTaper = ny < -0.68 ? 1 - (Math.abs(ny) - 0.68) * 0.18 : 1;
    const cols = Math.max(6, Math.round(rowWidth * jawTaper * templeTaper * 32));

    for (let col = 0; col <= cols; col += 1) {
      const lineX = cols === 0 ? 0 : -1 + (col / cols) * 2;
      const nx = lineX * rowWidth * jawTaper * templeTaper;
      const faceMask = nx * nx * 0.86 + ny * ny * 0.98;
      if (faceMask > 1) continue;

      const eyeHole =
        (((nx + 0.38) / 0.22) ** 2 + (((ny + 0.28) / 0.07) ** 2) < 1) ||
        (((nx - 0.38) / 0.22) ** 2 + (((ny + 0.28) / 0.07) ** 2) < 1);
      if (eyeHole) continue;

      const x = clamp(Math.round(centerX + nx * radiusX), 1, width - 2);
      const y = clamp(Math.round(centerY + ny * radiusY), 1, height - 2);
      const i = (y * width + x) * 4;
      const sampleStep = Math.max(4, Math.round(Math.min(width, height) * 0.01));
      const left = (y * width + Math.max(0, x - sampleStep)) * 4;
      const right = (y * width + Math.min(width - 1, x + sampleStep)) * 4;
      const up = (Math.max(0, y - sampleStep) * width + x) * 4;
      const down = (Math.min(height - 1, y + sampleStep) * width + x) * 4;
      const edge = clamp(
        Math.hypot((luminance(data, right) - luminance(data, left)) / 255, (luminance(data, down) - luminance(data, up)) / 255) * 1.6,
        0,
        1,
      );

      const eyeBand = ny > -0.52 && ny < -0.22 && Math.abs(nx) > 0.22 && Math.abs(nx) < 0.76;
      const mouthBand = ny > 0.33 && ny < 0.58 && Math.abs(nx) < 0.56;
      const noseBand = ny > -0.16 && ny < 0.34 && Math.abs(nx) < 0.22;
      const outlineBand = faceMask > 0.84;
      const foregroundBoost = isForeground(data, i) ? 0.1 : -0.08;
      const feature = (eyeBand ? 0.2 : 0) + (mouthBand ? 0.16 : 0) + (noseBand ? 0.16 : 0) + (outlineBand ? 0.22 : 0);
      const score = clamp(edge + feature + foregroundBoost + 0.18, 0, 1);

      const ellipsoid = Math.sqrt(Math.max(0, 1 - nx * nx * 0.55 - ny * ny * 0.68));
      const noseDepth = Math.exp(-((nx / 0.22) * (nx / 0.22)) - (((ny - 0.08) / 0.34) * ((ny - 0.08) / 0.34))) * 0.26;
      const cheekX = (Math.abs(nx) - 0.43) / 0.22;
      const cheekY = (ny + 0.02) / 0.42;
      const cheekDepth = Math.exp(-(cheekX * cheekX) - cheekY * cheekY) * 0.07;
      const z = ellipsoid * 0.48 + noseDepth + cheekDepth;
      const key = `${row}:${col}`;

      grid.set(key, vertices.length);
      vertices.push({
        x: nx,
        y: ny,
        z,
        size: 1.25 + score * 1.2,
        alpha: 0.24 + score * 0.48,
        feature,
      });
    }
  }

  const edges: Edge[] = [];
  for (const [key, index] of grid) {
    const [row, col] = key.split(':').map(Number);
    const neighbors = [`${row}:${col + 1}`, `${row + 1}:${col}`, `${row + 1}:${col + 1}`, `${row + 1}:${col - 1}`];
    for (const neighborKey of neighbors) {
      const neighbor = grid.get(neighborKey);
      if (neighbor === undefined) continue;
      const a = vertices[index];
      const b = vertices[neighbor];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      if (dist > 0.085) continue;
      edges.push({ a: index, b: neighbor, alpha: 0.18 + Math.min(a.alpha, b.alpha) * 0.46 });
    }
  }

  addFeaturePath(vertices, edges, ellipsePath(0, 0.02, 0.98, 1.08, 0.5, 86), 0.86, 2.8);
  addFeaturePath(vertices, edges, ellipsePath(-0.38, -0.28, 0.21, 0.065, 0.72, 22, Math.PI * 0.05, Math.PI * 0.95), 1, 3.4);
  addFeaturePath(vertices, edges, ellipsePath(0.38, -0.28, 0.21, 0.065, 0.72, 22, Math.PI * 0.05, Math.PI * 0.95), 1, 3.4);
  addFeaturePath(vertices, edges, ellipsePath(-0.38, -0.4, 0.28, 0.055, 0.72, 18, Math.PI, Math.PI * 2), 0.9, 3.2);
  addFeaturePath(vertices, edges, ellipsePath(0.38, -0.4, 0.28, 0.055, 0.72, 18, Math.PI, Math.PI * 2), 0.9, 3.2);
  addFeaturePath(
    vertices,
    edges,
    [
      [0, -0.25, 0.82],
      [-0.08, -0.02, 0.92],
      [-0.11, 0.22, 0.9],
      [-0.04, 0.36, 0.76],
      [0.04, 0.36, 0.76],
      [0.11, 0.22, 0.9],
      [0.08, -0.02, 0.92],
      [0, -0.25, 0.82],
    ],
    1,
    3.3,
  );
  addFeaturePath(vertices, edges, ellipsePath(0, 0.56, 0.28, 0.07, 0.7, 26), 1, 3.2);

  return { vertices, edges };
}

function rotate(vertex: Vertex, rotX: number, rotY: number) {
  const cosY = Math.cos(rotY);
  const sinY = Math.sin(rotY);
  const x1 = vertex.x * cosY + vertex.z * sinY;
  const z1 = -vertex.x * sinY + vertex.z * cosY;
  const cosX = Math.cos(rotX);
  const sinX = Math.sin(rotX);
  const y2 = vertex.y * cosX - z1 * sinX;
  const z2 = vertex.y * sinX + z1 * cosX;
  return { ...vertex, x: x1, y: y2, z: z2 };
}

export function ImageMappedFaceMesh3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawingCanvas = canvas;
    const drawingContext = ctx;
    const image = new Image();
    image.src = SOURCE;

    let width = 0;
    let height = 0;
    let frame = 0;
    let lastRender = 0;
    let mesh: Mesh = { vertices: [], edges: [] };
    let rotX = -0.08;
    let rotY = 0;

    function resize() {
      const rect = drawingCanvas.getBoundingClientRect();
      width = Math.max(360, Math.round(rect.width));
      height = Math.max(420, Math.round(rect.height));
      drawingCanvas.width = width * DPR;
      drawingCanvas.height = height * DPR;
      drawingContext.setTransform(DPR, 0, 0, DPR, 0, 0);
      if (image.complete) mesh = createImageMesh(image, width, height);
    }

    function render(now: number) {
      if (now - lastRender < FRAME_INTERVAL) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRender = now;

      const theme = getComputedStyle(document.documentElement);
      const dot = theme.getPropertyValue('--dot').trim() || '#c026d3';
      const glow = theme.getPropertyValue('--dot-glow').trim() || 'rgba(236,72,255,0.8)';
      const targetY = pointerRef.current.x * 0.32 + Math.sin(now * 0.00022) * 0.08;
      const targetX = -0.08 + pointerRef.current.y * 0.16;
      rotY += (targetY - rotY) * 0.08;
      rotX += (targetX - rotX) * 0.08;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalCompositeOperation = 'lighter';

      const scale = Math.min(width * 0.26, height * 0.29);
      const cx = width * 0.5;
      const cy = height * 0.3;
      const camera = 2.85;
      const projected = mesh.vertices.map((vertex) => {
        const rotated = rotate(vertex, rotX, rotY);
        const perspective = camera / (camera - rotated.z);
        return {
          ...rotated,
          px: cx + rotated.x * scale * perspective,
          py: cy + rotated.y * scale * perspective,
          perspective,
        };
      });

      drawingContext.lineWidth = 0.72;
      drawingContext.strokeStyle = 'rgba(236, 72, 255, 0.42)';
      for (const edge of mesh.edges) {
        const a = projected[edge.a];
        const b = projected[edge.b];
        if (!a || !b) continue;
        const zAlpha = clamp((a.z + b.z) * 0.52 + 0.52, 0.1, 1);
        drawingContext.globalAlpha = edge.alpha * zAlpha;
        drawingContext.beginPath();
        drawingContext.moveTo(a.px, a.py);
        drawingContext.lineTo(b.px, b.py);
        drawingContext.stroke();
      }

      drawingContext.shadowColor = glow;
      drawingContext.shadowBlur = 12;
      for (const vertex of projected) {
        const zAlpha = clamp(vertex.z * 0.7 + 0.58, 0.15, 1);
        drawingContext.globalAlpha = vertex.alpha * zAlpha;
        drawingContext.fillStyle = vertex.feature > 0.2 ? 'rgba(255, 0, 245, 0.95)' : dot;
        drawingContext.beginPath();
        drawingContext.arc(vertex.px, vertex.py, vertex.size * vertex.perspective, 0, Math.PI * 2);
        drawingContext.fill();
      }

      drawingContext.restore();
      frame = requestAnimationFrame(render);
    }

    function onPointerMove(event: PointerEvent) {
      const rect = drawingCanvas.getBoundingClientRect();
      pointerRef.current = {
        x: clamp((event.clientX - rect.left) / rect.width - 0.5, -0.5, 0.5),
        y: clamp((event.clientY - rect.top) / rect.height - 0.5, -0.5, 0.5),
      };
    }

    image.onload = () => {
      resize();
      frame = requestAnimationFrame(render);
    };

    window.addEventListener('resize', resize);
    drawingCanvas.addEventListener('pointermove', onPointerMove);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      drawingCanvas.removeEventListener('pointermove', onPointerMove);
    };
  }, []);

  return (
    <div className={styles.frame}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Trójwymiarowy neonowy model twarzy zmapowany z wyciętego zdjęcia"
      />
    </div>
  );
}
