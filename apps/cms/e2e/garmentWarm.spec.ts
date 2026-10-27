import { expect, type Page, test } from './offlineMedia'

/**
 * Touching a garment card warms that garment's data (faster-taps spec, Part 3): the card asks the
 * site's own `/__warm/garment/<product>/<colour>` once, and worker.mjs asks the shared store, so the
 * garment page's own data request finds the drawing already under way. `next start` does not run
 * worker.mjs, so here the address answers 404: this checks that the card ASKS, once.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'measured in Chromium')

function warmRequests(page: Page): string[] {
  const seen: string[] = []
  page.on('request', (request) => {
    const { pathname } = new URL(request.url())
    if (pathname.startsWith('/__warm/garment/')) seen.push(pathname)
  })
  return seen
}

test('pressing a garment card asks once for its data to be warmed', async ({ page }) => {
  await page.goto('/products')
  const card = page.locator('.product-card a.card-gallery__slide[tabindex="0"]').first()
  await expect(card).toBeVisible()
  const href = await card.getAttribute('href')
  const garment = new URL(href ?? '', 'https://wear-run.com').pathname
  const seen = warmRequests(page)
  // Keep the page: a press without the click that would leave it.
  await card.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await expect.poll(() => seen.length, { timeout: 3_000 }).toBe(1)
  expect(seen[0]).toBe(garment.replace(/^\/products\//, '/__warm/garment/'))
  await card.dispatchEvent('pointerdown', { pointerType: 'touch', bubbles: true })
  await page.waitForTimeout(500)
  expect(seen.length, 'a second press asked again').toBe(1)
})
