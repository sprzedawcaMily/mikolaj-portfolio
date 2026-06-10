import {
  pointInEyeIris,
  segmentMidpointInEyeIris,
} from '@/components/animation/parseKamochiEyeSvg';
import { parseFaceMesh } from '@/components/animation/mesh/faceMesh';
import { parseSvgMesh, type SvgMesh } from '@/components/animation/mesh/svgMesh';
import type { MeshZone } from '@/hooks/meshScrollEngine';
import type { MeshBundle } from './types';

const FACE_SOURCE = '/images/profile/Group%205.svg?v=svg-mesh-5';
const ARROW_SOURCE = '/images/profile/Group%201.svg?v=arrow-mesh-5';
const BUS_SOURCE = '/images/transitrank/autobus.svg?v=bus-mesh-16';
const FORK_SOURCE = '/images/forkfull/widelec.svg?v=fork-mesh-5';
const SPRAY_SOURCE = '/images/kamochi/sprej.svg?v=spray-mesh-4';
const LOUPE_SOURCE = '/images/kamochi/lupa.svg?v=loupe-mesh-5';
const RING_SOURCE = '/images/kamochi/pierscionek.svg?v=ring-mesh-4';
const EYE_SOURCE = '/images/kamochi/oko2.svg?v=eye-mesh-3';

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

async function fetchSvg(url: string) {
  try {
    const res = await fetch(url);
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

export async function loadMeshBundle(): Promise<MeshBundle> {
  const [faceSvg, arrowSvg, busSvg, forkSvg, spraySvg, loupeSvg, ringSvg, eyeSvg] = await Promise.all([
    fetch(FACE_SOURCE).then((r) => r.text()),
    fetchSvg(ARROW_SOURCE),
    fetchSvg(BUS_SOURCE),
    fetchSvg(FORK_SOURCE),
    fetchSvg(SPRAY_SOURCE),
    fetchSvg(LOUPE_SOURCE),
    fetchSvg(RING_SOURCE),
    fetchSvg(EYE_SOURCE),
  ]);

  const zoneMeshes: Partial<Record<MeshZone, SvgMesh>> = {};
  if (arrowSvg) zoneMeshes.palette = parseSvgMesh(arrowSvg, { strictLineSnap: true });
  if (busSvg) zoneMeshes.bus = parseSvgMesh(busSvg, { strictLineSnap: true });
  if (forkSvg) zoneMeshes.fork = parseSvgMesh(forkSvg, { strictLineSnap: false });
  if (spraySvg) zoneMeshes.spray = parseSvgMesh(spraySvg, { strictLineSnap: true });
  if (loupeSvg) zoneMeshes.loupe = parseSvgMesh(loupeSvg, { strictLineSnap: true });
  if (ringSvg) zoneMeshes.ring = parseSvgMesh(ringSvg, { strictLineSnap: true });
  if (eyeSvg) {
    const eyeMesh = parseEyeMesh(eyeSvg);
    zoneMeshes.careerEye = eyeMesh;
    zoneMeshes.skillsEye = eyeMesh;
  }

  return { faceMesh: parseFaceMesh(faceSvg), zoneMeshes };
}
