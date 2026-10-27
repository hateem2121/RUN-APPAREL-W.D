import { expect, type Page, test } from './offlineMedia'

type Request = Awaited<ReturnType<Page['waitForRequest']>>

/**
 * A website link fetches its whole page ahead when a visitor shows intent (faster-taps spec,
 * Part 2): the mouse entering it, keyboard focus or the start of a touch. On 26 Oct a tap waited
 * 2.85–3.75 s because Next had fetched ahead only the shared layout (2 KB) of a page drawn per
 * request. Without IntentLink a hover sends no whole-page request, so the first test fails.
 *
 * Chromium only: `navigator.connection.saveData` exists there, and the prefetch is the same code
 * in every engine.
 */
test.skip(({ browserName }) => browserName !== 'chromium', 'measured in Chromium')

/** Requests for a page's whole data: a tap, or a full prefetch, never the layout prefetch. */
function wholePageRequests(page: Page, path: string): Request[] {
  const seen: Request[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname !== path || !url.searchParams.has('_rsc')) return
    if (request.headers()['next-router-prefetch']) return
    seen.push(request)
  })
  return seen
}

async function settledOn(page: Page, path: string) {
  await page.goto(path)
  await expect(page.locator('h1')).toBeVisible()
  // The links in view are prefetched (layout only) as the page settles; wait them out.
  await page.waitForTimeout(1500)
}

const productsLink = (page: Page) =>
  page.locator('a[href="/products"]').filter({ visible: true }).first()

test('hovering the Products link fetches the whole page before any click', async ({ page }) => {
  await settledOn(page, '/faq')
  const seen = wholePageRequests(page, '/products')
  await productsLink(page).hover()
  await expect.poll(() => seen.length, { timeout: 5_000 }).toBe(1)
})

test('the click after a hover needs no second request', async ({ page }) => {
  await settledOn(page, '/faq')
  const seen = wholePageRequests(page, '/products')
  await productsLink(page).hover()
  await expect.poll(() => seen.length, { timeout: 5_000 }).toBe(1)
  await productsLink(page).click()
  await page.waitForURL((url) => url.pathname === '/products')
  await page.waitForTimeout(500)
  expect(seen.length, 'the click fetched the page again instead of using the prefetch').toBe(1)
})

test('with Save-Data the same hover fetches nothing ahead', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      value: { saveData: true },
      configurable: true,
    })
  })
  await settledOn(page, '/faq')
  const seen = wholePageRequests(page, '/products')
  await productsLink(page).hover()
  await page.waitForTimeout(1500)
  expect(seen.length).toBe(0)
})

// On `next start` there is no shared store, so this cannot fail the way production would (one
// visitor's drawing kept and served to the next). src/websiteRequestHeaders.test.ts holds the rule
// that prevents that: nothing the website draws reads the visitor's request (review of 27 Oct).
test('a dark-mode visitor arrives on the dark page', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark' })
  const page = await context.newPage()
  await settledOn(page, '/faq')
  await productsLink(page).hover()
  await page.waitForTimeout(500)
  await productsLink(page).click()
  await page.waitForURL((url) => url.pathname === '/products')
  await expect(page.locator('h1')).toBeVisible()
  // --bg in dark mode, packages/ui/src/tokens.css: #1c1f18.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe(
    'rgb(28, 31, 24)',
  )
  await context.close()
})
