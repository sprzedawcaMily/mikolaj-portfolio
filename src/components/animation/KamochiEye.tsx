import { useEffect, useId, useRef, useState } from 'react';
import { useMeshZone } from '@/context/MeshZoneContext';
import { useMeshMotionState } from '@/hooks/meshMotionState';
import { invalidateZonePinsCache, type MeshZone } from '@/hooks/meshScrollEngine';
import {
  EYE_CENTER,
  EYE_VIEWBOX,
  parseKamochiEyeSvg,
  type KamochiEyeData,
} from './parseKamochiEyeSvg';
import {
  eyeBlinkClipExpand,
  eyeBlinkCover,
  eyeBlinkTransform,
  eyeFirstRevealLayerOpacity,
  eyeIrisBlinkOpacity,
  eyePupilBlinkOpacity,
} from './eyeBlink';
import styles from './KamochiEye.module.css';

const EYE_SOURCE = '/images/kamochi/oko2.svg';
const RED_MAX = { left: 228, right: 228, y: 132 };
/**
 * Hull SVG jest szerszy niż białe kropki mesha — lekko zwężamy clip.
 * overlay: większa wartość = tęczówka widoczna dłużej przy krawędzi.
 */
const RED_ZONE_CLIP_SCALE = {
  full: { x: 0.93, y: 0.91 },
  overlay: { x: 0.905, y: 0.888 },
};
const LERP = 0.14;

type Offset = { x: number; y: number };
type AxisMax = { left: number; right: number; y: number };

function lerpOffset(current: Offset, target: Offset): Offset {
  return {
    x: current.x + (target.x - current.x) * LERP,
    y: current.y + (target.y - current.y) * LERP,
  };
}

function clampAxis(value: number, max: AxisMax): number {
  if (value < 0) return Math.max(value, -max.left);
  if (value > 0) return Math.min(value, max.right);
  return 0;
}

function readTrackingRect(anchorId: string | undefined, wrap: HTMLDivElement | null) {
  if (anchorId) {
    const anchor = document.getElementById(anchorId);
    if (anchor) return anchor.getBoundingClientRect();
  }
  return wrap?.getBoundingClientRect() ?? null;
}

function aimOffset(
  clientX: number,
  clientY: number,
  rect: DOMRect,
  max: AxisMax,
  mirrored: boolean,
): Offset {
  const eyeX = rect.left + (EYE_CENTER.x / EYE_VIEWBOX.w) * rect.width;
  const eyeY = rect.top + (EYE_CENTER.y / EYE_VIEWBOX.h) * rect.height;
  const scaleX = EYE_VIEWBOX.w / rect.width;
  const scaleY = EYE_VIEWBOX.h / rect.height;
  const mirrorSign = mirrored ? -1 : 1;
  const dx = (clientX - eyeX) * scaleX * 0.52 * mirrorSign;
  const dy = (clientY - eyeY) * scaleY * 0.4;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.5) return { x: 0, y: 0 };

  const radial = Math.min(1, Math.max(max.left, max.right, max.y) / dist);
  return {
    x: clampAxis(dx * radial, max),
    y: clampAxis(dy * radial, max),
  };
}

function redZoneClipTransform(irisOnly: boolean, blinkCover = 0) {
  const base = irisOnly ? RED_ZONE_CLIP_SCALE.overlay : RED_ZONE_CLIP_SCALE.full;
  const expand = eyeBlinkClipExpand(blinkCover);
  const sx = Math.min(0.99, base.x + expand);
  const sy = Math.min(0.99, base.y + expand);
  const { x: cx, y: cy } = EYE_CENTER;
  return `translate(${cx} ${cy}) scale(${sx} ${sy}) translate(${-cx} ${-cy})`;
}

type KamochiEyeProps = {
  className?: string;
  mirrored?: boolean;
  anchorId?: string;
  /** Tęczówka + źrenica; obrys z SVG (mesh tylko przy morphu). */
  irisOnly?: boolean;
  /** Strefa scrolla — synchronizuje fade z morphingiem mesha. */
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
  const { morphSettled, eyeIrisUnlocked, eyeFrame } = useMeshMotionState();
  const [reducedMotion, setReducedMotion] = useState(false);
  const zoneActive = meshZone == null || activeMeshZone === meshZone;
  const visible = inView && zoneActive;
  const targetRef = useRef<Offset>({ x: 0, y: 0 });
  const liveRef = useRef<Offset>({ x: 0, y: 0 });
  const [motion, setMotion] = useState<Offset>({ x: 0, y: 0 });
  const [blinkCover, setBlinkCover] = useState(0);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    reducedMotionRef.current = reduced;
    setReducedMotion(reduced);
    let cancelled = false;
    fetch(EYE_SOURCE)
      .then((r) => r.text())
      .then((text) => {
        if (!cancelled) setData(parseKamochiEyeSvg(text));
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
    function onPointerMove(e: PointerEvent) {
      const rect = readTrackingRect(anchorId, wrapRef.current);
      if (!rect || rect.width < 8) return;
      targetRef.current = aimOffset(e.clientX, e.clientY, rect, RED_MAX, mirrored);
    }

    function onPointerLeave() {
      targetRef.current = { x: 0, y: 0 };
    }

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('blur', onPointerLeave);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('blur', onPointerLeave);
    };
  }, [mirrored, anchorId]);

  useEffect(() => {
    if (reducedMotionRef.current) {
      setInView(true);
      return;
    }
    let frame = 0;
    function tick() {
      const now = performance.now();
      const next = lerpOffset(liveRef.current, targetRef.current);
      liveRef.current = next;
      setMotion(next);
      setBlinkCover(eyeBlinkCover(now));
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [data]);

  const irisReveal = irisOnly
    ? reducedMotion
      ? morphSettled
        ? 1
        : 0
      : eyeIrisUnlocked
        ? 1
        : 0
    : 1;
  const wrapClass = [
    styles.wrap,
    irisOnly && styles.irisOnly,
    !irisOnly && visible && styles.revealed,
    className,
  ]
    .filter(Boolean)
    .join(' ');
  const meshAttach = irisOnly && eyeFrame.ready
    ? `translate(${eyeFrame.ox}px, ${eyeFrame.oy}px) scale(${eyeFrame.scaleX}, ${eyeFrame.scaleY})`
    : '';
  const wrapStyle = irisOnly
    ? {
        opacity: visible ? irisReveal : 0,
        transform: meshAttach || undefined,
        transformOrigin: 'center center',
      }
    : undefined;

  if (!data) {
    return <div ref={wrapRef} className={wrapClass} style={wrapStyle} aria-hidden="true" />;
  }

  const redZoneClipId = `kamochi-eye-zone-${uid}`;
  const greenClipId = `kamochi-eye-green-${uid}`;
  const redClip = data.redZonePath ? `url(#${redZoneClipId})` : undefined;
  const meshSynced = irisOnly && eyeFrame.ready;
  const clipPathTransform = meshSynced
    ? redZoneClipTransform(irisOnly, 0)
    : redZoneClipTransform(irisOnly, blinkCover);
  const motionTransform = `translate(${motion.x} ${motion.y})`;
  const blinkSquash = meshSynced ? '' : eyeBlinkTransform(blinkCover);
  const irisTransform = `${motionTransform}${blinkSquash ? ` ${blinkSquash}` : ''}`.trim();
  const pupilTransform = irisTransform;
  const firstRevealOpacity = eyeFirstRevealLayerOpacity();
  const irisRingOpacity = firstRevealOpacity ?? eyeIrisBlinkOpacity(blinkCover);
  const pupilOpacity = firstRevealOpacity ?? eyePupilBlinkOpacity(blinkCover);
  const whiteFrame = irisOnly ? '' : data.white;

  return (
    <div ref={wrapRef} className={wrapClass} style={wrapStyle} aria-hidden="true">
      <svg
        className={[styles.svg, mirrored && styles.mirroredSvg].filter(Boolean).join(' ')}
        viewBox={`0 0 ${EYE_VIEWBOX.w} ${EYE_VIEWBOX.h}`}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          {data.redZonePath ? (
            <clipPath id={redZoneClipId}>
              <path d={data.redZonePath} transform={clipPathTransform} />
            </clipPath>
          ) : null}
        </defs>

        {!irisOnly ? <g dangerouslySetInnerHTML={{ __html: data.back }} /> : null}

        {/* Strefa oka — stała; tęczówka obcinana przy krawędzi białego obrysu. */}
        <g clipPath={redClip}>
          <g
            transform={irisTransform}
            className={styles.redLayer}
            style={{
              opacity: irisRingOpacity,
              visibility: irisRingOpacity < 0.04 ? 'hidden' : 'visible',
            }}
          >
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
                strokeWidth={2.5}
              />
            ))}
          </g>
          <g
            className={styles.pupilLayer}
            transform={pupilTransform}
            style={{
              opacity: pupilOpacity,
              visibility: pupilOpacity < 0.04 ? 'hidden' : 'visible',
            }}
          >
            <defs>
              <clipPath id={greenClipId}>
                <ellipse
                  cx={EYE_CENTER.x}
                  cy={EYE_CENTER.y}
                  rx={data.pupilClip.rx}
                  ry={data.pupilClip.ry}
                />
              </clipPath>
            </defs>
            <g clipPath={`url(#${greenClipId})`}>
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

        {!irisOnly && whiteFrame ? (
          <g
            className={styles.whiteLayer}
            dangerouslySetInnerHTML={{ __html: whiteFrame }}
          />
        ) : null}
      </svg>
    </div>
  );
}
