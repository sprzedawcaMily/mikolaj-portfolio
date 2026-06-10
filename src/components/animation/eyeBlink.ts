import { EYE_CENTER, EYE_VIEWBOX } from './parseKamochiEyeSvg';
import type { MeshPinState } from '@/hooks/meshScrollEngine';

const EYE_BLINK_FIRST_DELAY_MS = 4200;
const EYE_BLINK_MIN_GAP_MS = 7200;
const EYE_BLINK_GAP_SPAN_MS = 8800;

let blinkAt = 0;
let nextBlinkAt = 0;
let blinkActive = false;
let irisRevealUnlocked = false;
/** Po pierwszym otwarciu — normalne chowanie tęczówki przy kolejnych mrugnięciach. */
let irisRevealOpened = false;

export function setEyeBlinkActive(active: boolean) {
  blinkActive = active;
  if (!active) {
    blinkAt = 0;
    nextBlinkAt = 0;
    resetEyeIrisReveal();
  }
}

export function resetEyeIrisReveal() {
  irisRevealUnlocked = false;
  irisRevealOpened = false;
}

export function readEyeIrisRevealUnlocked() {
  return irisRevealUnlocked;
}

/** Po zbudowaniu oka — pierwsze mrugnięcie po krótkiej pauzie, potem reveal tęczówki. */
export function armEyeFirstBlink(now: number, delayMs = 1100) {
  if (!blinkActive) return;
  resetEyeIrisReveal();
  blinkAt = 0;
  nextBlinkAt = now + delayMs;
}

export function stepEyeIrisReveal(morphSettled: boolean, now: number) {
  if (!blinkActive || !morphSettled) {
    if (!morphSettled) resetEyeIrisReveal();
    return;
  }

  const cover = eyeBlinkCover(now);
  if (irisRevealUnlocked && !irisRevealOpened && cover < 0.05) {
    irisRevealOpened = true;
  }
  if (!irisRevealUnlocked && blinkAt > 0 && cover > 0.45) {
    irisRevealUnlocked = true;
  }
}

/** Podczas pierwszego revealu — pojawia się przy zamknięciu, zostaje widoczna aż oko się otworzy. */
export function eyeFirstRevealLayerOpacity(): number | null {
  if (!irisRevealUnlocked || irisRevealOpened) return null;
  return 1;
}

export function stepEyeBlink(now: number) {
  if (!blinkActive) return;
  if (nextBlinkAt <= 0) {
    nextBlinkAt = now + EYE_BLINK_FIRST_DELAY_MS;
    return;
  }
  if (now >= nextBlinkAt) {
    blinkAt = now;
    nextBlinkAt =
      now + EYE_BLINK_MIN_GAP_MS + ((now * 0.00061) % 1) * EYE_BLINK_GAP_SPAN_MS;
  }
}

/** 0 = otwarte, 1 = zamknięte (szczyt mrugnięcia). */
export function eyeBlinkCover(now: number): number {
  if (!blinkActive || blinkAt <= 0) return 0;
  const t = (now - blinkAt - 100) / 72;
  return Math.exp(-t * t);
}

export function eyeBlinkSquashY(y: number, pin: MeshPinState, cover: number): number {
  const squash = eyeBlinkSquash(cover);
  if (squash >= 0.99) return y;
  const cy = pin.docTop + (EYE_CENTER.y / EYE_VIEWBOX.h) * pin.stageH;
  return cy + (y - cy) * squash;
}

export function eyeBlinkSquash(cover: number): number {
  if (cover <= 0.02) return 1;
  return 1 - cover * 0.94;
}

export function eyeBlinkTransform(cover: number): string {
  const squash = eyeBlinkSquash(cover);
  if (squash >= 0.99) return '';
  const { x: cx, y: cy } = EYE_CENTER;
  return `translate(${cx} ${cy}) scale(1 ${squash}) translate(${-cx} ${-cy})`;
}

/**
 * Przy mruganiu poszerzamy clip tęczówki — różowy sięga bliżej białej obramówki,
 * zamiast znikać wcześniej w „obrączce” między iris a białym meshem.
 */
export function eyeBlinkClipExpand(cover: number): number {
  if (cover <= 0.02) return 0;
  return (1 - eyeBlinkSquash(cover)) * 0.11;
}

/** Tęczówka — znika ze squash białego mesha (przed źrenicą). */
export function eyeIrisBlinkOpacity(cover: number): number {
  if (cover <= 0.03) return 1;
  const squash = eyeBlinkSquash(cover);
  const fadeStart = 0.62;
  const fadeEnd = 0.26;
  if (squash >= fadeStart) return 1;
  if (squash <= fadeEnd) return 0;
  return (squash - fadeEnd) / (fadeStart - fadeEnd);
}

/** Źrenica — znika później niż tęczówka. */
export function eyePupilBlinkOpacity(cover: number): number {
  if (cover <= 0.03) return 1;
  const squash = eyeBlinkSquash(cover);
  const fadeStart = 0.46;
  const fadeEnd = 0.12;
  if (squash >= fadeStart) return 1;
  if (squash <= fadeEnd) return 0;
  return (squash - fadeEnd) / (fadeStart - fadeEnd);
}
