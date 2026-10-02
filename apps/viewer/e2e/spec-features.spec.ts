import { expect, type Page, test } from '@playwright/test'

/**
 * VA-59 (visual audit, 2026-10-02): the Performance fact of the spec list read as one run-on
 * string on a phone — the CMS's list of features joined with " / " and wrapped over five lines in
 * a half-width column. Each feature is now its own line, in a plain list: same words, same
 * order, no CMS change.
 *
 * ⚠️ FOUR FEATURES, NOT THE FIXTURE'S TWO. The fixture serves "Moisture management" and
 * "Four-way stretch", which is short enough that the old joined string fitted on a line or two at
 * most widths — a layout that holds for short words is the defect this repo keeps shipping
 * (tests-and-fixtures.md). Four invented features make the old string long enough to wrap, so
 * "each on its own line" is a real difference. Invented, so a test does not carry a product's words.
 *
 * The spec list is drawn up to 999px wide (from 1000px the same facts are the callouts over the
 * garment), so this runs at the phone widths and at 768px, where it is the only rendering.
 */

const FEATURES = [
  'Four-way stretch knit',
  'Bonded flat seams',
  'Reflective trims on cuffs and hem',
  'Brushed inner face',
]

function serveFeatures(page: Page, performanceFeatures: string[]) {
  return page.route('**/api/public/viewer/**', async (route) => {
    const response = await route.fetch()
    const body = (await response.json()) as { product: Record<string, unknown> }
    body.product.performanceFeatures = performanceFeatures
    await route.fulfill({ response, json: body })
  })
}

for (const width of [320, 390, 768] as const) {
  test(`each Performance feature starts on its own line at ${width}px (VA-59)`, async ({
    page,
  }) => {
    await serveFeatures(page, FEATURES)
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()

    const m = await page.evaluate(() => {
      const row = [...document.querySelectorAll('.spec-list > div')].find(
        (candidate) => candidate.querySelector('dt')?.textContent === '[ Performance ]',
      )
      const list = row?.querySelector('ul')
      const items = [...(row?.querySelectorAll('li') ?? [])]
      return {
        found: Boolean(row),
        shown: row ? getComputedStyle(row.closest('.spec-list') as Element).display : 'none',
        words: items.map((item) => item.textContent),
        tops: items.map((item) => Math.round(item.getBoundingClientRect().top)),
        text: row?.querySelector('dd')?.textContent ?? '',
        bullets: list ? getComputedStyle(list).listStyleType : '',
        indent: list ? Number.parseFloat(getComputedStyle(list).paddingLeft) : -1,
      }
    })

    expect(m.found, 'no Performance row in the spec list').toBe(true)
    expect(m.shown, 'the spec list is not drawn at this width').not.toBe('none')
    expect(m.words, 'the features changed, were reordered, or were lost').toEqual(FEATURES)
    // One line each: every feature starts lower than the one before it.
    expect(
      m.tops.every((top, index) => index === 0 || top > (m.tops[index - 1] ?? 0)),
      `two features share a line (tops: ${m.tops.join(', ')})`,
    ).toBe(true)
    expect(m.text, 'the features are still joined by a slash').not.toContain(' / ')
    expect(m.bullets, 'the list shows bullets').toBe('none')
    expect(m.indent, 'the list is indented').toBe(0)
  })
}

test('the features are a list a screen reader counts (VA-59)', async ({ page }) => {
  await serveFeatures(page, FEATURES)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const list = page.locator('.spec-list').getByRole('list')
  await expect(list, 'the features are not exposed as a list').toHaveCount(1)
  await expect(list.getByRole('listitem')).toHaveCount(FEATURES.length)
})
