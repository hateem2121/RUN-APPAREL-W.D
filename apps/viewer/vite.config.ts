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
const uploadSourceMaps = Boolean(
  SENTRY_AUTH_TOKEN && process.env.SENTRY_ORG && process.env.SENTRY_PROJECT,
)

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
    /**
     * ⚠️ DO NOT PRELOAD THE TWO CHUNKS `manualChunks` EXISTS TO DEFER.
     *
     * Vite's default `modulePreload` walks the dynamic-import graph and emits a
     * `<link rel="modulepreload">` for every chunk it finds — including the two
     * below, which are split out precisely so they are NOT fetched up front.
     * Measured in a real build on 2026-08-14, `dist/index.html` carried preload
     * links for `model-viewer` (294.50 kB gzip) and `motion` (53.81 kB gzip).
     *
     * The chunking looked correct and the effect was the opposite of its intent:
     * `canRender3D()` in lib/capabilities.ts returns false when
     * `navigator.connection.saveData` is set, under the comment "Respect
     * reduced-data mode" — but the browser had already fetched 294 kB of
     * renderer before React evaluated that guard. A phone on a metered
     * connection downloaded a 3D engine it was about to decline, and Motion for
     * a cursor that never mounts on touch.
     *
     * ⚠️ VERIFY THIS BY GREP, NOT BY BUNDLE SIZE. Every chunk keeps its exact
     * byte count — nothing moves between chunks — so `check-bundle-budget.mjs`
     * reports no change. The assertion is the ABSENCE of the two `<link>` tags
     * in dist/index.html; `scripts/preload.test.ts` is what pins it.
     */
    modulePreload: {
      resolveDependencies: (_url: string, deps: string[]) =>
        deps.filter((dep) => !/\/(model-viewer|motion|lenis)-[^/]*\.js$/.test(dep)),
    },
    // <model-viewer> bundles three.js — keep it in its own lazy chunk so the
    // page shell (poster-first render) stays small.
    rollupOptions: {
      output: {
        manualChunks(id) {
          /**
           * ⚠️ EVERY RULE BELOW IS SCOPED TO node_modules, and it has to be.
           *
           * The vendor matchers are substring tests on the module id, and this
           * repo has `src/lib/motion.ts` — the JS-side motion constants. Without
           * the guard, `/motion/` matched OUR file too, so it was bundled into
           * the vendor chunk and `smooth-scroll.ts` (which imports one constant
           * from it) ended up with a STATIC import of the Motion chunk. Every
           * visitor then downloaded Motion to read the number 1.1, which is the
           * exact opposite of what this splitting exists to do — and it looked
           * correct in the config while doing it.
           */
          /**
           * React is matched FIRST and WITHOUT the node_modules guard below.
           *
           * Rolldown gives CommonJS modules a synthetic id that does not always
           * contain `node_modules`, and React ships CJS. Guarded, those synthetic
           * ids fell through to automatic chunking and were grouped with whatever
           * imported them — which put a React interop shim in the MOTION chunk,
           * so the entry statically imported Motion to get `createElement`.
           */
          if (/(^|[/\\])react(-dom)?([/\\@.]|$)/.test(id) || id.includes('scheduler')) {
            return 'react'
          }
          if (!id.includes('node_modules')) return undefined
          /**
           * React gets its OWN chunk, and this is not tidiness.
           *
           * Without it, rolldown groups shared dependencies with whichever named
           * chunk already needs them — and `react-dom/client` (pulled in by
           * polish/index.ts for the cursor root) was merged into the "motion"
           * chunk. The polish layer then STATICALLY imported that chunk to get
           * `createRoot`, so every visitor downloaded Motion regardless of the
           * pointer gate. The config read correctly and the output did the
           * opposite; the only way to see it was to read the built chunk's own
           * import statements.
           */
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/scheduler/')) {
            return 'react'
          }
          if (id.includes('@google/model-viewer') || id.includes('/three/')) {
            return 'model-viewer'
          }
          /**
           * ⚠️ MOTION AND LENIS ARE SEPARATE CHUNKS, and that is the point.
           *
           * They shared one "motion" chunk until 2026-08-14, and the sharing
           * silently undid the scoping work around it. Lenis (smooth scroll) is
           * used by every visitor, including on touch. Motion is imported by
           * exactly one module — polish/Cursor — which renders null on touch,
           * under reduced motion and under automation.
           *
           * In one chunk, the unconditional dependency dragged the conditional
           * one in with it: a phone fetched Motion's spring physics for a
           * crosshair cursor it can never display, and lazy-loading Cursor
           * changed nothing because Lenis pulled the same file anyway. Splitting
           * them is what makes the gate in polish/index.ts actually save bytes.
           * `e2e/motion-and-layout.spec.ts` pins it from a touch context.
           */
          if (id.includes('/motion/') || id.includes('/framer-motion/')) {
            return 'motion'
          }
          if (id.includes('/lenis/')) {
            return 'lenis'
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
