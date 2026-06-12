import { markScrollActivity, markScrollReveal } from '@/hooks/meshPerfStats';

type RevealJob = {
  run: () => void;
  label: string;
};

const queue: RevealJob[] = [];
const queuedLabels = new Set<string>();
let flushRaf = 0;
let scrollListenerAttached = false;
const MAX_PER_FRAME = 2;

export function attachScrollRevealTracking() {
  if (scrollListenerAttached || typeof window === 'undefined') return;
  scrollListenerAttached = true;
  window.addEventListener('scroll', markScrollActivity, { passive: true });
}

function pump() {
  flushRaf = 0;

  let done = 0;
  while (queue.length > 0 && done < MAX_PER_FRAME) {
    const job = queue.shift()!;
    queuedLabels.delete(job.label);
    markScrollReveal(job.label);
    job.run();
    done += 1;
  }

  if (queue.length > 0) {
    flushRaf = requestAnimationFrame(pump);
  }
}

/** Max 2 sekcje na klatkę — bez blokady podczas scrolla (inaczej karty zostają niewidoczne). */
export function scheduleScrollReveal(label: string, run: () => void) {
  if (queuedLabels.has(label)) return;
  queuedLabels.add(label);
  queue.push({ label, run });
  if (!flushRaf) flushRaf = requestAnimationFrame(pump);
}
