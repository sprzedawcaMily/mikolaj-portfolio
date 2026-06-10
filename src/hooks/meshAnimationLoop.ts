/**
 * Jedna pętla RAF dla mesh — unika wielu równoległych requestAnimationFrame
 * i pozwala współdzielić cache layoutu (getBoundingClientRect) w tej samej klatce.
 */

export type MeshFrameCallback = (ts: number, dt: number) => void;

let frameId = 0;
let rafId = 0;
let lastTs = 0;
let running = false;
const subscribers = new Set<MeshFrameCallback>();

export function currentMeshFrameId() {
  return frameId;
}

export function subscribeMeshFrame(fn: MeshFrameCallback): () => void {
  subscribers.add(fn);
  if (!running) {
    running = true;
    lastTs = performance.now();
    rafId = requestAnimationFrame(loop);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && running) {
      running = false;
      cancelAnimationFrame(rafId);
    }
  };
}

function loop(ts: number) {
  if (!running) return;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  frameId += 1;
  for (const fn of subscribers) fn(ts, dt);
  rafId = requestAnimationFrame(loop);
}
