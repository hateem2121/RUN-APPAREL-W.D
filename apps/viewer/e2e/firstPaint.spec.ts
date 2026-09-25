import { expect, test } from '@playwright/test'

/**
 * RO-08 — something is on screen within 3 s on slow 3G.
 *
 * Chrome's "Slow 3G" profile through CDP (400 ms round trip, 50,000 B/s each way), cache
 * disabled, a fresh context per sample, five samples, judged on the median. CDP throttling
 * is Chromium-only; the markup it measures is the same in every engine.
 */
const SLOW_3G = {
  offline: false,
  latency: 400,
  downloadThroughput: 50_000,
  uploadThroughput: 50_000,
}
const SAMPLES = 5

test.describe('RO-08 — first paint on slow 3G', () => {
  test.setTimeout(180_000)

  test('the viewer paints something within 3 s (median of 5)', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP network throttling is Chromium-only')
    const paints: number[] = []
    for (let i = 0; i < SAMPLES; i++) {
      const context = await browser.newContext({ viewport: { width: 390, height: 844 } })
      const page = await context.newPage()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', SLOW_3G)
      await page.goto('/n001/wine', { waitUntil: 'commit' })
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
    console.log(`RO-08 viewer first paint on slow 3G: ${sorted.join(', ')} ms (median ${median})`)
    expect(median, 'no sample recorded a first paint').toBeGreaterThan(0)
  })
})
