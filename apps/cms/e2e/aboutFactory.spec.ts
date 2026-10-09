import { expect, test } from './offlineMedia'

/**
 * The about and factory pages (the about-factory build, 2026-10-09), in a real browser: what a
 * buyer would see broken.
 *
 * ⚠️ THE STAGE ROWS ARE MEASURED, NOT READ FROM site.css. The first build declared two columns
 * from 900px and drew them inside 584px at 1440px: each stage is an `<li>`, and the site caps every
 * `p, li` at the reading measure (34.362em), so the walkthrough sat in the left half of the page
 * with 280px photos. Only a picture showed it.
 */
test.describe('the factory page', () => {
  for (const width of [900, 1440, 1920]) {
    test(`each stage row spans the walkthrough at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/inside-the-factory')
      const list = await page.locator('.factory-stages').boundingBox()
      const rows = await page
        .locator('.factory-stage')
        .evaluateAll((all) => all.map((row) => row.getBoundingClientRect().width))
      if (!list) throw new Error('the walkthrough was not drawn')
      expect(rows, 'no stage rows were drawn, so nothing was measured').toHaveLength(5)
      for (const row of rows) expect(row).toBeCloseTo(list.width, 0)
    })
  }

  test('a stage with several photos sets them side by side at 1440px', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/inside-the-factory')
    // Stage 5 has four photos; one column made them a tower four photos tall.
    const tops = await page
      .locator('.factory-stage')
      .nth(4)
      .locator('.photo-figure')
      .evaluateAll((all) => all.map((figure) => Math.round(figure.getBoundingClientRect().top)))
    expect(tops, 'stage 5 drew no photos, so nothing was measured').toHaveLength(4)
    expect(new Set(tops).size, `photo tops ${tops.join(', ')}`).toBeLessThan(4)
  })
})
