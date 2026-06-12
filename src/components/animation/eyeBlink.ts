import { EYE_CENTER, EYE_VIEWBOX } from './parseKamochiEyeSvg';
import type { MeshZone } from '@/hooks/meshScrollEngine';
import type { MeshPinState } from '@/hooks/meshScrollEngine';

export type EyeBlinkZone = 'careerEye' | 'skillsEye';

const EYE_BLINK_FIRST_DELAY_MS = 4200;
const EYE_BLINK_MIN_GAP_MS = 7200;
const EYE_BLINK_GAP_SPAN_MS = 8800;

type EyeBlinkState = {
  blinkAt: number;
  nextBlinkAt: number;
  blinkActive: boolean;
  irisRevealUnlocked: boolean;
  irisRevealOpened: boolean;
  firstBlinkArmed: boolean;
};

function freshEyeBlinkState(): EyeBlinkState {
  return {
    blinkAt: 0,
    nextBlinkAt: 0,
    blinkActive: false,
    irisRevealUnlocked: false,
    irisRevealOpened: false,
    firstBlinkArmed: false,
  };
}

const eyeBlinkStates: Record<EyeBlinkZone, EyeBlinkState> = {
  careerEye: freshEyeBlinkState(),
  skillsEye: freshEyeBlinkState(),
};

export function isEyeBlinkZone(zone: MeshZone): zone is EyeBlinkZone {
  return zone === 'careerEye' || zone === 'skillsEye';
}

function stateFor(zone: EyeBlinkZone): EyeBlinkState {
  return eyeBlinkStates[zone];
}

export function setEyeBlinkActive(zone: EyeBlinkZone, active: boolean) {
  const state = stateFor(zone);
  state.blinkActive = active;
  if (!active) {
    state.blinkAt = 0;
    state.nextBlinkAt = 0;
    resetEyeIrisReveal(zone);
  }
}

export function deactivateAllEyeBlink() {
  setEyeBlinkActive('careerEye', false);
  setEyeBlinkActive('skillsEye', false);
}

export function resetEyeIrisReveal(zone: EyeBlinkZone) {
  const state = stateFor(zone);
  state.irisRevealUnlocked = false;
  state.irisRevealOpened = false;
  state.firstBlinkArmed = false;
}

export function readEyeIrisRevealUnlocked(zone: EyeBlinkZone) {
  return stateFor(zone).irisRevealUnlocked;
}

export function readEyeFirstBlinkArmed(zone: EyeBlinkZone) {
  return stateFor(zone).firstBlinkArmed;
}

export function readEyeIrisRevealOpened(zone: EyeBlinkZone) {
  return stateFor(zone).irisRevealOpened;
}

/** Po zbudowaniu oka — pierwsze mrugnięcie po krótkiej pauzie, potem reveal tęczówki. */
export function armEyeFirstBlink(zone: EyeBlinkZone, now: number, delayMs = 1100) {
  const state = stateFor(zone);
  if (!state.blinkActive) return;
  resetEyeIrisReveal(zone);
  state.blinkAt = 0;
  state.nextBlinkAt = now + delayMs;
  state.firstBlinkArmed = true;
}

export function stepEyeIrisReveal(zone: EyeBlinkZone, morphSettled: boolean, now: number) {
  const state = stateFor(zone);
  if (!state.blinkActive || !morphSettled) {
    if (!morphSettled) resetEyeIrisReveal(zone);
    return;
  }

  const cover = eyeBlinkCover(zone, now);
  if (state.irisRevealUnlocked && !state.irisRevealOpened && cover < 0.05) {
    state.irisRevealOpened = true;
  }
  if (!state.irisRevealUnlocked && state.blinkAt > 0 && cover > 0.45) {
    state.irisRevealUnlocked = true;
  }
}

/** Szczyt mrugnięcia — dopiero przy pełnym „zwężeniu” białego pola. */
const IRIS_REVEAL_PEAK = 0.45;
const PUPIL_REVEAL_PEAK = 0.45;

function firstRevealVisible(zone: EyeBlinkZone, cover: number, peak: number): number {
  const state = stateFor(zone);
  if (state.irisRevealOpened) return 1;
  if (!state.blinkActive || state.blinkAt <= 0) return 0;
  if (!state.irisRevealUnlocked && cover < peak) return 0;
  return 1;
}

/** Warstwa SVG — ukryta aż powieka idealnie zamknie białe pole. */
export function eyeIrisWrapRevealOpacity(zone: EyeBlinkZone, cover: number): number {
  return firstRevealVisible(zone, cover, IRIS_REVEAL_PEAK);
}

/** Tęczówka / źrenica — generowane dopiero w szczycie mrugnięcia. */
export function eyeFirstRevealLayerOpacity(
  zone: EyeBlinkZone,
  cover: number,
  layer: 'iris' | 'pupil',
): number | null {
  const state = stateFor(zone);
  if (state.irisRevealOpened) return null;
  const peak = layer === 'iris' ? IRIS_REVEAL_PEAK : PUPIL_REVEAL_PEAK;
  return firstRevealVisible(zone, cover, peak);
}

export function stepEyeBlink(zone: EyeBlinkZone, now: number) {
  const state = stateFor(zone);
  if (!state.blinkActive) return;
  if (state.nextBlinkAt <= 0) {
    state.nextBlinkAt = now + EYE_BLINK_FIRST_DELAY_MS;
    return;
  }
  if (now >= state.nextBlinkAt) {
    state.blinkAt = now;
    state.nextBlinkAt =
      now + EYE_BLINK_MIN_GAP_MS + ((now * 0.00061) % 1) * EYE_BLINK_GAP_SPAN_MS;
  }
}

/** 0 = otwarte, 1 = zamknięte (szczyt mrugnięcia). */
export function eyeBlinkCover(zone: EyeBlinkZone, now: number): number {
  const state = stateFor(zone);
  if (!state.blinkActive || state.blinkAt <= 0) return 0;
  const t = (now - state.blinkAt - 100) / 72;
  return Math.exp(-t * t);
}

export function eyeBlinkSquash(cover: number): number {
  if (cover <= 0.02) return 1;
  return 1 - cover * 0.94;
}

/** Lekkie poszerzenie na boki przy zamykaniu powieki — jak biały obrys mesha. */
export function eyeBlinkStretchX(cover: number): number {
  if (cover <= 0.02) return 1;
  return 1 + (1 - eyeBlinkSquash(cover)) * 0.14;
}

function eyePinCenter(pin: MeshPinState) {
  return {
    x: pin.docLeft + (EYE_CENTER.x / EYE_VIEWBOX.w) * pin.stageW,
    y: pin.docTop + (EYE_CENTER.y / EYE_VIEWBOX.h) * pin.stageH,
  };
}

export function eyeBlinkSquashY(y: number, pin: MeshPinState, cover: number): number {
  const squash = eyeBlinkSquash(cover);
  if (squash >= 0.99) return y;
  const { y: cy } = eyePinCenter(pin);
  return cy + (y - cy) * squash;
}

export function eyeBlinkStretchXPos(x: number, pin: MeshPinState, cover: number): number {
  const stretch = eyeBlinkStretchX(cover);
  if (stretch <= 1.001) return x;
  const { x: cx } = eyePinCenter(pin);
  return cx + (x - cx) * stretch;
}

export function eyeBlinkTransform(cover: number): string {
  const squash = eyeBlinkSquash(cover);
  const stretchX = eyeBlinkStretchX(cover);
  if (squash >= 0.99 && stretchX <= 1.001) return '';
  const { x: cx, y: cy } = EYE_CENTER;
  return `translate(${cx} ${cy}) scale(${stretchX} ${squash}) translate(${-cx} ${-cy})`;
}

/** Clip tęczówki — ta sama deformacja co biały mesh (rozciąg X + squash Y). */
export function eyeBlinkClipScale(cover: number): { x: number; y: number } {
  if (cover <= 0.02) return { x: 1, y: 1 };
  return { x: eyeBlinkStretchX(cover), y: eyeBlinkSquash(cover) };
}

/**
 * Tęczówka — widoczna przez większość mrugnięcia (squash białego tła ją zamyka).
 * Fade tylko na samym końcu, żeby nie chować wcześniej niż białe pole.
 */
export function eyeIrisBlinkOpacity(cover: number): number {
  if (cover <= 0.03) return 1;
  const squash = eyeBlinkSquash(cover);
  const fadeStart = 0.2;
  const fadeEnd = 0.07;
  if (squash >= fadeStart) return 1;
  if (squash <= fadeEnd) return 0;
  return (squash - fadeEnd) / (fadeStart - fadeEnd);
}

/** Źrenica — ten sam rytm co tęczówka (białe tło ją zamyka). */
export function eyePupilBlinkOpacity(cover: number): number {
  if (cover <= 0.03) return 1;
  const squash = eyeBlinkSquash(cover);
  const fadeStart = 0.2;
  const fadeEnd = 0.07;
  if (squash >= fadeStart) return 1;
  if (squash <= fadeEnd) return 0;
  return (squash - fadeEnd) / (fadeStart - fadeEnd);
}
