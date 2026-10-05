import { FAMILY_PAGES } from '../src/lib/familyPages'
import { expect, type Page, test } from './offlineMedia'

/**
 * VA-55 (visual audit, owner's choice 2026-10-02): the renders are cropped tight, so inside a card's
 * 4:5 box each garment ran to the edge: on the home family cards the sports bra touched both sides
 * and the jacket's sleeves reached the sides and the bottom, and the bib shorts touched top and
 * bottom on the home page and on /products. The pictures now keep a margin of about 6-8% inside
 * the same box. `src/pictureInset.test.ts` does the sums on the stylesheet's numbers; this measures
 * where a browser actually draws the picture.
 *
 * ⚠️ THE FIXTURE'S PICTURES ARE 2 x 2 PIXELS, SO THEY CANNOT SHOW THIS. A square picture in a 4:5
 * box is bound by the width and never touches the top, which hides exactly the failure the audit
 * found (a tall render touching top and bottom). So each frame is measured twice: with its picture as
 * served, and with a synthetic picture of each awkward shape swapped in — taller than the box,
 * the box's own shape, wider than it — which is what a real render can be. The site's own accessories
 * photo is real and is measured as it loads. A product card's picture is a resized copy, answered
 * here at the size the card asks for (`answerCardPictures`): at 2 x 2 the card discards it on a phone.
 *
 * "DRAWN CONTENT" is where `object-fit: contain` puts the picture inside the padded box (its content
 * box, picture centred), as the distance from each edge of the FRAME to the picture, in fractions of
 * the frame's own width at the sides and height at the top and bottom. The floor is 6%, the bottom of
 * the owner's "about 6-8%".
 *
 * What would have to break for these to fail: the margin removed or thinned, the rule no longer
 * reaching a frame (or reaching the home page's 3D picture, which a live model lies over), the frame
 * losing its 4:5 shape, or the swipe's slide no longer being the strip's whole width.
 */

const FLOOR = 0.06

type Margins = {
  left: number
  right: number
  top: number
  bottom: number
  frame: { width: number; height: number }
}

/** A flat picture of the given shape, as a data URL (the page's policy allows `data:` images). */
const synthetic = (width: number, height: number) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#888"/></svg>`,
  )}`

/**
 * Where every `image` is drawn inside its `frame`. With `shape`, each picture is first replaced by a
 * synthetic one of that shape; without it, it is measured as served.
 */
async function drawnMargins(
  page: Page,
  image: string,
  frame: string,
  shape?: { width: number; height: number },
): Promise<Margins[]> {
  return page.evaluate(
    async ({ image, frame, shape, source }) => {
      const found: Margins[] = []
      for (const img of document.querySelectorAll<HTMLImageElement>(image)) {
        // Eager first: a lazy picture below the fold has not been asked for, and has no size to measure.
        img.loading = 'eager'
        if (shape) {
          img.removeAttribute('srcset')
          img.removeAttribute('sizes')
          img.src = source
        }
        // A picture that never loaded draws nothing to measure: a resized copy (`/cdn-cgi/image/`)
        // that a local server cannot make, for a database whose garments name the live media host.
        // Skipped, not counted as a margin of NaN; `expectInset` still fails on finding none.
        const loaded = await img.decode().then(
          () => img.naturalWidth > 0,
          () => false,
        )
        if (!loaded) continue
        const box = img.closest<HTMLElement>(frame)
        if (!box) throw new Error(`${image} is not inside ${frame}`)
        const outer = box.getBoundingClientRect()
        const rect = img.getBoundingClientRect()
        const style = getComputedStyle(img)
        const px = (value: string) => Number.parseFloat(value) || 0
        const left = rect.left + px(style.paddingLeft) + px(style.borderLeftWidth)
        const top = rect.top + px(style.paddingTop) + px(style.borderTopWidth)
        const width =
          rect.width -
          px(style.paddingLeft) -
          px(style.paddingRight) -
          px(style.borderLeftWidth) -
          px(style.borderRightWidth)
        const height =
          rect.height -
          px(style.paddingTop) -
          px(style.paddingBottom) -
          px(style.borderTopWidth) -
          px(style.borderBottomWidth)
        // `object-fit: contain`, centred (the default `object-position: 50% 50%`).
        const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight)
        const drawnW = img.naturalWidth * scale
        const drawnH = img.naturalHeight * scale
        const drawnLeft = left + (width - drawnW) / 2
        const drawnTop = top + (height - drawnH) / 2
        found.push({
          left: drawnLeft - outer.left,
          right: outer.right - (drawnLeft + drawnW),
          top: drawnTop - outer.top,
          bottom: outer.bottom - (drawnTop + drawnH),
          frame: { width: outer.width, height: outer.height },
        })
      }
      return found
    },
    {
      image,
      frame,
      shape: shape ?? null,
      source: shape ? synthetic(shape.width, shape.height) : '',
    },
  )
}

function expectInset(measured: Margins[], what: string) {
  expect(measured.length, `${what}: no picture to measure`).toBeGreaterThan(0)
  for (const [index, m] of measured.entries()) {
    const label = `${what} #${index + 1}`
    expect(
      m.left / m.frame.width,
      `${label}: the picture runs to the left edge`,
    ).toBeGreaterThanOrEqual(FLOOR)
    expect(
      m.right / m.frame.width,
      `${label}: the picture runs to the right edge`,
    ).toBeGreaterThanOrEqual(FLOOR)
    expect(
      m.top / m.frame.height,
      `${label}: the picture runs to the top edge`,
    ).toBeGreaterThanOrEqual(FLOOR)
    expect(
      m.bottom / m.frame.height,
      `${label}: the picture runs to the bottom edge`,
    ).toBeGreaterThanOrEqual(FLOOR)
  }
}

/** The awkward shapes: taller than a 4:5 box (height-bound), its own, wider (width-bound), square. */
const SHAPES = [
  { name: 'a 2:3 render', width: 400, height: 600 },
  { name: 'a 4:5 render', width: 400, height: 500 },
  { name: 'a 5:4 picture', width: 500, height: 400 },
  { name: 'a square picture', width: 500, height: 500 },
]

/**
 * The card asks Cloudflare for a resized copy of its picture (`/cdn-cgi/image/…width=W,height=H…`,
 * `lib/cardImage.ts`). This answers that copy with a flat picture of exactly the box it asks for.
 *
 * ⚠️ WITHOUT IT THE PHONE CARDS HAD NO PICTURE TO MEASURE (CI, 2026-10-02). `offlineMedia.ts`
 * answers every media request, the resized ones included, with its 2 x 2 picture, and a browser
 * divides a srcset picture's width by its density: at 390px the 400-wide copy fills a 169.5px slot,
 * so the 2px picture reports a `naturalWidth` of 0 (measured in Chromium: 0 at 390px, 1 at 1440px,
 * 2 with no srcset). `ProductPoster` reads `complete && naturalWidth === 0` as a failed load and puts
 * its placeholder where the picture was, so at 390px these tests skipped on the Mac and failed in
 * CI. A real resized render is hundreds of pixels wide. A page route wins over the context route
 * `offlineMedia.ts` sets (Playwright, BrowserContext.route, read 2026-10-02), and it answers
 * locally too, so this suite still never reaches the media host.
 */
const answered = new WeakSet<Page>()
async function answerCardPictures(page: Page) {
  if (answered.has(page)) return
  answered.add(page)
  await page.route('**/cdn-cgi/image/**', async (route) => {
    const url = route.request().url()
    const width = Number(/width=(\d+)/.exec(url)?.[1] ?? 400)
    const height = Number(/height=(\d+)/.exec(url)?.[1] ?? width * 1.25)
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#888"/></svg>`,
    })
  })
}

async function openProducts(page: Page, width: number) {
  await answerCardPictures(page)
  await page.setViewportSize({ width, height: 900 })
  await page.goto('/products')
  if ((await page.locator('.card-gallery__slide .product-card__img').count()) === 0) {
    if (process.env.CI) throw new Error('no card picture on /products, and CI seeds one')
    test.skip(true, 'no garment picture in this local database')
  }
}

/*
 * Since polish D3 a family card is a ticket and its picture box is the ticket's picture half, whatever
 * shape that is: square-ish sideways on a phone (390px), wide for the fifth ticket across a tablet
 * (900px), and in the row of five (1440px) the top of a closed ticket, or, opened, the tall left of it.
 */
test.describe('the home family tickets keep a margin around the garment (VA-55, D3)', () => {
  for (const width of [390, 900, 1440]) {
    test(`at ${width}px the pictures as served sit 6% or more from every edge of their box`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/')
      expectInset(
        await drawnMargins(page, '.family-card__img', '.family-card__media'),
        'family card',
      )
    })

    for (const shape of SHAPES) {
      test(`at ${width}px ${shape.name} sits 6% or more from every edge`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 })
        await page.goto('/')
        expectInset(
          await drawnMargins(page, '.family-card__img', '.family-card__media', shape),
          `family card, ${shape.name}`,
        )
      })
    }
  }

  // The tallest box there is: an opened ticket's picture at 1180px, the narrowest row (179 x 380).
  for (const shape of SHAPES) {
    test(`an opened ticket at 1180px: ${shape.name} sits 6% or more from every edge`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1180, height: 900 })
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page.goto('/')
      // The first: CI's one garment is a Sportswear one, so this ticket has a picture everywhere.
      const first = page.locator('.family-grid > .family-card').first()
      await first.hover()
      // Open: its picture is the full height of the ticket.
      await expect
        .poll(() =>
          first.evaluate((card) => {
            const media = card.querySelector('.family-card__media')?.getBoundingClientRect()
            return media ? Math.round(media.height) : 0
          }),
        )
        .toBeGreaterThan(360)
      expectInset(
        await drawnMargins(
          page,
          '.family-card:hover .family-card__img',
          '.family-card__media',
          shape,
        ),
        `an opened ticket, ${shape.name}`,
      )
    })
  }

  test('five family pictures, the Sports Accessories photo with the same margin', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    await expect(page.locator('.family-card__media')).toHaveCount(5)
    // The owner kept the accessories photo and gave it the same margin as the others. (Once a
    // garment of its own is published its card shows that instead, and there is no photo to check.)
    if ((await page.locator('.family-card__img[src*="sports-accessories"]').count()) === 0) {
      test.skip(
        true,
        'the Sports Accessories card shows a garment, not the photo, in this database',
      )
    }
    expectInset(
      await drawnMargins(
        page,
        '.family-card__img[src*="sports-accessories"]',
        '.family-card__media',
      ),
      'the accessories card',
    )
  })
})

test.describe('the product cards’ swipe gallery keeps a margin around the garment (VA-55)', () => {
  for (const width of [390, 1440]) {
    test(`at ${width}px /products: the pictures as served sit 6% or more from every edge`, async ({
      page,
    }) => {
      await openProducts(page, width)
      expectInset(
        await drawnMargins(
          page,
          '.card-gallery__slide .product-card__img',
          '.product-card__figure',
        ),
        'product card',
      )
    })

    for (const shape of SHAPES) {
      test(`at ${width}px /products: ${shape.name} sits 6% or more from every edge`, async ({
        page,
      }) => {
        await openProducts(page, width)
        expectInset(
          await drawnMargins(
            page,
            '.card-gallery__slide .product-card__img',
            '.product-card__figure',
            shape,
          ),
          `product card, ${shape.name}`,
        )
      })
    }
  }

  /*
   * Polish D3b: an opened ticket's strip gives up its foot to the rising name band, so its pictures
   * re-fit a box wider than 4:5 (1.29 on the narrowest card, at 560px). The STRIP is then the frame a
   * garment keeps its margin in; the figure behind it keeps its 4:5 size.
   */
  for (const width of [560, 1280]) {
    for (const shape of SHAPES) {
      test(`at ${width}px an opened ticket: ${shape.name} sits 6% or more from every edge`, async ({
        page,
      }) => {
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await openProducts(page, width)
        const first = page.locator('.product-grid > .product-card').first()
        await first.hover()
        await expect
          .poll(() =>
            first.evaluate((card) => {
              // Risen, and settled: under reduced motion each part runs its own short transition of
              // the rise (productTickets.spec.ts, `isOpen`), the strip's foot included.
              const style = getComputedStyle(card)
              return (
                style.getPropertyValue('--ticket-rise') ===
                  style.getPropertyValue('--ticket-rise-to') &&
                card.getAnimations({ subtree: true }).length === 0
              )
            }),
          )
          .toBe(true)
        expectInset(
          await drawnMargins(
            page,
            // The showing colour's slide (its roving tabindex): the neighbours an opened card has loaded
            // lie beside the strip, in its scroll row, not inside it.
            '.product-card:hover .card-gallery__slide[tabindex="0"] .product-card__img',
            '.card-gallery',
            shape,
          ),
          `opened ticket, ${shape.name}`,
        )
      })
    }
  }

  test('the box keeps its shape (4:5, square on a phone) and a slide is still the strip’s whole width', async ({
    page,
  }) => {
    for (const [width, ratio] of [
      [1440, 0.8],
      [390, 1],
    ] as const) {
      await openProducts(page, width)
      const measured = await page
        .locator('.product-card__figure')
        .first()
        .evaluate((figure) => {
          const box = figure.getBoundingClientRect()
          const strip = figure.querySelector('.card-gallery') as HTMLElement
          const slides = [...figure.querySelectorAll<HTMLElement>('.card-gallery__slide')]
          return {
            ratio: box.width / box.height,
            strip: strip.clientWidth,
            slides: slides.map((slide) => slide.getBoundingClientRect().width),
          }
        })
      expect(
        Math.abs(measured.ratio - ratio),
        `${width}px: the figure is ${measured.ratio}`,
      ).toBeLessThan(0.02)
      for (const slide of measured.slides) {
        expect(
          Math.abs(slide - measured.strip),
          `${width}px: a slide is not the strip's width`,
        ).toBeLessThanOrEqual(1)
      }
    }
  })
})

test.describe('the buyer page’s hero picture keeps the same margin (VA-55)', () => {
  for (const { path } of FAMILY_PAGES) {
    test(`${path}: where the hero has a picture`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 })
      await page.goto(path)
      if ((await page.locator('.family-hero__frame').count()) === 0) {
        test.skip(true, 'this family has no hero picture in this database')
      }
      expectInset(
        await drawnMargins(page, '.family-hero__frame .product-card__img', '.family-hero__frame'),
        'hero picture',
      )
      for (const shape of SHAPES) {
        expectInset(
          await drawnMargins(
            page,
            '.family-hero__frame .product-card__img',
            '.family-hero__frame',
            shape,
          ),
          `hero picture, ${shape.name}`,
        )
      }
    })
  }
})

test.describe('the margin does not reach the home page’s 3D section (VA-55)', () => {
  test('its picture still fills its frame, because a live model lies exactly over it', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/')
    const img = page.locator('.proof__frame .product-card__img')
    if ((await img.count()) === 0) test.skip(true, 'no garment poster for the 3D section here')
    const padding = await img.evaluate((el) => {
      const style = getComputedStyle(el)
      return [style.paddingTop, style.paddingRight, style.paddingBottom, style.paddingLeft]
    })
    expect(padding, 'the 3D section picture was given the card margin').toEqual([
      '0px',
      '0px',
      '0px',
      '0px',
    ])
  })
})
