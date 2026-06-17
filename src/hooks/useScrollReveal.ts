import { useEffect, useId, useRef, useState } from 'react';
import { scheduleScrollReveal, attachScrollRevealTracking } from '@/hooks/scrollRevealBatch';
import { MOBILE_LAYOUT_MQ } from '@/hooks/mobileLayout';

export function useScrollReveal<T extends HTMLElement>(
  threshold = 0.12,
  rootMargin = '0px 0px -8% 0px',
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);
  const revealId = useId();

  useEffect(() => {
    // Mobile: bez batchowania i bez "pojawiania się" po scroll-stop — od razu włącz sekcję.
    if (window.matchMedia(MOBILE_LAYOUT_MQ).matches) {
      setVisible(true);
      return;
    }

    attachScrollRevealTracking();
    const el = ref.current;
    if (!el) return;

    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      setVisible(true);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        const label = el.getAttribute('data-reveal') || el.id || revealId;
        scheduleScrollReveal(label, reveal);
        observer.disconnect();
      },
      { threshold, rootMargin },
    );

    observer.observe(el);

    // Sekcje już w viewport przy mount — nie czekaj na scroll-stop.
    requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const vh = window.innerHeight;
      if (rect.top < vh * 0.92 && rect.bottom > vh * 0.04) {
        const label = el.getAttribute('data-reveal') || el.id || revealId;
        scheduleScrollReveal(label, reveal);
        observer.disconnect();
      }
    });

    return () => observer.disconnect();
  }, [threshold, rootMargin, revealId]);

  return { ref, visible };
}
