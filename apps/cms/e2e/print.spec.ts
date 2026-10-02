import { contrastOf } from '../../../scripts/contrast-rules.mjs'
import { expect, type Page, test } from './offlineMedia'

/**
 * VA-04 — a printed page reads, whatever theme it was printed from (visual audit, 2026-10-02).
 * Browsers drop background colours on paper, and printing changes neither the system's dark
 * setting nor a saved theme choice, so the dark theme printed light text on white: headline
 * 1.27:1, body 1.20:1. WCAG 1.4.3 asks for 4.5:1. The rules: packages/ui/src/tokens.css
 * (`color-scheme: light` in print), notch.css (the bar's words), base.css (the cookie card).
 * apps/viewer/e2e/print.spec.ts holds the garment pages to the same three.
 */

/** Every colour a reader meets on paper: the headline, the running text, the bar's name. */
const printedColours = (page: Page) =>
  page.evaluate(() => {
    const colour = (selector: string) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).color : `missing: ${selector}`
    }
    return {
      headline: colour('main h1'),
      text: colour('main p'),
      bar: colour('.notch__wordmark'),
    }
  })

const darkModes = [
  { how: 'the system setting', theme: null },
  { how: 'the theme switch', theme: 'dark' },
] as const

// The home, contact and products pages open on a PHOTO hero, dark in both themes on screen, which
// re-declares its own colours; site.css hands them back to the page on paper (found 2026-10-02).
for (const path of ['/', '/contact', '/privacy', '/products']) {
  for (const { how, theme } of darkModes) {
    test(`${path}: printed from dark mode set by ${how}, every word is dark on white`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: 'dark' })
      await page.goto(path)
      if (theme) {
        await page.evaluate((value) => {
          document.documentElement.dataset.theme = value
        }, theme)
      }
      // NEGATIVE CONTROL: on screen the page IS dark, so the paper result below means something.
      const onScreen = await printedColours(page)
      expect(
        contrastOf(onScreen.text, '#ffffff'),
        'the running text is not light on screen in dark mode',
      ).toBeLessThan(3)

      await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
      const onPaper = await printedColours(page)
      for (const [what, colour] of Object.entries(onPaper)) {
        expect(contrastOf(colour, '#ffffff'), `${what} on paper: ${colour}`).toBeGreaterThanOrEqual(
          4.5,
        )
      }
    })
  }
}

test('the cookie question never prints', async ({ page, context }) => {
  // The question honours navigator.webdriver; lift it, as consent.spec.ts does.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  await page.goto('/privacy')
  const card = page.getByRole('region', { name: 'Cookie choice' })
  await expect(card).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(card).toBeHidden()
})
