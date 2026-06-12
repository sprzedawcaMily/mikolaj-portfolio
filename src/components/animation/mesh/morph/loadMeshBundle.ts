import {
  parseKamochiEyeSvg,
  parseWhiteZonePathPoints,
  pointInEyeIris,
  segmentMidpointInEyeIris,
} from '@/components/animation/parseKamochiEyeSvg';
import { parseFaceMesh } from '@/components/animation/mesh/faceMesh';
import { parsePaletteSvgMesh } from '@/components/animation/mesh/parsePaletteMesh';
import { parseSvgMesh, type SvgMesh } from '@/components/animation/mesh/svgMesh';
import { MESH_ASSETS } from '@/data/meshAssets';
import type { MeshZone } from '@/hooks/meshScrollEngine';
import type { EyeWhiteHull, MeshBundle } from './types';

type DeferredRaw = {
  busSvg: string | null;
  forkSvg: string | null;
  spraySvg: string | null;
  loupeSvg: string | null;
  ringSvg: string | null;
  eyeSvg: string | null;
  arrowSvg: string | null;
};

function parseEyeMesh(svgText: string): SvgMesh {
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
  const hull = doc.querySelector('path[fill="#D9D9D9"]');
  hull?.remove();
  for (const el of doc.querySelectorAll(
    'circle[fill="#FF0000"], circle[fill="#00FF62"], circle[fill="#ff0000"], circle[fill="#00ff62"]',
  )) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('line[stroke="#FF0000"], line[stroke="#ff0000"]')) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('path[fill="#FF0000"], path[fill="#00FF62"]')) {
    el.remove();
  }
  for (const el of doc.querySelectorAll('circle[fill="#D9D9D9"]')) {
    const cx = Number(el.getAttribute('cx'));
    const cy = Number(el.getAttribute('cy'));
    if (Number.isFinite(cx) && Number.isFinite(cy) && pointInEyeIris(cx, cy)) {
      el.remove();
    }
  }
  for (const el of doc.querySelectorAll('line')) {
    const x1 = Number(el.getAttribute('x1'));
    const y1 = Number(el.getAttribute('y1'));
    const x2 = Number(el.getAttribute('x2'));
    const y2 = Number(el.getAttribute('y2'));
    if ([x1, y1, x2, y2].every(Number.isFinite) && segmentMidpointInEyeIris(x1, y1, x2, y2, 1.05)) {
      el.remove();
    }
  }
  return parseSvgMesh(new XMLSerializer().serializeToString(doc), { strictLineSnap: true });
}

async function fetchSvg(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

function parseDeferredZones(
  zoneMeshes: Partial<Record<MeshZone, SvgMesh>>,
  raw: DeferredRaw,
): EyeWhiteHull | null {
  let eyeWhiteHull: EyeWhiteHull | null = null;
  if (raw.busSvg) zoneMeshes.bus = parseSvgMesh(raw.busSvg, { strictLineSnap: true });
  if (raw.forkSvg) zoneMeshes.fork = parseSvgMesh(raw.forkSvg, { strictLineSnap: false });
  if (raw.spraySvg) zoneMeshes.spray = parseSvgMesh(raw.spraySvg, { strictLineSnap: true });
  if (raw.loupeSvg) zoneMeshes.loupe = parseSvgMesh(raw.loupeSvg, { strictLineSnap: true });
  if (raw.ringSvg) zoneMeshes.ring = parseSvgMesh(raw.ringSvg, { strictLineSnap: true });
  if (raw.eyeSvg) {
    const eyeMesh = parseEyeMesh(raw.eyeSvg);
    zoneMeshes.careerEye = eyeMesh;
    zoneMeshes.skillsEye = eyeMesh;
    const eyeParsed = parseKamochiEyeSvg(raw.eyeSvg);
    if (eyeParsed.whiteZonePath) {
      eyeWhiteHull = {
        path: eyeParsed.whiteZonePath,
        points: parseWhiteZonePathPoints(eyeParsed.whiteZonePath),
      };
    }
  }
  if (raw.arrowSvg) {
    zoneMeshes.contactArrow = parseSvgMesh(raw.arrowSvg, { strictLineSnap: true });
  }
  return eyeWhiteHull;
}

async function fetchDeferredRaw(): Promise<DeferredRaw> {
  const [busSvg, forkSvg, spraySvg, loupeSvg, ringSvg, eyeSvg, arrowSvg] = await Promise.all([
    fetchSvg(MESH_ASSETS.bus),
    fetchSvg(MESH_ASSETS.fork),
    fetchSvg(MESH_ASSETS.spray),
    fetchSvg(MESH_ASSETS.loupe),
    fetchSvg(MESH_ASSETS.ring),
    fetchSvg(MESH_ASSETS.eye),
    fetchSvg(MESH_ASSETS.contactArrow),
  ]);
  return { busSvg, forkSvg, spraySvg, loupeSvg, ringSvg, eyeSvg, arrowSvg };
}

function scheduleIdleWork(fn: () => void) {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(fn, { timeout: 2400 });
  } else {
    window.setTimeout(fn, 0);
  }
}

function expandDeferredZones(
  bundle: MeshBundle,
  expandListeners: Set<() => void>,
  raw: DeferredRaw,
) {
  bundle.eyeWhiteHull = parseDeferredZones(bundle.zoneMeshes, raw);
  bundle.zonesReady = true;
  for (const fn of expandListeners) fn();
  expandListeners.clear();
}

/** Twarz + paleta od razu; reszta stref fetch + parse w idle — szybszy first paint. */
export async function loadMeshBundle(): Promise<MeshBundle> {
  const [faceSvg, paletteSvg] = await Promise.all([
    fetch(MESH_ASSETS.hero).then((r) => r.text()),
    fetchSvg(MESH_ASSETS.palette),
  ]);

  const zoneMeshes: Partial<Record<MeshZone, SvgMesh>> = {};
  if (paletteSvg) zoneMeshes.palette = parsePaletteSvgMesh(paletteSvg);

  const expandListeners = new Set<() => void>();
  const bundle: MeshBundle = {
    faceMesh: parseFaceMesh(faceSvg),
    zoneMeshes,
    eyeWhiteHull: null,
    zonesReady: false,
    onZonesExpanded: (fn) => {
      if (bundle.zonesReady) {
        fn();
        return () => {};
      }
      expandListeners.add(fn);
      return () => {
        expandListeners.delete(fn);
      };
    },
  };

  void fetchDeferredRaw().then((raw) => {
    scheduleIdleWork(() => expandDeferredZones(bundle, expandListeners, raw));
  });

  return bundle;
}
