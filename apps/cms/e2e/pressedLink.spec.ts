import { expect, type Page, test } from './offlineMedia'

/**
 * The pressed link (look B, owner's yes on 27 Oct after a live demo): a tap on a header link marks
 * that link at once while its page is still on the way, and the page being left gives up its
 * underline, so the mark moves the moment a visitor taps. Here the next page's data (the `?_rsc=`
 * request Next makes for a client navigation) is held back 2 s, the way a slow first visit is (a
 * store miss took 0.4–3.8 s longer than a warm drawing on 27 Oct), so the waiting state can be
 * read. Without the mark, Contact stays plain until its page arrives and the first check fails.
 *
 * Laptop width: the links sit in the bar. On a phone the menu closes on the tap (closeMenuOnLeave,
 * 17 Oct), so the mark shows only as it slides away; the loading line carries that wait.
 */
const HELD_MS = 2_000

test.use({ viewport: { width: 1280, height: 720 } })

const barLink = (page: Page, href: string) => page.locator(`.notch .nav-link[href="${href}"]`)
const decoration = (link: ReturnType<Page['locator']>) =>
  link.evaluate((el) => {
    const style = getComputedStyle(el)
    return { line: style.textDecorationLine, colour: style.textDecorationColor }
  })

async function holdPageData(page: Page) {
  const seen = { held: 0 }
  await page.route(/[?&]_rsc=/, async (route) => {
    seen.held++
    await new Promise((resolve) => setTimeout(resolve, HELD_MS))
    await route.continue()
  })
  return seen
}

test.describe('the pressed link', () => {
  test('a tapped header link takes the underline at once, and the page being left gives it up', async ({
    page,
  }) => {
    await page.goto('/products')
    await expect(page.locator('h1')).toBeVisible()
    const products = barLink(page, '/products')
    const contact = barLink(page, '/contact')
    await expect(products).toHaveAttribute('aria-current', 'page')
    expect((await decoration(contact)).line, 'Contact is marked before any tap').toBe('none')

    const seen = await holdPageData(page)
    // Measured in the page, from the click event to the mark, as navProgress.spec.ts does.
    await page.evaluate(() => {
      const w = window as unknown as { __mark: { tapped: number; marked: number } }
      w.__mark = { tapped: -1, marked: -1 }
      const link = document.querySelector('.notch .nav-link[href="/contact"]')
      document.addEventListener(
        'click',
        (event) => {
          w.__mark.tapped = event.timeStamp
        },
        { capture: true, once: true },
      )
      new MutationObserver(() => {
        if (
          w.__mark.marked < 0 &&
          link &&
          getComputedStyle(link).textDecorationLine.includes('underline')
        )
          w.__mark.marked = performance.now()
      }).observe(document.documentElement, { subtree: true, childList: true, attributes: true })
    })

    await contact.click()
    await expect
      .poll(async () => (await decoration(contact)).line, { timeout: 1_000 })
      .toBe('underline')
    expect(
      new URL(page.url()).pathname,
      'the page arrived before the mark could be read, so nothing was waiting',
    ).toBe('/products')
    expect((await decoration(products)).line, 'the page being left kept its underline').toBe('none')
    const mark = await page.evaluate(
      () => (window as unknown as { __mark: { tapped: number; marked: number } }).__mark,
    )
    expect(mark.tapped, 'the page never saw the tap').toBeGreaterThanOrEqual(0)
    expect(mark.marked - mark.tapped, 'the mark came too late to answer the tap').toBeLessThan(200)

    await page.waitForURL((url) => url.pathname === '/contact', { timeout: 15_000 })
    await expect(contact).toHaveAttribute('aria-current', 'page')
    await expect(page.locator('.notch [data-pending]')).toHaveCount(0)
    expect(
      seen.held,
      'no client navigation was held, so this measured a full page load',
    ).toBeGreaterThan(0)
  })

  /*
   * Measured 27 Oct with notch.css's forced-colors rule for the pressed link taken out: Chromium and
   * WebKit kept the author's volt (rgb(205, 243, 69)) where the current page shows the system's link
   * colour, and this failed; Firefox replaces the colour itself, so there it passes either way.
   */
  test('with the system’s colours forced, the tapped link is marked exactly as the current page is', async ({
    page,
  }) => {
    await page.emulateMedia({ forcedColors: 'active' })
    await page.goto('/products')
    await expect(page.locator('h1')).toBeVisible()
    const forced = await page.evaluate(() => matchMedia('(forced-colors: active)').matches)
    test.skip(!forced, 'this engine cannot emulate forced colours')
    const current = await decoration(barLink(page, '/products'))
    expect(current.line).toBe('underline')

    await holdPageData(page)
    const contact = barLink(page, '/contact')
    await contact.click()
    await expect
      .poll(async () => (await decoration(contact)).line, { timeout: 1_000 })
      .toBe('underline')
    expect(new URL(page.url()).pathname).toBe('/products')
    expect(
      (await decoration(contact)).colour,
      'in high contrast the tapped link is not marked like the current page',
    ).toBe(current.colour)
  })
})
