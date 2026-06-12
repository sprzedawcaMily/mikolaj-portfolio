/**
 * Jedna pętla RAF dla mesh — unika wielu równoległych requestAnimationFrame
 * i pozwala współdzielić cache layoutu (getBoundingClientRect) w tej samej klatce.
 */

import { recordMeshFrameDuration } from '@/hooks/meshPerfStats';

export type MeshFrameCallback = (ts: number, dt: number) => void;

let frameId = 0;
let rafId = 0;
let lastTs = 0;
let lastRafTs = 0;
let running = false;
const subscribers = new Set<MeshFrameCallback>();
const prepCallbacks = new Set<() => void>();

/** Uruchamiane przed subskrybentami — np. blokada strefy podczas morphu. */
export function subscribeMeshFramePrep(fn: () => void): () => void {
  prepCallbacks.add(fn);
  return () => {
    prepCallbacks.delete(fn);
  };
}

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

  if (typeof document !== 'undefined' && document.hidden) {
    lastRafTs = ts;
    rafId = requestAnimationFrame(loop);
    return;
  }

  const frameStart = performance.now();
  const frameGapMs = lastRafTs > 0 ? ts - lastRafTs : 0;
  lastRafTs = ts;
  const dt = Math.min((ts - lastTs) / 1000, 0.05);
  lastTs = ts;
  frameId += 1;
  for (const fn of prepCallbacks) fn();
  for (const fn of subscribers) fn(ts, dt);
  recordMeshFrameDuration(performance.now() - frameStart, frameGapMs);
  rafId = requestAnimationFrame(loop);
}
