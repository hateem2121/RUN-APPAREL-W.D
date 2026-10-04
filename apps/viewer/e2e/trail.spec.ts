import { expect, test } from '@playwright/test'

/**
 * POLISH S5 — the trail, Home › Products › <category> › <garment>, under the garment band
 * (GarmentTrail.tsx). The W3C breadcrumb pattern (WAI-ARIA APG): a navigation landmark named
 * "Breadcrumb", the page you are on marked `aria-current="page"`. The category opens its own
 * page on the website (packages/shared/src/categoryPages.ts), the step the search-result
 * breadcrumb names too (`worker/preview.ts`).
 */

for (const { device, width, height } of [
  { device: 'a phone', width: 390, height: 844 },
  { device: 'a computer', width: 1440, height: 900 },
] as const) {
  test(`on ${device}, the trail links each step and marks the garment as this page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height })
    await page.goto('/n001/wine')
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    const trail = page.getByRole('navigation', { name: 'Breadcrumb' })
    await trail.scrollIntoViewIfNeeded()
    await expect(trail).toBeVisible()

    const links = trail.getByRole('link')
    await expect(links).toHaveText(['Home', 'Products', 'Sportswear'])
    expect(await links.evaluateAll((all) => all.map((a) => a.getAttribute('href')))).toEqual([
      'https://wear-run.com/',
      'https://wear-run.com/products',
      'https://wear-run.com/custom-activewear-manufacturer',
    ])
    const current = trail.locator('[aria-current="page"]')
    await expect(current).toHaveText('Velocity Performance Tee')
    await expect(current).toHaveCount(1)

    // Under the garment band (the owner gave the garment the row above it, D8 / M5).
    const below = await page.evaluate(() => {
      const band = document.querySelector('.stage-block')?.getBoundingClientRect()
      const nav = document.querySelector('nav.trail')?.getBoundingClientRect()
      return band && nav ? nav.top - band.bottom : null
    })
    expect(below, 'the trail starts below the garment band').toBeGreaterThanOrEqual(0)
  })
}

test('on a phone the trail comes before the garment’s name', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/n001/wine')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
  const gap = await page.evaluate(() => {
    const nav = document.querySelector('nav.trail')?.getBoundingClientRect()
    const name = document.querySelector('h1')?.getBoundingClientRect()
    return nav && name ? name.top - nav.bottom : null
  })
  expect(gap, 'the name follows the trail').toBeGreaterThan(0)
})
