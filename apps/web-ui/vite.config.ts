import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Base path for GitHub Pages. Relative ('./') so emitted asset URLs resolve
// against whatever path the site is served from — this keeps the bundle
// working after a repo rename (e.g. /agent-harness-generator/ → /metaharness/)
// without rebuilding. Override with VITE_BASE=/some/path/ for an absolute base.
const base = process.env.VITE_BASE ?? './';

export default defineConfig({
  base,
  plugins: [react()],
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split stable vendor code from app code so a content change doesn't
        // bust the (larger, slower-changing) React/JSZip chunks in the CDN.
        manualChunks(id) {
          if (id.includes('/node_modules/react/') || id.includes('/node_modules/react-dom/')) return 'react';
          if (id.includes('/node_modules/jszip/')) return 'zip';
        },
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
