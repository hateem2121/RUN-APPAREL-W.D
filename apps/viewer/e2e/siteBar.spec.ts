import { expect, test } from '@playwright/test'
import {
  SITE_BAR_WORDMARK,
  SITE_MENU_ID,
  SITE_MENU_NAME,
  siteBarAriaSnapshot,
} from '../../../packages/shared/src/siteBar'
import { contrastOf, parseCssColour, relativeLuminance } from '../../../scripts/contrast-rules.mjs'

/**
 * XS-02, XS-01, TY-08 — ONE menu bar on both hosts (owner decision 2026-09-17: "Same menu bars
 * everywhere. The one I prefer is at wear-run.help"). apps/cms/e2e/siteBar.spec.ts runs the
 * same checks against the same constants, so a bar that drifts on either host fails on THAT host.
 */
test.describe('one menu bar on both hosts — the viewer', () => {
  test('renders the shared accessibility tree: wide, and on a phone closed and open', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      await page.emulateMedia({ colorScheme: scheme })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
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

test.describe('the focus ring in the dark bar (volt, both themes)', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: every ring in the bar and the open menu reaches 4.5:1`, async ({
      page,
      browserName,
    }) => {
      test.skip(browserName === 'webkit', 'WebKit leaves links out of the Tab order by preference')
      await page.goto('/n001/wine')
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await page.setViewportSize({ width: 390, height: 800 })
      await page.goto('/n001/wine')
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
      // WAIT FOR THE HAND-OFF (motion-and-layout.spec.ts explains why), then Tab from the top.
      await page.waitForFunction(() => document.activeElement?.id === 'viewer-top')
      const ground = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
      const luminance = relativeLuminance(parseCssColour(ground).rgb)
      if (scheme === 'dark') expect(luminance, `not dark: ${ground}`).toBeLessThan(0.2)
      else expect(luminance, `not light: ${ground}`).toBeGreaterThan(0.5)
      const ring = () =>
        page.evaluate(() => {
          const element = document.activeElement as HTMLElement
          const behind =
            element.closest('.notch__menu:popover-open') ??
            element.closest('.notch') ??
            document.body
          const style = getComputedStyle(element)
          return {
            name: element.className,
            style: style.outlineStyle,
            colour: style.outlineColor,
            behind: getComputedStyle(behind).backgroundColor,
          }
        })
      const rings = []
      await page.keyboard.press('Tab') // the skip link
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the wordmark
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the menu button
      await page.keyboard.press('Enter')
      await expect(page.locator(`#${SITE_MENU_ID}:popover-open`)).toHaveCount(1)
      await page.keyboard.press('Tab')
      rings.push(await ring()) // the first link, in the open menu
      expect(rings.map((entry) => entry.name)).toEqual([
        'notch__wordmark',
        'notch__menu-btn',
        'nav-link',
      ])
      const failing = rings
        .filter((entry) => entry.style !== 'solid' || contrastOf(entry.colour, entry.behind) < 4.5)
        .map(
          (entry) =>
            `${entry.name}: ${entry.colour} on ${entry.behind} = ${contrastOf(entry.colour, entry.behind).toFixed(2)}:1`,
        )
      expect(failing, `${scheme}: a ring in the dark bar is too faint`).toEqual([])
    })
  }
})
