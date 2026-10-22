import { expect, test } from './offlineMedia'

/**
 * The loading line (site check-up #3, 2026-10-22): a tap on a link inside the site waited 2.3–2.8 s
 * on the live site with nothing on screen moving. Here the next page's data (the `?_rsc=` request
 * Next makes for a client navigation) is held back 2 s, the way a slow server answer is, and the
 * line must show within 0.6 s of the tap and be gone once the page is there. Without NavProgress
 * there is no `.nav-progress` at all, so the first assertion fails.
 */
const HELD_MS = 2_000

test.describe('the loading line', () => {
  test('a tap on the logo shows the line at once, and it goes when Home arrives', async ({
    page,
  }) => {
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    let held = 0
    await page.route(/[?&]_rsc=/, async (route) => {
      held++
      await new Promise((resolve) => setTimeout(resolve, HELD_MS))
      await route.continue()
    })
    const tapped = Date.now()
    await page.locator('.notch__wordmark').click()
    await expect(page.locator('.nav-progress[data-state="loading"]')).toBeAttached({
      timeout: 600,
    })
    const shownAfter = Date.now() - tapped
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })
    await expect(page.locator('.nav-progress[data-state="loading"]')).toHaveCount(0, {
      timeout: 5_000,
    })
    expect(
      held,
      'no client navigation was held, so this measured a full page load',
    ).toBeGreaterThan(0)
    expect(shownAfter, 'the line came too late to tell the tap was heard').toBeLessThan(600)
  })

  test('a link left to the browser starts no line (it shows its own progress)', async ({
    page,
  }) => {
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    // A plain link (no <Link>): the document sees the click unprevented, as a real one would be,
    // and only afterwards, at the window, is the full load cancelled so the test stays here.
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = '/privacy'
      a.id = 'plain-link'
      a.textContent = 'plain'
      document.querySelector('main')?.prepend(a)
      window.addEventListener('click', (event) => event.preventDefault())
    })
    await page.locator('#plain-link').click()
    await page.waitForTimeout(400)
    expect(new URL(page.url()).pathname, 'the window did not cancel the plain load, so the test left the page').toBe('/faq')
    await expect(page.locator('.nav-progress[data-state="loading"]')).toHaveCount(0)
  })
})
