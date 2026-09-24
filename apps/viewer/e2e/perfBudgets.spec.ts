import { expect, request, test } from '@playwright/test'

/**
 * Performance-budget robots for the viewer's own page.
 *
 * Deliberately its own file, not `motion-and-layout.spec.ts` — that file is shared
 * Phase-2 territory (Phase 1b-B's header work, Batch C's `.stage__callouts` gate,
 * Batch E's IM-06), and every Performance/Cross-surface robot in this batch avoids
 * adding to it for the same reason.
 *
 * Fetches the BUILT page's own HTML via `request`, not a full `page.goto()` — the
 * questions here (which tags exist, what attributes they carry) are answered by the
 * markup itself, and a raw fetch is faster and cannot be confused by anything a script
 * does after load.
 */

/**
 * PF-16 — render-blocking count and preload discipline.
 *
 * The e2e fixture omits the Cloudflare beacon script on purpose (see
 * `e2e/serve.mjs`, "cf beacon omitted: e2e runs offline"), so this counts one fewer
 * `<script src>` than production. That does not weaken the assertion: production's
 * beacon also carries `type="module"`, so the "every script with a src is
 * async/defer/module/noModule" rule holds for both shapes; what changes is only how
 * many script tags exist to check.
 */
test.describe('PF-16 — render-blocking discipline (viewer product page)', () => {
  test('every <script src> carries async, defer, type="module" or noModule', async ({
    baseURL,
  }) => {
    const ctx = await request.newContext()
    const html = await (await ctx.get(`${baseURL}/n001/wine`)).text()
    await ctx.dispose()

    const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
    const withSrc = scriptTags.filter((tag) => /\bsrc="[^"]*"/.test(tag))
    const blocking = withSrc.filter(
      (tag) => !/\basync\b|\bdefer\b|\btype="module"|\bnoModule\b/.test(tag),
    )

    expect(withSrc.length, 'no <script src> at all — the assertion below would pass vacuously').toBeGreaterThan(
      0,
    )
    expect(
      blocking,
      `classic blocking <script src> found on the viewer product page: ${blocking.join('\n')}`,
    ).toEqual([])
  })

  /**
   * Measured fresh against this fixture's own build, 2026-09-24 — never carried
   * forward from the plan's own citation, which was a live-production number for a
   * different (production-shaped) page. 4 `rel="preload"` (meshopt decoder, the HDR
   * environment map, 2 font subsets) + 3 `rel="modulepreload"` (rolldown-runtime,
   * react, preload-helper) = 7.
   */
  test('preload + modulepreload count matches the measured baseline', async ({ baseURL }) => {
    const ctx = await request.newContext()
    const html = await (await ctx.get(`${baseURL}/n001/wine`)).text()
    await ctx.dispose()

    const preloadCount = (html.match(/rel="preload"/g) ?? []).length
    const modulePreloadCount = (html.match(/rel="modulepreload"/g) ?? []).length

    expect(
      preloadCount,
      `preload count drifted (${preloadCount}) — re-measure before changing this number, ` +
        'do not just raise it',
    ).toBe(4)
    expect(
      modulePreloadCount,
      `modulepreload count drifted (${modulePreloadCount}) — re-measure before changing this ` +
        'number, do not just raise it',
    ).toBe(3)
  })
})
