import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';
import { meshPerfLogPlugin } from './vite/meshPerfLogPlugin';

export default defineConfig({
  plugins: [react(), meshPerfLogPlugin()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes('flyingDotEngine') ||
            id.includes('FlyingMeshDots') ||
            id.includes('loadMeshBundle') ||
            (id.includes('/mesh/') && !id.includes('node_modules'))
          ) {
            return 'mesh';
          }
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) {
            return 'react-vendor';
          }
        },
      },
    },
  },
});
