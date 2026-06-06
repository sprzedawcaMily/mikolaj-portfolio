import { useEffect, useMemo, useRef } from 'react';
import styles from './NeonFaceMesh3D.module.css';

interface Vertex3D {
  x: number;
  y: number;
  z: number;
  size: number;
  alpha: number;
  feature?: 'eye' | 'brow' | 'nose' | 'mouth' | 'outline';
}

interface Edge {
  a: number;
  b: number;
  alpha: number;
}

interface ProjectedVertex extends Vertex3D {
  px: number;
  py: number;
  pz: number;
  scale: number;
}

const DPR = 1;
const FRAME_INTERVAL = 1000 / 30;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function addPolyline(
  vertices: Vertex3D[],
  edges: Edge[],
  points: Array<[number, number, number]>,
  feature: Vertex3D['feature'],
  size = 3.4,
  alpha = 0.95,
) {
  let previous = -1;
  for (const [x, y, z] of points) {
    const index = vertices.length;
    vertices.push({ x, y, z, size, alpha, feature });
    if (previous >= 0) edges.push({ a: previous, b: index, alpha: 0.85 });
    previous = index;
  }
}

function ellipsePoints(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  z: number,
  count: number,
  start = 0,
  end = Math.PI * 2,
) {
  return Array.from({ length: count }, (_, i) => {
    const t = start + (i / (count - 1)) * (end - start);
    return [cx + Math.cos(t) * rx, cy + Math.sin(t) * ry, z] as [number, number, number];
  });
}

function isEyeHole(x: number, y: number) {
  const left = (((x + 0.28) / 0.17) ** 2) + (((y + 0.1) / 0.055) ** 2) < 1;
  const right = (((x - 0.28) / 0.17) ** 2) + (((y + 0.1) / 0.055) ** 2) < 1;
  return left || right;
}

function createMesh() {
  const vertices: Vertex3D[] = [];
  const edges: Edge[] = [];
  const grid = new Map<string, number>();
  const rows = 30;

  for (let row = 0; row <= rows; row += 1) {
    const v = -1 + (row / rows) * 2;
    const faceWidth = 0.58 * Math.sqrt(Math.max(0, 1 - (v * 0.78) ** 2));
    const taper = 1 - Math.max(0, v - 0.42) * 0.24;
    const width = faceWidth * taper;
    const cols = Math.max(6, Math.round(width * 32));

    for (let col = 0; col <= cols; col += 1) {
      const u = -1 + (col / cols) * 2;
      const x = u * width;
      const y = v * 0.92;

      if (isEyeHole(x, y)) continue;
      if (y > 0.61 && Math.abs(x) > 0.34 - (y - 0.61) * 0.38) continue;

      const nx = x / Math.max(width, 0.001);
      const ny = y / 0.92;
      const baseZ = Math.sqrt(Math.max(0, 1 - nx * nx * 0.72 - ny * ny * 0.45));
      const noseX = x / 0.14;
      const noseY = (y - 0.16) / 0.27;
      const browX = (Math.abs(x) - 0.28) / 0.18;
      const browY = (y + 0.18) / 0.08;
      const nose = Math.exp(-(noseX * noseX) - noseY * noseY) * 0.18;
      const brow = Math.exp(-(browX * browX) - browY * browY) * 0.04;
      const z = baseZ * 0.34 + nose + brow;
      const index = vertices.length;

      vertices.push({
        x,
        y,
        z,
        size: 1.55,
        alpha: 0.52,
      });
      grid.set(`${row}:${col}`, index);
    }
  }

  for (const [key, index] of grid) {
    const [row, col] = key.split(':').map(Number);
    const neighbors = [
      `${row}:${col + 1}`,
      `${row + 1}:${col}`,
      `${row + 1}:${col + 1}`,
      `${row + 1}:${col - 1}`,
    ];

    for (const neighborKey of neighbors) {
      const neighbor = grid.get(neighborKey);
      if (neighbor !== undefined) edges.push({ a: index, b: neighbor, alpha: 0.28 });
    }
  }

  addPolyline(vertices, edges, ellipsePoints(0, 0, 0.61, 0.93, 0.34, 76), 'outline', 2.8, 0.95);
  addPolyline(vertices, edges, ellipsePoints(-0.28, -0.1, 0.17, 0.056, 0.48, 24), 'eye', 3.2, 1);
  addPolyline(vertices, edges, ellipsePoints(0.28, -0.1, 0.17, 0.056, 0.48, 24), 'eye', 3.2, 1);
  addPolyline(vertices, edges, ellipsePoints(-0.28, -0.21, 0.23, 0.045, 0.49, 18, Math.PI, Math.PI * 2), 'brow', 3, 1);
  addPolyline(vertices, edges, ellipsePoints(0.28, -0.21, 0.23, 0.045, 0.49, 18, Math.PI, Math.PI * 2), 'brow', 3, 1);
  addPolyline(
    vertices,
    edges,
    [
      [0, -0.12, 0.58],
      [-0.035, 0.04, 0.64],
      [-0.06, 0.17, 0.66],
      [-0.035, 0.28, 0.61],
      [0, 0.33, 0.59],
      [0.035, 0.28, 0.61],
      [0.06, 0.17, 0.66],
      [0.035, 0.04, 0.64],
      [0, -0.12, 0.58],
    ],
    'nose',
    3.4,
    1,
  );
  addPolyline(vertices, edges, ellipsePoints(0, 0.49, 0.2, 0.045, 0.5, 26), 'mouth', 3.1, 1);

  return { vertices, edges };
}

function rotate(vertex: Vertex3D, rotX: number, rotY: number): Vertex3D {
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

export function NeonFaceMesh3D() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const mesh = useMemo(createMesh, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawingCanvas = canvas;
    const drawingContext = ctx;
    let width = 0;
    let height = 0;
    let frame = 0;
    let lastRender = 0;
    let rotX = -0.08;
    let rotY = 0;

    function resize() {
      const rect = drawingCanvas.getBoundingClientRect();
      width = Math.max(320, Math.round(rect.width));
      height = Math.max(420, Math.round(rect.height));
      drawingCanvas.width = Math.round(width * DPR);
      drawingCanvas.height = Math.round(height * DPR);
      drawingContext.setTransform(DPR, 0, 0, DPR, 0, 0);
    }

    function render(now: number) {
      if (now - lastRender < FRAME_INTERVAL) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRender = now;

      const theme = getComputedStyle(document.documentElement);
      const dotColor = theme.getPropertyValue('--dot').trim() || '#c026d3';
      const lineColor = 'rgba(236, 72, 255, 0.42)';
      const hotColor = 'rgba(255, 0, 245, 0.95)';
      const glowColor = 'rgba(236, 72, 255, 0.82)';
      const targetY = pointerRef.current.x * 0.26 + Math.sin(now * 0.00028) * 0.08;
      const targetX = -0.08 + pointerRef.current.y * 0.12;
      rotY += (targetY - rotY) * 0.08;
      rotX += (targetX - rotX) * 0.08;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalCompositeOperation = 'lighter';

      const scale = Math.min(width * 0.62, height * 0.48);
      const centerX = width * 0.5;
      const centerY = height * 0.49;
      const camera = 2.6;
      const projected: ProjectedVertex[] = mesh.vertices.map((vertex) => {
        const rotated = rotate(vertex, rotX, rotY);
        const perspective = camera / (camera - rotated.z);
        return {
          ...rotated,
          px: centerX + rotated.x * scale * perspective,
          py: centerY + rotated.y * scale * perspective,
          pz: rotated.z,
          scale: perspective,
        };
      });

      drawingContext.lineWidth = 0.72;
      drawingContext.strokeStyle = lineColor;
      for (const edge of mesh.edges) {
        const a = projected[edge.a];
        const b = projected[edge.b];
        if (!a || !b) continue;
        const zAlpha = clamp((a.pz + b.pz) * 0.65 + 0.52, 0.12, 1);
        drawingContext.globalAlpha = edge.alpha * zAlpha;
        drawingContext.beginPath();
        drawingContext.moveTo(a.px, a.py);
        drawingContext.lineTo(b.px, b.py);
        drawingContext.stroke();
      }

      drawingContext.shadowColor = glowColor;
      drawingContext.shadowBlur = 12;
      for (const vertex of projected) {
        const featureBoost = vertex.feature ? 1.45 : 1;
        const zAlpha = clamp(vertex.pz * 0.75 + 0.58, 0.18, 1);
        drawingContext.globalAlpha = vertex.alpha * zAlpha;
        drawingContext.fillStyle = vertex.feature ? hotColor : dotColor;
        drawingContext.beginPath();
        drawingContext.arc(vertex.px, vertex.py, vertex.size * vertex.scale * featureBoost, 0, Math.PI * 2);
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

    resize();
    frame = requestAnimationFrame(render);
    window.addEventListener('resize', resize);
    drawingCanvas.addEventListener('pointermove', onPointerMove);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      drawingCanvas.removeEventListener('pointermove', onPointerMove);
    };
  }, [mesh]);

  return (
    <div className={styles.frame}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Neonowa trójwymiarowa siatka twarzy"
      />
    </div>
  );
}
