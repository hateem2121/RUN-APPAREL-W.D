import { expect, test } from '@playwright/test'

/**
 * RO-08 — something is on screen within 3 s on slow 3G.
 *
 * Chrome's "Slow 3G" profile through CDP (400 ms round trip, 50,000 B/s each way), cache
 * disabled, a fresh context per sample, five samples, judged on the median. CDP throttling
 * is Chromium-only; the markup it measures is the same in every engine.
 *
 * The files arrive brotli-compressed, as Cloudflare sends them (since 2026-10-01, owner
 * decision, visual audit): see `sendBody` in e2e/serve.mjs.
 */
const SLOW_3G = {
  offline: false,
  latency: 400,
  downloadThroughput: 50_000,
  uploadThroughput: 50_000,
}
const SAMPLES = 5

/** The two files the 3D load needs, which the shell must NOT fetch (src/lib/preload3d.ts). */
const LATE_3D_FILES = ['/meshopt_decoder.js', '/env/studio-soft.hdr']

test.describe('RO-08 — first paint on slow 3G', () => {
  test.setTimeout(180_000)

  test('the viewer paints something within 3 s (median of 5)', async ({ browser, browserName }) => {
    test.skip(browserName !== 'chromium', 'CDP network throttling is Chromium-only')
    const paints: number[] = []
    let shell = ''
    for (let i = 0; i < SAMPLES; i++) {
      const context = await browser.newContext({
        viewport: { width: 390, height: 844 },
        // Brotli, as Cloudflare sends it (e2e/serve.mjs, `sendBody`).
        extraHTTPHeaders: { 'x-e2e-compress': '1' },
      })
      const page = await context.newPage()
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      await cdp.send('Network.emulateNetworkConditions', SLOW_3G)
      const response = await page.goto('/n001/wine', { waitUntil: 'commit' })
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
      if (i === 0) shell = (await response?.text()) ?? ''
      await context.close()
    }
    const sorted = [...paints].sort((a, b) => a - b)
    const median = sorted[Math.floor(SAMPLES / 2)] ?? Number.POSITIVE_INFINITY
    console.log(`RO-08 viewer first paint on slow 3G: ${sorted.join(', ')} ms (median ${median})`)
    expect(median, 'no sample recorded a first paint').toBeGreaterThan(0)
    /*
     * THE TWO KNOWN SLOWDOWNS, EACH CAUGHT BY THE INSTRUMENT THAT SEES IT (2026-10-01).
     *
     * Measured with brotli, four runs of five: the shell paints at 1,884-1,988 ms (medians
     * 1,920-1,984), with and without the visual audit's menu styles alike. Uncompressed, as this
     * test ran until then, the same page read 4,776-4,928 ms, and every stylesheet byte cost
     * about five times its own download time because it shares the line with the scripts and
     * fonts — 1,253 B of approved menu styles failed the old 4,800 ms ceiling by 96 ms, while a
     * visitor, who gets the brotli file, would not notice them.
     *
     *  - No loading screen in index.html (the original RO-08 defect): 5,008-5,028 ms. The 2,400
     *    ms ceiling fails it by 2.6 s and leaves the good path about 450 ms for the rest of the
     *    approved styles.
     *  - The two 3D preloads back in index.html: 2,044-2,072 ms, only ~130 ms over the good path
     *    once compressed — too close to time-gate without the ceiling failing on noise and on
     *    every small style change. So the shell this test was served is checked for them
     *    directly, below (scripts/preload.test.ts checks the source).
     */
    expect(
      median,
      `first paint on slow 3G took ${median} ms (samples ${sorted.join(', ')})`,
    ).toBeLessThanOrEqual(2_400)
    expect(shell, 'the shell was not captured, so the preload check measures nothing').toContain(
      '<div id="root">',
    )
    for (const file of LATE_3D_FILES) {
      expect(
        shell,
        `the shell fetches ${file} itself, competing with the stylesheet on the first screen`,
      ).not.toMatch(new RegExp(`<link[^>]*href="${file.replaceAll('.', '\\.')}"`))
    }
  })
})
