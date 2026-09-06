import { type Page, expect, test } from '@playwright/test'

/**
 * THE BLURRED PHOTO DURING THE DOWNLOAD, AND THE PRELOADS — fix plan Rank 6, audits
 * LIVE-04, LIVE-06, LIVE-10 (2026-09-03).
 *
 * Runs in the `webgl` project only: the placeholder exists for a visitor who WILL get 3D,
 * and Chromium is the engine with a CDP session, which is how the network is throttled
 * here — the fixture model is small, so at full speed the download is over before an
 * assertion could look. Throttled to ~50 kB/s it takes several seconds, long enough to
 * see the photo, its blur, and the readout over it.
 *
 * Both ways. The last test rewrites the payload to carry NO poster and asserts the stage
 * shows no image — so the first test's assertion is keyed to the poster, not to some
 * element that happens to be an <img>.
 */

/**
 * ~300 kB/s: the 1 MB model-viewer chunk arrives in a few seconds and the seeded model
 * (its 4096² weave included) takes several more — long enough to look, short enough to
 * finish. At 50 kB/s the chunk alone took 20 s and the model never arrived inside the
 * budget (measured 2026-09-03).
 */
const SLOW = { offline: false, latency: 50, downloadThroughput: 300_000, uploadThroughput: 300_000 }

async function throttle(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', SLOW)
  return cdp
}

test.describe('the colourway photo while the model downloads', () => {
  test.setTimeout(120_000)

  test('is on the stage, blurred, under the readout — then gone within a beat of load', async ({
    page,
  }) => {
    await throttle(page)
    await page.goto('/n001/wine')

    const placeholder = page.locator('.stage__placeholder')
    const readout = page.locator('.stage__loading')
    await expect(placeholder).toBeVisible({ timeout: 20_000 })
    await expect(readout).toBeVisible()

    // Blurred by the bytes still to come: a positive radius, and the photo itself.
    const blur = await placeholder.evaluate((el) => getComputedStyle(el).filter)
    expect(blur).toMatch(/blur\((\d+(\.\d+)?)px\)/)
    expect(Number.parseFloat(blur.match(/blur\((\d+(\.\d+)?)px\)/)?.[1] ?? '0')).toBeGreaterThan(0)
    await expect(placeholder).toHaveAttribute('src', /n001-wine-poster\.webp$/)
    await expect(placeholder).toHaveAttribute('aria-hidden', 'true')
    // The readout paints over the photo, not under it.
    const [imgZ, readoutZ] = await page.evaluate(() => {
      const order = Array.from(document.querySelectorAll('.stage__canvas > *'))
      return [
        order.findIndex((el) => el.classList.contains('stage__placeholder')),
        order.findIndex((el) => el.classList.contains('stage__loading')),
      ]
    })
    expect(imgZ).toBeGreaterThanOrEqual(0)
    expect(readoutZ).toBeGreaterThan(imgZ)

    // Once the model is in, the photo cross-fades out (PLACEHOLDER_FADE_MS, 500 ms) and
    // is unmounted by a timer. The bound here is deliberately loose: the timer runs on
    // the main thread, and on the CI runner's software WebGL the first frame after
    // `load` — uploading the fixture's 4608-px weave — blocks it for seconds. 800 ms
    // (500 + 300) failed there on 2026-09-03 with the image still mounted, while every
    // local run passed. What this proves is that the photo LEAVES once the model is in;
    // a photo that stayed would still be here ten seconds later.
    await page.waitForFunction(
      () =>
        Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
      undefined,
      { timeout: 60_000 },
    )
    await expect(placeholder).toHaveCount(0, { timeout: 10_000 })
  })

  test('the decoder and the lighting map are fetched alongside the model, not after it (LIVE-10)', async ({
    page,
  }) => {
    await throttle(page)
    const started: Record<string, number> = {}
    let glbFinished: number | null = null
    page.on('request', (request) => {
      const url = request.url()
      if (url.endsWith('/meshopt_decoder.js')) started.decoder = Date.now()
      if (url.endsWith('/env/studio-soft.hdr')) started.hdr = Date.now()
    })
    page.on('requestfinished', (request) => {
      if (request.url().endsWith('.glb')) glbFinished = Date.now()
    })
    await page.goto('/n001/wine')
    await page.waitForFunction(
      () =>
        Boolean((document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded),
      undefined,
      { timeout: 60_000 },
    )
    expect(started.decoder, 'the meshopt decoder was never requested').toBeDefined()
    expect(started.hdr, 'the lighting map was never requested').toBeDefined()
    expect(glbFinished, 'the model never finished downloading').not.toBeNull()
    // Both start while the model is still on the wire.
    expect(started.decoder!).toBeLessThan(glbFinished!)
    expect(started.hdr!).toBeLessThan(glbFinished!)
  })

  test('carries the payload dimensions so the browser can plan the decode', async ({ page }) => {
    // The payload has carried width/height since the CMS started storing them and
    // this element ignored them until 2026-09-04. Their absence never showed as
    // layout shift — CSS sizes the element absolutely — so nothing caught it.
    await page.route('**/api/public/viewer/**', async (route) => route.continue())
    await page.goto('/n001/wine')
    const img = page.locator('.stage__placeholder')
    await img.waitFor({ state: 'attached', timeout: 30_000 })
    const dims = await img.evaluate((el: HTMLImageElement) => ({
      w: el.getAttribute('width'),
      h: el.getAttribute('height'),
    }))
    expect(
      dims,
      'the placeholder lost its intrinsic dimensions — they come from the payload ' +
        'and let the browser plan the decode before the bytes arrive',
    ).toEqual({ w: '1200', h: '1500' })
  })

  test('NEGATIVE CONTROL: a payload with no poster paints no image during the download', async ({
    page,
  }) => {
    await throttle(page)
    await page.route('**/api/public/viewer/**', async (route) => {
      const response = await route.fetch()
      const body = (await response.json()) as {
        product?: { posterFallback?: unknown }
        colourways?: { poster?: unknown }[]
        selectedColourway?: { poster?: unknown } | null
      }
      if (body.product) body.product.posterFallback = null
      for (const c of body.colourways ?? []) c.poster = null
      if (body.selectedColourway) body.selectedColourway.poster = null
      await route.fulfill({ response, json: body })
    })
    await page.goto('/n001/wine')
    await expect(page.locator('.stage__loading')).toBeVisible({ timeout: 20_000 })
    await expect(page.locator('.stage__placeholder')).toHaveCount(0)
  })
})
