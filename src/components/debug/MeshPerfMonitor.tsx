import { useEffect, useRef } from 'react';
import {
  initMeshPerfLogging,
  isPerfMonitorEnabled,
  readMeshPerfStats,
  subscribeMeshPerfStats,
  type MeshPerfSpike,
} from '@/hooks/meshPerfStats';
import styles from './MeshPerfMonitor.module.css';

function fmtMs(n: number) {
  return `${n.toFixed(1)} ms`;
}

function gradeClass(ms: number, warn: number, bad: number) {
  if (ms >= bad) return styles.bad;
  if (ms >= warn) return styles.warn;
  return styles.ok;
}

function fmtSpike(spike: MeshPerfSpike) {
  const t = new Date(spike.when);
  const time = `${t.getHours().toString().padStart(2, '0')}:${t.getMinutes().toString().padStart(2, '0')}:${t.getSeconds().toString().padStart(2, '0')}`;
  const zone = spike.zoneChanged ? `${spike.zone} Δ` : spike.zone;
  const kind = spike.kind === 'frameGap' ? 'GAP' : spike.kind === 'longTask' ? 'LONG' : 'mesh';
  return `${time} · ${kind} ${fmtMs(spike.ms)} · ${zone} · ${spike.label}`;
}

export function MeshPerfMonitor() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPerfMonitorEnabled()) return;
    initMeshPerfLogging();

    const root = rootRef.current;
    if (!root) return;

    const fields = {
      fps: root.querySelector('[data-k="fps"]'),
      frame: root.querySelector('[data-k="frame"]'),
      raf: root.querySelector('[data-k="raf"]'),
      tick: root.querySelector('[data-k="tick"]'),
      peak: root.querySelector('[data-k="peak"]'),
      dots: root.querySelector('[data-k="dots"]'),
      paint: root.querySelector('[data-k="paint"]'),
      wires: root.querySelector('[data-k="wires"]'),
      zone: root.querySelector('[data-k="zone"]'),
      morph: root.querySelector('[data-k="morph"]'),
      phases: root.querySelector('[data-k="phases"]'),
      atlas: root.querySelector('[data-k="atlas"]'),
      prewarm: root.querySelector('[data-k="prewarm"]'),
      spikes: root.querySelector('[data-k="spikes"]'),
    };

    function paint() {
      const s = readMeshPerfStats();
      const p = s.phases;

      if (fields.fps) {
        fields.fps.textContent = String(s.fps);
        fields.fps.className = `${styles.val} ${gradeClass(s.frameMs, 12, 20)}`;
      }
      if (fields.frame) {
        fields.frame.textContent = fmtMs(s.frameGapMs || s.frameMs);
        fields.frame.className = `${styles.val} ${gradeClass(s.frameGapMs || s.frameMs, 12, 20)}`;
      }
      if (fields.raf) {
        fields.raf.textContent = fmtMs(s.rafWorkMs);
        fields.raf.className = `${styles.val} ${gradeClass(s.rafWorkMs, 8, 14)}`;
      }
      if (fields.tick) {
        fields.tick.textContent = fmtMs(s.meshTickMs);
        fields.tick.className = `${styles.val} ${gradeClass(s.meshTickMs, 8, 14)}`;
      }
      if (fields.peak) {
        fields.peak.textContent = fmtMs(s.peakFrameMs);
        fields.peak.className = `${styles.val} ${gradeClass(s.peakFrameMs, 48, 120)}`;
      }
      if (fields.dots) {
        fields.dots.textContent = `${s.visibleDots} widocznych / ${s.activeDots} aktywnych`;
      }
      if (fields.paint) {
        fields.paint.textContent = `DOM ${s.domPaints} · canvas ${s.canvasDots} · ${fmtMs(s.paintDotsMs)}`;
      }
      if (fields.wires) {
        fields.wires.textContent = `${s.wireEdges} kresek · ${fmtMs(s.paintWiresMs)}`;
      }
      if (fields.zone) fields.zone.textContent = s.zone;
      if (fields.morph) {
        fields.morph.textContent = s.morphFlying
          ? `morph ${Math.round(s.morphBuildT * 100)}%`
          : 'ustalone';
      }
      if (fields.phases) {
        fields.phases.textContent = [
          `sync ${fmtMs(p.sync)}`,
          `atlas ${fmtMs(p.atlasBuild)}`,
          `ensure ${fmtMs(p.syncEnsureDots)}`,
          `paint ${fmtMs(p.paintDots + p.paintWires)}`,
        ].join(' · ');
      }
      if (fields.atlas) {
        fields.atlas.textContent = s.lastAtlasBuildKey
          ? `${s.lastAtlasBuildKey} · ${fmtMs(s.lastAtlasBuildMs)}`
          : '—';
      }
      if (fields.prewarm) {
        fields.prewarm.textContent = s.prewarmDone ? 'tak' : 'czeka…';
        fields.prewarm.className = `${styles.val} ${s.prewarmDone ? styles.ok : styles.warn}`;
      }
      if (fields.spikes) {
        fields.spikes.innerHTML = '';
        if (s.spikes.length === 0) {
          const li = document.createElement('li');
          li.textContent = 'brak spike’ów >48 ms';
          li.className = styles.spikeIdle;
          fields.spikes.appendChild(li);
        } else {
          for (const spike of s.spikes) {
            const li = document.createElement('li');
            li.textContent = fmtSpike(spike);
            li.className = spike.ms >= 120 ? styles.spikeBad : styles.spikeWarn;
            fields.spikes.appendChild(li);
          }
        }
      }
    }

    paint();
    return subscribeMeshPerfStats(paint);
  }, []);

  if (!isPerfMonitorEnabled()) return null;

  return (
    <div ref={rootRef} className={styles.panel} aria-live="polite" aria-label="Monitor wydajności mesha">
      <p className={styles.title}>Mesh perf</p>
      <dl className={styles.grid}>
        <dt>FPS</dt>
        <dd data-k="fps" className={styles.val}>—</dd>
        <dt>Przerwa klatki</dt>
        <dd data-k="frame" className={styles.val}>—</dd>
        <dt>RAF mesh</dt>
        <dd data-k="raf" className={styles.val}>—</dd>
        <dt>Peak</dt>
        <dd data-k="peak" className={styles.val}>—</dd>
        <dt>tickFlyingDots</dt>
        <dd data-k="tick" className={styles.val}>—</dd>
        <dt>Kropki</dt>
        <dd data-k="dots" className={styles.val}>—</dd>
        <dt>Malowanie</dt>
        <dd data-k="paint" className={styles.val}>—</dd>
        <dt>Kreski</dt>
        <dd data-k="wires" className={styles.val}>—</dd>
        <dt>Strefa</dt>
        <dd data-k="zone" className={styles.val}>—</dd>
        <dt>Morph</dt>
        <dd data-k="morph" className={styles.val}>—</dd>
        <dt>Fazy (ostatni tick)</dt>
        <dd data-k="phases" className={styles.val}>—</dd>
        <dt>Ostatni atlas</dt>
        <dd data-k="atlas" className={styles.val}>—</dd>
        <dt>Prewarm</dt>
        <dd data-k="prewarm" className={styles.val}>—</dd>
      </dl>
      <p className={styles.spikeTitle}>Spiki (&gt;48 ms)</p>
      <ul data-k="spikes" className={styles.spikeList} />
      <p className={styles.hint}>
        GAP = React/layout · auto-lite na słabszym sprzęcie · <code>?full=1</code> · <code>?lite=1</code>
      </p>
    </div>
  );
}
