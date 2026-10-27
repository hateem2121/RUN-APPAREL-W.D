import { answerCardPictures } from './cardPictures'
import { expect, type Locator, type Page, test } from './offlineMedia'

/**
 * A gallery card's dots and arrows change its colour with the dye (owner, 2026-10-26: one dye
 * everywhere a garment changes colour; CardGallery.tsx says how), on /products: CI's seeded garment has
 * a poster for each of its five colours. (The layout harness of `galleryArrows.spec.ts` carries no
 * pictures, so a press there can only glide.)
 *
 * What would have to break for these to fail: a press that cuts or glides instead of dyeing, a link
 * left on the old colour, a layer left showing, a finger's swipe turned into a dye, any dye for a
 * visitor who asked for less motion, or a layer that widens the page on a phone.
 */

/**
 * A card standing on a colour whose NEXT colour is pictured the same way (a render beside a poster
 * glides, by design: CI's seeded garment has a render for its first colour and posters for the other
 * four), engaged, ready for a press on the next dot, whose picture may not have loaded yet (the
 * gallery holds the old one over it until it has). Returns the card and the dot to press.
 */
async function readyCard(
  page: Page,
  width = 1280,
  height = 900,
): Promise<{ card: Locator; to: number }> {
  await page.setViewportSize({ width, height })
  // Pictures of the size each card asks for: the 2 x 2 stand-in reads as a failed load on a phone.
  await answerCardPictures(page)
  await page.goto('/products')
  const cards = page.locator('li.product-card:has(.card-gallery__dot)')
  await expect(cards.first()).toBeVisible()
  const [index, from] = await cards.evaluateAll((all) => {
    for (const [i, card] of all.entries()) {
      const kinds = [...card.querySelectorAll<HTMLElement>('.card-gallery__slide')].map(
        (slide) => slide.dataset.kind,
      )
      const at = kinds.findIndex((kind, k) => kind !== 'none' && kind === kinds[k + 1])
      if (at >= 0) return [i, at]
    }
    return [-1, -1]
  })
  if (index < 0) {
    if (process.env.CI) throw new Error('no card has two colours pictured alike, and CI seeds one')
    test.skip(true, 'no garment with two colours pictured alike in this local database')
  }
  const card = cards.nth(index)
  await card.scrollIntoViewIfNeeded()
  // The card's script must own it before the pointer arrives: a hover before hydration asks for
  // nothing, and the next picture never loads (Chromium and Firefox, 2026-10-26).
  await page.waitForFunction(
    (el) => !!el && Object.keys(el).some((key) => key.startsWith('__reactProps')),
    await card.locator('.product-card__figure').elementHandle(),
  )
  await card.locator('.product-card__figure').hover()
  const strip = card.locator('.card-gallery')
  if (from > 0) {
    await card.locator('.card-gallery__dot').nth(from).click()
    await expect
      .poll(() => strip.evaluate((el) => Math.round(el.scrollLeft / el.clientWidth)))
      .toBe(from)
    await page.waitForTimeout(400)
  }
  // The picture showing must have loaded: the dye starts from it.
  await expect
    .poll(() =>
      card
        .locator('.card-gallery__slide')
        .nth(from)
        .locator('img')
        .evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0),
    )
    .toBe(true)
  return { card, to: from + 1 }
}

/** Counts the frames in which this card's dye is running. */
const countFrames = (card: Locator) =>
  card.evaluate((element) => {
    const w = window as unknown as { __frames: number }
    w.__frames = 0
    const tick = () => {
      if (element.querySelector('.dye-layer')?.hasAttribute('data-running')) w.__frames++
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  })
const frames = (page: Page) =>
  page.evaluate(() => (window as unknown as { __frames: number }).__frames)

test('a dot press soaks the new colour in, the link follows it, and nothing is left', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { card, to } = await readyCard(page)
  await countFrames(card)
  const wanted = await card.locator('.card-gallery__slide').nth(to).getAttribute('href')
  await card.locator('.card-gallery__dot').nth(to).click()
  const layer = card.locator('.dye-layer')
  await expect(layer).not.toHaveAttribute('data-running', { timeout: 3000 })
  expect(await frames(page), 'the colour was cut or glided, not dyed').toBeGreaterThan(5)
  expect(await layer.evaluate((element) => getComputedStyle(element).visibility)).toBe('hidden')
  await expect(card.locator('.product-card__link')).toHaveAttribute('href', wanted ?? 'none')
  await expect(card.locator('.card-gallery__dot').nth(to)).toHaveAttribute('aria-pressed', 'true')
  // The strip stands on the new colour: the jump was the strip's own, not a picture swapped in.
  expect(
    await card
      .locator('.card-gallery')
      .evaluate((strip) => Math.round(strip.scrollLeft / strip.clientWidth)),
  ).toBe(to)
})

test('a swipe still glides the strip, with no dye', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { card } = await readyCard(page)
  await countFrames(card)
  const strip = card.locator('.card-gallery')
  const start = await strip.evaluate((el) => el.scrollLeft)
  // The wheel goes where the pointer is: back over the picture from the dots.
  await card.locator('.product-card__figure').hover()
  await page.mouse.wheel(400, 0)
  await expect
    .poll(() => strip.evaluate((el) => el.scrollLeft), { timeout: 3000 })
    .toBeGreaterThan(start)
  await page.waitForTimeout(800)
  expect(await frames(page), 'a swipe drew the dye').toBe(0)
})

test('under reduced motion a dot press changes the colour at once, with no dye', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const { card, to } = await readyCard(page)
  await countFrames(card)
  await card.locator('.card-gallery__dot').nth(to).click()
  await expect(card.locator('.card-gallery__dot').nth(to)).toHaveAttribute('aria-pressed', 'true')
  await page.waitForTimeout(800)
  expect(await frames(page)).toBe(0)
})

test('on a 360px phone a dot press widens nothing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const { card, to } = await readyCard(page, 360, 780)
  await card.locator('.card-gallery__dot').nth(to).click()
  const sideways = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  )
  expect(sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
})
