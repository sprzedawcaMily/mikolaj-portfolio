import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { initMeshPerfMode } from '@/hooks/meshPerfMode';
import { attachScrollIntentTracking } from '@/hooks/meshPerfStats';
import '@/styles/globals.css';
import '@/styles/perf.css';

initMeshPerfMode();
attachScrollIntentTracking();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
