import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  build: {
    // <model-viewer> bundles three.js — keep it in its own lazy chunk so the
    // page shell (poster-first render) stays small.
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('@google/model-viewer') || id.includes('/three/')) {
            return 'model-viewer'
          }
          // Keep the refined-motion layer (Motion + Lenis) out of the initial
          // shell — it is dynamically imported after first paint.
          if (id.includes('/motion/') || id.includes('/framer-motion/') || id.includes('/lenis/')) {
            return 'motion'
          }
          return undefined
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
