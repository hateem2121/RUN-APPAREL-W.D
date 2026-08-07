import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Source maps are uploaded to Sentry ONLY when an auth token is present, and are
 * GENERATED only in that same case.
 *
 * ⚠️ THE COUPLING IS THE POINT — do not split these two conditions. `dist/` is
 * deployed wholesale (apps/viewer/wrangler.jsonc → assets.directory), so a `.map`
 * file that is generated but not deleted is a `.map` file served to the public
 * internet. Generating maps unconditionally and deleting them "later" is one
 * refactor away from publishing the entire un-minified source of the viewer.
 *
 * `sourcemap: 'hidden'` emits the maps without the `//# sourceMappingURL` comment,
 * so a browser never asks for them even in the window before they are removed;
 * `filesToDeleteAfterUpload` then removes them from dist/ once Sentry has them.
 * Belt and braces, because the failure is silent and permanent.
 */
const SENTRY_AUTH_TOKEN = process.env.SENTRY_AUTH_TOKEN
const uploadSourceMaps = Boolean(SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT)

export default defineConfig({
  plugins: [
    react(),
    // Absent entirely without a token, so a local or PR build is byte-identical to
    // what it was before this plugin existed.
    ...(uploadSourceMaps
      ? [
          sentryVitePlugin({
            authToken: SENTRY_AUTH_TOKEN,
            org: process.env.SENTRY_ORG,
            project: process.env.SENTRY_PROJECT,
            // MUST match VITE_SENTRY_RELEASE in src/lib/sentry.ts, or events arrive
            // under a release with no maps and every frame stays minified. CI sets
            // both from github.sha.
            release: { name: process.env.VITE_SENTRY_RELEASE },
            sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
            // A Sentry outage must never block a production release. The cost of
            // failing open is one deploy with minified traces; the cost of failing
            // closed is being unable to ship.
            errorHandler: (err) => {
              console.warn('[sentry] source map upload failed, continuing:', err.message)
            },
          }),
        ]
      : []),
  ],
  build: {
    sourcemap: uploadSourceMaps ? 'hidden' : false,
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
