import { useEffect, useId, useRef, useState } from 'react';
import { subscribeMeshFrame } from '@/hooks/meshAnimationLoop';
import { useMeshZone } from '@/context/MeshZoneContext';
import { readMeshMotionState } from '@/hooks/meshMotionState';
import { invalidateZonePinsCache, type MeshZone } from '@/hooks/meshScrollEngine';
import {
  EYE_CENTER,
  EYE_VIEWBOX,
  parseKamochiEyeSvg,
  type EyeIrisTrackMax,
  type KamochiEyeData,
} from './parseKamochiEyeSvg';
import {
  eyeBlinkClipScale,
  eyeBlinkCover,
  eyeBlinkTransform,
  eyeFirstRevealLayerOpacity,
  eyeIrisBlinkOpacity,
  eyeIrisWrapRevealOpacity,
  eyePupilBlinkOpacity,
  isEyeBlinkZone,
  readEyeIrisRevealOpened,
  type EyeBlinkZone,
} from './eyeBlink';
import { MESH_ASSETS } from '@/data/meshAssets';
import styles from './KamochiEye.module.css';

const EYE_SOURCE = MESH_ASSETS.eye;
const IRIS_TRACK_LERP = 0.14;
const IRIS_TRACK_QUANT = 1;
const TRACK_RECT_CACHE_MS = 120;
const FALLBACK_TRACK_MAX: EyeIrisTrackMax = { left: 240, right: 240, y: 85 };
const EYE_ORIGIN = `${(EYE_CENTER.x / EYE_VIEWBOX.w) * 100}% ${(EYE_CENTER.y / EYE_VIEWBOX.h) * 100}%`;

type Offset = { x: number; y: number };

type EyePaintCache = {
  hullPath: string;
  clipTransform: string;
  irisTrackTransform: string;
  eyeSquashTransform: string;
  irisOpacity: string;
  pupilOpacity: string;
  irisWrapOpacity: string;
  wrapTransform: string;
  wrapOpacity: string;
};

function easeIrisBuild(t: number) {
  const u = Math.max(0, Math.min(1, t));
  return u * u * (3 - 2 * u);
}

function lerpOffset(current: Offset, target: Offset): Offset {
  return {
    x: current.x + (target.x - current.x) * IRIS_TRACK_LERP,
    y: current.y + (target.y - current.y) * IRIS_TRACK_LERP,
  };
}

function clampAxis(value: number, negMax: number, posMax: number) {
  if (value < 0) return Math.max(value, -negMax);
  if (value > 0) return Math.min(value, posMax);
  return 0;
}

function quantizeTrack(v: number) {
  return Math.round(v / IRIS_TRACK_QUANT) * IRIS_TRACK_QUANT;
}

function readTrackingRect(anchorId: string | undefined, wrap: HTMLDivElement | null) {
  if (anchorId) {
    const anchor = document.getElementById(anchorId);
    if (anchor) return anchor.getBoundingClientRect();
  }
  return wrap?.getBoundingClientRect() ?? null;
}

function aimIrisOffset(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  mirrored: boolean,
  trackMax: EyeIrisTrackMax,
): Offset {
  const eyeX = rect.left + (EYE_CENTER.x / EYE_VIEWBOX.w) * rect.width;
  const eyeY = rect.top + (EYE_CENTER.y / EYE_VIEWBOX.h) * rect.height;
  const scaleX = EYE_VIEWBOX.w / rect.width;
  const scaleY = EYE_VIEWBOX.h / rect.height;
  const mirrorSign = mirrored ? -1 : 1;
  const dx = (clientX - eyeX) * scaleX * 0.6 * mirrorSign;
  const dy = (clientY - eyeY) * scaleY * 0.38;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return { x: 0, y: 0 };

  const radialCap = Math.max(trackMax.left, trackMax.right, trackMax.y);
  const radial = Math.min(1, radialCap / dist);
  return {
    x: clampAxis(dx * radial, trackMax.left, trackMax.right),
    y: clampAxis(dy * radial, trackMax.y, trackMax.y),
  };
}

/** Clip = dokładnie białe tło z SVG; przy mruganiu ta sama deformacja co mesh. */
function whiteZoneClipTransform(blinkCover: number) {
  const blink = eyeBlinkClipScale(blinkCover);
  if (blink.x >= 0.999 && blink.y >= 0.999) return '';
  const { x: cx, y: cy } = EYE_CENTER;
  return `translate(${cx} ${cy}) scale(${blink.x} ${blink.y}) translate(${-cx} ${-cy})`;
}

function setSvgTransform(el: SVGGElement | SVGPathElement | null, value: string) {
  if (!el) return;
  if (value) el.setAttribute('transform', value);
  else el.removeAttribute('transform');
}

function setClipTransform(
  clipPath: SVGPathElement | null,
  value: string,
  cache: EyePaintCache,
) {
  if (cache.clipTransform === value) return;
  cache.clipTransform = value;
  setSvgTransform(clipPath, value);
}

function hideEyeOverlay(
  cache: EyePaintCache,
  irisWrap: SVGGElement | null,
  irisG: SVGGElement | null,
  pupilG: SVGGElement | null,
  irisTrack: SVGGElement | null,
  eyeContent: SVGGElement | null,
  wrap: HTMLDivElement | null,
) {
  setLayerOpacity(irisWrap, 0, 'irisWrapOpacity', cache);
  setLayerOpacity(irisG, 0, 'irisOpacity', cache);
  setLayerOpacity(pupilG, 0, 'pupilOpacity', cache);
  if (cache.irisTrackTransform !== '') {
    cache.irisTrackTransform = '';
    setSvgTransform(irisTrack, '');
  }
  if (cache.eyeSquashTransform !== '') {
    cache.eyeSquashTransform = '';
    setSvgTransform(eyeContent, '');
  }
  if (wrap && cache.wrapOpacity !== '0') {
    cache.wrapOpacity = '0';
    wrap.style.opacity = '0';
    wrap.style.transform = '';
    cache.wrapTransform = '';
  }
}

function setLayerOpacity(
  el: SVGGElement | null,
  opacity: number,
  cacheKey: keyof EyePaintCache,
  cache: EyePaintCache,
) {
  if (!el) return;
  const key = opacity < 0.04 ? 'hidden' : String(opacity);
  if (cache[cacheKey] === key) return;
  cache[cacheKey] = key;
  if (key === 'hidden') {
    el.style.opacity = '0';
    el.style.visibility = 'hidden';
  } else {
    el.style.opacity = key;
    el.style.visibility = 'visible';
  }
}

type KamochiEyeProps = {
  className?: string;
  mirrored?: boolean;
  anchorId?: string;
  irisOnly?: boolean;
  meshZone?: MeshZone;
};

export function KamochiEye({
  className,
  mirrored = false,
  anchorId,
  irisOnly = false,
  meshZone,
}: KamochiEyeProps) {
  const uid = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<KamochiEyeData | null>(null);
  const [inView, setInView] = useState(false);
  const { zone: activeMeshZone } = useMeshZone();
  const zoneActive = meshZone == null || activeMeshZone === meshZone;
  const visible = inView && zoneActive;
  const blinkZone: EyeBlinkZone | null =
    meshZone != null && isEyeBlinkZone(meshZone) ? meshZone : null;
  const irisTargetRef = useRef<Offset>({ x: 0, y: 0 });
  const irisLiveRef = useRef<Offset>({ x: 0, y: 0 });
  const trackMaxRef = useRef<EyeIrisTrackMax>(FALLBACK_TRACK_MAX);
  const irisTrackRef = useRef<SVGGElement>(null);
  const eyeContentRef = useRef<SVGGElement>(null);
  const irisGRef = useRef<SVGGElement>(null);
  const pupilGRef = useRef<SVGGElement>(null);
  const irisWrapRef = useRef<SVGGElement>(null);
  const clipPathRef = useRef<SVGPathElement>(null);
  const trackRectCacheRef = useRef<{ rect: DOMRect | null; at: number }>({ rect: null, at: 0 });
  const visibleRef = useRef(visible);
  const reducedMotionRef = useRef(false);
  const paintCacheRef = useRef<EyePaintCache>({
    hullPath: '',
    clipTransform: '',
    irisTrackTransform: '',
    eyeSquashTransform: '',
    irisOpacity: '',
    pupilOpacity: '',
    irisWrapOpacity: '',
    wrapTransform: '',
    wrapOpacity: '',
  });
  visibleRef.current = visible;

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedMotionRef.current = reduced;
    let cancelled = false;
    fetch(EYE_SOURCE)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) {
          const parsed = parseKamochiEyeSvg(text);
          trackMaxRef.current = parsed.irisTrackMax;
          setData(parsed);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    invalidateZonePinsCache();
  }, [anchorId]);

  useEffect(() => {
    const target = anchorId ? document.getElementById(anchorId) : wrapRef.current;
    if (!target) return;

    const io = new IntersectionObserver(
      ([entry]) => {
        setInView(entry.isIntersecting && entry.intersectionRatio >= 0.05);
      },
      { threshold: [0, 0.05, 0.12, 0.28], rootMargin: '0px 0px -4% 0px' },
    );
    io.observe(target);
    return () => io.disconnect();
  }, [anchorId, data]);

  useEffect(() => {
    function readCachedTrackingRect() {
      const now = performance.now();
      const cache = trackRectCacheRef.current;
      if (cache.rect && now - cache.at < TRACK_RECT_CACHE_MS) return cache.rect;
      const rect = readTrackingRect(anchorId, wrapRef.current);
      trackRectCacheRef.current = { rect, at: now };
      return rect;
    }

    function onPointerMove(e: PointerEvent) {
      if (!visibleRef.current) return;
      const rect = readCachedTrackingRect();
      if (!rect || rect.width < 8) return;
      irisTargetRef.current = aimIrisOffset(
        e.clientX,
        e.clientY,
        rect,
        mirrored,
        trackMaxRef.current,
      );
    }

    function onPointerLeave() {
      irisTargetRef.current = { x: 0, y: 0 };
    }

    function bustRectCache() {
      trackRectCacheRef.current.at = 0;
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    window.addEventListener('scroll', bustRectCache, { passive: true });
    window.addEventListener('resize', bustRectCache);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', onPointerLeave);
      window.removeEventListener('scroll', bustRectCache);
      window.removeEventListener('resize', bustRectCache);
    };
  }, [mirrored, anchorId]);

  useEffect(() => {
    if (visible) return;
    hideEyeOverlay(
      paintCacheRef.current,
      irisWrapRef.current,
      irisGRef.current,
      pupilGRef.current,
      irisTrackRef.current,
      eyeContentRef.current,
      wrapRef.current,
    );
  }, [visible]);

  useEffect(() => {
    if (!data || reducedMotionRef.current) {
      if (reducedMotionRef.current) setInView(true);
      return;
    }

    return subscribeMeshFrame(() => {
      if (document.hidden) return;

      const irisTrack = irisTrackRef.current;
      const eyeContent = eyeContentRef.current;
      const irisG = irisGRef.current;
      const pupilG = pupilGRef.current;
      const irisWrap = irisWrapRef.current;
      const wrap = wrapRef.current;
      const cache = paintCacheRef.current;

      if (!visibleRef.current) {
        hideEyeOverlay(cache, irisWrap, irisG, pupilG, irisTrack, eyeContent, wrap);
        return;
      }

      if (!irisTrack || !eyeContent || !irisG || !pupilG || !irisWrap) return;

      const motion = readMeshMotionState();

      const track = lerpOffset(irisLiveRef.current, irisTargetRef.current);
      irisLiveRef.current = track;

      const now = performance.now();
      const blink = blinkZone ? eyeBlinkCover(blinkZone, now) : 0;
      const { morphSettled: settled, morphBuildT: buildT, eyeHullPathD, eyeFrame: meshFrame } = motion;
      const irisBuild = settled ? 1 : buildT;
      const revealOpened = blinkZone ? readEyeIrisRevealOpened(blinkZone) : false;
      const blinkActive = blink > 0.03;
      const vis = visibleRef.current;

      const qx = quantizeTrack(track.x);
      const qy = quantizeTrack(track.y);
      const irisTrackTransform = qx === 0 && qy === 0 ? '' : `translate(${qx} ${qy})`;
      if (cache.irisTrackTransform !== irisTrackTransform) {
        cache.irisTrackTransform = irisTrackTransform;
        setSvgTransform(irisTrack, irisTrackTransform);
      }

      const eyeSquashTransform = revealOpened && blinkActive ? eyeBlinkTransform(blink) : '';
      if (cache.eyeSquashTransform !== eyeSquashTransform) {
        cache.eyeSquashTransform = eyeSquashTransform;
        setSvgTransform(eyeContent, eyeSquashTransform);
      }

      const hullPath = eyeHullPathD || data.whiteZonePath || '';
      if (hullPath && cache.hullPath !== hullPath) {
        cache.hullPath = hullPath;
        clipPathRef.current?.setAttribute('d', hullPath);
      }

      const clipTransform = whiteZoneClipTransform(blink);
      setClipTransform(clipPathRef.current, clipTransform, cache);

      const firstRevealIris = blinkZone
        ? eyeFirstRevealLayerOpacity(blinkZone, blink, 'iris')
        : null;
      const irisRingOpacity = blinkZone
        ? (firstRevealIris ?? eyeIrisBlinkOpacity(blink))
        : 0;
      setLayerOpacity(irisG, irisRingOpacity, 'irisOpacity', cache);

      const firstRevealPupil = blinkZone
        ? eyeFirstRevealLayerOpacity(blinkZone, blink, 'pupil')
        : null;
      const pupilOpacity = blinkZone
        ? revealOpened
          ? eyePupilBlinkOpacity(blink)
          : (firstRevealPupil ?? eyePupilBlinkOpacity(blink))
        : 0;
      setLayerOpacity(pupilG, pupilOpacity, 'pupilOpacity', cache);

      const buildReveal = buildT > 0.06 ? easeIrisBuild(irisBuild) : 0;
      const irisReveal = blinkZone
        ? eyeIrisWrapRevealOpacity(blinkZone, blink) * buildReveal
        : buildReveal;

      if (irisOnly) {
        setLayerOpacity(irisWrap, vis ? irisReveal : 0, 'irisWrapOpacity', cache);
      }

      if (irisOnly && wrap) {
        const meshSynced = irisBuild >= 0.94 && meshFrame.ready;
        const meshAttach = meshSynced
          ? `translate3d(${meshFrame.ox}px, ${meshFrame.oy}px, 0)`
          : '';
        const wrapOpacity = vis ? '1' : '0';
        if (cache.wrapTransform !== meshAttach || cache.wrapOpacity !== wrapOpacity) {
          cache.wrapTransform = meshAttach;
          cache.wrapOpacity = wrapOpacity;
          wrap.style.opacity = wrapOpacity;
          wrap.style.transform = meshAttach;
          wrap.style.transformOrigin = EYE_ORIGIN;
        }
      }
    });
  }, [data, irisOnly, blinkZone]);

  const wrapClass = [
    styles.wrap,
    irisOnly && styles.irisOnly,
    !irisOnly && visible && styles.revealed,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  if (!data) {
    return <div ref={wrapRef} className={wrapClass} aria-hidden="true" />;
  }

  const whiteZoneClipId = `kamochi-eye-zone-${uid}`;
  const whiteClip = data.whiteZonePath ? `url(#${whiteZoneClipId})` : undefined;
  const whiteFrame = irisOnly ? '' : data.white;

  return (
    <div ref={wrapRef} className={wrapClass} aria-hidden="true">
      <svg
        className={[styles.svg, mirrored && styles.mirroredSvg].filter(Boolean).join(' ')}
        viewBox={`0 0 ${EYE_VIEWBOX.w} ${EYE_VIEWBOX.h}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {data.whiteZonePath ? (
            <clipPath id={whiteZoneClipId} clipPathUnits="userSpaceOnUse">
              <path ref={clipPathRef} d={data.whiteZonePath} />
            </clipPath>
          ) : null}
        </defs>

        {!irisOnly ? <g dangerouslySetInnerHTML={{ __html: data.back }} /> : null}

        <g ref={irisWrapRef} clipPath={whiteClip}>
          <g ref={irisTrackRef} className={styles.irisTrack}>
            <g ref={eyeContentRef}>
              <g ref={irisGRef} className={styles.redLayer}>
                {data.redCircles.map((dot, i) => (
                  <circle key={`rc-${i}`} cx={dot.cx} cy={dot.cy} r={dot.r} className={styles.irisDot} />
                ))}
                {data.redLines.map((line, i) => (
                  <line
                    key={`rl-${i}`}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className={styles.irisLine}
                    strokeWidth={2}
                  />
                ))}
              </g>
              <g ref={pupilGRef} className={styles.pupilLayer}>
                {[...data.pupilBridgeLines, ...data.pupilLines].map((line, i) => (
                  <line
                    key={`pl-${i}`}
                    x1={line.x1}
                    y1={line.y1}
                    x2={line.x2}
                    y2={line.y2}
                    className={styles.pupilLine}
                    strokeWidth={2}
                  />
                ))}
                {data.pupilCircles.map((dot, i) => (
                  <circle
                    key={`pg-${i}`}
                    cx={dot.cx}
                    cy={dot.cy}
                    r={dot.r}
                    className={styles.pupilDot}
                  />
                ))}
              </g>
            </g>
          </g>
        </g>

        {!irisOnly && whiteFrame ? (
          <g className={styles.whiteLayer} dangerouslySetInnerHTML={{ __html: whiteFrame }} />
        ) : null}
      </svg>
    </div>
  );
}
