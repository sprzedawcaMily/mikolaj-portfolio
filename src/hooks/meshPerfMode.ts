/**
 * Tryb wizualny lite — ?lite=1, prefers-reduced-motion lub słabszy sprzęt.
 * Tryb slow (?slow=1) — symulacja słabego PC (agresywne cięcia).
 */

let lite = false;
let slow = false;
let reducedMotion = false;
let autoLite = false;
let fullFps = false;
let initialized = false;

function prefersReducedMotion() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function prefersLowPowerDevice() {
  if (typeof navigator === 'undefined') return false;

  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;

  return cores <= 4 || (memory != null && memory <= 4) || Boolean(connection?.saveData);
}

function applyLiteClasses() {
  document.documentElement.classList.add('mesh-lite');
  if (slow) document.documentElement.classList.add('mesh-slow');
  if (reducedMotion) document.documentElement.classList.add('mesh-reduced-motion');
  if (autoLite && !slow && !reducedMotion) {
    document.documentElement.classList.add('mesh-auto-lite');
  }
}

export function initMeshPerfMode(): boolean {
  if (initialized || typeof window === 'undefined') return lite;
  initialized = true;

  const params = new URLSearchParams(window.location.search);
  reducedMotion = prefersReducedMotion();

  if (params.has('slow')) {
    slow = true;
    lite = true;
    applyLiteClasses();
    console.info('[mesh-perf] tryb slow — symulacja słabego PC');
    return lite;
  }

  if (params.has('lite')) {
    lite = true;
    applyLiteClasses();
    return lite;
  }

  if (!params.has('full') && prefersLowPowerDevice()) {
    lite = true;
    autoLite = true;
    applyLiteClasses();
    console.info('[mesh-perf] auto-lite — słabszy sprzęt / save-data');
    return lite;
  }

  if (params.has('perf')) {
    document.documentElement.classList.add('mesh-lite');
  }

  if (reducedMotion && !params.has('full')) {
    lite = true;
    applyLiteClasses();
  }

  if (params.has('full')) {
    fullFps = true;
    lite = false;
    autoLite = false;
  }

  return lite;
}

export function isMeshLiteMode(): boolean {
  if (!initialized) initMeshPerfMode();
  return lite;
}

export function isMeshSlowMode(): boolean {
  if (!initialized) initMeshPerfMode();
  return slow;
}

export function isMeshReducedMotion(): boolean {
  if (!initialized) initMeshPerfMode();
  return reducedMotion;
}

export function isMeshAutoLite(): boolean {
  if (!initialized) initMeshPerfMode();
  return autoLite;
}

/** ?full=1 — bez limitu klatek (stride=1 także podczas scrolla). */
export function isMeshFullFps(): boolean {
  if (!initialized) initMeshPerfMode();
  return fullFps;
}
