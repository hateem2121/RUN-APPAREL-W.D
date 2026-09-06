import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The build must not preload the two chunks `manualChunks` exists to defer.
 *
 * WHY THIS EXISTS. Vite's default `modulePreload` walks the dynamic-import graph
 * and emits a `<link rel="modulepreload">` for every chunk it finds, including
 * ones that were deliberately split out to stay lazy. Measured on 2026-08-14,
 * `dist/index.html` carried preload links for `model-viewer` (294.50 kB gzip)
 * and `motion` (53.81 kB gzip).
 *
 * The consequence is not merely weight. `canRender3D()` returns false when
 * `navigator.connection.saveData` is set, under the comment "Respect reduced-data
 * mode" — and the browser had already fetched 294 kB of renderer before React
 * could evaluate that guard. The guard was written, was correct, and was
 * defeated by the build.
 *
 * ⚠️ NOTHING ELSE CATCHES THIS. Every chunk keeps its exact byte count, so
 * `check-bundle-budget.mjs` sees no change; the chunks are still lazy in the
 * module graph, so no import assertion sees it either. The only observable is
 * the tags themselves.
 */
const DIST = join(import.meta.dirname, '..', 'dist')
const INDEX = join(DIST, 'index.html')

/**
 * ⚠️ THIS GUARD RAN NOWHERE THAT MATTERED UNTIL 2026-08-29.
 *
 * The three checks below were `skipIf(!existsSync(INDEX))`, and `dist/` is
 * gitignored. CI runs `pnpm test:coverage` (ci.yml) BEFORE `pnpm build`, so on a
 * clean checkout the build did not exist yet and all three skipped — every run.
 * Measured both ways on a byte-identical tree: with a stale local build 4 pass; in a
 * clean checkout 1 passes and 3 skip. So the only thing standing between the shell and
 * a re-shipped 294 kB of 3D renderer ran ONLY on a developer machine carrying an old
 * build. That is the `public/draco/` trap exactly inverted — passing locally because
 * of an artifact a clean checkout does not have.
 *
 * The fix is not to reorder CI (that would run `seed:assets` before the suite and
 * change what the tests see). It is a dedicated CI step AFTER `pnpm build` that sets
 * this variable, which turns the skip into a hard failure. Locally, a missing build
 * still skips, so `pnpm test` stays fast and honest.
 */
const REQUIRE_BUILD = process.env.REQUIRE_BUILD_ARTIFACTS === '1'
const HAS_BUILD = existsSync(INDEX)
/**
 * Escapes every regex metacharacter, not just `.`. The old
 * `host.replace(/\./g, '\\.')` was correct for today's two literal hostnames and
 * wrong for anything else (CodeQL js/incomplete-sanitization).
 *
 * RegExp.escape() would be the modern form and DOES exist in Node 24.18.1 —
 * verified by running it, against published articles claiming Node lacks it. It is
 * not used because every workspace pins `lib: ES2022` and tsc rejects it there with
 * TS2550, verified by compiling a probe at the repo's own target. ES2022 is a
 * shipped-browser floor; it is not raised to satisfy one test file.
 */
function escapeRegex(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const SOURCE_INDEX = join(import.meta.dirname, '..', 'index.html')

const LAZY_CHUNKS = ['model-viewer', 'motion'] as const

describe('build output', () => {
  it('has a build to inspect whenever one is REQUIRED (the CI post-build step)', () => {
    /*
     * The whole point of REQUIRE_BUILD_ARTIFACTS. Without this, a CI step that forgot to
     * build would let the three guards below skip and report green — the exact failure
     * this file exists to stop, one level up. Locally REQUIRE_BUILD is unset and this
     * passes trivially, which is intended.
     */
    expect(REQUIRE_BUILD && !HAS_BUILD).toBe(false)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'does not modulepreload the chunks that are meant to stay lazy',
    () => {
      const html = readFileSync(INDEX, 'utf8')
      for (const chunk of LAZY_CHUNKS) {
        const preloaded = new RegExp(`modulepreload[^>]*${chunk}-[^>]*\\.js`).test(html)
        expect(
          preloaded,
          `dist/index.html preloads the "${chunk}" chunk. It is split out in ` +
            'vite.config.ts precisely so it is NOT fetched up front — preloading it ' +
            "defeats canRender3D()'s Save-Data guard before React can evaluate it.",
        ).toBe(false)
      }
    },
  )
})

describe('the Latin fonts are preloaded, and only those', () => {
  /**
   * ⚠️ ASSERTED AGAINST dist/, NOT index.html, AND THAT IS THE POINT. The filenames
   * are content-hashed, so these links cannot live in the source HTML — a hardcoded
   * one would go stale at the next font bump and preload a 404, which is strictly
   * WORSE than no hint because the browser then fetches twice. They are injected by
   * the `run-preload-latin-fonts` plugin in vite.config.ts, which reads the emitted
   * bundle, so the only place the claim can be checked is the build.
   */
  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)(
    'preloads exactly the two Latin faces, each with crossorigin',
    () => {
      const html = readFileSync(INDEX, 'utf8')
      const links = html.match(/<link[^>]*rel="preload"[^>]*as="font"[^>]*>/g) ?? []

      expect(
        links.length,
        'expected exactly two font preloads — Archivo latin and Instrument Serif ' +
          'latin. A different count means the plugin matched the wrong subsets.',
      ).toBe(2)

      const joined = links.join('\n')
      expect(joined).toMatch(/archivo-latin-/)
      expect(joined).toMatch(/instrument-serif-latin-/)

      // ⚠️ The half that gets dropped. Fonts are fetched in CORS mode even
      // same-origin; without this the preload opens a connection in the wrong
      // credentials mode and the real request opens a SECOND one, so the hint
      // costs a round trip instead of saving one.
      for (const link of links) {
        expect(link, `a font preload without crossorigin: ${link}`).toMatch(/crossorigin/)
      }

      // Latin only. Preloading a subset this audience does not render would fetch
      // bytes for nothing, which is the opposite of the point.
      expect(joined, 'latin-ext must not be preloaded').not.toMatch(/latin-ext/)
      expect(joined, 'vietnamese must not be preloaded').not.toMatch(/vietnamese/)
      expect(joined, 'the .woff fallbacks are never chosen by a modern browser').not.toMatch(
        /\.woff"/,
      )
    },
  )
})

describe('the head', () => {
  it('preloads the meshopt decoder as a script and the lighting map as a CORS fetch (Rank 6)', () => {
    /**
     * Both used to start only after the model-viewer chunk arrived and asked for them
     * (audit LIVE-10). The decoder is injected as a classic <script>, so `as="script"`;
     * the HDR is read over fetch in CORS mode, so `as="fetch"` WITH `crossorigin` — a
     * fetch preload without it is a second connection, not a hint.
     */
    const html = readFileSync(SOURCE_INDEX, 'utf8')
    expect(html).toMatch(/<link rel="preload" href="\/meshopt_decoder\.js" as="script" \/>/)
    expect(html).toMatch(
      /<link rel="preload" href="\/env\/studio-soft\.hdr" as="fetch" crossorigin="anonymous" \/>/,
    )
    // The negative shape: no fetch preload may ship without the attribute.
    const fetchPreloads = html.match(/<link rel="preload"[^>]*as="fetch"[^>]*>/g) ?? []
    expect(fetchPreloads.length).toBeGreaterThan(0)
    for (const line of fetchPreloads) expect(line).toMatch(/crossorigin/)
  })

  it('preconnects to both cross-origin hosts on the critical path', () => {
    /**
     * The page's critical path runs through two cross-origin hosts —
     * `cms.wear-run.help` for the product payload and `media.wear-run.help` for
     * the 27 MB model — and neither had a preconnect. Each therefore paid DNS +
     * TCP + TLS serially at the moment it was first needed, on a phone that has
     * just scanned a QR tag.
     *
     * ⚠️ `crossorigin` is REQUIRED on both and is the half that gets dropped.
     * Both are CORS requests — `fetchWithProgress` reads `content-length` and the
     * payload fetch is a plain cross-origin GET — and a preconnect without the
     * attribute opens a connection in the wrong credentials mode, so the browser
     * opens a SECOND one when the real request arrives. That is strictly worse
     * than having no hint at all.
     */
    const html = readFileSync(SOURCE_INDEX, 'utf8')
    for (const host of ['cms.wear-run.help', 'media.wear-run.help']) {
      const tag = new RegExp(`<link[^>]*rel="preconnect"[^>]*${escapeRegex(host)}[^>]*>`)
      const match = html.match(tag)
      expect(match, `no preconnect for ${host}`).not.toBeNull()
      expect(
        match?.[0],
        `the preconnect for ${host} is missing crossorigin — without it the ` +
          'browser opens a second connection for the real CORS request, which is ' +
          'worse than no hint',
      ).toMatch(/crossorigin/)
    }
  })
})

describe('the lazy chunks stay lazy', () => {
  /**
   * WHAT THIS PINS, AND WHAT IT DELIBERATELY DOES NOT.
   *
   * The goal (VANITY-01) was that a phone should not pay for Motion — 53.81 kB
   * gzip imported by exactly one module, `polish/Cursor`, which renders null on
   * touch. Three things were fixed and are asserted below:
   *
   *   1. Neither lazy chunk is MODULEPRELOADED. This was the Phase 1 defect:
   *      the build emitted preload links for model-viewer and motion, so the
   *      browser fetched 294 kB of renderer before `canRender3D()` could apply
   *      its Save-Data guard.
   *   2. The polish chunk carries NO static import of the motion chunk. It did,
   *      because polish/index.ts imported React to mount the cursor and the
   *      bundler resolved `createElement` out of the motion chunk. Mounting
   *      moved into Cursor itself.
   *   3. Motion and Lenis are SEPARATE chunks. They shared one, and Lenis is
   *      used by every visitor including on touch — so the shared chunk made
   *      lazy-loading Cursor pointless.
   *
   * ⚠️ NOT ASSERTED: that the motion chunk is never requested at all. The ENTRY
   * chunk still statically imports it — rolldown co-locates a React CommonJS
   * interop shim there, and no `manualChunks` arrangement tried on 2026-08-14
   * dislodged it. That is bundler-internal and pre-existing. An e2e test written
   * against a touch context to assert "never fetched" therefore cannot pass, and
   * was removed rather than left red or weakened into meaninglessness.
   */
  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('splits motion and lenis into separate chunks', () => {
    const assets = join(DIST, 'assets')
    const files = existsSync(assets) ? readdirSync(assets) : []
    expect(
      files.filter((f) => /^motion-.*\.js$/.test(f)),
      'no motion chunk was emitted — did manualChunks change?',
    ).toHaveLength(1)
    expect(
      files.filter((f) => /^lenis-.*\.js$/.test(f)),
      'Lenis must be its own chunk: it is used by every visitor, including on ' +
        'touch, so sharing a chunk with Motion makes the cursor gate pointless',
    ).toHaveLength(1)
  })

  it.skipIf(!HAS_BUILD && !REQUIRE_BUILD)('keeps the motion chunk out of the polish chunk', () => {
    const assets = join(DIST, 'assets')
    const polish = readdirSync(assets).find((f) => /^polish-.*\.js$/.test(f))
    expect(polish, 'no polish chunk emitted').toBeTruthy()
    const source = readFileSync(join(assets, polish as string), 'utf8')
    expect(
      /from"\.\/motion-[^"]*"/.test(source),
      'the polish chunk statically imports the motion chunk, so every visitor ' +
        'downloads Motion regardless of the pointer gate in polish/index.ts. ' +
        'Check that nothing in polish/ imports React — see the comment there.',
    ).toBe(false)
  })
})
