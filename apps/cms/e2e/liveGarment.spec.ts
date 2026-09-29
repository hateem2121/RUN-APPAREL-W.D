import { expect, type Page, test } from './offlineMedia'

/**
 * №03's live garment (decision D24, 2026-09-29). What would have to break for these to fail:
 * a model that downloads on a data-saving connection, a failed model that takes the picture
 * with it, or a model that never loads at all.
 *
 * The suite's garment models are not served (serve.mjs: the seeded files are not on this
 * origin), and CI's database is the only one guaranteed to hold a published garment with a
 * model — so a local run without one skips, and a CI run without one fails.
 */
async function openWithGarment(page: Page) {
  // Playwright sets navigator.webdriver, and the live garment honours it as the cursor does.
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  await page.goto('/')
  if ((await page.locator('.live-garment').count()) === 0) {
    if (process.env.CI) throw new Error('no live garment on the home page, and CI seeds one')
    test.skip(true, 'no published garment with a model in this local database')
  }
}

test.describe('№03 — the live 3D garment', () => {
  test('a model that fails to load leaves the picture exactly as it was', async ({ page }) => {
    await page.route('**/*.glb', (route) => route.fulfill({ status: 404, body: '' }))
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect(page.locator('.live-garment')).toHaveAttribute('data-phase', 'failed', {
      timeout: 15000,
    })
    await expect(page.locator('.live-garment model-viewer')).toHaveCount(0)
    await expect(page.locator('.proof__frame')).toBeVisible()
    await expect(page.locator('.proof__link')).toHaveAttribute('href', /\/products\//)
  })

  test('the model is only requested once the section is near', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.glb')) requested.push(request.url())
    })
    await page.route('**/*.glb', (route) => route.fulfill({ status: 404, body: '' }))
    await openWithGarment(page)
    await page.waitForTimeout(500)
    expect(requested, 'the model downloaded on the first screen').toEqual([])
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    await expect.poll(() => requested.length, { timeout: 15000 }).toBeGreaterThan(0)
  })

  test('on a data-saving connection nothing downloads until the visitor asks', async ({ page }) => {
    const requested: string[] = []
    page.on('request', (request) => {
      if (request.url().endsWith('.glb')) requested.push(request.url())
    })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'connection', {
        get: () => ({ saveData: true, effectiveType: '4g' }),
      })
    })
    await page.route('**/*.glb', (route) => route.fulfill({ status: 404, body: '' }))
    await openWithGarment(page)
    await page.locator('.proof__figure').scrollIntoViewIfNeeded()
    const offer = page.getByRole('button', { name: 'Turn it in 3D' })
    await expect(offer).toBeVisible()
    await page.waitForTimeout(500)
    expect(requested).toEqual([])
    await offer.click()
    await expect.poll(() => requested.length, { timeout: 15000 }).toBeGreaterThan(0)
  })
})
