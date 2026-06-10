export type DotBody = {
  x: number;
  y: number;
  vx: number;
  vy: number;
};

export type DotPhysicsConfig = {
  /** Stała prędkość px/klatkę przy dt=1 (~60fps). */
  speed: number;
  /** Jak szybko kierunek może się zmienić — niżej = wolniejsze zawracanie. */
  steer: number;
  snapDistance: number;
};

export const DISPLAY_MORPH_SPEED = 0.012;

export const MORPH_DOT_PHYSICS: DotPhysicsConfig = {
  speed: 1.35,
  steer: 0.009,
  snapDistance: 0.35,
};

export const DEFAULT_DOT_PHYSICS: DotPhysicsConfig = {
  speed: 2.65,
  steer: 0.011,
  snapDistance: 0.1,
};

export const CLUSTER_GATHER = 0.38;
/** Minimalny promień chmury względem min(canvasW, canvasH). */
export const CLUSTER_MIN_RADIUS_RATIO = 0.11;
/** Maksymalny promień pomieszanej chmury (bez zachowania kształtu). */
export const CLUSTER_MAX_RADIUS_RATIO = 0.27;

/** Koniec fazy podróży (0–1); potem rozszerzanie w docelowy kształt. */
export const MORPH_TRAVEL_END = 0.78;
/** Jak szybko robi się zwarta kupka na początku podróży. */
export const MORPH_COMPACT_RAMP = 0.32;
export const MORPH_COMPACT_STRENGTH = 0.93;
/** Minimalny rozmiar kształtu w środku trasy (sin — bez twardej fazy na końcu). */
export const MORPH_MID_SCALE = 0.38;

/** Bezpośredni blend source→target — w połowie trasy dokładnie między figurami. */
export function directBlendMorph(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  progress: number,
) {
  const t = easeSmoothStep(clamp01(progress));
  return {
    x: sourceX + (finalX - sourceX) * t,
    y: sourceY + (finalY - sourceY) * t,
  };
}
/** @deprecated użyj directBlendMorph */
export function smoothShapeMorph(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  _startCx: number,
  _startCy: number,
  _endCx: number,
  _endCy: number,
  progress: number,
  _midScale = MORPH_MID_SCALE,
) {
  return directBlendMorph(sourceX, sourceY, finalX, finalY, progress);
}

/** Kreski — narastają wraz z postępem morphu. */
export function smoothMorphWireAlpha(progress: number) {
  const t = easeSmoothStep(clamp01(progress));
  return 0.15 + 0.73 * t;
}

/** Krawędzie supplementów — dopiero gdy split-y się rozjeżdżają. */
export function smoothMorphSupplementEdgeReveal(progress: number) {
  const t = easeSmoothStep(clamp01(progress));
  return clamp01((t - 0.45) / 0.55);
}

/** Siła „kupki” w środku trasy (0–1). Sin daje 0 na start/koniec. */
export const PILE_SQUEEZE_STRENGTH = 0.48;

/** @deprecated użyj smoothMorphWireAlpha */
export function smoothMorphLayoutScale(_progress = 0) {
  return 1;
}

export type MorphPathMode = 'direct' | 'pile' | 'travel-expand' | 'head-cluster';

function clamp01(v: number) {
  return Math.max(0, Math.min(1, v));
}

function easeSmoothStep(v: number) {
  const t = clamp01(v);
  return t * t * (3 - 2 * t);
}

export function centroidOf(points: { x: number; y: number }[]) {
  if (points.length === 0) return { x: 0, y: 0 };
  let sx = 0;
  let sy = 0;
  for (const p of points) {
    sx += p.x;
    sy += p.y;
  }
  return { x: sx / points.length, y: sy / points.length };
}

/**
 * Kształt zmienia się przez całą animację; w środku lekka kupka (sin),
 * bez jednego punktu lecącego po ekranie.
 */
export function fluidPileMorph(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  pileStartX: number,
  pileStartY: number,
  pileEndX: number,
  pileEndY: number,
  progress: number,
  squeezeStrength = PILE_SQUEEZE_STRENGTH,
) {
  const t = easeSmoothStep(clamp01(progress));

  const baseX = sourceX + (finalX - sourceX) * t;
  const baseY = sourceY + (finalY - sourceY) * t;

  const pileX = pileStartX + (pileEndX - pileStartX) * t;
  const pileY = pileStartY + (pileEndY - pileStartY) * t;

  const squeeze = Math.sin(t * Math.PI);
  const pull = squeeze * squeeze * squeezeStrength;

  return {
    x: baseX + (pileX - baseX) * pull,
    y: baseY + (pileY - baseY) * pull,
  };
}

/**
 * Podróż jako zwarta kupka (centroid start→cel), rozszerzanie dopiero na końcu trasy.
 */
export function travelThenExpandMorph(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  pileStartX: number,
  pileStartY: number,
  pileEndX: number,
  pileEndY: number,
  progress: number,
  compactStrength = MORPH_COMPACT_STRENGTH,
) {
  const p = clamp01(progress);
  const offsetX = sourceX - pileStartX;
  const offsetY = sourceY - pileStartY;

  if (p >= MORPH_TRAVEL_END) {
    const expandU = easeSmoothStep((p - MORPH_TRAVEL_END) / (1 - MORPH_TRAVEL_END));
    const compactX = pileEndX + offsetX * (1 - compactStrength);
    const compactY = pileEndY + offsetY * (1 - compactStrength);
    return {
      x: compactX + (finalX - compactX) * expandU,
      y: compactY + (finalY - compactY) * expandU,
    };
  }

  const travelU = easeSmoothStep(p / MORPH_TRAVEL_END);
  const clusterX = pileStartX + (pileEndX - pileStartX) * travelU;
  const clusterY = pileStartY + (pileEndY - pileStartY) * travelU;
  const compactU = easeSmoothStep(clamp01(p / MORPH_COMPACT_RAMP));
  const compact = compactStrength * compactU;

  return {
    x: clusterX + offsetX * (1 - compact),
    y: clusterY + offsetY * (1 - compact),
  };
}

/** @deprecated użyj smoothMorphLayoutScale */
export function morphOffsetScale(
  progress: number,
  _minScale = MORPH_MID_SCALE,
  _compactStrength = MORPH_COMPACT_STRENGTH,
) {
  return smoothMorphLayoutScale(progress);
}

/** Kreski widoczne dopiero przy rozwijaniu docelowego kształtu. */
export function morphWireReveal(progress: number) {
  const p = clamp01(progress);
  if (p < MORPH_TRAVEL_END * 0.92) return 0;
  return easeSmoothStep((p - MORPH_TRAVEL_END * 0.92) / (1 - MORPH_TRAVEL_END * 0.92)) * 0.88;
}

/** Supplementy pojawiają się razem z rozwijaniem. */
export function morphSplitReveal(progress: number) {
  const p = clamp01(progress);
  if (p < MORPH_TRAVEL_END) return 0;
  return easeSmoothStep((p - MORPH_TRAVEL_END) / (1 - MORPH_TRAVEL_END));
}

/** @deprecated użyj fluidPileMorph */
export function pileMorphTarget(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  pileStartX: number,
  pileStartY: number,
  pileEndX: number,
  pileEndY: number,
  progress: number,
) {
  return fluidPileMorph(
    sourceX,
    sourceY,
    finalX,
    finalY,
    pileStartX,
    pileStartY,
    pileEndX,
    pileEndY,
    progress,
  );
}

/** Losowa (deterministyczna) pozycja w chmurze — bez zachowania kształtu źródła/celu. */
export function scrambledCloudPoint(
  clusterX: number,
  clusterY: number,
  minRadius: number,
  maxRadius: number,
  seed: number,
) {
  const hash = (seed * 1103515245 + 12345) >>> 0;
  const angle = (seed * 2.399963229728653) % (Math.PI * 2);
  const rf = (hash % 1000) / 1000;
  const radius = minRadius + (maxRadius - minRadius) * (0.2 + rf * 0.8);
  const squash = 0.78 + ((hash >> 10) % 1000) / 1000 * 0.38;
  return {
    x: clusterX + Math.cos(angle) * radius,
    y: clusterY + Math.sin(angle) * radius * squash,
  };
}

/** Najpierw pomieszana chmura, potem rozkład w docelowy kształt. */
export function clusterMorphTarget(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  clusterX: number,
  clusterY: number,
  progress: number,
  gatherRatio = CLUSTER_GATHER,
  minRadius = 0,
  maxRadius = minRadius,
  nodeSeed = 0,
) {
  const gather = scrambledCloudPoint(
    clusterX,
    clusterY,
    minRadius,
    Math.max(minRadius, maxRadius),
    nodeSeed,
  );
  const p = clamp01(progress);
  if (p <= gatherRatio) {
    const u = easeSmoothStep(p / gatherRatio);
    return {
      x: sourceX + (gather.x - sourceX) * u,
      y: sourceY + (gather.y - sourceY) * u,
    };
  }
  const u = easeSmoothStep((p - gatherRatio) / (1 - gatherRatio));
  return {
    x: gather.x + (finalX - gather.x) * u,
    y: gather.y + (finalY - gather.y) * u,
  };
}

export function stepDisplayMorph(
  display: number,
  target: number,
  dt: number,
  speed = DISPLAY_MORPH_SPEED,
) {
  const gap = target - display;
  if (Math.abs(gap) < 0.0005) return target;
  return display + Math.sign(gap) * Math.min(Math.abs(gap), speed * dt);
}

export function dotsNeedFrames(bodies: Map<number, DotBody>, minSpeed = 0.04) {
  for (const body of bodies.values()) {
    if (Math.hypot(body.vx, body.vy) > minSpeed) return true;
  }
  return false;
}

export type ScrollTargetMap = Map<number, { x: number; y: number }>;

export type SimMorphState = {
  morph: number;
  busMorph: number;
  forkMorph: number;
  sprayMorph: number;
  loupeMorph: number;
  ringMorph: number;
  careerEyeMorph: number;
  skillsEyeMorph: number;
};

export function createSimMorphState(): SimMorphState {
  return {
    morph: 0,
    busMorph: 0,
    forkMorph: 0,
    sprayMorph: 0,
    loupeMorph: 0,
    ringMorph: 0,
    careerEyeMorph: 0,
    skillsEyeMorph: 0,
  };
}

/** Stała prędkość domykania morphu (0–1) — niezależna od scrolla. */
export const SIM_MORPH_SPEED = 0.009;

export function stepSimMorph(
  sim: SimMorphState,
  target: SimMorphState,
  dt: number,
  speed = SIM_MORPH_SPEED,
) {
  const keys = [
    'morph',
    'busMorph',
    'forkMorph',
    'sprayMorph',
    'loupeMorph',
    'ringMorph',
    'careerEyeMorph',
    'skillsEyeMorph',
  ] as const;
  const step = speed * dt;
  for (const key of keys) {
    const gap = target[key] - sim[key];
    if (Math.abs(gap) < 0.0006) {
      sim[key] = target[key];
      continue;
    }
    sim[key] += Math.sign(gap) * Math.min(Math.abs(gap), step);
  }
}

export function simMorphActive(sim: SimMorphState, target: SimMorphState) {
  return (
    Math.abs(sim.morph - target.morph) > 0.008
    || Math.abs(sim.busMorph - target.busMorph) > 0.008
    || Math.abs(sim.forkMorph - target.forkMorph) > 0.008
    || Math.abs(sim.sprayMorph - target.sprayMorph) > 0.008
    || Math.abs(sim.loupeMorph - target.loupeMorph) > 0.008
    || Math.abs(sim.ringMorph - target.ringMorph) > 0.008
    || Math.abs(sim.careerEyeMorph - target.careerEyeMorph) > 0.008
    || Math.abs(sim.skillsEyeMorph - target.skillsEyeMorph) > 0.008
  );
}

export function resetDotBodies(store: Map<number, DotBody>) {
  store.clear();
}

export function placeDotForPhysics(
  bodies: Map<number, DotBody>,
  scrollTargets: ScrollTargetMap,
  id: number,
  sourceX: number,
  sourceY: number,
  targetX: number,
  targetY: number,
): { px: number; py: number } {
  scrollTargets.set(id, { x: targetX, y: targetY });
  const body = bodies.get(id);
  return {
    px: body?.x ?? sourceX,
    py: body?.y ?? sourceY,
  };
}

/** Trajektoria morphu kropki. */
export function morphDotPosition(
  sourceX: number,
  sourceY: number,
  finalX: number,
  finalY: number,
  progress: number,
  mode: MorphPathMode,
  anchorA: number = sourceX,
  anchorB: number = sourceY,
  anchorC: number = finalX,
  anchorD: number = finalY,
) {
  const p = clamp01(progress);
  if (mode === 'direct') {
    const u = easeSmoothStep(p);
    return {
      x: sourceX + (finalX - sourceX) * u,
      y: sourceY + (finalY - sourceY) * u,
    };
  }
  if (mode === 'pile') {
    return fluidPileMorph(
      sourceX,
      sourceY,
      finalX,
      finalY,
      anchorA,
      anchorB,
      anchorC,
      anchorD,
      p,
    );
  }
  if (mode === 'travel-expand') {
    return travelThenExpandMorph(
      sourceX,
      sourceY,
      finalX,
      finalY,
      anchorA,
      anchorB,
      anchorC,
      anchorD,
      p,
    );
  }
  return clusterMorphTarget(
    sourceX,
    sourceY,
    finalX,
    finalY,
    anchorA,
    anchorB,
    p,
  );
}

/** Prosty lot w linii prostej — stała prędkość px/klatkę (dt≈1 @60fps), bez skręcania. */
export function stepDotToward(
  body: DotBody,
  targetX: number,
  targetY: number,
  dt: number,
  speedPx = 2.4,
  snapDistance = 0.4,
) {
  const dx = targetX - body.x;
  const dy = targetY - body.y;
  const dist = Math.hypot(dx, dy);

  if (dist < snapDistance) {
    body.x = targetX;
    body.y = targetY;
    body.vx = 0;
    body.vy = 0;
    return;
  }

  const step = speedPx * dt;
  const t = Math.min(1, step / dist);
  body.x += dx * t;
  body.y += dy * t;
  body.vx = 0;
  body.vy = 0;
}

export function stepDotBody(
  body: DotBody,
  targetX: number,
  targetY: number,
  dt: number,
  config: DotPhysicsConfig = DEFAULT_DOT_PHYSICS,
) {
  const dx = targetX - body.x;
  const dy = targetY - body.y;
  const dist = Math.hypot(dx, dy);

  if (dist < config.snapDistance) {
    body.x = targetX;
    body.y = targetY;
    body.vx *= 0.72;
    body.vy *= 0.72;
    return;
  }

  const nx = dx / dist;
  const ny = dy / dist;
  const desiredVx = nx * config.speed;
  const desiredVy = ny * config.speed;

  const steerT = config.steer * dt;
  body.vx += (desiredVx - body.vx) * steerT;
  body.vy += (desiredVy - body.vy) * steerT;

  const speed = Math.hypot(body.vx, body.vy);
  if (speed > 0.06) {
    body.vx = (body.vx / speed) * config.speed;
    body.vy = (body.vy / speed) * config.speed;
  } else {
    body.vx = desiredVx;
    body.vy = desiredVy;
  }

  const step = config.speed * dt;
  if (dist <= step) {
    body.x = targetX;
    body.y = targetY;
    return;
  }

  body.x += body.vx * dt;
  body.y += body.vy * dt;
}

export function applyDotPhysicsToNodes<
  T extends { px: number; py: number; reveal?: number },
>(
  store: Map<number, DotBody>,
  positions: Array<T | undefined>,
  ids: Iterable<number>,
  dt: number,
  getTarget?: (id: number) => { x: number; y: number } | undefined,
  config: DotPhysicsConfig = DEFAULT_DOT_PHYSICS,
) {
  for (const id of ids) {
    const pos = positions[id as number];
    if (!pos || (pos.reveal != null && pos.reveal < 0.02)) continue;

    const target = getTarget?.(id as number);
    const targetX = target?.x ?? pos.px;
    const targetY = target?.y ?? pos.py;

    let body = store.get(id as number);
    if (!body) {
      body = { x: pos.px, y: pos.py, vx: 0, vy: 0 };
      store.set(id as number, body);
    }

    stepDotBody(body, targetX, targetY, dt, config);
    pos.px = body.x;
    pos.py = body.y;
  }
}
