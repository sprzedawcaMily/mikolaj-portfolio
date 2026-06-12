/**
 * Ścieżki assetów mesh — jedna mapa dla loadMeshBundle, KamochiEye i skryptów diag.
 * Folder = sekcja/portfolio (nie wrzucaj lupy do kamochi itd.).
 */
export const MESH_ASSETS = {
  hero: '/images/profile/Group%205.svg?v=svg-mesh-6',
  palette: '/images/profile/paleta.svg?v=palette-mesh-6',
  bus: '/images/transitrank/autobus.svg?v=bus-mesh-17',
  fork: '/images/forkfull/widelec.svg?v=fork-mesh-6',
  spray: '/images/kamochi/sprej.svg?v=spray-mesh-5',
  loupe: '/images/legitcheck/lupa.svg?v=loupe-mesh-6',
  ring: '/images/stylerank/pierscionek.svg?v=ring-mesh-5',
  eye: '/images/experience/oko2.svg?v=eye-mesh-4',
  contactArrow: '/images/profile/strzalak.svg?v=contact-arrow-3',
} as const;

export type MeshAssetKey = keyof typeof MESH_ASSETS;
