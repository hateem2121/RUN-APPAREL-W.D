import { expect, test } from '@playwright/test'

/**
 * A MODEL DOWNLOAD THAT ANSWERS AND THEN SENDS NOTHING — issue #41.
 *
 * On 2026-09-24 Cloudflare's Islamabad edge answered every fresh model request with `200` and its headers, then sent
 * 0 body bytes. Before this, the stage read "LOADING 3D MODEL · 0.0 MB" for as long as the tab stayed open.
 *
 * `e2e/serve.mjs`'s stall route reproduces that exact shape — headers, then silence — for the first three requests
 * under a key, then serves the real file. The API response is rewritten here to point the model at a key unique to
 * this run, so parallel runs never share a counter.
 *
 * `page.clock` skips the three 12 s silences instead of waiting 36 s. It is resumed before TRY 3D AGAIN, so the
 * real download and model-viewer's own frames run on real time.
 *
 * In the `webgl` project on purpose (the file name matches its `testMatch`): without a WebGL context
 * `canRender3D()` is false, the page never downloads a model, and every assertion below would be about a poster
 * path this change does not touch.
 */
test('a download that stops sending retries, then offers TRY 3D AGAIN, which loads the model', async ({
  page,
}, info) => {
  test.setTimeout(120_000)
  const key = `k${info.retry}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  await page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const json = await response.json()
    json.product.glbUrl = json.product.glbUrl.replace('/fixtures/', `/fixtures/stall/${key}/3/`)
    await route.fulfill({ response, json })
  })

  await page.clock.install()
  const firstRequest = page.waitForRequest(/\/fixtures\/stall\//)
  await page.goto('/n001/wine')
  await firstRequest

  // The first silence: no retry line before it, then try 2 of 3.
  const retryLine = page.locator('.stage__loading-detail', { hasText: 'DOWNLOAD STOPPED' })
  await expect(retryLine).toHaveCount(0)
  await page.clock.fastForward(12_500)
  await expect(page.getByText('DOWNLOAD STOPPED · TRYING AGAIN (2 OF 3)')).toBeVisible()
  await page.clock.fastForward(12_500)
  await expect(page.getByText('DOWNLOAD STOPPED · TRYING AGAIN (3 OF 3)')).toBeVisible()
  await page.clock.fastForward(12_500)

  const notice = page.locator('.stage__error:not([hidden])')
  await expect(notice).toHaveText(
    'The 3D model stopped downloading. Press TRY 3D AGAIN, or come back later. ' +
      'The colors, fabric and specifications on this page are correct, ' +
      'and you can still send an inquiry below.',
  )
  const retry = page.getByRole('button', { name: 'TRY 3D AGAIN' })
  await expect(retry).toBeVisible()
  // The owner's rule: no picture in any failure state — the download-time photo leaves with the download.
  await expect(page.locator('.stage__placeholder, .stage img')).toHaveCount(0)
  // Stopping is not loading: the readout is gone, not frozen.
  await expect(page.locator('.stage__loading')).toHaveCount(0)

  // Request 4 under this key is served for real.
  await page.clock.resume()
  await retry.click()
  await expect(retry).toHaveCount(0)
  await expect(page.locator('.stage__error')).toBeHidden()
  await page.waitForFunction(
    () => (document.querySelector('model-viewer') as { loaded?: boolean } | null)?.loaded === true,
    null,
    { timeout: 90_000 },
  )
})
