import { expect, test } from '@playwright/test'

/**
 * The 404 page, and the catch-all route that makes it reachable.
 *
 * ⚠️ THE SHADOWING CASES BELOW ARE THE POINT OF THIS FILE. Reaching the branded 404
 * required a catch-all route at the root of the (frontend) group, and a catch-all is
 * exactly the kind of change that can quietly swallow everything else the Worker serves
 * — the Payload admin, the public REST API, the robots and sitemap conventions, and the
 * static files in public/. Next's specificity rules say it does not. This proves it,
 * because getting it wrong takes down the admin and the API together and the only
 * symptom on the 404 itself would be that it works.
 */

test.describe('the branded 404', () => {
  test('answers 404 with the site chrome and a way out', async ({ page }) => {
    // Before the catch-all existed this rendered Next's own bare "404: This page could
    // not be found" — no navigation, no way back, on a site whose URLs are printed on
    // physical QR tags.
    const response = await page.goto('/definitely-not-a-page')
    expect(response?.status()).toBe(404)

    await expect(page.locator('h1')).toContainText(/isn.t here/i)
    await expect(page.locator('.notch__nav a')).toHaveCount(2)
    await expect(page.locator('.site-footer')).toBeVisible()
    // both routes out are offered
    await expect(page.locator('main a[href="/products"]')).toBeVisible()
    await expect(page.locator('main a[href="/contact"]')).toBeVisible()
  })

  test('is not indexable, unlike every other page under this layout', async ({ page }) => {
    // The layout sets `index: true` for everything beneath it, which is right for the
    // three real pages and wrong for this one: a 404 that invites indexing is how "Page
    // not found" ends up in Google under the company name.
    await page.goto('/definitely-not-a-page')
    /*
     * ⚠️ ASSERTS EVERY TAG, NOT A COUNT. This route always carries two: Next adds its own
     * `noindex` to a not-found page on top of whatever the metadata chain produces. An
     * earlier attempt removed the page's own `robots` to avoid the duplicate and made it
     * worse — the page then inherited the layout's `index, follow` and told crawlers both
     * `noindex` and `index` at once. What matters is that NONE of them invites indexing.
     */
    const contents = await page
      .locator('meta[name="robots"]')
      .evaluateAll((tags) => tags.map((tag) => tag.getAttribute('content') ?? ''))
    expect(contents.length).toBeGreaterThan(0)
    for (const content of contents) {
      expect(content, `a robots tag invites indexing: "${content}"`).toContain('noindex')
    }
  })

  test('a link out of the 404 actually works', async ({ page }) => {
    await page.goto('/definitely-not-a-page')
    await page.locator('main a[href="/products"]').click()
    await expect(page).toHaveURL(/\/products$/)
    await expect(page.locator('h1')).toContainText(/Every garment/i)
  })
})

test.describe('the catch-all shadows nothing', () => {
  const MUST_STILL_WORK = [
    { path: '/admin', label: 'the Payload admin' },
    { path: '/api/media?limit=1', label: 'the REST API' },
    { path: '/robots.txt', label: 'robots.txt' },
    { path: '/sitemap.xml', label: 'sitemap.xml' },
    { path: '/og-default.png', label: 'the social card' },
    { path: '/icon.svg', label: 'the fallback tab icon' },
  ]

  for (const route of MUST_STILL_WORK) {
    test(`${route.label} is not swallowed`, async ({ request }) => {
      const response = await request.get(route.path)
      expect(response.status(), `${route.path} returned ${response.status()}`).toBe(200)
      // A 200 that is secretly the HTML 404 would pass a status check, so assert the
      // body is not the not-found page.
      const body = await response.text()
      expect(body).not.toContain('404 · PAGE NOT FOUND')
    })
  }
})

test.describe('content security policy', () => {
  test('the public pages carry a real policy', async ({ request }) => {
    const csp = (await request.get('/')).headers()['content-security-policy'] ?? ''
    expect(csp).toContain("default-src 'self'")
    /*
     * ⚠️ NO NONCE ASSERTION, DELIBERATELY. A nonce needs per-request middleware and this
     * stack cannot run one: measured 2026-09-05, `proxy.ts` on the Node runtime fails
     * `opennextjs-cloudflare build` ("Node.js middleware is not currently supported"),
     * and with `runtime: 'edge'` it fails earlier ("Proxy does not support Edge
     * runtime") — both while `pnpm build` stayed green.
     *
     * These three are what the policy is actually worth, and none of them depends on
     * inline scripts: base-tag hijacking of every relative URL, plugin execution, and a
     * stolen page posting somewhere else.
     */
    expect(csp).toContain("object-src 'none'")
    expect(csp).toContain("base-uri 'self'")
    expect(csp).toContain("form-action 'self'")
    expect(csp).toContain("frame-ancestors 'none'")
  })

  test('the admin does NOT get it', async ({ request }) => {
    // Payload's bundle needs inline styles and dynamic imports; next.config.mjs records
    // why it deliberately has no full policy. Widening the source list would break the
    // login rather than fail loudly.
    const csp = (await request.get('/admin')).headers()['content-security-policy'] ?? ''
    expect(csp).toBe("frame-ancestors 'none'")
  })

  test('every page still runs its scripts under the policy', async ({ page }) => {
    // The failure this guards against is silent: a refused script leaves only a console
    // entry and the page still "loads".
    const refusals: string[] = []
    page.on('console', (message) => {
      if (/Content Security Policy|Refused to (execute|load)/i.test(message.text())) {
        refusals.push(message.text())
      }
    })
    for (const path of ['/', '/products', '/contact']) {
      await page.goto(path)
      await page.waitForLoadState('networkidle')
    }
    expect(refusals, 'the CSP blocked something the page needs').toEqual([])
  })
})
