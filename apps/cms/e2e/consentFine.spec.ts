import { expect, test } from './offlineMedia'

/**
 * VA-13 (visual audit, owner's choice 2026-10-02): the cookie card's sentence draws at 12px on a
 * phone held upright, a phone held sideways and a desktop. The rule is shared with the garment
 * pages (packages/ui/src/base.css); src/consentFine.test.ts holds the source, this the result.
 */
for (const [width, height] of [
  [390, 844],
  [640, 360],
  [1440, 900],
] as const) {
  test(`the cookie card's sentence is 12px at ${width}x${height}`, async ({ page, context }) => {
    // The card honours navigator.webdriver; lift it, as consent.spec.ts does.
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
    })
    await page.setViewportSize({ width, height })
    await page.goto('/')
    const sentence = page.locator('.consent__text')
    await expect(sentence).toBeVisible()
    expect(await sentence.evaluate((element) => getComputedStyle(element).fontSize)).toBe('12px')
  })
}
