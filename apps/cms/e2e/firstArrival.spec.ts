import { expect, test } from './offlineMedia'

/**
 * The first-arrival curtain on every screen size (D51). The flag is lifted because the curtain does
 * nothing under automation. Measured while it is up: the mark and the numbers inside the screen and
 * not overlapping; then the curtain must leave and take nothing with it.
 */
const SCREENS: Array<[number, number]> = [
  [280, 653],
  [320, 568],
  [390, 844],
  [440, 956],
  [568, 320],
  [844, 390],
  [768, 1024],
  [1024, 600],
  [1440, 900],
  [2560, 1440],
  [3840, 2160],
]

for (const [width, height] of SCREENS) {
  test(`${width}x${height}: the curtain fits, then leaves`, async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'layout rule; the other engines run the live check')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.setViewportSize({ width, height })
    await page.goto('/', { waitUntil: 'commit' })
    await page.locator('.preloader__mark').waitFor({ state: 'attached' })
    const found = await page.evaluate(() => {
      const on = document.documentElement.getAttribute('data-preload')
      const rect = (s: string) => document.querySelector(s)?.getBoundingClientRect()
      const mark = rect('.preloader__mark')
      const year = rect('.preloader__year')
      const inside = (r?: DOMRect) =>
        !!r && r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
      const apart = !!mark && !!year && (year.bottom <= mark.top + 1 || year.right <= mark.left + 1)
      return {
        on: !!on,
        mark: inside(mark),
        year: inside(year),
        apart,
        tall: (mark?.height ?? 0) > 20,
      }
    })
    expect(found).toEqual({ on: true, mark: true, year: true, apart: true, tall: true })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-preload')), {
        timeout: 8_000,
      })
      .toBe(false)
  })
}

test('under automation there is no curtain', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'one engine')
  await page.goto('/')
  await expect(page.locator('.preloader')).toBeHidden()
})
