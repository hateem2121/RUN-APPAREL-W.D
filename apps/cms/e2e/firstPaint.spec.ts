import { expect, test } from './offlineMedia'

/**
 * RO-08 — something is on screen within 3 s on slow 3G, the site half.
 *
 * Same method as `apps/viewer/e2e/firstPaint.spec.ts`: Chrome's "Slow 3G" profile through
 * CDP (400 ms round trip, 50,000 B/s each way), cache disabled, a fresh context per
 * sample, five samples, judged on the median. CDP throttling is Chromium-only.
 */
const SLOW_3G = {
  offline: false,
  latency: 400,
  downloadThroughput: 50_000,
  uploadThroughput: 50_000,
}
const SAMPLES = 5
const PAGES = ['/', '/products', '/contact'] as const

test.describe('RO-08 — first paint on slow 3G (site)', () => {
  test.setTimeout(120_000)

  /*
   * The cause, checked on its own: a `<link rel="stylesheet">` in the served page is a
   * second download that paint waits for. `experimental.inlineCss` in next.config.mjs
   * removes it; this fails the moment it comes back, in any engine, with no timing in it.
   */
  for (const path of PAGES) {
    test(`${path} carries its CSS inside the page, not as a stylesheet link`, async ({
      baseURL,
      request,
    }) => {
      const html = await (await request.get(`${baseURL}${path}`)).text()
      const links = [...html.matchAll(/<link\b[^>]*rel="stylesheet"[^>]*>/g)].map((m) => m[0])
      expect(links, 'a render-blocking stylesheet link is back').toEqual([])
      expect(html, 'no inline <style> block either: the page would paint unstyled').toMatch(
        /<style\b[^>]*data-precedence/,
      )
    })
  }

  test('the home page paints something within 3 s (median of 5)', async ({
    baseURL,
    browser,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'CDP network throttling is Chromium-only')
    const paints: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', SLOW_3G)
      await page.goto(`${baseURL}/`, { waitUntil: 'commit' })
      await page.waitForFunction(
        () => performance.getEntriesByName('first-contentful-paint').length > 0,
        undefined,
        { timeout: 30_000 },
      )
      paints.push(
        await page.evaluate(() =>
          Math.round(performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? -1),
        ),
      )
      await context.close()
    }
    const sorted = [...paints].sort((a, b) => a - b)
    const median = sorted[Math.floor(SAMPLES / 2)] ?? Number.POSITIVE_INFINITY
    console.log(`RO-08 site first paint on slow 3G: ${sorted.join(', ')} ms (median ${median})`)
    expect(median, 'no sample recorded a first paint').toBeGreaterThan(0)
    /*
     * Measured 2026-09-25 on this harness (`next start`, five runs each): 2,316-2,328 ms
     * with the stylesheet as a link, 1,096-1,104 ms with it inline; the same page through
     * the Worker (`opennextjs-cloudflare preview`) read 1,100-1,108. Live before the fix:
     * 3,132 ms median, the extra ~0.8 s being the Worker's server time. 1,700 fails the
     * link case by 600 ms and leaves 600 ms for a slower CI runner's server render.
     */
    expect(
      median,
      `first paint on slow 3G took ${median} ms (samples ${sorted.join(', ')})`,
    ).toBeLessThanOrEqual(1_700)
  })
})
