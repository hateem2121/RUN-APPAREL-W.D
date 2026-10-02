import { expect, test } from '@playwright/test'

/**
 * VA-17 (visual audit, 2026-10-02): the garment page's fluid paddings and gaps keep to the 2px
 * scale. Each `clamp()` that grows with the window has a `round(…, 2px)` twin behind `@supports`,
 * after its rule (the note above `--site-gutter`'s rounding in packages/ui/src/tokens.css), and
 * src/styles/fluidSpacing.test.ts checks every twin is written. This asks the page whether each
 * one WINS: placed before its rule, a twin loses to the plain `clamp()` and nothing else notices
 * (that happened while it was being built).
 *
 * The widths are chosen so every unrounded value is fractional: at 1037px (the two-column stage),
 * 2vw is 20.74px, 4vw 41.48px, 5vw 51.85px and 6vw 62.22px; at 557px (a phone layout, with the
 * fixed contact bar), 2vw is 11.14px and 4vw 22.28px. So a value that is not a whole, even number
 * of pixels is a twin that did not apply.
 */
const AT: Record<number, { selector: string; property: string }[]> = {
  1037: [
    { selector: '.stage__inner', property: 'padding-top' },
    { selector: '.stage__aside', property: 'padding-top' },
    { selector: '.content', property: 'padding-top' },
    { selector: '.content', property: 'padding-left' },
    { selector: '.content', property: 'row-gap' },
    { selector: 'footer .footer-cta', property: 'padding-top' },
  ],
  557: [
    { selector: '.stage__inner', property: 'padding-top' },
    { selector: '.content', property: 'padding-left' },
    { selector: '.action-bar', property: 'padding-left' },
    { selector: '.action-bar', property: 'padding-right' },
  ],
}

for (const [width, measured] of Object.entries(AT)) {
  test(`fluid paddings and gaps land on the 2px scale at ${width}px (VA-17)`, async ({ page }) => {
    await page.setViewportSize({ width: Number(width), height: 900 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const off: string[] = []
    for (const entry of measured) {
      const value = await page
        .locator(entry.selector)
        .first()
        .evaluate(
          (element, property) => getComputedStyle(element).getPropertyValue(property),
          entry.property,
        )
      const pixels = Number.parseFloat(value)
      // The control: a missing element or a zero would pass "even" for the wrong reason.
      expect(pixels, `${entry.selector} ${entry.property} measured nothing`).toBeGreaterThan(0)
      if (!Number.isInteger(pixels) || pixels % 2 !== 0) {
        off.push(`${entry.selector} ${entry.property}: ${value}`)
      }
    }
    expect(off, 'fluid spacing between the 2px steps').toEqual([])
  })
}
