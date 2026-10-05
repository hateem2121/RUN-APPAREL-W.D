import AxeBuilder from '@axe-core/playwright'
import { expect, type Locator, type Page, test } from './offlineMedia'

/**
 * Polish D3b, X9, M1 and F1: the product cards are tickets (the owner's words: "the same shape for
 * every product card on computers. Phones get the sideways version all the time"; X9: "the front
 * shows picture + name + dots, and the rest appears when the card opens").
 *
 * Below 560px each card is a sideways ticket, one a row: the picture on the left, the name and the
 * dots on the right, notches where the halves meet. From 560px it is upright: the picture, a tear
 * line with a notch on each side, the name, the dots. A pointer resting on it, or the keyboard
 * reaching it, opens it: the name and its stub rise over the foot of the picture, the code, the
 * description and the way in arrive in the room they leave, and the card keeps its height.
 *
 * ⚠️ THE CARDS ARE COPIED IN THE BROWSER, as `productsGrid.spec.ts` does: CI's seed holds one garment.
 * The copies are measured and hovered (both CSS), never clicked; the dots need the first card's script.
 *
 * What would have to break for these to fail: a phone given anything but one sideways ticket a row,
 * or a phone card that opens; a closed card showing its code, description or caption, or an opened
 * one cutting them off; a card that does not open for a resting pointer or the keyboard, opens for a
 * pointer passing by, closes under the pointer that moves onto it, or ignores Escape; a card that
 * grows or shrinks as it opens (the row below would jump); the notches or the tear line not where the
 * halves meet; a keyboard ring the card cuts off (measured in PIXELS, as the family tickets'); a touch
 * screen given a card that waits for a hover; or a contrast or naming fault in either theme.
 */

const tabKey = (browserName: string) => (browserName === 'webkit' ? 'Alt+Tab' : 'Tab')

const cards = (page: Page) => page.locator('.product-grid > .product-card')

/** The first card, copied until the grid holds `count`. */
async function fill(page: Page, count: number) {
  await page.evaluate((target) => {
    const grid = document.querySelector('.product-grid')
    const first = grid?.querySelector('.product-card')
    if (!grid || !first) throw new Error('no card to copy')
    while (grid.children.length > 1) grid.lastElementChild?.remove()
    while (grid.children.length < target) grid.append(first.cloneNode(true))
  }, count)
}

/**
 * /products at `width`, the grid's top just under the bar, the pointer away from the cards. With
 * reduced motion unless `motion` is asked for: that setting zeroes every delay (base.css), the pause
 * before opening included, so a test of the pause runs with motion. Scrolled first because the
 * pixel reads need the cards on screen, and the products film sits above them.
 */
async function openProducts(page: Page, width: number, { motion = false, height = 900 } = {}) {
  await page.setViewportSize({ width, height })
  await page.emulateMedia({ reducedMotion: motion ? 'no-preference' : 'reduce' })
  await page.goto('/products')
  if ((await cards(page).count()) === 0) {
    if (process.env.CI) throw new Error('no card on /products, and CI seeds one')
    test.skip(true, 'no garment in this local database')
  }
  await page.evaluate(() => {
    const grid = document.querySelector('.product-grid') as HTMLElement
    window.scrollTo({
      top: grid.getBoundingClientRect().top + window.scrollY - 96,
      behavior: 'instant',
    })
  })
  // After React has taken over the cards (their picture links are its own): `goto` returns at
  // `load`, and a node planted before hydration can be dropped (viewerCue.spec.ts measured it).
  await page.waitForFunction(() => {
    const slide = document.querySelector('.product-grid .card-gallery__slide')
    return !!slide && Object.keys(slide).some((key) => key.startsWith('__reactProps'))
  })
  await page.mouse.move(2, 2)
}

/** How far the ticket has risen, in px: 0 closed, `--ticket-rise-to` open. */
const rise = (card: Locator) =>
  card.evaluate((element) =>
    Number.parseFloat(getComputedStyle(element).getPropertyValue('--ticket-rise')),
  )

/**
 * Open: risen all the way, every line of the opened part drawn in full, and the whole ticket SETTLED.
 *
 * ⚠️ UNDER REDUCED MOTION EACH PART OF A TICKET RUNS ITS OWN TRANSITION OF THE RISE IT INHERITS.
 * base.css gives every element a 0.01ms transition, and a part with no `transition` of its own
 * transitions `all`, the registered `--ticket-rise` included. Each finishes on the next frame, so for
 * a frame the card has risen and its name band and opening part have not, and on a loaded machine
 * that frame is long: WebKit read the band un-risen, with the card risen and nineteen transitions
 * running inside it, in 18 runs of 30 (2026-10-05). So nothing is read until none runs.
 */
const isOpen = (card: Locator) =>
  card.evaluate((element) => {
    // Settled means no animation that runs in TIME. Since MO4 (2026-10-05) each card also carries
    // a scroll-linked rise (`animation-timeline: view()`), which follows the scroll and never ends,
    // so with motion allowed a bare count never reached 0 (CI on PR #128, and the Mac).
    const timedAnimations = (root: Element) =>
      root
        .getAnimations({ subtree: true })
        .filter((animation) => animation.timeline === document.timeline).length
    const to = Number.parseFloat(getComputedStyle(element).getPropertyValue('--ticket-rise-to'))
    const now = Number.parseFloat(getComputedStyle(element).getPropertyValue('--ticket-rise'))
    const lines = [...element.querySelectorAll('.product-card__more > *')]
    return (
      to > 0 &&
      Math.abs(now - to) < 0.5 &&
      lines.every((line) => getComputedStyle(line).opacity === '1') &&
      timedAnimations(element) === 0
    )
  })

/** Nothing moving anywhere in the ticket (`isOpen` says why): for reads after a close or a focus. */
const settled = (card: Locator) =>
  card.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .every((animation) => animation.timeline !== document.timeline),
  )

type Box = {
  left: number
  top: number
  right: number
  bottom: number
  width: number
  height: number
}

/** Boxes of the card's parts, in the viewport. */
const parts = (card: Locator) =>
  card.evaluate((element) => {
    const box = (selector: string | null): Box | null => {
      const target = selector ? element.querySelector(selector) : element
      if (!target) return null
      const { left, top, right, bottom, width, height } = target.getBoundingClientRect()
      return { left, top, right, bottom, width, height }
    }
    return {
      card: box(null) as Box,
      figure: box('.product-card__figure'),
      strip: box('.card-gallery'),
      name: box('.product-card__name'),
      body: box('.product-card__body'),
      more: box('.product-card__more'),
      dots: box('.card-gallery__dots'),
      colour: box('.card-gallery__colour'),
    }
  })

/** One screen pixel, as base64 PNG bytes: only ever compared with another read the same way. */
const pixel = async (page: Page, x: number, y: number) =>
  (
    await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } })
  ).toString('base64')

test.describe('a phone: one sideways ticket a row (M1)', () => {
  for (const width of [320, 390, 430, 559]) {
    test(`at ${width}px: the picture left, at least square, the name and the dots right, the rest out of sight`, async ({
      page,
    }) => {
      await openProducts(page, width, { height: 844 })
      await fill(page, 4)
      const grid = await page
        .locator('.product-grid')
        .evaluate((el) => el.getBoundingClientRect().width)
      for (const card of await cards(page).all()) {
        const { card: box, figure, name, dots } = await parts(card)
        if (!figure || !name || !dots) throw new Error('a card lost a part')
        expect(Math.abs(box.width - grid), 'not one ticket a row').toBeLessThanOrEqual(1)
        // 44% of the ticket, a square or taller where the words need more room.
        expect(figure.width / box.width).toBeGreaterThan(0.42)
        expect(figure.width / box.width).toBeLessThan(0.46)
        expect(figure.height).toBeGreaterThanOrEqual(figure.width - 1)
        expect(figure.height, 'the picture leaves a gap under it').toBeGreaterThanOrEqual(
          box.height - 2.5,
        )
        expect(name.left, 'the name is not beside the picture').toBeGreaterThanOrEqual(
          figure.right - 1,
        )
        expect(dots.left, 'the dots are not beside the picture').toBeGreaterThanOrEqual(
          figure.right - 1,
        )
        expect(dots.top, 'the dots are not under the name').toBeGreaterThanOrEqual(name.bottom - 1)
        expect(dots.bottom, 'the dots run past the ticket').toBeLessThanOrEqual(box.bottom + 0.5)
      }
      const first = cards(page).first()
      // Out of sight, not out of reach: a screen reader still has every word (the visually-hidden
      // technique, not opacity, which scripts/contrast-rules.mjs would read as 1:1). The caption is
      // the opening part's: each picture link carries its own, hidden on every screen.
      for (const selector of [
        '.product-card__meta',
        '.product-card__more .viewer-cue',
        '.card-gallery__colour',
      ]) {
        const seen = await first.locator(selector).evaluate((el) => {
          const { width, height } = el.getBoundingClientRect()
          return {
            width,
            height,
            text: el.textContent?.trim() ?? '',
            opacity: getComputedStyle(el).opacity,
          }
        })
        expect(seen.width * seen.height, `${selector} is on show`).toBeLessThanOrEqual(1)
        expect(seen.text, `${selector} lost its words`).not.toBe('')
        expect(seen.opacity, `${selector} is hidden by opacity`).toBe('1')
      }
      await expect(first.locator('.product-card__link')).toHaveAccessibleName(/Opens the 3D viewer/)
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        'the page scrolls sideways',
      ).toBeLessThanOrEqual(0)
    })
  }

  test('at 390px a resting pointer and the keyboard leave the ticket as it is', async ({
    page,
    browserName,
  }) => {
    await openProducts(page, 390, { height: 844, motion: true })
    const first = cards(page).first()
    await first.hover()
    await page.waitForTimeout(400)
    expect(await rise(first)).toBe(0)
    await first.locator('.card-gallery__slide').first().focus()
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await page.keyboard.press(tabKey(browserName))
    await page.waitForTimeout(400)
    expect(await rise(first)).toBe(0)
  })
})

/*
 * The sideways tickets' notches, read in pixels: a phone's, and a tablet's odd last card lying across
 * both columns. The second caught a real fault by eye on 2026-10-05, not by a test: its rule set the
 * `mask` shorthand, which put `mask-composite` back to `add`, and two layers added together cover
 * each other's notch.
 */
test.describe('sideways tickets: the notches where the halves meet (M1, D3b)', () => {
  for (const [label, width, count, which] of [
    ['a phone’s ticket', 390, 2, 1],
    ['a tablet’s odd last ticket, across both columns', 700, 3, 2],
  ] as const) {
    test(`${label}, at ${width}px: the page’s ground shows at the seam, top and bottom`, async ({
      page,
    }) => {
      await openProducts(page, width, { height: 900 })
      await fill(page, count)
      const ticket = cards(page).nth(which)
      await ticket.scrollIntoViewIfNeeded()
      const { card, figure } = await parts(ticket)
      if (!figure) throw new Error('no picture')
      const seam = figure.right
      const ground = await pixel(page, card.left - 6, card.top + 20)
      expect(await pixel(page, seam, card.top + 2), 'no notch at the top').toBe(ground)
      expect(await pixel(page, seam, card.bottom - 3), 'no notch at the bottom').toBe(ground)
      // The control: a little further along the top edge is the ticket, not the ground.
      expect(await pixel(page, seam + 30, card.top + 2)).not.toBe(ground)
    })
  }
})

test.describe('from 560px: the upright ticket that opens (D3b, X9)', () => {
  for (const width of [560, 899, 900, 1280, 1440, 1920]) {
    test(`at ${width}px closed: the picture, the tear line at its foot, the name and the dots; nothing else`, async ({
      page,
    }) => {
      await openProducts(page, width)
      await fill(page, 6)
      const first = cards(page).first()
      const { card, figure, name, dots, more } = await parts(first)
      if (!figure || !name || !dots || !more) throw new Error('a card lost a part')
      // The card's own width, measured from the grid (`--card-w`): it places the tear line.
      const cardWidth = await first.evaluate((el) =>
        Number.parseFloat(getComputedStyle(el).getPropertyValue('--card-w')),
      )
      expect(
        Math.abs(cardWidth - card.width),
        `--card-w ${cardWidth} vs ${card.width}`,
      ).toBeLessThanOrEqual(0.5)
      expect(
        Math.abs(figure.width / figure.height - 0.8),
        'the picture is not 4:5',
      ).toBeLessThanOrEqual(0.01)
      expect(name.top).toBeGreaterThanOrEqual(figure.bottom - 0.5)
      expect(dots.top).toBeGreaterThanOrEqual(name.bottom - 0.5)
      expect(
        more.height,
        'a closed ticket shows its code, description or caption',
      ).toBeLessThanOrEqual(0.5)
      expect(
        await first.locator('.card-gallery__colour').evaluate((el) => getComputedStyle(el).opacity),
        'the colour’s name shows on a closed ticket',
      ).toBe('0')
      const tear = await first.evaluate((el) => {
        const line = getComputedStyle(el, '::after')
        return { top: Number.parseFloat(line.top), style: line.borderTopStyle }
      })
      expect(tear.style).toBe('dashed')
      // `top` is from the padding box, 1px inside the border.
      expect(
        Math.abs(card.top + 1 + tear.top - figure.bottom),
        'the tear line is not at the picture’s foot',
      ).toBeLessThanOrEqual(1)
    })
  }

  test('a resting pointer opens one after a pause, and the pointer moving onto it keeps it open', async ({
    page,
  }) => {
    await openProducts(page, 1280, { motion: true })
    await fill(page, 6)
    const second = cards(page).nth(1)
    await second.locator('.product-card__figure').hover({ position: { x: 30, y: 30 } })
    // The pause before opening, and none before closing: the family tickets' asymmetry.
    expect(await second.evaluate((el) => getComputedStyle(el).transitionDelay)).toContain('0.12s')
    await expect.poll(() => isOpen(second)).toBe(true)
    const { more } = await parts(second)
    if (!more) throw new Error('no opened part')
    await page.mouse.move(more.left + more.width / 2, more.top + more.height / 2, { steps: 6 })
    // Still risen the moment the pointer arrives, and still open once the arrows have faded (leaving
    // the picture fades them, so the ticket is not settled at once).
    expect(
      await second.evaluate((el) => getComputedStyle(el).getPropertyValue('--ticket-open')),
    ).toBe('1')
    expect(await rise(second)).toBeGreaterThan(115)
    await expect.poll(() => isOpen(second)).toBe(true)
    await page.mouse.move(2, 2)
    await expect.poll(() => rise(second)).toBe(0)
    expect(await second.evaluate((el) => getComputedStyle(el).transitionDelay)).not.toContain(
      '0.12s',
    )
  })

  test('opening moves nothing: the ticket keeps its height and the next row stays where it was', async ({
    page,
  }) => {
    await openProducts(page, 1280, { motion: true })
    await fill(page, 6)
    const first = cards(page).first()
    const below = cards(page).nth(3)
    const before = { card: (await parts(first)).card.height, below: (await parts(below)).card.top }
    await first.locator('.product-card__figure').hover({ position: { x: 30, y: 30 } })
    // Every frame of the opening, not just its end.
    const frames = await first.evaluate(
      (element, next) =>
        new Promise<number[][]>((done) => {
          const seen: number[][] = []
          const start = performance.now()
          const tick = () => {
            const row = document.querySelectorAll('.product-grid > .product-card')[next]
            seen.push([
              element.getBoundingClientRect().height,
              row?.getBoundingClientRect().top ?? 0,
            ])
            if (performance.now() - start < 700) requestAnimationFrame(tick)
            else done(seen)
          }
          requestAnimationFrame(tick)
        }),
      3,
    )
    await expect.poll(() => isOpen(first)).toBe(true)
    for (const [height, top] of frames) {
      expect(
        Math.abs((height ?? 0) - before.card),
        'the ticket changed height as it opened',
      ).toBeLessThanOrEqual(0.5)
      expect(Math.abs((top ?? 0) - before.below), 'the row below moved').toBeLessThanOrEqual(0.5)
    }
  })

  /*
   * The opened part's lines must fit the room the rise leaves, on the narrowest and widest cards
   * (246px at 560, 254 at 900, 275 at 1920, 310 at 1440, 379 at 1280, 420 at 899), with a
   * description longer than any live one: it stops at two lines, and nothing is cut.
   */
  for (const width of [560, 700, 899, 900, 1180, 1280, 1440, 1920]) {
    test(`at ${width}px opened: every line fits, the description in two lines at most`, async ({
      page,
    }) => {
      await openProducts(page, width)
      // CI's seeded garment has no short description, so the first card is given one, after the
      // code as ProductCardItem places it.
      await page.evaluate(() => {
        const meta = document.querySelector('.product-card__meta')
        if (!meta) throw new Error('no card code')
        let desc = document.querySelector('.product-card__desc')
        if (!desc) {
          desc = document.createElement('p')
          desc.className = 'product-card__desc'
          meta.after(desc)
        }
        desc.textContent =
          'A long description written to be longer than any garment on the live site, so the opened ' +
          'ticket is measured with the most words it could ever be given, which it must stop at two lines.'
      })
      const first = cards(page).first()
      // And the longest colour name in the owner's approved list (polish N1, second list,
      // 2026-10-05; the seed's are one short word): it must sit under the lines on the narrowest
      // card too.
      await first.evaluate((element) => {
        const colour = element.querySelector('.card-gallery__colour')
        if (colour) colour.textContent = 'Podium Lilac / Night Indigo'
      })
      await first.locator('.product-card__figure').hover({ position: { x: 30, y: 30 } })
      await expect.poll(() => isOpen(first)).toBe(true)
      const fit = await first.evaluate((element) => {
        const more = element.querySelector('.product-card__more') as HTMLElement
        const room = more.getBoundingClientRect()
        const colour = element.querySelector('.card-gallery__colour')?.getBoundingClientRect()
        const lines = [...more.children].map((line) => {
          const { top, bottom } = line.getBoundingClientRect()
          return {
            name: line.className,
            top,
            bottom,
            scroll: line.scrollHeight - line.clientHeight,
          }
        })
        const desc = element.querySelector('.product-card__desc') as HTMLElement
        const lineHeight = Number.parseFloat(getComputedStyle(desc).lineHeight)
        return {
          room: { top: room.top, bottom: room.bottom },
          colour: colour ? { top: colour.top, bottom: colour.bottom } : null,
          lines,
          descLines: desc.getBoundingClientRect().height / lineHeight,
        }
      })
      for (const line of fit.lines) {
        expect(line.top, `${line.name} starts above the room`).toBeGreaterThanOrEqual(
          fit.room.top - 0.5,
        )
        expect(line.bottom, `${line.name} is cut off: ${JSON.stringify(fit)}`).toBeLessThanOrEqual(
          fit.room.bottom + 0.5,
        )
        // The colour's name sits in the room's foot, under the lines, never over one.
        if (fit.colour)
          expect(line.bottom, `${line.name} runs into the colour’s name`).toBeLessThanOrEqual(
            fit.colour.top + 0.5,
          )
      }
      expect(fit.descLines, 'the description is not held to two lines').toBeLessThanOrEqual(2.05)
    })
  }

  test('the keyboard opens one at once; Escape closes it, and moving on lets it open again', async ({
    page,
    browserName,
  }) => {
    await openProducts(page, 1280, { motion: true })
    await fill(page, 6)
    const first = cards(page).first()
    const slide = first.locator('.card-gallery__slide').first()
    await slide.focus()
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await page.keyboard.press(tabKey(browserName))
    await expect(slide).toBeFocused()
    // No pause for the keyboard.
    expect(await first.evaluate((el) => getComputedStyle(el).transitionDelay)).not.toContain(
      '0.12s',
    )
    await expect.poll(() => isOpen(first)).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => rise(first)).toBe(0)
    await expect(slide).toBeFocused()
    // On to the card's own link: focus moved, so it opens again.
    await first.locator('.product-card__link').focus()
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await page.keyboard.press(tabKey(browserName))
    await expect.poll(() => isOpen(first)).toBe(true)
  })

  test('Escape closes one the pointer opened, until the pointer leaves it', async ({ page }) => {
    await openProducts(page, 1280)
    await fill(page, 6)
    const third = cards(page).nth(2)
    await third.hover()
    await expect.poll(() => isOpen(third)).toBe(true)
    await page.keyboard.press('Escape')
    await expect.poll(() => rise(third)).toBe(0)
    await page.mouse.move(2, 2)
    await third.hover()
    await expect.poll(() => isOpen(third)).toBe(true)
  })

  test('the notches show the page’s ground at the tear line, closed and opened', async ({
    page,
  }) => {
    await openProducts(page, 1280)
    await fill(page, 6)
    const second = cards(page).nth(1)
    const ground = async () => {
      const { card } = await parts(second)
      return pixel(page, card.left - 6, card.top + 40)
    }
    const at = async () => {
      const { card, body } = await parts(second)
      if (!body) throw new Error('no name band')
      // The tear line is the name band's top edge, closed and opened.
      return { left: card.left, right: card.right, y: body.top }
    }
    const closed = await at()
    const groundColour = await ground()
    expect(await pixel(page, closed.left + 2, closed.y), 'no notch on the left, closed').toBe(
      groundColour,
    )
    expect(await pixel(page, closed.right - 3, closed.y), 'no notch on the right, closed').toBe(
      groundColour,
    )
    expect(await pixel(page, closed.left + 2, closed.y + 30), 'the control: the ticket').not.toBe(
      groundColour,
    )
    await second.hover()
    await expect.poll(() => isOpen(second)).toBe(true)
    const opened = await at()
    expect(opened.y, 'the tear line did not rise').toBeLessThan(closed.y - 50)
    expect(await pixel(page, opened.left + 2, opened.y), 'no notch on the left, opened').toBe(
      groundColour,
    )
    expect(await pixel(page, opened.right - 3, opened.y), 'no notch on the right, opened').toBe(
      groundColour,
    )
  })
})

test.describe('the keyboard rings, drawn inside the ticket (F1)', () => {
  /*
   * In PIXELS, as the family tickets' are: the audit's first word on F1 checked the style, and the
   * ring was cut off by the card. Each ring is read where the card would cut it: 3px inside the
   * ticket's edge for the picture's and the name's, 3px under a dot for the dots'.
   */
  for (const [label, width] of [
    ['a phone, sideways', 390],
    ['opened, from 560px', 1280],
  ] as const) {
    test(`${label}: the picture’s ring and the name’s ring show inside the edge, only with focus`, async ({
      page,
      browserName,
    }) => {
      await openProducts(page, width, { height: 900 })
      const first = cards(page).first()
      const slide = first.locator('.card-gallery__slide').first()
      const link = first.locator('.product-card__link')
      // Arrives by the key (a script's `focus()` is not keyboard focus in every engine). The step
      // back can leave the grid for the chips above it and scroll the page, so the card is brought
      // back to the middle of the screen, focus untouched, before any pixel is read.
      const keyTo = async (target: Locator) => {
        await target.focus()
        await page.keyboard.press(`Shift+${tabKey(browserName)}`)
        await page.keyboard.press(tabKey(browserName))
        await expect(target).toBeFocused()
        await first.evaluate((card) =>
          card.scrollIntoView({ block: 'center', behavior: 'instant' }),
        )
      }
      // The picture's: 3px inside its left edge, halfway down what shows of it. Both reads land on
      // the picture's ground, which the garment never reaches (VA-55's margin), wherever the strip is.
      const pictureSpot = async () => {
        const { strip } = await parts(first)
        if (!strip) throw new Error('no picture')
        return { x: strip.left + 3, y: strip.top + strip.height / 2 }
      }
      const before = await pictureSpot()
      const bare = await pixel(page, before.x, before.y)
      await keyTo(slide)
      // Settled first, ring and all: under reduced motion a ring transitions in too (`isOpen` says why).
      await expect.poll(() => (width >= 560 ? isOpen(first) : settled(first))).toBe(true)
      const spot = await pictureSpot()
      expect(await pixel(page, spot.x, spot.y), 'no ring 3px inside the picture').not.toBe(bare)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
      await expect.poll(() => settled(first)).toBe(true)
      expect(await rise(first)).toBe(0)
      // The name's: drawn by the name band's `::after`, round the name and the opened part.
      const nameSpot = async () => {
        const { body } = await parts(first)
        if (!body) throw new Error('no name band')
        return { x: body.left + 3, y: body.top + body.height / 2 }
      }
      const unfocused = await nameSpot()
      const plain = await pixel(page, unfocused.x, unfocused.y)
      await keyTo(link)
      await expect.poll(() => (width >= 560 ? isOpen(first) : settled(first))).toBe(true)
      expect(
        await link.evaluate((el) => getComputedStyle(el).outlineStyle),
        'a second ring on the link',
      ).toBe('none')
      const focused = await nameSpot()
      expect(
        await pixel(page, focused.x, focused.y),
        'no ring 2-4px inside the name band',
      ).not.toBe(plain)
    })
  }

  test('a colour dot’s ring is not cut off at the foot of the ticket', async ({
    page,
    browserName,
  }) => {
    await openProducts(page, 1280)
    const first = cards(page).first()
    const dot = first.locator('.card-gallery__dot').nth(1)
    if ((await dot.count()) === 0) test.skip(true, 'no card with more than one colour here')
    const below = async () => {
      const box = await dot.boundingBox()
      if (!box) throw new Error('no dot')
      return { x: box.x + box.width / 2, y: box.y + box.height + 3 }
    }
    const spot = await below()
    const bare = await pixel(page, spot.x, spot.y)
    await dot.focus()
    await page.keyboard.press(`Shift+${tabKey(browserName)}`)
    await page.keyboard.press(tabKey(browserName))
    await expect(dot).toBeFocused()
    await expect.poll(() => isOpen(first)).toBe(true)
    const after = await below()
    expect(await pixel(page, after.x, after.y), 'the dot’s ring is cut off under it').not.toBe(bare)
  })
})

// Its own context: Firefox refuses a mobile one before a test could skip itself.
test('a touch screen as wide as a computer never opens a ticket', async ({
  browser,
  browserName,
  baseURL,
}) => {
  test.skip(browserName !== 'chromium', 'only Chromium emulates a touch screen this wide')
  const context = await browser.newContext({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 1366, height: 1024 },
  })
  try {
    const page = await context.newPage()
    await page.goto(`${baseURL}/products`)
    expect(
      await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches),
    ).toBe(false)
    const first = cards(page).first()
    // A finger on the card is a hover too, and a sticky one: it must open nothing. (A tap would
    // follow the card's link away from the page.)
    await first.hover()
    await page.waitForTimeout(400)
    expect(await rise(first)).toBe(0)
    expect(
      await first
        .locator('.product-card__more')
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeLessThanOrEqual(0.5)
  } finally {
    await context.close()
  }
})

test.describe('contrast and names, one ticket open, in both themes', () => {
  for (const scheme of ['light', 'dark'] as const) {
    test(`${scheme}: axe finds no fault in the grid`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await openProducts(page, 1280)
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
      await fill(page, 3)
      const second = cards(page).nth(1)
      await second.hover()
      await expect.poll(() => isOpen(second)).toBe(true)
      const results = await new AxeBuilder({ page })
        .include('.product-grid')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze()
      expect(
        results.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([])
    })
  }
})
