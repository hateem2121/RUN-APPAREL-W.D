import { LIVE_GROUP_GARMENTS } from './fixtures/productsGroups'
import { expect, test } from './offlineMedia'
import { productsGroupsHarnessHtml } from './productsGroupsHarness'

/**
 * ⚠️ NO GROUP MAY SPILL OVER THE NEXT BEFORE IT IS SCROLLED TO (11 Oct 2026). Polish S9 (5 Oct)
 * stood each undrawn group after the first in at 1,200px, and Teamwear is 3,446px on a 412px phone.
 * So, unscrolled, its cards lay 2,246px past their group and on top of the next group's cards.
 * Lighthouse's touch-target audit measures the page unscrolled, and it failed /products on a phone
 * in every live run from 5 to 11 October. Its numbers matched this geometry to the pixel: the r-aj
 * link at 3,964px, the r-csp link at 3,987px.
 *
 * ON A HARNESS (`productsGroupsHarness.ts`), because CI's database holds one garment and no group
 * long enough to spill.
 *
 * What would have to break for this to fail: any rule that sizes a group by a stand-in rather than
 * by its garments, a stand-in shorter than a group, or anything else that lets a group's cards
 * reach past its own box while it is off screen.
 */
test('no family group spills over the next before it is scrolled to', async ({ page }) => {
  const html = await productsGroupsHarnessHtml()
  await page.route('**/__products-groups', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  // The cards rise into place as they scroll in (`card-rise`, site.css), only when motion is
  // welcome: a card still waiting below the screen sits 24px low, which this would read as a spill.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [width, height] of [
    [412, 823],
    [390, 844],
    [768, 1024],
    [1440, 900],
  ] as const) {
    await page.setViewportSize({ width, height })
    await page.goto('/__products-groups')
    await expect(page.locator('li.product-card')).toHaveCount(LIVE_GROUP_GARMENTS)
    const spills = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.gallery-group')].flatMap((group) => {
        const box = group.getBoundingClientRect()
        const last = [...group.querySelectorAll('li.product-card')].at(-1)?.getBoundingClientRect()
        return last && last.bottom > box.bottom + 0.5
          ? [`${group.id}: its cards end ${Math.round(last.bottom - box.bottom)}px below the group`]
          : []
      }),
    )
    expect(await page.evaluate(() => window.scrollY), 'measured unscrolled').toBe(0)
    expect(spills, `${width}x${height}`).toEqual([])
  }
})
