import { expect, test } from './offlineMedia'

/*
 * The bar's layout at a given width and ROOT size — the fitted formulas in
 * packages/ui/src/notch.css (measured on the live site 2026-09-23: the inline row
 * keeps the name whole from 180.7px + 14.857rem with desktop spacing; name + button from
 * 111.6px + 7.208rem). Duplicated here ON PURPOSE: a change to one without the other fails.
 */
const layoutAt = (width: number, rootPx: number) => ({
  phone: width < 720 || width < 184 + 14.9 * rootPx,
  twoRows: width < 114 + 7.25 * rootPx,
})

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
  // 340: inside the band below 360px where site.css tightens the bar's spacing (2026-09-11).
  const WIDTHS = [320, 340, 360, 390, 412, 430, 768, 1440]

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
            buttonShown: (() => {
              const button = document.querySelector('.notch__menu-btn')
              return Boolean(button && button.getClientRects().length > 0)
            })(),
            linksInBar: (() => {
              const bar = document.querySelector('.notch')?.getBoundingClientRect()
              const links = [...document.querySelectorAll('#site-menu a')]
              return (
                links.length > 0 &&
                links.every((link) => {
                  const box = link.getBoundingClientRect()
                  return bar && box.width > 0 && box.top >= bar.top && box.bottom <= bar.bottom
                })
              )
            })(),
            buttonBelowName: (() => {
              const mark = document.querySelector('.notch__wordmark')?.getBoundingClientRect()
              const button = document.querySelector('.notch__menu-btn')?.getBoundingClientRect()
              return Boolean(mark && button && button.top >= mark.bottom - 1)
            })(),
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

        const expected = layoutAt(width, size)
        expect(
          m.buttonShown,
          `${width}px at ${scale}% text: the menu button should ${expected.phone ? '' : 'NOT '}show`,
        ).toBe(expected.phone)
        expect(m.linksInBar, `${width}px at ${scale}% text: the links inline`).toBe(!expected.phone)
        if (expected.phone) {
          expect(
            m.buttonBelowName,
            `${width}px at ${scale}% text: the button should sit ${expected.twoRows ? 'under' : 'beside'} the name`,
          ).toBe(expected.twoRows)
        }
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

test.describe('TY-11 — the footer keeps every word at 200% text on a phone', () => {
  /**
   * Measured 2026-09-09/10 (audit TY-11): at 200% browser text on a phone, the dark footer cut
   * off real text at its right edge — "Send a tech pack, a sketch, o…", "Reply within 2
   * business…" and the address line. The slab is `overflow: hidden` for its cropped wordmark,
   * so an over-wide column is not scrolled, it is silently clipped.
   *
   * The instrument asks every word in the slab to end inside the slab, skipping `aria-hidden`
   * layers (the cropped wordmark is cropped on purpose). Its negative control is a planted
   * nowrap line, which must be reported before any real page is graded.
   *
   * 200% comes from the browser's text-size setting, never an injected `html { font-size }` —
   * see the top of this file for why only the real setting moves `rem` media queries. Chromium
   * takes it over CDP; Firefox takes it from the profile pref this file sets at launch.
   */
  const clipped = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const slab = document.querySelector('.site-footer__slab')
      if (!slab) return ['there is no .site-footer__slab on this page']
      const edge = slab.getBoundingClientRect().right
      const out: string[] = []
      const walker = document.createTreeWalker(slab, NodeFilter.SHOW_TEXT)
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const text = (node.nodeValue ?? '').trim()
        if (!text || node.parentElement?.closest('[aria-hidden="true"]')) continue
        const range = document.createRange()
        range.selectNodeContents(node)
        const right = Math.max(...[...range.getClientRects()].map((rect) => rect.right))
        if (right - edge > 1)
          out.push(`"${text.slice(0, 40)}" runs ${(right - edge).toFixed(0)}px past the slab`)
      }
      return out
    })

  const at200 = async (
    page: import('@playwright/test').Page,
    context: import('@playwright/test').BrowserContext,
    browserName: string,
  ) => {
    if (browserName === 'chromium') {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } })
    }
    await page.setViewportSize({ width: 390, height: 844 })
  }

  test('the detector reports a planted clipped line (negative control)', async ({
    page,
    context,
    browserName,
  }) => {
    await at200(page, context, browserName)
    await page.goto('/contact')
    await page.evaluate(() => {
      const line = document.createElement('p')
      line.textContent = 'PLANTED '.repeat(40)
      line.style.whiteSpace = 'nowrap'
      document.querySelector('.site-footer__inner')?.append(line)
    })
    const found = await clipped(page)
    expect(
      found.some((entry) => entry.startsWith('"PLANTED')),
      found.join('\n'),
    ).toBe(true)
  })

  for (const path of ['/', '/contact']) {
    test(`${path}: nothing in the footer is clipped at 200% text, 390px`, async ({
      page,
      context,
      browserName,
    }) => {
      await at200(page, context, browserName)
      await page.goto(path)
      await page.evaluate(() => document.fonts.ready)
      const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
      // The control for the setup: at the default size nothing would be clipped anyway.
      expect(root, `the text size never moved to 200% in ${browserName}`).toBe('32px')
      expect(await clipped(page)).toEqual([])
    })
  }
})

test.describe('FA-E-03 past 200% — the menu takes over before the inline row would cut the name', () => {
  test('250% text: the button at 768px, the words inline at 800px, the name whole at both', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Page.setFontSizes is a CDP command')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 40, fixed: 40 } })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    // the inline row needs 775px at a 40px root (measured); the clause switches below 780px
    for (const [width, phone] of [
      [768, true],
      [800, false],
      [1440, false],
    ] as const) {
      await page.setViewportSize({ width, height: 900 })
      const m = await page.evaluate(() => {
        const mark = document.querySelector('.notch__wordmark') as HTMLElement
        const button = document.querySelector('.notch__menu-btn')
        return {
          root: getComputedStyle(document.documentElement).fontSize,
          whole: mark.scrollWidth <= mark.clientWidth,
          buttonShown: Boolean(button && button.getClientRects().length > 0),
        }
      })
      expect(m.root).toBe('40px')
      expect(m.whole, `the name is cut at ${width}px`).toBe(true)
      expect(m.buttonShown, `the menu button at ${width}px`).toBe(phone)
    }
  })

  test('200% text on a 390px phone: the open menu fits the screen and scrolls inside itself', async ({
    page,
    context,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Page.setFontSizes is a CDP command')
    const cdp = await context.newCDPSession(page)
    await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } })
    await page.setViewportSize({ width: 390, height: 640 })
    await page.goto('/')
    await page.getByRole('button', { name: 'Menu', exact: true }).click()
    const m = await page.evaluate(() => {
      const panel = document.getElementById('site-menu')
      const box = panel?.getBoundingClientRect()
      return panel && box
        ? { bottom: box.bottom, overflow: getComputedStyle(panel).overflowY, height: innerHeight }
        : null
    })
    if (!m) throw new Error('the menu did not open')
    expect(m.bottom, 'the open menu runs off the screen (WCAG 1.4.10)').toBeLessThanOrEqual(
      m.height - 11,
    )
    expect(m.overflow).toBe('auto')
  })
})
