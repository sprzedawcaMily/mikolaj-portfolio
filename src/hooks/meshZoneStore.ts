import type { MeshZone, ScrollAimPoint } from '@/hooks/meshScrollEngine';

export type MeshZoneSnapshot = {
  zone: MeshZone;
  paletteAim: ScrollAimPoint | null;
};

let snapshot: MeshZoneSnapshot = { zone: 'hero', paletteAim: null };
let morphZoneLock: MeshZone | null = null;
let meshScrolling = false;
const zoneListeners = new Set<() => void>();

export function setMeshScrolling(active: boolean) {
  meshScrolling = active;
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('mesh-scrolling', active);
}

export function isMeshScrolling() {
  return meshScrolling;
}

/** Blokuje flip strefy podczas morphu — zapobiega bugowi scrolla przy zmianie kierunku. */
export function setMorphZoneLock(zone: MeshZone | null) {
  morphZoneLock = zone;
}

export function readMorphZoneLock(): MeshZone | null {
  return morphZoneLock;
}

export function readMeshZone(): MeshZoneSnapshot {
  return snapshot;
}

/** Aktualizacja z pętli RAF — React tylko przy zmianie strefy. */
export function publishMeshZone(next: MeshZoneSnapshot): void {
  const zoneChanged = snapshot.zone !== next.zone;
  const paletteChanged = snapshot.paletteAim !== next.paletteAim;
  if (!zoneChanged && !paletteChanged) return;

  snapshot = next;
  if (zoneChanged) {
    for (const fn of zoneListeners) fn();
  }
}

export function subscribeMeshZone(fn: () => void): () => void {
  zoneListeners.add(fn);
  return () => {
    zoneListeners.delete(fn);
  };
}
