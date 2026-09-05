import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
// @ts-expect-error — plain .mjs, as scripts/csp.mjs is. Every decision it makes is
// a pure function with tests in scripts/sw.test.ts; this plugin is only the I/O.
import { serviceWorkerSource, serviceWorkerVersion, shellFromBundle } from './scripts/sw.mjs'

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
    /**
     * Preload the two font faces a Latin visitor actually uses.
     *
     * ⚠️ THEY WERE THIRD IN A THREE-DEEP CHAIN: HTML -> CSS -> font. A woff2 is not
     * discoverable until the bundled stylesheet has arrived AND parsed, so the two
     * faces on the critical path each waited a full round trip that the browser
     * could have started immediately. index.html already preloads the meshopt
     * decoder and the lighting map for exactly this reason ("fetched ALONGSIDE the
     * model instead of after it — measured 0.5s on the live waterfall"); the fonts
     * were the remaining case and are the ones the FIRST PAINT waits on.
     *
     * ⚠️ IT HAS TO BE A BUILD-TIME PLUGIN, NOT A LINK IN index.html, because the
     * filenames are content-hashed. Hardcoding one would go stale at the next font
     * bump and preload a 404 — strictly worse than no hint, since the browser then
     * fetches twice.
     *
     * ⚠️ `crossorigin` IS REQUIRED AND IS THE HALF THAT GETS DROPPED. Fonts are
     * fetched in CORS mode even same-origin; a preload without it opens a
     * connection in the wrong credentials mode, the real request opens a second
     * one, and the hint costs a round trip instead of saving one. index.html's own
     * comment makes the same point about its two preconnects, and
     * scripts/preload.test.ts pins both halves there.
     *
     * LATIN ONLY. The build emits seven font files — latin, latin-ext and
     * vietnamese subsets plus two .woff fallbacks no modern browser chooses.
     * Preloading a subset this audience does not use would fetch bytes nobody
     * renders, which is the opposite of the point. `unicode-range` still governs
     * what the browser USES; this only front-runs the two it will ask for anyway.
     */
    {
      name: 'run-preload-latin-fonts',
      enforce: 'post' as const,
      transformIndexHtml: {
        order: 'post' as const,
        handler(html: string, ctx: { bundle?: Record<string, unknown> }) {
          const files = Object.keys(ctx.bundle ?? {})
          const wanted = files.filter(
            (f) => /\.woff2$/.test(f) && /-latin-/.test(f) && !/latin-ext/.test(f),
          )
          if (wanted.length === 0) return html
          return {
            html,
            tags: wanted.map((file) => ({
              tag: 'link',
              attrs: {
                rel: 'preload',
                as: 'font',
                type: 'font/woff2',
                href: `/${file}`,
                crossorigin: '',
              },
              injectTo: 'head' as const,
            })),
          }
        },
      },
    },
    // Absent entirely without a token, so a local or PR build is byte-identical to
    // what it was before this plugin existed.
    /**
     * Emit the offline shell service worker.
     *
     * Scope, and the four measured reasons no garment is in it:
     * `docs/DECISION-OFFLINE-SCOPE.md`. Every decision below is a pure function in
     * `scripts/sw.mjs` with tests; this hook is the I/O around them, which is the
     * same split `scripts/csp.mjs` and `scripts/gen-headers.mjs` use and the reason
     * only the pure half is counted for coverage.
     *
     * ⚠️ IT HAS TO BE GENERATED, NOT A FILE IN `public/`. Two halves:
     *   - the shell is content-hashed, so a hand-written list goes stale at the next
     *     build and precaches a 404 — the same argument the font-preload plugin above
     *     makes about hardcoding a filename;
     *   - the browser only re-installs a service worker whose BYTES changed, so a
     *     static `sw.js` would pin the first shell it ever saw, forever.
     */
    {
      name: 'run-offline-shell',
      apply: 'build' as const,
      generateBundle(_options: unknown, bundle: Record<string, unknown>) {
        const shell = shellFromBundle(bundle) as string[]
        // The two immutable-but-unhashed files are read from public/ so their BYTES
        // reach the version hash. Without this a decoder bump leaves the worker
        // byte-identical and the stale decoder is served from cache indefinitely.
        const contents: Record<string, string> = {}
        for (const path of shell) {
          if (path === '/' || path.startsWith('/assets/')) continue
          try {
            contents[path] = readFileSync(join(import.meta.dirname, 'public', path), 'utf8')
          } catch {
            // A shell entry that is not on disk is a bug, but failing the build here
            // would trade a stale-cache risk for no deploy at all. The version simply
            // falls back to being name-derived for that entry.
          }
        }
        const version = serviceWorkerVersion(shell, contents) as string
        ;(this as { emitFile: (file: unknown) => void }).emitFile({
          type: 'asset',
          fileName: 'sw.js',
          source: serviceWorkerSource({ shell, version }),
        })
      },
    },
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
        /**
         * ROLLDOWN'S NATIVE CHUNKER, NOT `manualChunks` — and the swap is the fix
         * for a defect that survived three previous repairs of this same block.
         *
         * WHAT KEPT BREAKING. Motion is imported by exactly one module,
         * `polish/Cursor`, which renders null on touch, under reduced motion and
         * under automation, and which `polish/index.ts` dynamically imports only
         * after a pointer check. Despite that, the ENTRY chunk carried a static
         * `import{a as t,i as n}from"./motion-*.js"`, so every phone fetched
         * 130,808 bytes (48,273 gzip) of spring physics before first paint for a
         * crosshair it can never show. Verified on the deployed bundle and on a
         * live mobile load where `isCoarsePointer()` was true and `Cursor-*.js`
         * was correctly never requested — the runtime gate worked, it was simply
         * gating the wrong 2 KB, because a static import is resolved long before
         * any gate can have an opinion.
         *
         * WHY `manualChunks` COULD NOT FIX IT. It was instrumented on 2026-08-19:
         * it returns 'react' for `react/jsx-runtime.js` and
         * `react/cjs/react-jsx-runtime.production.js` exactly as intended.
         * Rolldown then DUPLICATED those CommonJS modules into the motion chunk
         * regardless — `react.transitional.element` greps in both the react chunk
         * and the motion chunk of one build — and the entry bound to the copy.
         * The rollup-compatibility layer simply does not govern the synthetic CJS
         * wrapper modules; `advancedChunks` does. Measured after the swap: the
         * react chunk grew 181,753 -> 189,589 (it now owns the copy that was being
         * duplicated), motion shrank 130,808 -> 122,987, total bytes unchanged,
         * and the entry's import of motion is GONE.
         *
         * FOUR EARLIER ATTEMPTS, recorded so they are not retried blind:
         *   - own chunk for `src/lib/motion.ts` — created it (25 B), no effect;
         *     our own constants were never the cause despite an old comment here
         *     warning that they had been once.
         *   - own chunk for jsx-runtime — shared it (435 B), cut the entry's motion
         *     imports 2 -> 1, still fetched.
         *   - splitting react / react-dom — React core just moved into the
         *     react-dom chunk; entry still bound to motion.
         *   - deleting the motion rule so Cursor's dynamic chunk owned Motion —
         *     WORSE: rolldown folded Motion into the react chunk (181 -> 310 KB),
         *     making it unconditional rather than merely eager.
         *
         * THE INVARIANTS THIS BLOCK EXISTS TO HOLD, each learned from a defect:
         *   - React needs its own group, or `react-dom/client` (pulled in to host
         *     the cursor) lands in the motion chunk and drags Motion into the
         *     entry to get `createRoot`.
         *   - Motion and Lenis must NOT share a chunk. Lenis is used by every
         *     visitor including on touch; Motion is not. Shared, the unconditional
         *     one drags in the conditional one and lazy-loading Cursor buys
         *     nothing.
         *   - model-viewer bundles three.js and stays in its own lazy chunk so the
         *     poster-first shell stays small.
         *
         * Pinned by `e2e/motion-and-layout.spec.ts` -> "a touch device does not
         * download the Motion chunk", which is a real assertion now. An older
         * comment here claimed that test already existed when it never had, which
         * is the direct reason the same failure recurred four times.
         */
        advancedChunks: {
          groups: [
            /**
             * ⚠️ VITE'S OWN PRELOAD HELPER, IN A CHUNK OF ITS OWN — AND IT IS THE
             * SINGLE HEAVIEST THING IN THIS FILE. 286,496 bytes gzip.
             *
             * `__vitePreload` is the ~700-byte runtime function that loads a
             * dynamically-imported chunk. Rolldown places it in whichever chunk
             * it likes, and it had landed in the **model-viewer** chunk. Both the
             * entry and the polish layer import that one function from there —
             * and a static ES import of ANY symbol forces the browser to fetch
             * and evaluate the ENTIRE chunk. So the entry could not run until
             * 1,024,060 bytes (286,496 gzip) of three.js had arrived.
             *
             * Measured on the live waterfall 2026-08-19: `model-viewer-*.js` was
             * requested in the same burst as `index-*.js`, not after it.
             *
             * WHAT THAT DEFEATED. `Stage.tsx` imports model-viewer with a genuine
             * `await import()`, and `canRender3D()` in lib/capabilities.ts refuses
             * 3D outright when `navigator.connection.saveData` is set. Neither
             * could help: the bytes were already committed before any of that code
             * ran. The `modulePreload` filter above is a separate, real fix for a
             * separate problem — it removes the `<link rel=modulepreload>` HINT —
             * but a hint is not what was fetching this. A static import is.
             *
             * The comment on that filter says a phone "downloaded a 3D engine it
             * was about to decline". That was still true after the filter landed,
             * for this reason, and this is what actually stops it.
             *
             * AFTER: the entry's only static imports are this helper (703 B gzip),
             * react, and the rolldown runtime; model-viewer is reached through
             * `await import(\`./model-viewer-*.js\`)`. Total bytes on disk are
             * unchanged — 287 KB simply stopped being on the critical path.
             * Verified on the iOS 26.5 simulator that the garment still renders,
             * and by the full e2e suite, which loads a real model in a real
             * browser on three engines.
             *
             * `priority: 200` so it outranks every vendor group below; the helper
             * must never be absorbed into a big chunk again.
             */
            { name: 'preload-helper', priority: 200, test: /preload-helper/ },
            {
              name: 'react',
              priority: 100,
              test: /[/\\]node_modules[/\\](react|react-dom|scheduler)[/\\]/,
            },
            {
              name: 'model-viewer',
              priority: 90,
              test: /[/\\]node_modules[/\\](@google[/\\]model-viewer|three)[/\\]/,
            },
            {
              name: 'motion',
              priority: 80,
              test: /[/\\]node_modules[/\\](motion|framer-motion|motion-dom|motion-utils)[/\\]/,
            },
            { name: 'lenis', priority: 70, test: /[/\\]node_modules[/\\]lenis[/\\]/ },
          ],
        },
      },
    },
  },
  server: {
    port: 5173,
  },
})
