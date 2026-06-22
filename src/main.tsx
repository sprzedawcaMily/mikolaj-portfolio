import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initMeshPerfMode } from '@/hooks/meshPerfMode';
import { attachScrollIntentTracking } from '@/hooks/meshPerfStats';
import { attachMobileLayoutListener, initMobileLayoutClass } from '@/hooks/mobileLayout';
import '@/styles/fonts.css';
import '@/styles/globals.css';
import '@/styles/perf.css';
import '@/styles/mobile.css';

initMeshPerfMode();
initMobileLayoutClass();
attachScrollIntentTracking();
attachMobileLayoutListener();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
