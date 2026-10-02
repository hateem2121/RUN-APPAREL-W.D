import { expect, test } from './offlineMedia'
import {
  SITE_BAR_WORDMARK,
  SITE_MENU_ID,
  SITE_MENU_NAME,
  siteBarAriaSnapshot,
} from '../../../packages/shared/src/siteBar'

/**
 * XS-02, XS-01, TY-08 — ONE menu bar on both hosts (owner decision 2026-09-17: "Same menu bars
 * everywhere. The one I prefer is at wear-run.help"). apps/viewer/e2e/siteBar.spec.ts runs the
 * same checks against the same constants, so a bar that drifts on either host fails on THAT host.
 */
test.describe('one menu bar on both hosts — the site', () => {
  test('renders the shared accessibility tree: wide, and on a phone closed and open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    const wordmark = (await page.locator('.notch__wordmark').innerText()).trim()
    const bar = page.locator('header.notch-shell')
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('wide', wordmark))
    await page.setViewportSize({ width: 390, height: 800 })
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('phone-closed', wordmark))
    await page.getByRole('button', { name: SITE_MENU_NAME, exact: true }).click()
    await expect(page.locator(`#${SITE_MENU_ID}:popover-open`)).toHaveCount(1)
    await expect(bar).toMatchAriaSnapshot(siteBarAriaSnapshot('phone-open', wordmark))
  })

  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: sets the name exactly as the contract says (TY-08, XS-01)`, async ({
      page,
    }) => {
      await page.goto('/')
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/')
      await page.evaluate(() => document.fonts.ready.then(() => true))
      const m = await page.locator('.notch__wordmark').evaluate((element) => {
        const style = getComputedStyle(element)
        const bar = element.closest('.notch')
        return {
          family: style.fontFamily,
          fontWeight: style.fontWeight,
          fontStretch: style.fontStretch,
          fontSize: style.fontSize,
          letterSpacing: style.letterSpacing,
          colour: style.color,
          barColour: bar ? getComputedStyle(bar).color : '',
        }
      })
      expect({
        fontWeight: m.fontWeight,
        fontStretch: m.fontStretch,
        fontSize: m.fontSize,
        letterSpacing: m.letterSpacing,
      }).toEqual(SITE_BAR_WORDMARK)
      expect(m.family).toMatch(/^"?Archivo Variable"?/)
      expect(m.colour, "the name is not in the bar's own text colour").toBe(m.barColour)
    })
  }
})

/*
 * VA-50 (owner, 2026-10-01, from an iPhone): the strip around the clock and battery stayed paper
 * above the dark bar. Safari 26 and 27 ignore `theme-color` and take that area's colour from a
 * fixed element touching the page's top edge, found by hit-testing — so a 6px strip in the bar's
 * colour, on phones only (owner decision). Asserted where Safari looks: what the top edge holds
 * beside the bar. Android Chrome still reads `theme-color`, so that must give the same colour.
 * apps/viewer/e2e/siteBar.spec.ts runs the same test on a garment page.
 */
test.describe('the phone status area takes the bar colour (VA-50) — the site', () => {
  /** What Safari and Chrome would each take for the browser's own bar, as #rrggbb. */
  const probe = () => {
    const hex = (rgb: string) =>
      `#${(rgb.match(/\d+/g) ?? [])
        .slice(0, 3)
        .map((n) => Number(n).toString(16).padStart(2, '0'))
        .join('')}`
    const strip = document.querySelector('.notch-strip') as HTMLElement
    const box = strip.getBoundingClientRect()
    const style = getComputedStyle(strip)
    const themeColour = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
      .find((tag) => !tag.media || matchMedia(tag.media).matches)
      ?.content.toLowerCase()
    return {
      touch: matchMedia('(hover: none)').matches,
      display: style.display,
      position: style.position,
      box: [box.top, box.height, box.width - innerWidth],
      hit: document.elementFromPoint(4, 2) === strip,
      strip: hex(style.backgroundColor),
      bar: hex(getComputedStyle(document.querySelector('.notch') as HTMLElement).backgroundColor),
      page: hex(getComputedStyle(document.body).backgroundColor),
      themeColour,
    }
  }

  test.describe('on a touch phone', () => {
    test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })
    for (const scheme of ['light', 'dark'] as const) {
      test(`${scheme}: the top edge holds a strip in the bar's colour`, async ({
        page,
        browserName,
      }) => {
        test.skip(browserName === 'firefox', 'Firefox has no mobile emulation (isMobile)')
        await page.emulateMedia({ colorScheme: scheme })
        await page.goto('/')
        await expect(page.locator('.notch')).toBeVisible()
        const top = await page.evaluate(probe)
        expect(top.touch, 'the emulated phone reports hover — this test measures nothing').toBe(
          true,
        )
        expect(top.position).toBe('fixed')
        expect(top.box, 'not a full-width 6px strip at the very top').toEqual([0, 6, 0])
        expect(top.strip, "the strip is not the bar's colour").toBe(top.bar)
        expect(
          top.hit,
          'Safari finds the strip by hit-testing, and the top edge holds something else',
        ).toBe(true)
        expect(top.themeColour, "Android's bar would not be the bar's colour").toBe(top.bar)
      })
    }
  })

  test('not on a desktop: no strip, and the browser bar takes the page colour', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/')
    await expect(page.locator('.notch')).toBeVisible()
    const top = await page.evaluate(probe)
    expect(top.touch).toBe(false)
    expect(top.display).toBe('none')
    expect(top.hit).toBe(false)
    expect(top.themeColour, 'a desktop took the phone colour').toBe(top.page)
  })
})
