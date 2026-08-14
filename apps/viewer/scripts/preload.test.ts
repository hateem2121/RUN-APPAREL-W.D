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
const SOURCE_INDEX = join(import.meta.dirname, '..', 'index.html')

const LAZY_CHUNKS = ['model-viewer', 'motion'] as const

describe('build output', () => {
  it.skipIf(!existsSync(INDEX))(
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

describe('the head', () => {
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
      const tag = new RegExp(`<link[^>]*rel="preconnect"[^>]*${host.replace(/\./g, '\\.')}[^>]*>`)
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
  it.skipIf(!existsSync(INDEX))('splits motion and lenis into separate chunks', () => {
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

  it.skipIf(!existsSync(INDEX))('keeps the motion chunk out of the polish chunk', () => {
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
