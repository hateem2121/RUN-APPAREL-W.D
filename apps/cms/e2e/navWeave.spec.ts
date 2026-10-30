import { expect, test } from './offlineMedia'

/**
 * T7, the woven tap, on every screen size (D51): a held tap covers the page below the header and
 * shows S4 and words after 1 s, and the cover leaves completely once the page has arrived.
 */
const SCREENS: Array<[number, number]> = [
  [280, 653],
  [320, 568],
  [390, 844],
  [568, 320],
  [844, 390],
  [768, 1024],
  [1024, 600],
  [1440, 900],
  [2560, 1440],
  [3840, 2160],
]

test.describe('the woven tap', () => {
  for (const [width, height] of SCREENS) {
    test(`${width}x${height}: covers, words fit, leaves nothing behind`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'layout rule; other engines run the live check')
      await page.emulateMedia({ reducedMotion: 'no-preference' })
      await page.setViewportSize({ width, height })
      await page.goto('/faq')
      await expect(page.locator('h1')).toBeVisible()
      await page.route(/[?&]_rsc=/, async (route) => {
        await new Promise((resolve) => setTimeout(resolve, 2_000))
        await route.continue()
      })
      await page.evaluate(() => (document.querySelector('.notch__wordmark') as HTMLElement).click())
      const weave = page.locator('.nav-weave[data-weave="hold"]')
      await expect(weave).toBeAttached({ timeout: 1_800 })
      const found = await page.evaluate(() => {
        const el = document.querySelector('.nav-weave') as HTMLElement
        const box = el.getBoundingClientRect()
        const words = el.querySelector('.mono')?.getBoundingClientRect()
        const mark = el.querySelector('.loom-mark')?.getBoundingClientRect()
        const picks = [...el.querySelectorAll('.nav-weave__picks i')].map((p) =>
          p.getBoundingClientRect(),
        )
        return {
          full: box.width === innerWidth && box.height === innerHeight,
          reachesFoot: Math.max(...picks.map((p) => p.bottom)) >= innerHeight,
          wordsIn:
            !!words && words.left >= 0 && words.right <= innerWidth && words.bottom <= innerHeight,
          markIn:
            !!mark &&
            mark.left >= 0 &&
            mark.right <= innerWidth &&
            mark.top >= 0 &&
            mark.bottom <= innerHeight,
          text: el.querySelector('.mono')?.textContent,
        }
      })
      expect(found).toEqual({
        full: true,
        reachesFoot: true,
        wordsIn: true,
        markIn: true,
        text: 'Loading Home…',
      })
      await page.waitForURL((url) => url.pathname === '/', { timeout: 15_000 })
      await expect(page.locator('.nav-weave[data-weave]')).toHaveCount(0, { timeout: 3_000 })
    })
  }

  test('reduced motion: no cover, the still line instead', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'one engine')
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/faq')
    await expect(page.locator('h1')).toBeVisible()
    await page.route(/[?&]_rsc=/, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 1_500))
      await route.continue()
    })
    await page.locator('.notch__wordmark').click()
    await expect(page.locator('.nav-progress[data-state="loading"]')).toBeVisible()
    await expect(page.locator('.nav-weave[data-weave]')).toHaveCount(0)
  })
})
