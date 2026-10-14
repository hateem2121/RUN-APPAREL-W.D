import { expect, test } from './offlineMedia'

/**
 * The byline under a guide's lede ("Written by …", "Last checked …") is one item per row on a
 * phone and one row from 560px (site.css `.page-byline`, owner 2026-10-14).
 *
 * ⚠️ IT MUST NOT BE THE FONT THAT DECIDES. Wrapping by fit made the row count depend on which font
 * had arrived: at 412px the two items needed 370px in the stand-in faces and 380px in Archivo,
 * the column was 372px, and the byline grew 49 -> 110px when the webfont landed (Lighthouse CLS
 * 0.133 on four guides). 480px is the width that proves the rule in ANY font: there both fonts fit
 * the items in one 440px row, so only the rule can stack them. Measured, not read from the CSS.
 */
type Item = { top: number; bottom: number }

async function bylineItems(page: import('@playwright/test').Page): Promise<Item[]> {
  return page.locator('main dl.page-byline > div').evaluateAll((all) =>
    all.map((item) => {
      const box = item.getBoundingClientRect()
      return { top: box.top, bottom: box.bottom }
    }),
  )
}

test.describe('the byline under a guide', () => {
  for (const width of [360, 412, 480, 559]) {
    test(`is one item per row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/guides/private-label-packaging')
      await page.evaluate(() => document.fonts.ready)
      const items = await bylineItems(page)
      expect(items, 'the byline was not drawn, so nothing was measured').toHaveLength(2)
      const [first, second] = items as [Item, Item]
      expect(second.top).toBeGreaterThanOrEqual(first.bottom)
    })
  }

  for (const width of [560, 1280]) {
    test(`keeps its two items on one row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/guides/private-label-packaging')
      await page.evaluate(() => document.fonts.ready)
      const items = await bylineItems(page)
      expect(items).toHaveLength(2)
      const [first, second] = items as [Item, Item]
      expect(second.top).toBeCloseTo(first.top, 0)
    })
  }
})
