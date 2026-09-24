import { expect, request, test } from '@playwright/test'

/**
 * Performance-budget robots for the site pages — the CMS-side half of `where: both`
 * Performance rows. Own file rather than an existing spec: nothing here needs a real
 * browser, so it fetches the built HTML directly (via `request`, not `page.goto`),
 * which is also faster and cannot be confused by anything a script does after load.
 */

const PAGES = ['/', '/products', '/contact'] as const

/**
 * PF-16 — render-blocking count and preload discipline.
 *
 * Measured fresh against this fixture's own build with one seeded product,
 * 2026-09-24 — never carried forward from the plan's own citation, which was a
 * live-production number against 32 published products (the count of image preload
 * hints on `/products` scales with the catalogue, so a fixture with one product is not
 * the number to pin there; the script-preload count and the render-blocking rule do
 * not scale with catalogue size, so those are what this file asserts).
 */
for (const path of PAGES) {
  test.describe(`PF-16 — render-blocking discipline (${path})`, () => {
    test('every <script src> carries async, defer, type="module" or noModule', async ({
      baseURL,
    }) => {
      const ctx = await request.newContext()
      const html = await (await ctx.get(`${baseURL}${path}`)).text()
      await ctx.dispose()

      const scriptTags = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0])
      const withSrc = scriptTags.filter((tag) => /\bsrc="[^"]*"/.test(tag))
      const blocking = withSrc.filter(
        (tag) => !/\basync\b|\bdefer\b|type="module"|noModule/.test(tag),
      )

      expect(
        withSrc.length,
        `no <script src> at all on ${path} — the assertion below would pass vacuously`,
      ).toBeGreaterThan(0)
      expect(
        blocking,
        `classic blocking <script src> found on ${path}: ${blocking.join('\n')}`,
      ).toEqual([])
    })

    test('preload + modulepreload count matches the measured baseline', async ({ baseURL }) => {
      const ctx = await request.newContext()
      const html = await (await ctx.get(`${baseURL}${path}`)).text()
      await ctx.dispose()

      const preloadCount = (html.match(/rel="preload"/g) ?? []).length
      const modulePreloadCount = (html.match(/rel="modulepreload"/g) ?? []).length

      // One low-priority script preload (Next's own hydration entry, carrying its own
      // `id`) on every page today — none of the three pages preloads an image via a
      // <link>; /products' first poster instead gets eager loading + fetchPriority on
      // the <img> itself, asserted separately below.
      expect(
        preloadCount,
        `${path} now hints ${preloadCount} preloads — re-measure before changing this number, ` +
          'do not just raise it',
      ).toBe(1)
      expect(modulePreloadCount, `${path} now hints ${modulePreloadCount} modulepreloads`).toBe(0)
    })
  })
}

test.describe('PF-16 — the first poster on /products is eager and high priority', () => {
  test('the first product card image carries loading=eager + fetchPriority=high', async ({
    baseURL,
  }) => {
    const ctx = await request.newContext()
    const html = await (await ctx.get(`${baseURL}/products`)).text()
    await ctx.dispose()

    const firstImg = html.match(/<img\b[^>]*class="product-card__img"[^>]*>/)?.[0]
    expect(firstImg, 'no product card image found on /products — is the fixture seeded?').toBeTruthy()
    expect(firstImg).toMatch(/loading="eager"/)
    expect(firstImg).toMatch(/fetchPriority="high"/)
  })
})
