import { useEffect, useRef } from 'react';
import styles from './InteractiveDotField.module.css';

interface Dot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

const DOT_COUNT_DESKTOP = 24;
const DOT_COUNT_MOBILE = 14;
const LINK_DISTANCE = 110;
const POINTER_DISTANCE = 150;
const FRAME_INTERVAL = 1000 / 15;
const SCROLL_IDLE_MS = 180;

function rand(seed: number) {
  const x = Math.sin(seed * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

export function InteractiveDotField() {
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
    let width = 0;
    let height = 0;
    let dpr = 1;
    let dots: Dot[] = [];
    let lastRender = 0;
    let running = document.visibilityState === 'visible';
    let scrollPaused = false;
    let scrollIdleTimer = 0;

    function buildDots() {
      const count = width < 720 ? DOT_COUNT_MOBILE : DOT_COUNT_DESKTOP;
      dots = Array.from({ length: count }, (_, i) => {
        const angle = rand(i + 41) * Math.PI * 2;
        const speed = 0.055 + rand(i + 71) * 0.2;
        return {
          x: rand(i + 1) * width,
          y: rand(i + 101) * height,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          size: 1.2 + rand(i + 9) * 2.2,
          phase: rand(i + 177) * Math.PI * 2,
        };
      });
    }

    function resize() {
      dpr = 1;
      width = window.innerWidth;
      height = window.innerHeight;
      drawingCanvas.width = Math.round(width * dpr);
      drawingCanvas.height = Math.round(height * dpr);
      drawingCanvas.style.width = `${width}px`;
      drawingCanvas.style.height = `${height}px`;
      drawingContext.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildDots();
    }

    let dotColor = '#A78BFA';
    let lineColor = 'rgba(167, 139, 250, 0.35)';
    let themeReadAt = 0;

    function readThemeColors(time: number) {
      if (time - themeReadAt < 2000) return;
      themeReadAt = time;
      const theme = getComputedStyle(document.documentElement);
      dotColor = theme.getPropertyValue('--dot').trim() || '#A78BFA';
      lineColor = theme.getPropertyValue('--dot-line').trim() || 'rgba(167, 139, 250, 0.35)';
    }

    function render(time: number) {
      if (!running) return;
      if (scrollPaused) {
        frame = requestAnimationFrame(render);
        return;
      }
      if (time - lastRender < FRAME_INTERVAL) {
        frame = requestAnimationFrame(render);
        return;
      }
      lastRender = time;
      frame = requestAnimationFrame(render);
      readThemeColors(time);
      drawingContext.clearRect(0, 0, width, height);
      drawingContext.save();
      drawingContext.globalCompositeOperation = 'lighter';

      for (const dot of dots) {
        dot.vx += Math.cos(time * 0.00028 + dot.phase) * 0.003;
        dot.vy += Math.sin(time * 0.00024 + dot.phase * 1.4) * 0.003;
        const speed = Math.hypot(dot.vx, dot.vy);
        if (speed > 0.34) {
          dot.vx = (dot.vx / speed) * 0.34;
          dot.vy = (dot.vy / speed) * 0.34;
        }

        dot.x += dot.vx;
        dot.y += dot.vy;

        if (dot.x < -20) dot.x = width + 20;
        if (dot.x > width + 20) dot.x = -20;
        if (dot.y < -20) dot.y = height + 20;
        if (dot.y > height + 20) dot.y = -20;

        if (pointerRef.current.active) {
          const dx = dot.x - pointerRef.current.x;
          const dy = dot.y - pointerRef.current.y;
          const distance = Math.hypot(dx, dy);
          if (distance < POINTER_DISTANCE) {
            const force = (1 - distance / POINTER_DISTANCE) ** 2 * 3.2;
            dot.x += (dx / Math.max(distance, 1)) * force;
            dot.y += (dy / Math.max(distance, 1)) * force;
            dot.vx += (dx / Math.max(distance, 1)) * 0.012;
            dot.vy += (dy / Math.max(distance, 1)) * 0.012;
          }
        }
      }

      drawingContext.lineWidth = 0.5;
      drawingContext.strokeStyle = lineColor;
      for (let i = 0; i < dots.length; i += 1) {
        let links = 0;
        for (let j = i + 1; j < dots.length; j += 1) {
          const a = dots[i];
          const b = dots[j];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (distance > LINK_DISTANCE) continue;
          if (links > 2 && rand(i * 101 + j) > 0.28) continue;
          links += 1;
          drawingContext.globalAlpha = (1 - distance / LINK_DISTANCE) * (0.04 + rand(i * 17 + j) * 0.06);
          drawingContext.beginPath();
          drawingContext.moveTo(a.x, a.y);
          drawingContext.lineTo(b.x, b.y);
          drawingContext.stroke();
        }
      }

      drawingContext.fillStyle = dotColor;
      for (const dot of dots) {
        const pulse = 0.65 + Math.sin(time * 0.0008 + dot.phase) * 0.35;
        drawingContext.globalAlpha = 0.16 + pulse * 0.2;
        drawingContext.beginPath();
        drawingContext.arc(dot.x, dot.y, dot.size * pulse, 0, Math.PI * 2);
        drawingContext.fill();
      }

      drawingContext.restore();
    }

    function onVisibilityChange() {
      const wasRunning = running;
      running = document.visibilityState === 'visible';
      if (running && !wasRunning) frame = requestAnimationFrame(render);
    }

    function onScroll() {
      scrollPaused = true;
      window.clearTimeout(scrollIdleTimer);
      scrollIdleTimer = window.setTimeout(() => {
        scrollPaused = false;
      }, SCROLL_IDLE_MS);
    }

    function onPointerMove(event: PointerEvent) {
      pointerRef.current = {
        x: event.clientX,
        y: event.clientY,
        active: true,
      };
    }

    function onPointerLeave() {
      pointerRef.current.active = false;
    }

    resize();
    frame = requestAnimationFrame(render);
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerleave', onPointerLeave);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      running = false;
      window.clearTimeout(scrollIdleTimer);
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerleave', onPointerLeave);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return <canvas ref={canvasRef} className={styles.canvas} aria-hidden />;
}
