import { markScrollReveal } from '@/hooks/meshPerfStats';
import { useEffect, useRef, useState } from 'react';

export function useScrollReveal<T extends HTMLElement>(
  threshold = 0.12,
  rootMargin = '0px 0px -8% 0px',
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const label =
            el.getAttribute('data-reveal')
            || el.getAttribute('aria-label')
            || el.id
            || el.className.split(/\s+/).find((c) => c && c !== 'root')?.slice(0, 40)
            || el.tagName.toLowerCase();
          markScrollReveal(label);
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible };
}
