import { expect, test } from './offlineMedia'

/**
 * The press page (2026-10-07), in a real browser: what a journalist would see broken.
 *
 * ⚠️ THE FACTS' COLUMNS ARE MEASURED, NOT READ FROM site.css. The first build declared five
 * columns from 1180px and drew four: `.case-facts`, whose type the facts borrow, says four from
 * 1000px further down the same file, and at equal specificity the later rule wins. Ten facts in
 * four columns left two empty cells on a wide screen, which only a picture showed.
 */
test.describe('the press page', () => {
  for (const width of [390, 768, 1180, 1440]) {
    test(`no row of quick facts is left half empty at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/press')
      const { columns, items } = await page.locator('.press-facts').evaluate((grid) => ({
        columns: getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length,
        items: grid.children.length,
      }))
      expect(items, 'no facts were drawn').toBeGreaterThan(0)
      expect(items % columns, `${items} facts in ${columns} columns`).toBe(0)
    })
  }

  test('the quick facts stand clear of their heading', async ({ page }) => {
    // `.case-facts { margin: 0 }`, later in site.css, once cancelled the gap: the heading's
    // letters sat on the first rule.
    await page.goto('/press')
    const heading = await page.locator('#quick-facts').boundingBox()
    const facts = await page.locator('.press-facts').boundingBox()
    if (!heading || !facts) throw new Error('the heading or the facts were not drawn')
    expect(facts.y - (heading.y + heading.height)).toBeGreaterThanOrEqual(16)
  })

  test('every "Download" serves a picture', async ({ page, request }) => {
    await page.goto('/press')
    const links = page.locator('a.press-photos__download')
    const hrefs = await links.evaluateAll((all) =>
      all.map((link) => (link as HTMLAnchorElement).getAttribute('href') ?? ''),
    )
    expect(hrefs.length, 'no download links were drawn').toBeGreaterThan(0)
    for (const href of hrefs) {
      const response = await request.get(href)
      expect(response.status(), href).toBe(200)
      expect(response.headers()['content-type'], href).toMatch(/^image\//)
    }
  })

  test('the media contact is a working mail link', async ({ page }) => {
    await page.goto('/press')
    await expect(
      page.locator('#media-contact ~ * a[href="mailto:media@wear-run.com"]'),
    ).toHaveCount(1)
  })
})
