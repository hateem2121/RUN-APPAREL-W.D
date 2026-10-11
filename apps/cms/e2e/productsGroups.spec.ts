import AxeBuilder from '@axe-core/playwright'
import { LIVE_GROUP_GARMENTS, LIVE_GROUPS } from './fixtures/productsGroups'
import { expect, type Page, test } from './offlineMedia'
import { HARNESS_FONTS, harnessFontFile, productsGroupsHarnessHtml } from './productsGroupsHarness'

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
 * What would have to break for these to fail: any rule that sizes a group, or a card, by a stand-in
 * rather than by what it holds, a stand-in shorter than its content, or anything else that lets one
 * card's links reach over another's while they are off screen.
 */
const SIZES = [
  [412, 823],
  [390, 844],
  [768, 1024],
  [1440, 900],
] as const

test.beforeEach(async ({ page }) => {
  const html = await productsGroupsHarnessHtml()
  await page.route('**/__products-groups', (route) =>
    route.fulfill({ contentType: 'text/html', body: html }),
  )
  await page.route(HARNESS_FONTS, (route) => {
    const file = harnessFontFile(new URL(route.request().url()).pathname)
    return file ? route.fulfill({ path: file }) : route.fulfill({ status: 404, body: '' })
  })
})

/** The harness at one size: chips and cards drawn, the site's own typeface in, nothing scrolled. */
async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height })
  await page.goto('/__products-groups')
  await expect(page.locator('li.product-card')).toHaveCount(LIVE_GROUP_GARMENTS)
  await expect(page.locator('.filter-chip')).toHaveCount(LIVE_GROUPS.length)
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready
    const families: string[] = []
    document.fonts.forEach((face) => {
      if (face.status === 'loaded') families.push(face.family.replace(/^["']|["']$/g, ''))
    })
    return families
  })
  // Without it the names wrap at a stand-in's widths, and this measures a page nobody sees.
  expect(loaded, 'the fonts the harness page loaded').toContain('Archivo Variable')
  expect(await page.evaluate(() => window.scrollY), 'measured unscrolled').toBe(0)
}

test('no family group spills over the next before it is scrolled to', async ({ page }) => {
  // The cards rise into place as they scroll in (`card-rise`, site.css), only when motion is
  // welcome: a card still waiting below the screen sits 24px low, which this would read as a spill.
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const [width, height] of SIZES) {
    await open(page, width, height)
    const spills = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.gallery-group')].flatMap((group) => {
        const box = group.getBoundingClientRect()
        const last = [...group.querySelectorAll('li.product-card')].at(-1)?.getBoundingClientRect()
        return last && last.bottom > box.bottom + 0.5
          ? [`${group.id}: its cards end ${Math.round(last.bottom - box.bottom)}px below the group`]
          : []
      }),
    )
    expect(spills, `${width}x${height}`).toEqual([])
  }
})

/**
 * ⚠️ LIGHTHOUSE'S OWN RULE, AS LIGHTHOUSE RUNS IT (review of 11 Oct 2026). Lighthouse 13.5.0 runs
 * axe-core 4.13's `target-size` over the page as it loads: unscrolled, with motion on. Every link
 * and button must be 24px or more, or have room around it, and one that another target lies over
 * counts as too small ("partially obscured"), which is how the spilled Teamwear links failed. The
 * test above sees only a group's own box. This sees any card's links crossing another's, whatever
 * lets them.
 *
 * ⚠️ AN "INCOMPLETE" COUNTS AS A FAILURE HERE, unlike in Lighthouse. Planted on 11 Oct 2026: with
 * each card standing in at 40px, its pictures ran 60-90px over the next card, the test above
 * passed, and axe's rule threw ("Axe encountered an error") and returned no violation and no pass,
 * so Lighthouse would have shown nothing either. The clean page gives 543 passes and 0 incomplete.
 */
test('every link passes Lighthouse’s touch-target rule before anything is scrolled to', async ({
  page,
}) => {
  // Eight loads and eight axe runs; a timeout only bounds a failure.
  test.setTimeout(180_000)
  for (const motion of ['no-preference', 'reduce'] as const) {
    await page.emulateMedia({ reducedMotion: motion })
    for (const [width, height] of SIZES) {
      await open(page, width, height)
      expect(
        await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches),
        'the motion setting reached the page',
      ).toBe(motion === 'reduce')
      const { incomplete, passes, violations } = await new AxeBuilder({ page })
        .withRules(['target-size'])
        .analyze()
      expect(await page.evaluate(() => window.scrollY), 'axe scrolled nothing').toBe(0)
      expect(
        [...violations, ...incomplete].flatMap((rule) =>
          rule.nodes.map((node) => `${node.target.join(' ')}: ${node.failureSummary ?? ''}`),
        ),
        `${width}x${height}, motion ${motion}`,
      ).toEqual([])
      // A rule that measured nothing passes the line above; every chip and card link is a target.
      expect(passes.flatMap((rule) => rule.nodes).length, 'targets measured').toBeGreaterThan(100)
    }
  }
})
