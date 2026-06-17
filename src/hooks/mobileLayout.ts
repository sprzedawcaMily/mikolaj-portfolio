import { useEffect, useState } from 'react';

/** Ten sam próg co Hero / sectionMeshLayout — jedna strefa „mobile”. */
export const MOBILE_LAYOUT_MQ = '(max-width: 959px)';

function readMobileLayout() {
  return typeof window !== 'undefined' && window.matchMedia(MOBILE_LAYOUT_MQ).matches;
}

export function initMobileLayoutClass() {
  document.documentElement.classList.toggle('layout-mobile', readMobileLayout());
}

export function attachMobileLayoutListener() {
  const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
  const sync = () => document.documentElement.classList.toggle('layout-mobile', mq.matches);
  mq.addEventListener('change', sync);
  return () => mq.removeEventListener('change', sync);
}

export function useMobileLayout() {
  const [isMobile, setIsMobile] = useState(readMobileLayout);

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const sync = () => {
      setIsMobile(mq.matches);
      document.documentElement.classList.toggle('layout-mobile', mq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return isMobile;
}
