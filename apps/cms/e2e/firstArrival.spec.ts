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

/*
 * A visitor who acts ends the curtain (12 Nov 2026, A5 and A8). Live, Tab twice under the curtain
 * focused "RUN APPAREL" and "Products" behind it (WCAG 2.2 SC 2.4.11), and a tap reached whatever
 * lay under it. Now a key or a tap finishes the roll and lifts it at once, and the tap is kept.
 */
test.describe('a visitor who acts ends the curtain', () => {
  test.beforeEach(async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine: the rule is in the inline script')
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.goto('/', { waitUntil: 'commit' })
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-preload')))
      .toBe('on')
  })

  test('Tab lifts it within 400 ms, so focus never sits under it', async ({ page }) => {
    await page.keyboard.press('Tab')
    const pressedAt = Date.now()
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-preload')), {
        timeout: 400,
        intervals: [50],
      })
      .not.toBe('on')
    expect(Date.now() - pressedAt).toBeLessThanOrEqual(400)
    await page.keyboard.press('Tab')
    await expect
      .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-preload')))
      .toBe(false)
    const covered = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el || el === document.body) return 'nothing focused'
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return top && (top === el || el.contains(top) || top.contains(el)) ? 'visible' : 'covered'
    })
    expect(covered).toBe('visible')
  })

  test('a tap ends it and does not follow a link hidden under it', async ({ page }) => {
    // A real link under the tap point, or the test passes on a page with nothing there (review I1,
    // 12 Nov 2026: the first version of this test tapped empty ground and proved nothing).
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = '/products'
      a.id = 'planted-link'
      a.style.cssText = 'position:fixed;inset:0;z-index:1;display:block'
      document.body.append(a)
    })
    const under = await page.evaluate(() => {
      const preloader = document.querySelector('.preloader') as HTMLElement
      preloader.style.visibility = 'hidden'
      const id = document.elementFromPoint(200, 300)?.id
      preloader.style.visibility = ''
      return id
    })
    expect(under, 'the planted link is not under the tap point').toBe('planted-link')
    const before = page.url()
    await page.mouse.click(200, 300)
    await expect
      .poll(() => page.evaluate(() => document.documentElement.getAttribute('data-preload')), {
        timeout: 400,
        intervals: [50],
      })
      .not.toBe('on')
    await page.waitForTimeout(1000)
    expect(page.url()).toBe(before)
    // Once the curtain is gone the same link works again: nothing keeps eating taps.
    await expect
      .poll(() => page.evaluate(() => document.documentElement.hasAttribute('data-preload')))
      .toBe(false)
    await page.mouse.click(200, 300)
    await page.waitForURL('**/products')
  })
})
