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
});
