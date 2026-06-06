import { useEffect, useRef } from 'react';
import styles from './PhotoMappedFace.module.css';

interface Particle {
  x: number;
  y: number;
  sx: number;
  sy: number;
  size: number;
  alpha: number;
  delay: number;
  group: number;
}

const SOURCE = '/images/profile/face.png';
const DPR_CAP = 1;
const SAMPLE_GAP = 20;
const MAX_DETAIL_DOTS = 170;
const FACE_OUTLINE_DOTS = 72;
const FRAME_INTERVAL = 1000 / 30;
const FACE_FOCUS_X = 0.5;
const FACE_FOCUS_Y = 0.52;
const FACE_RADIUS_X = 0.34;
const FACE_RADIUS_Y = 0.43;

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function isInsideFaceMask(x: number, y: number, width: number, height: number) {
  const nx = (x / width - FACE_FOCUS_X) / FACE_RADIUS_X;
  const ny = (y / height - FACE_FOCUS_Y) / FACE_RADIUS_Y;
  return nx * nx + ny * ny < 1;
}

function drawFaceCrop(ctx: CanvasRenderingContext2D, image: HTMLImageElement, width: number, height: number) {
  const sx = image.naturalWidth * 0.16;
  const sy = image.naturalHeight * 0.09;
  const sw = image.naturalWidth * 0.68;
  const sh = image.naturalHeight * 0.58;
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
}

function createFaceMesh(image: HTMLImageElement, width: number, height: number) {
  const source = document.createElement('canvas');
  source.width = width;
  source.height = height;
  const ctx = source.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { particles: [] as Particle[] };

  drawFaceCrop(ctx, image, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const candidates: Array<Particle & { score: number }> = [];
  const particles: Particle[] = [];

  for (let y = SAMPLE_GAP; y < height - SAMPLE_GAP; y += SAMPLE_GAP) {
    for (let x = SAMPLE_GAP; x < width - SAMPLE_GAP; x += SAMPLE_GAP) {
      if (!isInsideFaceMask(x, y, width, height)) continue;

      const right = ((y * width + Math.min(width - 1, x + SAMPLE_GAP)) * 4);
      const down = ((Math.min(height - 1, y + SAMPLE_GAP) * width + x) * 4);
      const left = ((y * width + Math.max(0, x - SAMPLE_GAP)) * 4);
      const up = ((Math.max(0, y - SAMPLE_GAP) * width + x) * 4);
      const lumRight =
        0.2126 * (data[right] ?? 0) +
        0.7152 * (data[right + 1] ?? 0) +
        0.0722 * (data[right + 2] ?? 0);
      const lumDown =
        0.2126 * (data[down] ?? 0) +
        0.7152 * (data[down + 1] ?? 0) +
        0.0722 * (data[down + 2] ?? 0);
      const lumLeft =
        0.2126 * (data[left] ?? 0) +
        0.7152 * (data[left + 1] ?? 0) +
        0.0722 * (data[left + 2] ?? 0);
      const lumUp =
        0.2126 * (data[up] ?? 0) +
        0.7152 * (data[up + 1] ?? 0) +
        0.0722 * (data[up + 2] ?? 0);
      const edgeX = Math.abs(lumRight - lumLeft) / 255;
      const edgeY = Math.abs(lumDown - lumUp) / 255;
      const edge = clamp(Math.hypot(edgeX, edgeY) * 1.55, 0, 1);

      // Keep only strong face details. No portrait/background fill.
      if (edge < 0.24) continue;

      const row = Math.round(y / SAMPLE_GAP);
      const col = Math.round(x / SAMPLE_GAP);
      const seed = x * 31 + y * 71;

      candidates.push({
        x,
        y,
        sx: width * 0.5 + (pseudoRandom(seed) - 0.5) * width * 1.35,
        sy: height * 0.5 + (pseudoRandom(seed + 9) - 0.5) * height * 1.1,
        size: 5.2 + edge * 4.8,
        alpha: 0.52 + edge * 0.48,
        delay: pseudoRandom(seed + 19) * 0.38,
        group: row * 1000 + col,
        score: edge,
      });
    }
  }

  candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_DETAIL_DOTS)
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .forEach(({ score: _score, ...particle }) => {
      particles.push(particle);
    });

  for (let i = 0; i < FACE_OUTLINE_DOTS; i += 1) {
    const t = (i / FACE_OUTLINE_DOTS) * Math.PI * 2;
    const wobble = 1 + Math.sin(t * 3.1) * 0.035 + Math.sin(t * 7.4) * 0.018;
    const x = width * (FACE_FOCUS_X + Math.cos(t) * FACE_RADIUS_X * wobble);
    const y = height * (FACE_FOCUS_Y + Math.sin(t) * FACE_RADIUS_Y * wobble);
    const seed = i * 97;
    particles.push({
      x,
      y,
      sx: width * 0.5 + (pseudoRandom(seed) - 0.5) * width * 1.2,
      sy: height * 0.5 + (pseudoRandom(seed + 9) - 0.5) * height,
      size: 7 + pseudoRandom(seed + 17) * 3.5,
      alpha: 0.78,
      delay: pseudoRandom(seed + 19) * 0.32,
      group: i,
    });
  }

  return { particles };
}

export function PhotoMappedFace() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointerRef = useRef({ x: -9999, y: -9999, active: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawingCanvas = canvas;
    const drawingContext = ctx;
    let frame = 0;
    let start = performance.now();
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let dpr = 1;
    let lastRender = 0;

    const image = new Image();
    image.src = SOURCE;

    function resize() {
      const rect = drawingCanvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      width = Math.max(320, Math.round(rect.width));
      height = Math.max(420, Math.round(rect.height));
      drawingCanvas.width = Math.round(width * dpr);
      drawingCanvas.height = Math.round(height * dpr);
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);

      if (image.complete) {
        const mesh = createFaceMesh(image, width, height);
        particles = mesh.particles;
        start = performance.now();
      }
    }

    function render(now: number) {
      if (now - lastRender < FRAME_INTERVAL) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRender = now;

      const theme = getComputedStyle(document.documentElement);
      const dot = theme.getPropertyValue('--dot').trim() || '#A78BFA';
      const glow = theme.getPropertyValue('--dot-glow').trim() || 'rgba(196, 181, 253, 0.75)';
      const elapsed = (now - start) / 1000;

      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalCompositeOperation = 'lighter';

      const positions = particles.map((p) => {
        const t = clamp((elapsed - p.delay) / 1.2, 0, 1);
        const eased = easeOutCubic(t);
        let x = p.sx + (p.x - p.sx) * eased;
        let y = p.sy + (p.y - p.sy) * eased;

        if (pointerRef.current.active) {
          const dx = x - pointerRef.current.x;
          const dy = y - pointerRef.current.y;
          const dist = Math.hypot(dx, dy);
          if (dist < 90) {
            const force = (1 - dist / 90) * 18;
            x += (dx / Math.max(dist, 1)) * force;
            y += (dy / Math.max(dist, 1)) * force;
          }
        }

        return { x, y, alpha: p.alpha * eased, size: p.size };
      });

      drawingContext.shadowColor = glow;
      drawingContext.shadowBlur = 8;
      drawingContext.fillStyle = dot;
      for (const p of positions) {
        if (p.alpha < 0.04) continue;
        drawingContext.globalAlpha = p.alpha;
        drawingContext.beginPath();
        drawingContext.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        drawingContext.fill();
      }

      drawingContext.restore();
      frame = requestAnimationFrame(render);
    }

    image.onload = () => {
      resize();
      frame = requestAnimationFrame(render);
    };

    function onMove(event: PointerEvent) {
      const rect = drawingCanvas.getBoundingClientRect();
      pointerRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        active: true,
      };
    }

    function onLeave() {
      pointerRef.current.active = false;
    }

    window.addEventListener('resize', resize);
    drawingCanvas.addEventListener('pointermove', onMove);
    drawingCanvas.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      drawingCanvas.removeEventListener('pointermove', onMove);
      drawingCanvas.removeEventListener('pointerleave', onLeave);
    };
  }, []);

  return (
    <div className={styles.frame}>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        aria-label="Twarz Mikołaja zbudowana z dużych fioletowych kropek na transparentnym tle"
      />
    </div>
  );
}
