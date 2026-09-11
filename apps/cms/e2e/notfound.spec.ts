import { expect, test } from '@playwright/test'

/**
 * The 404 page — and the two ways it has been broken.
 *
 * ⚠️ IT MUST RENDER WITHOUT JAVASCRIPT, AND FOR MONTHS IT DID NOT. The branded page was a
 * `[...unmatched]` catch-all inside (frontend) calling `notFound()`. Measured 2026-09-06
 * by three instruments, two of them independent: a blank white screen with scripting off
 * — 0 characters of body text, no heading, no links, on every wrong URL, while the three
 * real pages rendered fully in the same run (FA-I-01, FA-P-01). The page built to prevent
 * a dead end WAS the dead end.
 *
 * The cause is upstream and still open: `notFound()` does not server-render its page,
 * delivering the markup only inside the Flight payload (vercel/next.js#62228, #57583).
 * Next's OWN unmatched handling does render, so the catch-all was deleted and
 * `src/app/not-found.tsx` took its place. The no-JS case below is the guard.
 *
 * ⚠️ THE SHADOWING CASES ARE THE SECOND POINT OF THIS FILE. Anything answering unmatched
 * URLs can quietly swallow everything else the Worker serves — the Payload admin, the
 * public REST API, the robots and sitemap conventions, and the static files in public/.
 * Next's specificity rules say it does not. This proves it, because getting it wrong
 * takes down the admin and the API together and the only symptom on the 404 itself would
 * be that it works.
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
    // both routes out are offered
    await expect(page.locator('main a[href="/products"]')).toBeVisible()
    await expect(page.locator('main a[href="/contact"]')).toBeVisible()
    /*
     * ⚠️ THE EMAIL IN FULL, NOT ONLY BEHIND A BUTTON — and it comes from the shared
     * defaults rather than from D1. This page reads no database on purpose: a 404 is
     * disproportionately likely to be reached during exactly the failure that would make
     * that read fail, and its whole job is to work when something else has not.
     */
    await expect(page.locator('main a[href^="mailto:"]')).toBeVisible()

    /*
     * ⚠️ AND THE SITE'S FOOTER SINCE 2026-09-11, which this comment used to say was absent
     * "for the same reason". It no longer needs D1: it renders from `FALLBACK_SITE_SETTINGS`,
     * the object `getSiteSettings()` returns during an outage (audit LA-05 — a broken link
     * offered no address, no privacy notice and no terms).
     */
    const footer = page.locator('footer.site-footer')
    await expect(footer).toHaveCount(1)
    await expect(footer.locator('a[href="/privacy"]')).toHaveCount(1)
    await expect(footer.locator('a[href="/terms"]')).toHaveCount(1)
    await expect(footer.locator('a[href^="mailto:"]').first()).toBeVisible()
  })

  /**
   * ⚠️ THE REGRESSION GUARD FOR THE DEFECT THIS PAGE WAS REBUILT AROUND (FA-I-01,
   * FA-P-01), AND FOR THE GAP THAT LET IT SHIP (FA-T-09).
   *
   * `apps/cms/e2e/` already asserted that the three real pages render with scripting off.
   * It skipped the one page whose entire purpose is recovering from a broken link — which
   * is how a blank 404 survived a full audit's worth of green tests.
   *
   * `javaScriptEnabled: false` is the actual condition, not an approximation of it: the
   * browser never runs the Flight payload, so what this sees is what a visitor behind a
   * corporate proxy, a privacy extension or a failed script fetch receives.
   */
  test.describe('with scripting off', () => {
    test.use({ javaScriptEnabled: false })

    test('the 404 is rendered HTML, not a Flight payload', async ({ page }) => {
      const response = await page.goto('/definitely-not-a-page')
      expect(response?.status()).toBe(404)

      await expect(page.locator('h1')).toContainText(/isn.t here/i)
      await expect(page.locator('main a[href="/products"]')).toBeVisible()
      await expect(page.locator('main a[href="/contact"]')).toBeVisible()
      // The footer's routes out are HTML too, not something hydration adds (LA-05).
      await expect(page.locator('footer.site-footer a[href="/privacy"]')).toHaveCount(1)
      await expect(page.locator('footer.site-footer a[href="/terms"]')).toHaveCount(1)

      // The measurement that failed before the fix: 0 characters of body text.
      const text = await page.locator('body').innerText()
      expect(
        text.replace(/\s+/g, ' ').trim().length,
        'the 404 body is empty without JavaScript — notFound() is back, or the page moved ' +
          'into a route group. See the docblock above and vercel/next.js#62228.',
      ).toBeGreaterThan(200)
    })

    test('the three real pages still render too — the control', async ({ page }) => {
      // Without this the test above could pass on a page that renders nothing at all
      // anywhere, which is a state this suite should also notice.
      for (const path of ['/', '/products', '/contact']) {
        await page.goto(path)
        await expect(page.locator('h1'), `${path} has no heading without JS`).toBeVisible()
      }
    })
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

test.describe('the 404 shadows nothing', () => {
  /*
   * ⚠️ THE REST API ROW EXPECTS 403, NOT 200, AND THAT IS THE POINT OF THE ROW.
   * `Media.read` became `isAuthenticated` on main on 2026-09-05 (the collection was
   * enumerating every model URL to anyone), so an anonymous `GET /api/media` is now
   * refused BY PAYLOAD — a JSON 403 from the API is proof the request reached the API.
   * What this test guards against is the catch-all answering instead, which is the
   * HTML not-found page with a 404. Written as 200 before that change landed, it
   * failed the first time the two branches met.
   */
  const MUST_STILL_WORK = [
    { path: '/admin', label: 'the Payload admin', status: 200 },
    { path: '/api/media?limit=1', label: 'the REST API', status: 403, json: true },
    { path: '/robots.txt', label: 'robots.txt', status: 200 },
    { path: '/sitemap.xml', label: 'sitemap.xml', status: 200 },
    { path: '/og-default.png', label: 'the social card', status: 200 },
    { path: '/icon.svg', label: 'the fallback tab icon', status: 200 },
  ]

  for (const route of MUST_STILL_WORK) {
    test(`${route.label} is not swallowed`, async ({ request }) => {
      const response = await request.get(route.path)
      expect(response.status(), `${route.path} returned ${response.status()}`).toBe(route.status)
      if (route.json) {
        // The refusal must come from Payload — JSON — not from a page that happens
        // to carry the same status.
        expect(response.headers()['content-type'] ?? '').toContain('json')
      }
      /*
       * A matching status that is secretly the HTML 404 would pass the check above, so
       * assert the body is not the not-found page.
       *
       * ⚠️ AGAINST RENDERED MARKUP, NOT RAW HTML, AND THAT DISTINCTION COST A DEBUGGING
       * ROUND. When the branded 404 moved to `src/app/not-found.tsx` on 2026-09-07, Next
       * began inlining that route's chunk into EVERY document — so `/admin` contains the
       * string "404 · PAGE NOT FOUND" as bundled data while rendering "Dashboard — RUN
       * APPAREL CMS" perfectly well at 200. The raw-text assertion failed on a page that
       * was entirely correct.
       *
       * Stripping `<script>` blocks is what separates what a visitor SEES from what the
       * response happens to carry. This is the fifth time this repo has recorded the same
       * shape of false positive — a check matching prose or payload rather than output —
       * and the fix is always the same.
       */
      const body = await response.text()
      const rendered = body.replace(/<script[\s\S]*?<\/script>/g, '')
      expect(rendered).not.toContain('404 · PAGE NOT FOUND')
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

  /**
   * ⚠️ ON THE DOCUMENTS AND NOT ON THE API, WHICH IS THE POINT OF BOTH HALVES.
   *
   * COOP severs `window.opener`; CORP says this document may not be embedded as a
   * subresource by another origin, covering every path `frame-ancestors` does not
   * (FA-O-07).
   *
   * The second assertion is the one that matters more. The viewer fetches
   * `/api/public/viewer/*` from another origin, and CORP's interaction with a CORS fetch
   * is subtler than it looks — the failure mode is the 3D pages rendering "REFERENCE
   * UNAVAILABLE" intermittently, which is precisely the incident publicViewer.ts already
   * records from the Vary/ACAO episode. Putting these in `SECURITY_HEADERS` would have
   * applied them to every route; this proves they did not.
   *
   * COEP is absent on purpose: `require-corp` demands a CORP header from every
   * cross-origin subresource, which here means every poster on media.wear-run.help, and
   * buys cross-origin isolation this site has no use for.
   */
  test('the documents are cross-origin isolated and the API is not', async ({ request }) => {
    for (const path of ['/', '/products', '/contact', '/privacy', '/terms']) {
      const h = (await request.get(path)).headers()
      expect(h['cross-origin-opener-policy'], `${path} has no COOP`).toBe('same-origin')
      expect(h['cross-origin-resource-policy'], `${path} has no CORP`).toBe('same-origin')
    }
    const api = (await request.get('/api/public/viewer/does-not-exist')).headers()
    expect(
      api['cross-origin-resource-policy'],
      'CORP on the public API is how the viewer stops being able to read it',
    ).toBeUndefined()
    expect(api['cross-origin-embedder-policy']).toBeUndefined()
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
