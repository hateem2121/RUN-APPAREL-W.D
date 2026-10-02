import { expect, type Page, test } from './offlineMedia'

/**
 * VA-45 (visual audit, 2026-10-02): a headline that runs past three lines gets more air between its
 * lines, on a phone only. `.display` sets 0.92 of its size (31px lines under 34px type); at five
 * lines — the audit's /custom-teamwear-manufacturer at 390px — the lines nearly touch.
 * `.display--long` (packages/ui/src/base.css) sets 0.98 below 720px, on the headlines known to be
 * long, and nothing anywhere else: a desktop, and any short headline, keep 0.92.
 *
 * What would have to break for these to fail: the rule applied at every width (the desktop
 * reading), a long headline losing its class (the phone reading), the class on a short headline
 * (the short-headline reading), or the seam moving off 720px. `apps/viewer/src/styles/
 * headlineLeading.test.ts` holds the stylesheet and who carries the class; this holds the lines.
 *
 * ⚠️ EACH LOOSENED CASE ALSO ASSERTS THE HEADLINE REALLY RUNS PAST THREE LINES at that width: a
 * "long" headline of two lines would make the rule pointless, and the leading alone could not say.
 * The lines are the box's height over its leading; an accent word is a taller inline box, so the
 * quotient is rounded rather than compared exactly.
 */

const HERO = '.site-hero h1.display--hero'

type Reading = { ratio: number; lines: number }

/** The hero headline's leading as a share of its size, and the lines it sets on. */
async function readHeadline(
  page: Page,
  path: string,
  width: number,
  height = 844,
): Promise<Reading> {
  await page.setViewportSize({ width, height })
  await page.goto(path)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  return page.locator(HERO).evaluate((element) => {
    const style = getComputedStyle(element)
    const leading = Number.parseFloat(style.lineHeight)
    return {
      ratio: leading / Number.parseFloat(style.fontSize),
      lines: Math.round(element.getBoundingClientRect().height / leading),
    }
  })
}

const FAMILY = '/custom-teamwear-manufacturer'

test.describe('a long headline leads at 0.96–1.0 of its size on a phone (VA-45)', () => {
  for (const width of [320, 390, 430]) {
    test(`${width}px: a buyer page's headline, past three lines, is loosened`, async ({ page }) => {
      const headline = await readHeadline(page, FAMILY, width)
      expect(
        headline.lines,
        `only ${headline.lines} lines: this test is not about a long headline`,
      ).toBeGreaterThanOrEqual(4)
      expect(headline.ratio).toBeGreaterThanOrEqual(0.96)
      expect(headline.ratio).toBeLessThan(1)
    })
  }

  test('390px: a guide’s headline is loosened too', async ({ page }) => {
    const headline = await readHeadline(page, '/guides/garment-printing-methods', 390)
    expect(headline.lines, `only ${headline.lines} lines`).toBeGreaterThanOrEqual(4)
    expect(headline.ratio).toBeGreaterThanOrEqual(0.96)
    expect(headline.ratio).toBeLessThan(1)
  })

  test('the seam is 720px: loosened at 719, the poster leading at 720', async ({ page }) => {
    const below = await readHeadline(page, FAMILY, 719, 900)
    const at = await readHeadline(page, FAMILY, 720, 900)
    expect(below.ratio, '719px is still a phone').toBeGreaterThanOrEqual(0.96)
    expect(at.ratio, '720px is not').toBeCloseTo(0.92, 3)
  })
})

test.describe('a desktop and a short headline keep 0.92 (VA-45)', () => {
  test('1440px: the buyer page’s headline is back to 0.92', async ({ page }) => {
    const headline = await readHeadline(page, FAMILY, 1440, 900)
    expect(headline.ratio).toBeCloseTo(0.92, 3)
  })

  test('390px: a short headline keeps 0.92 — /contact’s, and the guides’ index', async ({
    page,
  }) => {
    const contact = await readHeadline(page, '/contact', 390)
    expect(
      contact.lines,
      'a long headline here: this test is not about a short one',
    ).toBeLessThanOrEqual(3)
    expect(contact.ratio).toBeCloseTo(0.92, 3)
    const index = await readHeadline(page, '/guides', 390)
    expect(index.ratio).toBeCloseTo(0.92, 3)
  })
})
