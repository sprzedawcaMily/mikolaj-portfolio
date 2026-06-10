import type { NormPt, SourceSnapshot, ZoneSnapshot } from './types';

export type ZoneDotSnapshot = Pick<
  ZoneSnapshot,
  'goals' | 'mappedIds' | 'splits' | 'layoutW' | 'layoutH'
>;

export type CatalogDot = {
  index: number;
  key: string;
  norm: NormPt;
};

/** Para morphu: ten sam hostId w obu SVG = ta sama kropka. */
export type HostMorphPair = {
  /** slot w mapie kropek — hostId lub hash supplementu */
  slot: number;
  hostId: number | null;
  splitKey: string | null;
  src: NormPt | null;
  tgt: NormPt | null;
};

/** @deprecated alias */
export type IndexedDotPair = {
  index: number;
  src: NormPt | null;
  tgt: NormPt | null;
  srcKey: string | null;
  tgtKey: string | null;
};

function splitSlot(hostId: number, idx: number) {
  return 1_000_000 + hostId * 32 + idx;
}

export function sortDotKeys(a: string, b: string) {
  const hostRank = (key: string) => (key.startsWith('h:') ? 0 : 1);
  const ra = hostRank(a);
  const rb = hostRank(b);
  if (ra !== rb) return ra - rb;
  if (a.startsWith('h:') && b.startsWith('h:')) {
    return Number(a.slice(2)) - Number(b.slice(2));
  }
  return a.localeCompare(b);
}

function collectSplitKeys(snapshot: ZoneDotSnapshot) {
  const keys = new Set<string>();
  for (const [hostId, pts] of snapshot.splits) {
    pts.forEach((_, i) => keys.add(`${hostId}:${i}`));
  }
  return keys;
}

/**
 * Pary wyłącznie po ID hosta / kluczu splitu — nie po pozycji na ekranie.
 * Host 12 w busie → host 12 w forku.
 */
export function buildHostMorphPairs(
  source: SourceSnapshot,
  target: ZoneSnapshot,
): HostMorphPair[] {
  const pairs: HostMorphPair[] = [];
  const hostIds = new Set([...source.mappedIds, ...target.mappedIds]);
  const sortedHosts = [...hostIds].sort((a, b) => a - b);

  for (const hostId of sortedHosts) {
    pairs.push({
      slot: hostId,
      hostId,
      splitKey: null,
      src: source.goals.get(hostId) ?? null,
      tgt: target.goals.get(hostId) ?? null,
    });
  }

  const splitKeys = new Set([
    ...collectSplitKeys(source),
    ...collectSplitKeys(target),
  ]);
  for (const key of [...splitKeys].sort()) {
    const [hostIdStr, idxStr] = key.split(':');
    const hostId = Number(hostIdStr);
    const idx = Number(idxStr);
    if (!Number.isFinite(hostId) || !Number.isFinite(idx)) continue;
    pairs.push({
      slot: splitSlot(hostId, idx),
      hostId: null,
      splitKey: key,
      src: source.splits.get(hostId)?.[idx] ?? null,
      tgt: target.splits.get(hostId)?.[idx] ?? null,
    });
  }

  return pairs;
}

/** @deprecated */
export function buildIndexedDotPairs(
  source: SourceSnapshot,
  target: ZoneSnapshot,
): IndexedDotPair[] {
  return buildHostMorphPairs(source, target).map((p) => ({
    index: p.slot,
    src: p.src,
    tgt: p.tgt,
    srcKey: p.hostId != null ? `h:${p.hostId}` : p.splitKey ? `s:${p.splitKey}` : null,
    tgtKey: p.hostId != null ? `h:${p.hostId}` : p.splitKey ? `s:${p.splitKey}` : null,
  }));
}

export function buildDepartureRanks(pairs: HostMorphPair[]): Map<number, number> {
  const entries = pairs.map((p) => ({
    slot: p.slot,
    ny: p.src?.ny ?? p.tgt?.ny ?? 0.5,
    id: p.hostId ?? p.slot,
  }));
  entries.sort((a, b) => {
    const dny = b.ny - a.ny;
    if (Math.abs(dny) > 0.0005) return dny;
    return a.id - b.id;
  });
  const ranks = new Map<number, number>();
  entries.forEach((e, i) => ranks.set(e.slot, i));
  return ranks;
}

export function catalogZoneDots(snapshot: ZoneDotSnapshot): CatalogDot[] {
  const entries: { key: string; nx: number; ny: number }[] = [];
  for (const id of snapshot.mappedIds) {
    const g = snapshot.goals.get(id);
    if (g) entries.push({ key: `h:${id}`, nx: g.nx, ny: g.ny });
  }
  for (const [hostId, pts] of snapshot.splits) {
    pts.forEach((p, i) => {
      entries.push({ key: `s:${hostId}:${i}`, nx: p.nx, ny: p.ny });
    });
  }
  const sorted = entries.sort((a, b) => sortDotKeys(a.key, b.key));
  return sorted.map((e, i) => ({
    index: i + 1,
    key: e.key,
    norm: { nx: e.nx, ny: e.ny },
  }));
}

export function zoneDotCount(snapshot: ZoneDotSnapshot): number {
  let n = snapshot.mappedIds.size;
  for (const pts of snapshot.splits.values()) n += pts.length;
  return n;
}

export function hostRanksFromPairs(
  pairs: HostMorphPair[],
  side: 'src' | 'tgt',
): Map<number, number> {
  const ranks = new Map<number, number>();
  for (const pair of pairs) {
    if (pair.hostId == null) continue;
    const has = side === 'tgt' ? pair.tgt : pair.src;
    if (has) ranks.set(pair.hostId, pair.slot);
  }
  return ranks;
}

/** @deprecated */
export function sourceHostRanks(source: ZoneDotSnapshot): Map<number, number> {
  const ranks = new Map<number, number>();
  for (const id of source.mappedIds) ranks.set(id, id);
  return ranks;
}

/** @deprecated */
export function targetHostRanks(target: ZoneSnapshot): Map<number, number> {
  const ranks = new Map<number, number>();
  for (const id of target.mappedIds) ranks.set(id, id);
  return ranks;
}

/** @deprecated */
export function travelSeedForPair(pair: { hostId?: number | null; slot?: number; index?: number }) {
  if (pair.hostId != null) return pair.hostId;
  return pair.slot ?? pair.index ?? 0;
}

export function logMorphPairing(
  fromZone: string,
  toZone: string,
  pairs: HostMorphPair[] | IndexedDotPair[],
  srcCount: number,
  tgtCount: number,
) {
  if (!import.meta.env.DEV) return;
  console.group(
    `[mesh morph] ${fromZone} → ${toZone} | hostId pairing | src=${srcCount} tgt=${tgtCount}`,
  );
  for (const p of pairs) {
    const label = 'hostId' in p && (p as HostMorphPair).hostId != null
      ? `h:${(p as HostMorphPair).hostId}`
      : (p as HostMorphPair).splitKey
        ? `s:${(p as HostMorphPair).splitKey}`
        : (p as IndexedDotPair).srcKey ?? '?';
    const src = p.src ? `(${p.src.nx.toFixed(3)},${p.src.ny.toFixed(3)})` : '—';
    const tgt = p.tgt ? `(${p.tgt.nx.toFixed(3)},${p.tgt.ny.toFixed(3)})` : '—';
    console.log(`  ${label}: ${src} → ${tgt}`);
  }
  console.groupEnd();
}

export function logZoneDotCounts(
  zones: { zone: string; snapshot: ZoneDotSnapshot | null }[],
) {
  if (!import.meta.env.DEV) return;
  const rows = zones
    .filter((z): z is { zone: string; snapshot: ZoneDotSnapshot } => Boolean(z.snapshot))
    .map((z) => ({ zone: z.zone, count: zoneDotCount(z.snapshot) }));
  console.group('[mesh dots] per zone');
  for (const row of rows) console.log(`  ${row.zone}: ${row.count}`);
  console.groupEnd();
}

export function logZoneCatalog(zone: string, snapshot: ZoneDotSnapshot) {
  if (!import.meta.env.DEV) return;
  const catalog = catalogZoneDots(snapshot);
  console.group(`[mesh dots] ${zone}`);
  for (const dot of catalog) {
    console.log(`  ${dot.key} @ (${dot.norm.nx.toFixed(3)}, ${dot.norm.ny.toFixed(3)})`);
  }
  console.groupEnd();
}
