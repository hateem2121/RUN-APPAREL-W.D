import { expect, type Page, test } from './offlineMedia'

/**
 * VA-40 (visual audit, 2026-10-02), the website's half. The bar's EDGE is in the shared stylesheet
 * (packages/ui/src/notch.css), so the website's bar matches the garment pages'
 * (apps/viewer/e2e/barAutoHide.spec.ts asks them): since polish D12 (2026-10-04, the owner's choice)
 * that edge is the soft shadow alone, and VA-40's 1px hairline is gone. And the bar LEAVING on a
 * scroll is the garment pages' alone: the website never asks for it, so its fixed bar stays where it
 * always was.
 *
 * What would have to break for these to fail: a ring coming back or the soft shadow going on either
 * host, or the opt-in being turned into the default, which would move the website's bar on every phone.
 */

const BAR = 'header.notch-shell .notch'

async function openHome(page: Page) {
  await page.goto('/')
  await expect(page.locator(BAR)).toBeVisible()
}

test.describe('the bar’s edge is its soft shadow alone (polish D12) — the site', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: one soft shadow, and no ring`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openHome(page)
      const shadow = await page.locator(BAR).evaluate((bar) => getComputedStyle(bar).boxShadow)
      const layers = shadow.split(/,(?![^(]*\))/).map((layer) => layer.trim())
      expect(layers, `the bar's shadow is not one layer: ${shadow}`).toHaveLength(1)
      expect(layers[0], 'the soft shadow is gone').toMatch(/0px 8px 24px/)
      expect(layers[0], 'a 1px ring is back').not.toMatch(/0px 0px 0px 1px/)
    })
  }
})

test.describe('the website’s bar never leaves (VA-40 is the garment pages’ alone)', () => {
  test.describe('on a touch phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

    test('scrolled far down it is still on the screen, and nothing asked it to go', async ({
      page,
      browserName,
    }) => {
      test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await openHome(page)
      expect(
        await page.evaluate(() => matchMedia('(hover: none)').matches),
        'the emulated phone reports hover — this test measures nothing',
      ).toBe(true)
      await page.evaluate(() => window.scrollTo(0, 700))
      await page.evaluate(() => window.scrollTo(0, 1400))
      await page.evaluate(
        () =>
          new Promise<void>((done) =>
            requestAnimationFrame(() => requestAnimationFrame(() => done())),
          ),
      )
      await expect(page.locator('header.notch-shell')).not.toHaveAttribute('data-bar-hidden', /.*/)
      const box = await page.locator(BAR).evaluate((bar) => {
        const rect = bar.getBoundingClientRect()
        return { top: rect.top, bottom: rect.bottom, visibility: getComputedStyle(bar).visibility }
      })
      expect(box.top, 'the site’s fixed bar left the screen').toBeGreaterThanOrEqual(0)
      expect(box.bottom).toBeGreaterThan(0)
      expect(box.visibility).toBe('visible')
    })
  })
})
