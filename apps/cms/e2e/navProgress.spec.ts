import { expect, type Page, test } from './offlineMedia'

/**
 * The loading line (site check-up #3, 2026-10-22): a tap on a link inside the site waited 2.3–2.8 s
 * on the live site with nothing on screen moving. Here the next page's data (the `?_rsc=` request
 * Next makes for a client navigation) is held back 2 s, the way a slow server answer is, and the
 * line must show within 0.6 s of the tap and be gone once the page is there. Without NavProgress
 * there is no `.nav-progress` at all, so the first assertion fails.
 *
 * The 0.6 s is measured IN THE PAGE, from the click event to the line appearing. It was the test's
 * own clock until 27 Oct, which also counted Playwright's click and its retry loop: once the line
 * waited 0.4 s (faster-taps spec, Part 4), Firefox read 701 ms for a line that came on time.
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
    await page.evaluate(() => {
      const w = window as unknown as { __line: { tapped: number; shown: number } }
      w.__line = { tapped: -1, shown: -1 }
      document.addEventListener(
        'click',
        (event) => {
          w.__line.tapped = event.timeStamp
        },
        { capture: true, once: true },
      )
      new MutationObserver(() => {
        if (w.__line.shown < 0 && document.querySelector('.nav-progress[data-state="loading"]'))
          w.__line.shown = performance.now()
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true })
    })
    await page.locator('.notch__wordmark').click()
    await expect(page.locator('.nav-progress[data-state="loading"]')).toBeAttached({
      timeout: 2_000,
    })
    const line = await page.evaluate(
      () => (window as unknown as { __line: { tapped: number; shown: number } }).__line,
    )
    expect(line.tapped, 'the page never saw the tap').toBeGreaterThanOrEqual(0)
    const shownAfter = line.shown - line.tapped
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
    expect(
      new URL(page.url()).pathname,
      'the window did not cancel the plain load, so the test left the page',
    ).toBe('/faq')
    await expect(page.locator('.nav-progress[data-state="loading"]')).toHaveCount(0)
  })

  /*
   * Faster-taps spec, Part 4 (owner, 27 Oct): the line waits 0.4 s, so a tap that arrives sooner
   * shows none. Both tests run on the PAGE'S OWN CLOCK (Playwright's `page.clock`): the tap's data is
   * held until the test lets it go, and time moves only when the test moves it. Review of 27 Oct:
   * the test before timed the tap with the real clock and skipped itself outside 150–380 ms, so on
   * CI's slower machines it could skip every run and pass on nothing; the logs could not tell.
   */
  const holdTheTap = async (page: Page) => {
    let release = () => {}
    const released = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = 0
    await page.route(/[?&]_rsc=/, async (route) => {
      held++
      const response = await route.fetch()
      await released
      await route.fulfill({ response })
    })
    return { release, held: () => held }
  }
  const lineState = (page: Page) =>
    page.locator('.nav-progress').evaluate((line) => line.getAttribute('data-state'))
  const onFaqWithClock = async (page: Page) => {
    await page.clock.install()
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100)
  }

  test('a tap still waiting shows the line at 0.4 s, not before', async ({ page }) => {
    await onFaqWithClock(page)
    const tap = await holdTheTap(page)
    await page.locator('.notch__wordmark').click()
    await page.clock.runFor(390)
    expect(await lineState(page), 'the line showed before 0.4 s').not.toBe('loading')
    await page.clock.runFor(20)
    expect(await lineState(page), 'the line did not show at 0.4 s').toBe('loading')
    expect(tap.held(), 'no client navigation was held').toBeGreaterThan(0)
    tap.release()
  })

  test('a tap that arrives within 0.4 s shows no line', async ({ page }) => {
    await onFaqWithClock(page)
    const tap = await holdTheTap(page)
    await page.evaluate(() => {
      const w = window as unknown as { __lineShown: boolean }
      w.__lineShown = false
      new MutationObserver(() => {
        if (document.querySelector('.nav-progress[data-state="loading"]')) w.__lineShown = true
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true })
    })
    await page.locator('.notch__wordmark').click()
    await page.clock.runFor(300)
    expect(tap.held(), 'no client navigation was held').toBeGreaterThan(0)
    tap.release()
    await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })
    // The line watches for the arrival once a frame, then the clock passes the 0.4 s mark.
    await page.clock.runFor(400)
    expect(
      await page.evaluate(() => (window as unknown as { __lineShown: boolean }).__lineShown),
      'a tap that arrived after 0.3 s showed the line',
    ).toBe(false)
  })
})
