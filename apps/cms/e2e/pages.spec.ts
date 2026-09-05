import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

/**
 * The public site, loaded in a real browser.
 *
 * ⚠️ EVERY CASE HERE PINS A DEFECT THAT WAS ACTUALLY FOUND, not a hypothetical. The
 * audit's largest finding was that nothing loaded these pages at all: if all three had
 * rendered blank, every gate in CI would have stayed green.
 *
 * ⚠️ THE PRODUCT GALLERY IS DELIBERATELY STATE-TOLERANT. The content helpers fall back
 * to defaults when D1 is unreachable, so the gallery legitimately has two states: cards,
 * or the "references are being updated" message. CI has no seeded local database and
 * a developer's machine does; asserting a card count would fail in one of the two for
 * reasons that are not defects. Each BRANCH is asserted strictly instead, and the one
 * thing both must satisfy — the page is not blank — is asserted unconditionally.
 */

const PAGES = [
  { path: '/', name: 'home', heading: /Made to order/i },
  { path: '/products', name: 'products', heading: /Every garment/i },
  { path: '/contact', name: 'contact', heading: /talk production/i },
] as const

test.describe('every page renders real content', () => {
  for (const page of PAGES) {
    test(`${page.name} is not blank`, async ({ page: browser }) => {
      const response = await browser.goto(page.path)
      expect(response?.status(), `${page.path} did not return 200`).toBe(200)

      // Exactly one h1, and it says what it should — the cheapest possible proof that
      // the server rendered this page rather than an error shell.
      const h1 = browser.locator('h1')
      await expect(h1).toHaveCount(1)
      await expect(h1).toHaveText(page.heading)

      // The chrome the layout is responsible for.
      await expect(browser.locator('.notch__nav a')).toHaveCount(2)
      await expect(browser.locator('main#main')).toBeVisible()
      await expect(browser.locator('.site-footer')).toBeVisible()

      // and real prose, not just a skeleton
      const text = (await browser.locator('main').innerText()).trim()
      expect(text.length, 'main rendered almost no text').toBeGreaterThan(120)
    })
  }
})

test.describe('the product gallery', () => {
  test('shows either real cards or the designed empty state, never nothing', async ({ page }) => {
    await page.goto('/products')
    const cards = page.locator('.product-card')
    const count = await cards.count()

    if (count === 0) {
      // The empty state had never been rendered by any test before this one.
      await expect(page.locator('.site-empty')).toBeVisible()
      await expect(page.locator('.site-empty')).toContainText(/being updated/i)
      return
    }

    const first = cards.first()
    await expect(first.locator('.product-card__name')).not.toBeEmpty()

    /*
     * ⚠️ CARDS MUST LINK TO THE VIEWER HOST, NEVER TO THIS ONE. The garment is served by
     * a different Worker reached from printed QR tags; a relative link would 404 because
     * nothing here serves that shape. Pinned because both sides would otherwise stay
     * green while a buyer met "[ REFERENCE UNAVAILABLE ]".
     */
    const href = await first.locator('a.product-card__link').getAttribute('href')
    expect(href).toMatch(/^https:\/\/viewer\./)

    // Every card shows a poster OR the placeholder — never an empty box.
    for (let index = 0; index < Math.min(count, 4); index++) {
      const figure = cards.nth(index).locator('.product-card__figure')
      const hasImage = (await figure.locator('img').count()) > 0
      const hasPlaceholder = (await figure.locator('.product-card__placeholder').count()) > 0
      expect(hasImage || hasPlaceholder, `card ${index} figure is empty`).toBe(true)
    }
  })

  test('falls back to the placeholder when every poster fails', async ({ page }) => {
    /*
     * The poster `error` event fires while the HTML is still parsing — BEFORE React
     * hydrates and attaches its handler — so `onError` alone never fires. Measured
     * 2026-09-05 against a forced 404: image broken, React hydrated, no swap. The
     * component detects the already-failed state on mount instead, and this is the case
     * that proves it, in the only place it can be proven: a real browser.
     */
    await page.route('**/api/media/**', (route) => route.fulfill({ status: 404, body: '' }))
    await page.route('**media.wear-run.help/**', (route) =>
      route.fulfill({ status: 404, body: '' }),
    )
    await page.goto('/products')

    const cards = page.locator('.product-card')
    if ((await cards.count()) === 0) test.skip(true, 'no cards in this environment')

    await cards.first().scrollIntoViewIfNeeded()
    // Not a fixed wait: the swap happens on mount, so poll for the outcome instead.
    await expect(page.locator('.product-card__img')).toHaveCount(0, { timeout: 10_000 })
    await expect(cards.first().locator('.product-card__placeholder')).toBeVisible()
  })
})

test.describe('accessibility', () => {
  for (const page of PAGES) {
    test(`${page.name} has no automated violations`, async ({ page: browser }) => {
      await browser.goto(page.path)
      const results = await new AxeBuilder({ page: browser })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()

      // Name the offenders in the failure, or a red run says only "expected 0".
      const summary = results.violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ')
      expect(results.violations, `axe violations: ${summary}`).toEqual([])
    })
  }
})
