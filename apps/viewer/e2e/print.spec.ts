import { expect, type Page, test } from '@playwright/test'
import { contrastOf } from '../../../scripts/contrast-rules.mjs'

/**
 * VA-04 on the garment pages — a printed page reads, whatever theme it was printed from (visual
 * audit, 2026-10-02). Browsers drop background colours on paper and printing changes neither the
 * system's dark setting nor a saved theme choice, so a dark theme prints light text on white;
 * WCAG 1.4.3 asks for 4.5:1. The rules are shared with the website (packages/ui: tokens.css,
 * notch.css, base.css), and apps/cms/e2e/print.spec.ts holds the website to the same checks.
 */

const printedColours = (page: Page) =>
  page.evaluate(() => {
    const colour = (selector: string) => {
      const el = document.querySelector(selector)
      return el ? getComputedStyle(el).color : `missing: ${selector}`
    }
    return { headline: colour('h1'), text: colour('main p'), bar: colour('.notch__wordmark') }
  })

for (const { how, theme } of [
  { how: 'the system setting', theme: null },
  { how: 'the theme switch', theme: 'dark' },
] as const) {
  test(`printed from dark mode set by ${how}, every word is dark on white (VA-04)`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    if (theme) {
      await page.evaluate((value) => {
        document.documentElement.dataset.theme = value
      }, theme)
    }
    // NEGATIVE CONTROL: on screen the page IS dark, so the paper result below means something.
    const onScreen = await printedColours(page)
    expect(contrastOf(onScreen.text, '#ffffff'), 'not light text on screen').toBeLessThan(3)

    await page.emulateMedia({ media: 'print', colorScheme: 'dark' })
    const onPaper = await printedColours(page)
    for (const [what, colour] of Object.entries(onPaper)) {
      expect(contrastOf(colour, '#ffffff'), `${what} on paper: ${colour}`).toBeGreaterThanOrEqual(
        4.5,
      )
    }
  })
}

test('the cookie question never prints (VA-04)', async ({ page, context }) => {
  // The question honours navigator.webdriver; lift it, as consent.spec.ts does.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
  })
  await page.goto('/n001/wine')
  const card = page.locator('.consent')
  await expect(card).toBeVisible()
  await page.emulateMedia({ media: 'print' })
  await expect(card).toBeHidden()
})
