import { answerCardPictures } from './cardPictures'
import { expect, type Page, test } from './offlineMedia'

/**
 * /products skips drawing a card's OTHER colours until the card comes within two screens (site.css, at
 * `[data-far]`, 2026-10-21): 41 cards of up to five slides cost a
 * GitHub runner 1.1 s of style and layout on a phone, and Lighthouse live failed on it.
 *
 * What would have to break for these to fail:
 * - the rule is dropped, so the far cards' colours are drawn again (the saving is gone);
 * - the rule is widened to the picture box or the card. Measured on the live page that day, the
 *   picture box version started every card picture only once it was 29-408px ON the screen instead
 *   of about 2,700px ahead, because a lazy picture inside an undrawn box has no position. Lighthouse
 *   scored that version HIGHER, so only a test like the second one sees it.
 *
 * ⚠️ THE CARDS ARE COPIED IN THE BROWSER, as in productsGrid.spec.ts: CI's seed holds one garment
 * (five colours), and a page of one card has nothing far down it. Each copy's picture gets its own
 * address, so the browser fetches it rather than reusing the first card's. Copies carry the server's
 * mark but no script, so the observer that clears it (`CardGallery.tsx`) is NOT held here: the seed's
 * one card is the first, never marked. Its markup is held by `CardGallery.test.ts`, and the observer
 * on the live page, in WebKit, after the deploy (2026-10-21).
 */

const COPIES = 41
/** Switches the rule off, for the comparison and the negative control. */
const ALL_DRAWN = '.card-gallery__slide { content-visibility: visible !important; }'
/** The widened rule that measured as a regression. */
const BOX_SKIPPED = '.product-card__figure { content-visibility: auto; }'

async function openWithCopies(page: Page, extraCss = '') {
  await answerCardPictures(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/products')
  if ((await page.locator('.product-grid .product-card').count()) === 0) {
    if (process.env.CI) throw new Error('no card on /products, and CI seeds one')
    test.skip(true, 'no garment in this local database')
  }
  const slides = await page.evaluate(
    ({ copies, css }) => {
      if (css)
        document.head.append(Object.assign(document.createElement('style'), { textContent: css }))
      const grid = document.querySelector('.product-grid') as HTMLElement
      const first = grid.querySelector('.product-card') as HTMLElement
      while (grid.children.length > 1) grid.lastElementChild?.remove()
      for (let n = 1; n < copies; n++) {
        const copy = first.cloneNode(true) as HTMLElement
        copy.dataset.copy = String(n)
        // The mark the server gives every card from the fifth on (`startsFar`, lib/cardGallery.ts). A copy
        // has no script to clear it, so this holds the CSS and the pictures, not the observer.
        copy.querySelector('.product-card__figure')?.setAttribute('data-far', '')
        // Its own address per copy, lazy like every card below the first screen.
        for (const img of copy.querySelectorAll<HTMLImageElement>(
          '.card-gallery__slide:first-child img',
        )) {
          img.loading = 'lazy'
          img.removeAttribute('fetchpriority')
          const mark = (url: string) => `${url}${url.includes('?') ? '&' : '?'}copy=${n}`
          if (img.srcset)
            img.srcset = img.srcset
              .split(', ')
              .map((entry) => {
                const [url, size] = entry.split(' ')
                return `${mark(url as string)} ${size ?? ''}`.trim()
              })
              .join(', ')
          if (img.getAttribute('src')) img.src = mark(img.getAttribute('src') as string)
        }
        grid.append(copy)
      }
      return first.querySelectorAll('.card-gallery__slide').length
    },
    { copies: COPIES, css: extraCss },
  )
  return slides
}

/** Whether each card's second colour is drawn: [the first card on the screen, the last card]. */
async function secondColourDrawn(page: Page) {
  return page.evaluate(() => {
    const cards = [...document.querySelectorAll('.product-grid > .product-card')]
    // ⚠️ ASK ABOUT SOMETHING INSIDE THE SLIDE, NEVER THE SLIDE. The box that carries
    // `content-visibility: auto` is never skipped itself, only its contents, so the slide always
    // answers "drawn" (the first version of this test did, and passed nothing). `<picture>` is
    // `display: contents` and always answers "not drawn", so the picture or the hidden name is asked.
    const drawn = (card: Element | undefined) =>
      (
        card?.querySelectorAll('.card-gallery__slide')[1]?.querySelector('img, span') as
          | HTMLElement
          | null
          | undefined
      )?.checkVisibility({ contentVisibilityAuto: true }) ?? null
    ;(cards[0] as HTMLElement).scrollIntoView({ block: 'center' })
    return new Promise<{ near: boolean | null; far: boolean | null; firstOfFar: boolean | null }>(
      (done) =>
        requestAnimationFrame(() =>
          requestAnimationFrame(() =>
            done({
              near: drawn(cards[0]),
              far: drawn(cards.at(-1)),
              firstOfFar:
                (
                  cards
                    .at(-1)
                    ?.querySelector(
                      '.card-gallery__slide img, .card-gallery__slide span',
                    ) as HTMLElement | null
                )?.checkVisibility({
                  contentVisibilityAuto: true,
                }) ?? null,
            }),
          ),
        ),
    )
  })
}

/**
 * How far below the screen each copy's picture was when the browser asked for it, scrolling down.
 *
 * ⚠️ THE POSITION IS WORKED OUT AFTERWARDS, FROM TIMES, NOT READ WHEN THE REQUEST IS SEEN. The first
 * version asked the page for the card's position from the request event, and by the time that
 * question ran the page could have scrolled on a step or more: one Chromium run read -39px for a
 * picture that had started thousands of pixels ahead. Each scroll step is logged with the page's
 * clock and each request's start comes from the browser's own timing, both in epoch milliseconds.
 */
async function pictureLeadPx(page: Page): Promise<number[]> {
  const starts: { copy: string; at: number }[] = []
  page.on('requestfinished', (request) => {
    const copy = /[?&]copy=(\d+)/.exec(request.url())?.[1]
    const at = request.timing().startTime
    if (copy && at > 0) starts.push({ copy, at })
  })
  const steps: { at: number; y: number }[] = []
  await page.evaluate(() => window.scrollTo(0, 0))
  const height = await page.evaluate(() => document.documentElement.scrollHeight)
  // 400px steps: far finer than the ~2,600px lead being measured, and few enough that two full scrolls
  // finish inside the time a busy CI machine gives Firefox (one timed out at 30 s, 2026-10-21).
  for (let y = 0; y < height; y += 400) {
    steps.push(
      await page.evaluate((top) => {
        window.scrollTo(0, top)
        return { at: Date.now(), y: scrollY }
      }, y),
    )
    await page.waitForTimeout(120)
  }
  await page.waitForTimeout(500)
  const { tops, screen } = await page.evaluate(() => ({
    screen: innerHeight,
    tops: Object.fromEntries(
      [...document.querySelectorAll<HTMLElement>('[data-copy]')].map((card) => [
        card.dataset.copy,
        card.getBoundingClientRect().top + scrollY,
      ]),
    ),
  }))
  return starts.flatMap(({ copy, at }) => {
    const step = steps.filter((s) => s.at <= at).at(-1)
    const top = tops[copy]
    // Asked for before the first step (on arrival) says nothing about scrolling; leave it out.
    return step && top !== undefined && step.y > 0 ? [Math.round(top - step.y - screen)] : []
  })
}

test.describe('far down /products a card waits to draw its other colours, and nothing else waits', () => {
  test('a card on the screen draws every colour; the last card draws only its first', async ({
    page,
  }) => {
    const slides = await openWithCopies(page)
    test.skip(slides < 2, 'the seeded garment has one colour, so there is no other colour to skip')
    expect(await secondColourDrawn(page)).toEqual({ near: true, far: false, firstOfFar: true })
  })

  test('the check sees a page that draws everything (negative control)', async ({ page }) => {
    const slides = await openWithCopies(page, ALL_DRAWN)
    test.skip(slides < 2, 'the seeded garment has one colour')
    expect((await secondColourDrawn(page)).far).toBe(true)
  })

  test('a card’s picture starts as far ahead of the screen as it does with every colour drawn', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    await openWithCopies(page)
    const withRule = await pictureLeadPx(page)
    const other = await context.newPage()
    await openWithCopies(other, ALL_DRAWN)
    const without = await pictureLeadPx(other)
    await other.close()
    // The control that the measure measured: copies far down were fetched while scrolling.
    expect(without.length, 'no copy was fetched while scrolling').toBeGreaterThanOrEqual(10)
    expect(withRule.length).toBeGreaterThanOrEqual(10)
    expect(Math.min(...withRule)).toBeGreaterThanOrEqual(Math.min(...without) - 100)
  })

  test('the check sees a rule that holds the pictures back (negative control)', async ({
    page,
    context,
  }) => {
    test.setTimeout(90_000)
    await openWithCopies(page, BOX_SKIPPED)
    const boxSkipped = await pictureLeadPx(page)
    const other = await context.newPage()
    await openWithCopies(other, ALL_DRAWN)
    const without = await pictureLeadPx(other)
    await other.close()
    expect(without.length).toBeGreaterThanOrEqual(10)
    expect(Math.min(...boxSkipped)).toBeLessThan(Math.min(...without) - 100)
  })
})
