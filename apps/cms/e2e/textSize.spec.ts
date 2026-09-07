import { expect, test } from '@playwright/test'

/**
 * FA-E-03 — the header at large BROWSER TEXT (not page zoom).
 *
 * ⚠️ ITS OWN FILE BECAUSE OF ONE LINE. Firefox's default font size is a profile pref and
 * Playwright accepts `launchOptions` only at the top level of a file, so the Firefox case
 * below forces a dedicated worker. Putting it in `navbar.spec.ts` relaunches that whole
 * file's browser; here it costs one launch. The pref is inert in Chromium, which reads
 * the same setting over CDP inside each test.
 */
test.use({ launchOptions: { firefoxUserPrefs: { 'font.size.variable.x-western': 32 } } })

test.describe('FA-E-03 — the company name survives the reader turning text up', () => {
  /**
   * ⚠️ THE NAME WAS BEING CUT OFF ON THE TWO COMMONEST PHONE WIDTHS. Measured 2026-09-07
   * in Chromium and Firefox, identically, `scrollWidth/clientWidth` of `.notch__wordmark`
   * on `/`:
   *
   *   text size   320px         390px         430px
   *   125%        144/96  CUT   ok            ok
   *   150%        173/71  CUT   173/141 CUT   ok
   *   200%        230/19  CUT   230/89  CUT   230/129 CUT
   *
   * Everything in the bar is in `rem` and the bar is not, so the nav grew from 130.3px to
   * 181.5px and the wordmark — the only shrinkable item — paid for all of it.
   *
   * ⚠️ THE INSTRUMENT IS THE BROWSER'S DEFAULT FONT SIZE, NOT AN INJECTED
   * `html { font-size }`, AND THE DIFFERENCE IS THE WHOLE TEST. `rem` inside a MEDIA
   * QUERY resolves against the initial font size, so the fix — a `calc(100px + 13.7rem)`
   * query that adds a second row — is invisible to a stylesheet that fakes the setting.
   * Proved both ways on a `(max-width: 20rem)` control at 350px: injected CSS moved every
   * length and left the query FALSE; `Page.setFontSizes` moved both. A test written the
   * easy way would have passed against a fix that never fired.
   *
   * ⚠️ CHROMIUM ONLY, DELIBERATELY, AND THE REASON IS NOT "IT FAILS ELSEWHERE". Firefox's
   * equivalent is a profile pref, which Playwright only accepts at LAUNCH — a sweep of
   * seven text sizes would need seven browser launches. Firefox was measured by hand over
   * the same grid on 2026-09-07 and agreed with Chromium on every cell, and the
   * single-size Firefox case below keeps one live check on that.
   */
  const SIZES = [100, 125, 150, 175, 200]
  const WIDTHS = [320, 360, 390, 412, 430, 768, 1440]

  for (const scale of SIZES) {
    test(`nothing is clipped and the hero still clears the bar at ${scale}% text`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'Page.setFontSizes is a CDP command')
      const cdp = await context.newCDPSession(page)
      const size = (16 * scale) / 100
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: size, fixed: size } })

      /*
       * ⚠️ ONE NAVIGATION, THEN RESIZE. Seven `goto`s per case put 70 extra page loads on
       * a single `next start` and made unrelated tests time out waiting for `load` under
       * seven parallel workers — a flake that moved to a different test every run.
       * Resizing is not a shortcut: media queries and layout re-resolve on resize, and
       * the sweep that produced the thresholds in this file's header was measured exactly
       * this way. The font size is set on the CONTEXT, so it survives the resize too, and
       * the root-size control below is what proves that per case.
       */
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready)

      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 820 })

        const m = await page.evaluate(() => {
          const mark = document.querySelector('.notch__wordmark') as HTMLElement
          const bar = document.querySelector('.notch')?.getBoundingClientRect()
          const first = document
            .querySelector('.site-hero .label, .site-hero h1')
            ?.getBoundingClientRect()
          return {
            root: getComputedStyle(document.documentElement).fontSize,
            need: mark.scrollWidth,
            have: mark.clientWidth,
            text: mark.textContent ?? '',
            gap: bar && first ? Number((first.top - bar.bottom).toFixed(2)) : Number.NaN,
            barHeight: bar ? Number(bar.height.toFixed(1)) : Number.NaN,
          }
        })

        // The control for the instrument itself: if setFontSizes silently stopped
        // working, every case below would pass at the default size and prove nothing.
        expect(m.root, `the text size never moved at ${scale}%`).toBe(`${size}px`)

        expect(
          m.need,
          `${width}px at ${scale}% text: "${m.text}" needs ${m.need}px and has ${m.have}px`,
        ).toBeLessThanOrEqual(m.have)

        // The other half, and the trap: a taller bar that the page does not reserve for
        // covers the top of the hero. `--notch-lines` drives both, and this is what says
        // it still does.
        expect(
          m.gap,
          `${width}px at ${scale}% text: the ${m.barHeight}px bar leaves ${m.gap}px above ` +
            'the first line — the clearance no longer follows the row count',
        ).toBeGreaterThanOrEqual(0)
      }
    })
  }

  test.describe('and Firefox agrees, at the size WCAG actually asks for', () => {
    // 200% is SC 1.4.4's figure, and the pref that produces it is set at the top of this
    // file — which is the entire reason this file exists.
    test('the name is whole at 200% text on a phone', async ({ page, browserName }) => {
      test.skip(browserName !== 'firefox', 'the pref only applies to Firefox')
      await page.setViewportSize({ width: 390, height: 820 })
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready)
      const m = await page.evaluate(() => {
        const mark = document.querySelector('.notch__wordmark') as HTMLElement
        const bar = document.querySelector('.notch')?.getBoundingClientRect()
        const first = document.querySelector('.site-hero .label')?.getBoundingClientRect()
        return {
          root: getComputedStyle(document.documentElement).fontSize,
          need: mark.scrollWidth,
          have: mark.clientWidth,
          gap: bar && first ? Number((first.top - bar.bottom).toFixed(2)) : Number.NaN,
        }
      })
      expect(m.root, 'the Firefox pref did not take — this case measured nothing').toBe('32px')
      expect(m.need).toBeLessThanOrEqual(m.have)
      expect(m.gap).toBeGreaterThanOrEqual(0)
    })
  })
})
