import { useEffect, useState } from 'react';

export type EyeMeshFrame = {
  ready: boolean;
  /** Przesunięcie centroidu kropek względem środka pina (px). */
  ox: number;
  oy: number;
  /** Skala vs. oczekiwany rozmiar oka w pinie (średnia osi). */
  scale: number;
  scaleX: number;
  scaleY: number;
};

export type MeshMotionSnapshot = {
  morphFlying: boolean;
  morphSettled: boolean;
  scrolling: boolean;
  /** 0–1: postęp budowania kształtu (lot + lądowanie kropek). */
  morphBuildT: number;
  /** Tęczówka SVG — przyczepiona do wylądowanych kropek mesha. */
  eyeFrame: EyeMeshFrame;
  /** Tęczówka + źrenica widoczne dopiero po pierwszym mrugnięciu. */
  eyeIrisUnlocked: boolean;
};

const IDLE_EYE_FRAME: EyeMeshFrame = { ready: false, ox: 0, oy: 0, scale: 1, scaleX: 1, scaleY: 1 };

let snapshot: MeshMotionSnapshot = {
  morphFlying: false,
  morphSettled: true,
  scrolling: false,
  morphBuildT: 1,
  eyeFrame: IDLE_EYE_FRAME,
  eyeIrisUnlocked: false,
};

const listeners = new Set<() => void>();

export function readMeshMotionState(): MeshMotionSnapshot {
  return snapshot;
}

export function publishMeshMotionState(next: Partial<MeshMotionSnapshot>) {
  const prev = snapshot;
  snapshot = { ...snapshot, ...next };
  if (
    prev.morphFlying === snapshot.morphFlying
    && prev.morphSettled === snapshot.morphSettled
    && prev.scrolling === snapshot.scrolling
    && prev.morphBuildT === snapshot.morphBuildT
    && prev.eyeFrame.ox === snapshot.eyeFrame.ox
    && prev.eyeFrame.oy === snapshot.eyeFrame.oy
    && prev.eyeFrame.scale === snapshot.eyeFrame.scale
    && prev.eyeFrame.scaleX === snapshot.eyeFrame.scaleX
    && prev.eyeFrame.scaleY === snapshot.eyeFrame.scaleY
    && prev.eyeFrame.ready === snapshot.eyeFrame.ready
    && prev.eyeIrisUnlocked === snapshot.eyeIrisUnlocked
  ) {
    return;
  }
  for (const fn of listeners) fn();
}

export function subscribeMeshMotionState(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useMeshMotionState(): MeshMotionSnapshot {
  const [state, setState] = useState(readMeshMotionState);
  useEffect(() => subscribeMeshMotionState(() => setState(readMeshMotionState())), []);
  return state;
}
