import type { MeshZone } from '@/hooks/meshScrollEngine';

export type MeshPerfPhases = {
  pins: number;
  sync: number;
  syncLayout: number;
  syncEnsureDots: number;
  atlasBuild: number;
  step: number;
  paintDots: number;
  paintWires: number;
  total: number;
};

export type MeshPerfSpikeKind = 'mesh' | 'frameGap' | 'longTask';

export type MeshPerfSpike = {
  kind: MeshPerfSpikeKind;
  ms: number;
  when: number;
  frameGapMs: number;
  rafWorkMs: number;
  tickMs: number;
  zone: MeshZone | '—';
  zoneChanged: boolean;
  morphFlying: boolean;
  morphBuildT: number;
  activeDots: number;
  scrolling: boolean;
  label: string;
  phases: MeshPerfPhases;
  atlasKey: string;
  detail?: string;
};

export type MeshPerfStats = {
  fps: number;
  /** Przerwa między klatkami RAF — to odczuwasz jako „zatrzymanie”. */
  frameMs: number;
  frameGapMs: number;
  rafWorkMs: number;
  meshTickMs: number;
  paintDotsMs: number;
  paintWiresMs: number;
  activeDots: number;
  visibleDots: number;
  domPaints: number;
  canvasDots: number;
  wireEdges: number;
  zone: MeshZone | '—';
  morphBuildT: number;
  morphFlying: boolean;
  peakFrameMs: number;
  lastAtlasBuildMs: number;
  lastAtlasBuildKey: string;
  phases: MeshPerfPhases;
  spikes: MeshPerfSpike[];
  prewarmDone: boolean;
};

const EMPTY_PHASES: MeshPerfPhases = {
  pins: 0,
  sync: 0,
  syncLayout: 0,
  syncEnsureDots: 0,
  atlasBuild: 0,
  step: 0,
  paintDots: 0,
  paintWires: 0,
  total: 0,
};

const DEFAULT_STATS: MeshPerfStats = {
  fps: 0,
  frameMs: 0,
  frameGapMs: 0,
  rafWorkMs: 0,
  meshTickMs: 0,
  paintDotsMs: 0,
  paintWiresMs: 0,
  activeDots: 0,
  visibleDots: 0,
  domPaints: 0,
  canvasDots: 0,
  wireEdges: 0,
  zone: '—',
  morphBuildT: 1,
  morphFlying: false,
  peakFrameMs: 0,
  lastAtlasBuildMs: 0,
  lastAtlasBuildKey: '',
  phases: { ...EMPTY_PHASES },
  spikes: [],
  prewarmDone: false,
};

const LOG_PREFIX = '[mesh-perf]';
const SPIKE_THRESHOLD_MS = 48;
const SPIKE_HISTORY = 8;
const SPIKE_LOG_MAX = 100;
const ATLAS_LOG_THRESHOLD_MS = 40;
const FPS_WINDOW = 45;
const SCROLL_RECENT_MS = 280;
const REVEAL_CORRELATE_MS = 350;

let stats: MeshPerfStats = { ...DEFAULT_STATS, phases: { ...EMPTY_PHASES }, spikes: [] };
const listeners = new Set<() => void>();
const spikeLog: MeshPerfSpike[] = [];

const fpsSamples: number[] = [];

let lastTickPhases: MeshPerfPhases = { ...EMPTY_PHASES };
let lastTickZone: MeshZone | '—' = '—';
let lastTickZoneChanged = false;
let lastTickMs = 0;
let lastTickMorphFlying = false;
let lastTickMorphBuildT = 0;
let lastTickActiveDots = 0;
let lastScrollAt = 0;
let consoleApiInstalled = false;
let longTaskObserver: PerformanceObserver | null = null;
let fileFlushTimer: ReturnType<typeof setTimeout> | null = null;
let sessionStartedAt = 0;
const flushedSpikeWhen = new Set<number>();

type RecentReveal = { label: string; at: number };
const recentReveals: RecentReveal[] = [];

export function readMeshPerfStats(): MeshPerfStats {
  return stats;
}

export function getMeshPerfSpikeLog(): readonly MeshPerfSpike[] {
  return spikeLog;
}

export function markScrollActivity() {
  lastScrollAt = performance.now();
}

let scrollIntentListenerAttached = false;

/** Wheel / touch przed scroll — mesh ma ustąpić natychmiast, nie dopiero po evencie scroll. */
export function attachScrollIntentTracking() {
  if (scrollIntentListenerAttached || typeof window === 'undefined') return;
  scrollIntentListenerAttached = true;
  const bump = () => markScrollActivity();
  window.addEventListener('wheel', bump, { passive: true });
  window.addEventListener('touchmove', bump, { passive: true });
  window.addEventListener(
    'keydown',
    (e) => {
      const k = e.key;
      if (
        k === 'ArrowUp'
        || k === 'ArrowDown'
        || k === 'PageUp'
        || k === 'PageDown'
        || k === 'Home'
        || k === 'End'
        || k === ' '
      ) {
        bump();
      }
    },
    { passive: true },
  );
}

export function markScrollReveal(label: string) {
  const at = performance.now();
  recentReveals.push({ label, at });
  if (recentReveals.length > 12) recentReveals.shift();
}

export function isScrollingRecently() {
  return performance.now() - lastScrollAt < SCROLL_RECENT_MS;
}

function wasScrollingRecently() {
  return isScrollingRecently();
}

function recentRevealHint(): string | undefined {
  const now = performance.now();
  const hit = recentReveals.find((r) => now - r.at < REVEAL_CORRELATE_MS);
  return hit?.label;
}

export type MeshPerfReport = {
  type: 'report';
  updatedAt: string;
  session: {
    startedAt: string;
    url: string;
    slow: boolean;
    lite: boolean;
    viewport: { w: number; h: number };
    userAgent: string;
  };
  summary: {
    spikeCount: number;
    byKind: Record<MeshPerfSpikeKind, number>;
    byZone: Record<string, number>;
    byLabel: Array<{ label: string; count: number; maxMs: number }>;
    fps: number;
    peakFrameMs: number;
    frameGapMs: number;
    rafWorkMs: number;
    meshTickMs: number;
    zone: MeshZone | '—';
    prewarmDone: boolean;
  };
  spikes: MeshPerfSpike[];
  stats: MeshPerfStats;
};

function sessionMeta() {
  const params = new URLSearchParams(window.location.search);
  return {
    startedAt: new Date(sessionStartedAt || Date.now()).toISOString(),
    url: window.location.href,
    slow: params.has('slow'),
    lite: params.has('lite') || params.has('slow') || params.has('perf'),
    viewport: { w: window.innerWidth, h: window.innerHeight },
    userAgent: navigator.userAgent,
  };
}

function buildLabelSummary(spikes: readonly MeshPerfSpike[]) {
  const map = new Map<string, { count: number; maxMs: number }>();
  for (const spike of spikes) {
    const hit = map.get(spike.label) ?? { count: 0, maxMs: 0 };
    hit.count += 1;
    hit.maxMs = Math.max(hit.maxMs, spike.ms);
    map.set(spike.label, hit);
  }
  return [...map.entries()]
    .map(([label, data]) => ({ label, ...data }))
    .sort((a, b) => b.maxMs - a.maxMs || b.count - a.count)
    .slice(0, 20);
}

export function buildMeshPerfReport(): MeshPerfReport {
  const spikes = [...spikeLog];
  const byKind: Record<MeshPerfSpikeKind, number> = {
    mesh: 0,
    frameGap: 0,
    longTask: 0,
  };
  const byZone: Record<string, number> = {};
  for (const spike of spikes) {
    byKind[spike.kind] += 1;
    const zone = String(spike.zone);
    byZone[zone] = (byZone[zone] ?? 0) + 1;
  }

  return {
    type: 'report',
    updatedAt: new Date().toISOString(),
    session: sessionMeta(),
    summary: {
      spikeCount: spikes.length,
      byKind,
      byZone,
      byLabel: buildLabelSummary(spikes),
      fps: stats.fps,
      peakFrameMs: stats.peakFrameMs,
      frameGapMs: stats.frameGapMs,
      rafWorkMs: stats.rafWorkMs,
      meshTickMs: stats.meshTickMs,
      zone: stats.zone,
      prewarmDone: stats.prewarmDone,
    },
    spikes,
    stats: readMeshPerfStats(),
  };
}

async function postPerfPayload(payload: unknown) {
  if (!import.meta.env.DEV || typeof fetch === 'undefined') return false;
  try {
    const res = await fetch('/__mesh-perf/log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function flushSpikeToFile(spike: MeshPerfSpike) {
  if (!import.meta.env.DEV || flushedSpikeWhen.has(spike.when)) return;
  flushedSpikeWhen.add(spike.when);
  await postPerfPayload({ type: 'spike', spike });
}

function scheduleReportFlush() {
  if (!import.meta.env.DEV) return;
  if (fileFlushTimer) return;
  fileFlushTimer = setTimeout(() => {
    fileFlushTimer = null;
    void saveMeshPerfReport();
  }, 3000);
}

export async function saveMeshPerfReport(): Promise<boolean> {
  if (!import.meta.env.DEV) return false;
  return postPerfPayload(buildMeshPerfReport());
}

export function dumpMeshPerfSpikes(): void {
  if (spikeLog.length === 0) {
    console.info(`${LOG_PREFIX} brak zarejestrowanych spike'ów (próg ${SPIKE_THRESHOLD_MS} ms)`);
    return;
  }
  console.group(`${LOG_PREFIX} historia spike'ów (${spikeLog.length})`);
  console.table(
    spikeLog.map((s) => ({
      czas: new Date(s.when).toLocaleTimeString(),
      typ: s.kind,
      ms: +s.ms.toFixed(1),
      gap: +s.frameGapMs.toFixed(1),
      raf: +s.rafWorkMs.toFixed(1),
      tick: +s.tickMs.toFixed(1),
      scroll: s.scrolling ? 'tak' : '—',
      strefa: s.zoneChanged ? `${s.zone} Δ` : s.zone,
      winowajca: s.label,
      detail: s.detail ?? '—',
    })),
  );
  console.groupEnd();
  void saveMeshPerfReport().then((ok) => {
    if (ok) {
      console.info(`${LOG_PREFIX} zapisano raport → logs/mesh-perf-report.json`);
    }
  });
}

function installConsoleApi() {
  if (consoleApiInstalled || typeof window === 'undefined' || !isPerfMonitorEnabled()) return;
  consoleApiInstalled = true;

  const api = {
    spikes: () => spikeLog,
    dump: dumpMeshPerfSpikes,
    stats: readMeshPerfStats,
    report: buildMeshPerfReport,
    save: saveMeshPerfReport,
    clear: () => {
      spikeLog.length = 0;
      recentReveals.length = 0;
      flushedSpikeWhen.clear();
      publishMeshPerfStats({ spikes: [], peakFrameMs: 0 });
      console.info(`${LOG_PREFIX} wyczyszczono log spike'ów`);
    },
  };

  Object.defineProperty(window, '__meshPerf', {
    value: api,
    enumerable: true,
    configurable: true,
  });

  console.info(
    `${LOG_PREFIX} logowanie aktywne — dump: __meshPerf.dump() · plik: logs/mesh-perf-report.json`,
  );
}

function startLongTaskObserver() {
  if (longTaskObserver || typeof PerformanceObserver === 'undefined') return;

  try {
    longTaskObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.duration < SPIKE_THRESHOLD_MS) continue;
        const attribution = (
          entry as PerformanceEntry & {
            attribution?: Array<{ name?: string; containerType?: string }>;
          }
        ).attribution?.[0];
        const attrName = attribution?.name || attribution?.containerType || '';
        recordLongTaskSpike(entry.duration, attrName, entry.name);
      }
    });
    longTaskObserver.observe({ type: 'longtask', buffered: true } as PerformanceObserverInit);
    logPerfEvent('longtask observer aktywny');
  } catch {
    logPerfEvent('longtask observer niedostępny w tej przeglądarce');
  }
}

export function publishMeshPerfStats(partial: Partial<MeshPerfStats>) {
  stats = { ...stats, ...partial };
  for (const fn of listeners) fn();
}

export function publishTickPhases(phases: Partial<MeshPerfPhases> & { total: number }) {
  lastTickPhases = { ...EMPTY_PHASES, ...phases };
  stats = { ...stats, phases: lastTickPhases };
}

export function setTickSpikeContext(
  zone: MeshZone | '—',
  zoneChanged: boolean,
  tickMs: number,
  extra?: {
    morphFlying?: boolean;
    morphBuildT?: number;
    activeDots?: number;
  },
) {
  if (zoneChanged && isPerfMonitorEnabled() && zone !== lastTickZone) {
    console.info(`${LOG_PREFIX} zmiana strefy: ${lastTickZone} → ${zone}`);
  }

  lastTickZone = zone;
  lastTickZoneChanged = zoneChanged;
  lastTickMs = tickMs;
  lastTickMorphFlying = extra?.morphFlying ?? stats.morphFlying;
  lastTickMorphBuildT = extra?.morphBuildT ?? stats.morphBuildT;
  lastTickActiveDots = extra?.activeDots ?? stats.activeDots;
}

function spikeLabel(phases: MeshPerfPhases): string {
  const entries: [string, number][] = [
    ['buildDotAtlas', phases.atlasBuild],
    ['syncFlyingTargets', phases.sync],
    ['ensureDot DOM', phases.syncEnsureDots],
    ['layout lookup', phases.syncLayout],
    ['paintWires', phases.paintWires],
    ['paintDots', phases.paintDots],
    ['stepFlight', phases.step],
    ['computePins', phases.pins],
  ];
  entries.sort((a, b) => b[1] - a[1]);
  const top = entries.find(([, ms]) => ms >= 8);
  return top?.[0] ?? 'inne (mesh)';
}

function frameGapLabel(scrolling: boolean): string {
  const reveal = recentRevealHint();
  if (reveal) return `frameGap + reveal: ${reveal}`;
  if (scrolling) return 'frameGap (scroll / React / layout)';
  return 'frameGap (główny wątek)';
}

function pushSpike(spike: MeshPerfSpike) {
  spikeLog.unshift(spike);
  if (spikeLog.length > SPIKE_LOG_MAX) spikeLog.pop();
  logSpikeToConsole(spike);
  void flushSpikeToFile(spike);
  scheduleReportFlush();
  const spikes = [spike, ...stats.spikes].slice(0, SPIKE_HISTORY);
  publishMeshPerfStats({
    spikes,
    peakFrameMs: Math.max(stats.peakFrameMs * 0.98, spike.ms),
  });
}

function logSpikeToConsole(spike: MeshPerfSpike) {
  if (!isPerfMonitorEnabled()) return;

  installConsoleApi();

  const severity = spike.ms >= 120 ? 'error' : spike.ms >= 72 ? 'warn' : 'info';
  const time = new Date(spike.when).toLocaleTimeString();
  const zoneTag = spike.zoneChanged ? `${spike.zone} (Δ strefa)` : String(spike.zone);

  const headline =
    `${LOG_PREFIX} [${spike.kind}] ${spike.ms.toFixed(1)} ms @ ${time} — ${spike.label} · ${zoneTag}`;

  console[severity](headline, {
    kind: spike.kind,
    frameGapMs: +spike.frameGapMs.toFixed(2),
    rafWorkMs: +spike.rafWorkMs.toFixed(2),
    tickMs: +spike.tickMs.toFixed(2),
    scrolling: spike.scrolling,
    morphFlying: spike.morphFlying,
    morphBuildT: +spike.morphBuildT.toFixed(3),
    activeDots: spike.activeDots,
    atlasKey: spike.atlasKey || null,
    detail: spike.detail ?? null,
    phases: spike.kind === 'mesh' ? { ...spike.phases } : undefined,
  });
}

function makeSpikeBase(
  kind: MeshPerfSpikeKind,
  ms: number,
  frameGapMs: number,
  rafWorkMs: number,
  label: string,
  detail?: string,
): MeshPerfSpike {
  const scrolling = wasScrollingRecently();
  return {
    kind,
    ms,
    when: Date.now(),
    frameGapMs,
    rafWorkMs,
    tickMs: lastTickMs,
    zone: lastTickZone,
    zoneChanged: lastTickZoneChanged,
    morphFlying: lastTickMorphFlying,
    morphBuildT: lastTickMorphBuildT,
    activeDots: lastTickActiveDots,
    scrolling,
    label,
    phases: { ...lastTickPhases },
    atlasKey: stats.lastAtlasBuildKey,
    detail,
  };
}

function recordSpike(rafWorkMs: number, frameGapMs: number) {
  const tickMs = lastTickMs;
  const gapSpike = frameGapMs >= SPIKE_THRESHOLD_MS;
  const meshSpike = rafWorkMs >= SPIKE_THRESHOLD_MS || tickMs >= SPIKE_THRESHOLD_MS;

  if (!gapSpike && !meshSpike) return;

  const gapDominant =
    gapSpike && frameGapMs > Math.max(rafWorkMs, tickMs) + 10;

  /* Pauza RAF podczas scrolla — gap to czas scrolla, nie blokada wątku. */
  if (gapDominant && frameGapMs > 220 && rafWorkMs < 56 && tickMs < 56) {
    return;
  }

  if (gapDominant) {
    const scrolling = wasScrollingRecently();
    pushSpike(
      makeSpikeBase(
        'frameGap',
        frameGapMs,
        frameGapMs,
        rafWorkMs,
        frameGapLabel(scrolling),
        recentRevealHint(),
      ),
    );
    return;
  }

  if (meshSpike) {
    pushSpike(
      makeSpikeBase(
        'mesh',
        Math.max(rafWorkMs, tickMs),
        frameGapMs,
        rafWorkMs,
        spikeLabel(lastTickPhases),
      ),
    );
  }
}

function recordLongTaskSpike(durationMs: number, attribution: string, entryName: string) {
  if (!isPerfMonitorEnabled()) return;

  const detail = [attribution, entryName].filter(Boolean).join(' · ') || undefined;
  const label = attribution ? `longTask: ${attribution}` : 'longTask';

  pushSpike(
    makeSpikeBase('longTask', durationMs, 0, 0, label, detail),
  );
}

export function recordMeshFrameDuration(rafWorkMs: number, frameGapMs: number) {
  const gapForFps = frameGapMs > 0 ? frameGapMs : rafWorkMs;
  fpsSamples.push(gapForFps);
  if (fpsSamples.length > FPS_WINDOW) fpsSamples.shift();
  const avg = fpsSamples.reduce((a, b) => a + b, 0) / fpsSamples.length;

  publishMeshPerfStats({
    frameMs: gapForFps,
    frameGapMs,
    rafWorkMs,
    fps: avg > 0 ? Math.round(1000 / avg) : 0,
  });
  recordSpike(rafWorkMs, frameGapMs);
}

export function recordAtlasBuild(key: string, ms: number) {
  publishMeshPerfStats({
    lastAtlasBuildMs: ms,
    lastAtlasBuildKey: key,
    phases: { ...stats.phases, atlasBuild: ms },
  });
  lastTickPhases = { ...lastTickPhases, atlasBuild: ms };

  if (isPerfMonitorEnabled() && ms >= ATLAS_LOG_THRESHOLD_MS) {
    installConsoleApi();
    const severity = ms >= 120 ? 'warn' : 'info';
    console[severity](
      `${LOG_PREFIX} buildDotAtlas ${ms.toFixed(1)} ms — ${key}`,
      { key, ms: +ms.toFixed(2) },
    );
  }
}

export function logPerfEvent(
  event: string,
  detail?: Record<string, string | number | boolean | null>,
) {
  if (!isPerfMonitorEnabled()) return;
  installConsoleApi();
  console.info(`${LOG_PREFIX} ${event}`, detail ?? {});
}

export function subscribeMeshPerfStats(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function isPerfMonitorEnabled() {
  if (typeof window === 'undefined') return false;
  const params = new URLSearchParams(window.location.search);
  if (params.has('perf')) return true;
  if (import.meta.env.DEV) return true;
  return false;
}

/** Wywołaj raz przy starcie — udostępnia `window.__meshPerf` i long-task observer. */
export function initMeshPerfLogging() {
  if (!isPerfMonitorEnabled()) return;
  sessionStartedAt = Date.now();
  installConsoleApi();
  startLongTaskObserver();
  void saveMeshPerfReport();
}
