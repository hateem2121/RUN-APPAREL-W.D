import { expect, test } from './offlineMedia'

/**
 * VA-17 (visual audit, 2026-10-02): the website's fluid paddings keep to the 2px scale. Each
 * `clamp()` that grows with the window has a `round(…, 2px)` twin behind `@supports`, after its
 * rule (the note above `--site-gutter`'s rounding in packages/ui/src/tokens.css), and
 * apps/viewer/src/styles/fluidSpacing.test.ts checks every twin is written. This asks the page
 * whether each one WINS: placed before its rule, a twin loses to the plain `clamp()` and nothing
 * else notices (that happened while it was being built).
 *
 * The widths are chosen so every unrounded value is fractional: at 1037px, 9vw is 93.33px, 11vw
 * 114.07px, 6vw 62.22px, 5vw 51.85px and 4vw 41.48px; at 1291px they are 116.19, 142.01, 77.46,
 * 64.55 (held at its 64px cap) and 51.64px. So a value that is not a whole, even number of pixels
 * is a twin that did not apply.
 */
const MEASURED: { path: string; selector: string; property: string }[] = [
  { path: '/', selector: '.site-container', property: 'padding-left' },
  { path: '/', selector: '.site-section', property: 'padding-top' },
  { path: '/', selector: '.site-section', property: 'padding-bottom' },
  { path: '/', selector: '.footer-cta', property: 'padding-top' },
  { path: '/', selector: '.footer-facts', property: 'padding-bottom' },
  // A plain hero (the home and products heroes are photo heroes with rules of their own).
  { path: '/privacy', selector: '.site-hero', property: 'padding-bottom' },
]

for (const width of [1037, 1291]) {
  test(`fluid paddings land on the 2px scale at ${width}px (VA-17)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const off: string[] = []
    let path = ''
    for (const entry of MEASURED) {
      if (entry.path !== path) {
        path = entry.path
        await page.goto(path)
      }
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
        off.push(`${entry.path} ${entry.selector} ${entry.property}: ${value}`)
      }
    }
    expect(off, 'fluid spacing between the 2px steps').toEqual([])
  })
}
