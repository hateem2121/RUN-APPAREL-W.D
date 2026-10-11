import { expect, type Locator, type Page, test } from './offlineMedia'
import { HARNESS_FONTS, harnessFontFile, productsGroupsHarnessHtml } from './productsGroupsHarness'

/**
 * ⚠️ "PREVIOUS" TWICE WHILE A "NEXT" GLIDE IS UNDER HALFWAY (VA-30; main, CI run 38142934506,
 * 11 Oct 2026). VA-30's own test (`pages.spec.ts`) presses next, then previous twice, and Firefox
 * ended on the first colour instead of the last, on both tries, so nothing deployed until a re-run.
 * A smooth scroll sent somewhere new keeps its speed: the strip ran on towards the second colour,
 * past halfway, before it turned round, and the gallery took a reading made on the way out for
 * arrival. `afterScroll` in `lib/cardGallery.ts` has the rule now, and its tests replay the
 * positions, so they fail the same way every time; this checks the real gallery in each engine.
 *
 * ON THE HARNESS (`productsGroupsHarness.ts`): the page's own cards, every one with five colours,
 * and no database. CI's /products holds one garment. The clicks are the page's own (`click()`),
 * because Playwright's take tens of milliseconds each to land, and the moment of the press is the
 * thing being tested.
 */

const LAST = 4

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

/** The harness on a computer's screen, every card fresh on its first colour, motion welcome. */
async function open(page: Page): Promise<Locator> {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/__products-groups')
  const cards = page.locator('li.product-card:has(.card-gallery__arrow--next)')
  await expect(cards).toHaveCount(41)
  expect(
    await page.evaluate(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches),
    'the strip must glide, as it does when motion is welcome',
  ).toBe(false)
  return cards
}

/** The colour the dots show, and the slide the strip shows. */
const showing = (card: Locator) =>
  card.evaluate((element) => {
    const strip = element.querySelector<HTMLElement>('.card-gallery')
    const dots = [...element.querySelectorAll('.card-gallery__dot')]
    return {
      dot: dots.findIndex((dot) => dot.getAttribute('aria-pressed') === 'true'),
      picture: strip ? Math.round(strip.scrollLeft / strip.clientWidth) : -1,
    }
  })

/*
 * Each card is pressed where it went wrong, timed against the strip rather than the clock: "previous"
 * once the strip is 36–44% of the way to the second colour, and again 50–70ms later. Before the fix,
 * 17 of 60 such presses on these cards in Firefox 155 ended on the first colour, and this test failed
 * on its first card. Whether a press lands in that window depends on how far one frame moves the
 * strip, which a busy machine makes coarse, so the count that did is recorded, not required: every
 * press must end on the last colour wherever it landed.
 *
 * What would have to break for this to fail: ending a glide on a reading taken while the strip is still
 * moving, or counting a press from a colour the strip is only passing.
 */
test('"previous" twice during a "next" glide ends on the last colour, and the picture with it', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000)
  const cards = await open(page)
  const shares = [0.36, 0.38, 0.4, 0.42, 0.44]
  const gaps = [50, 60, 70]
  const underHalfway: number[] = []
  for (let index = 0; index < 15; index++) {
    const card = cards.nth(index)
    await card.scrollIntoViewIfNeeded()
    const press = await card.evaluate(
      async (element, { share, gap }) => {
        const strip = element.querySelector<HTMLElement>('.card-gallery')
        const next = element.querySelector<HTMLButtonElement>('.card-gallery__arrow--next')
        const previous = element.querySelector<HTMLButtonElement>('.card-gallery__arrow--prev')
        if (!strip || !next || !previous) throw new Error('the card has no strip or no arrows')
        const dots = [...element.querySelectorAll('.card-gallery__dot')]
        const fresh = dots[0]?.getAttribute('aria-pressed') === 'true' && strip.scrollLeft === 0
        const slide = strip.clientWidth
        const frame = () => new Promise((resolve) => requestAnimationFrame(resolve))
        next.click()
        const giveUp = performance.now() + 2000
        while (strip.scrollLeft < share * slide && performance.now() < giveUp) await frame()
        const first = strip.scrollLeft / slide
        previous.click()
        await new Promise((resolve) => setTimeout(resolve, gap))
        previous.click()
        return { fresh, first }
      },
      { share: shares[index % shares.length], gap: gaps[index % gaps.length] },
    )
    const where = `card ${index + 1}: the first "previous" at ${Math.round(press.first * 100)}% of the way`
    expect(press.fresh, `${where}: the card was not fresh`).toBe(true)
    if (press.first < 0.5) underHalfway.push(Math.round(press.first * 100))
    await expect
      .poll(() => showing(card), { message: where, timeout: 5000 })
      .toEqual({
        dot: LAST,
        picture: LAST,
      })
  }
  testInfo.annotations.push({
    type: 'first "previous" under halfway, where it broke',
    description: `${underHalfway.length} of 15, at ${underHalfway.join('%, ')}%`,
  })
})

/*
 * The glide must END, or the dots would stop following the strip after an arrow is pressed: a
 * finger, the wheel or a key releases it at once (`handOver`), but nothing else does. This scrolls
 * the strip as a script would, with none of the three, once the glide has come to rest.
 *
 * What would have to break for this to fail: the strip's `onScrollEnd` not reaching `afterScroll`
 * in an engine that reports rests (all three here), which would leave the glide under way for good.
 */
test('once an arrow’s glide comes to rest, the dots follow the strip again', async ({ page }) => {
  const cards = await open(page)
  const card = cards.first()
  await card.scrollIntoViewIfNeeded()
  await card.evaluate(async (element) => {
    const strip = element.querySelector<HTMLElement>('.card-gallery')
    const next = element.querySelector<HTMLButtonElement>('.card-gallery__arrow--next')
    if (!strip || !next) throw new Error('the card has no strip or no arrows')
    const rested = new Promise((resolve) =>
      strip.addEventListener('scrollend', resolve, { once: true }),
    )
    next.click()
    await rested
  })
  await expect.poll(() => showing(card)).toEqual({ dot: 1, picture: 1 })
  await card.evaluate((element) => {
    const strip = element.querySelector<HTMLElement>('.card-gallery')
    strip?.scrollTo({ left: 3 * strip.clientWidth, behavior: 'instant' })
  })
  await expect.poll(() => showing(card), { timeout: 5000 }).toEqual({ dot: 3, picture: 3 })
})
