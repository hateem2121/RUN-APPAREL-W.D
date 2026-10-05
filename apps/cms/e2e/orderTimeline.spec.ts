import AxeBuilder from '@axe-core/playwright'
import { FACTORY_PHOTOS, factoryPhotoWidths } from '../src/lib/factoryPhotos'
import { ORDER_PHASES } from '../src/lib/orderProcess'
import { expect, type Page, test } from './offlineMedia'
import { hintedWidth } from './sizesHint'

/**
 * Polish D4 (the owner's answers Q14 and Q41, 2026-10-03): "How an order works" is eight photo
 * cards that stack as the page scrolls, each step's own factory photo behind its words under the
 * photo hero's dark wash. The next card slides up and covers the one before, which sinks back and
 * darkens. The SAME eight cards, from the same list, are the order guide's "The eight steps", so
 * the steps have one set of names everywhere (X21: home, guide and buyer pages told the order three
 * ways). `src/orderTimelinePhotos.test.ts` holds the data and the markup; this holds what only a
 * browser can say.
 *
 * What would have to break for these to fail: a card with another step's words or photo, the guide
 * wording its steps its own way again, a card that does not stop or stops in the wrong place, a
 * covered card that does not sink (or one that sinks with nothing over it), motion for someone who
 * asked for none, words spilling out of a card, a line of text a buyer cannot read over a photo,
 * or a size hint that hands a sharp screen a file it must stretch.
 *
 * ⚠️ THE STACK IS MEASURED WITH MOTION ALLOWED, everything else under reduced motion, where the
 * cards are a plain list (the report's D4: "reduce motion shows the steps without movement").
 * A covered card is SCALED, and `getBoundingClientRect` includes that, so heights are read from
 * `offsetHeight`; the scale keeps its top edge (`transform-origin` at the top), so tops are true.
 */

const GUIDE = '/guides/how-a-private-label-order-works'
const STEPS = ORDER_PHASES.flatMap((phase) =>
  phase.steps.map((step) => ({ ...step, phase: phase.name })),
)
const photoOf = (slug: string) => FACTORY_PHOTOS.find((photo) => photo.slug === slug)

async function open(
  page: Page,
  width: number,
  height: number,
  { path = '/', motion = 'reduce' }: { path?: string; motion?: 'reduce' | 'no-preference' } = {},
) {
  await page.emulateMedia({ reducedMotion: motion })
  await page.setViewportSize({ width, height })
  await page.goto(path)
  // The control that the cards exist: an empty list would pass every check below.
  await expect(page.locator('.order-steps > .order-step')).toHaveCount(8)
}

/**
 * The stack's own numbers, read from the page: where the list starts, each card's stop, H and M.
 * ⚠️ READ ONCE THE SECTION HAS ARRIVED. Below the first screen the section is still moved down by
 * its entrance (`site-reveal`, a 24px transform), and a list top read there put every scroll in
 * this file 24px too far; `offsetTop` ignores the transform but is rounded to a whole pixel at each
 * of its steps, 1.45px out in all (both measured 2026-10-05). So: scroll to just above the list,
 * where the entrance is over, and read the exact rectangle there.
 */
async function stack(page: Page) {
  await page.locator('.order-steps').evaluate((list) => {
    let top = 0
    for (let node: HTMLElement | null = list as HTMLElement; node; ) {
      top += node.offsetTop
      node = node.offsetParent as HTMLElement | null
    }
    window.scrollTo({ top: top - 120, behavior: 'instant' })
  })
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
  return page.locator('.order-steps').evaluate((list) => {
    const cards = [...list.querySelectorAll<HTMLElement>(':scope > .order-step')]
    return {
      listTop: list.getBoundingClientRect().top + window.scrollY,
      gap: Number.parseFloat(getComputedStyle(list).rowGap),
      heights: cards.map((card) => card.offsetHeight),
      stops: cards.map((card) => Number.parseFloat(getComputedStyle(card).top)),
      positions: cards.map((card) => getComputedStyle(card).position),
    }
  })
}

type Stack = Awaited<ReturnType<typeof stack>>

/**
 * The scroll at which card `k` has stopped and the next is still `before` px short of touching it:
 * card k's place in the list is `k` cards of height H and gap M down from the list's top.
 */
const settledAt = (s: Stack, k: number, before: number) =>
  s.listTop + k * ((s.heights[0] ?? 0) + s.gap) - (s.stops[k] ?? 0) + (s.gap - before)

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  // A scroll timeline follows on the next frame; two frames make sure the styles caught up.
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

const tops = (page: Page) =>
  page
    .locator('.order-steps > .order-step')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top))

const spread = (values: number[]) => Math.max(...values) - Math.min(...values)

test.describe('D4 — the home page’s eight steps, as cards, everywhere (Q14, Q41, X21)', () => {
  for (const path of ['/', GUIDE]) {
    test(`${path}: eight cards carry the home page’s eight steps, word for word, and no photo label`, async ({
      page,
    }) => {
      await open(page, 1440, 900, { path })
      const cards = await page.locator('.order-steps > .order-step').evaluateAll((all) =>
        all.map((card) => ({
          number: card.querySelector('.order-step__number')?.textContent ?? '',
          numberHidden: card.querySelector('.order-step__number')?.getAttribute('aria-hidden'),
          phase: card.querySelector('.order-step__phase')?.textContent ?? '',
          actor: card.querySelector('.order-step__actor')?.textContent ?? '',
          title: card.querySelector('h3.order-step__title')?.textContent ?? '',
          body: card.querySelector('.order-step__body')?.textContent ?? '',
          // No label naming the room (the owner, 2026-10-05): the photo's alt describes it.
          labels: card.querySelectorAll('.order-step__room, figcaption').length,
        })),
      )
      expect(cards).toEqual(
        STEPS.map((step, index) => ({
          number: String(index + 1).padStart(2, '0'),
          numberHidden: 'true',
          phase: step.phase,
          actor: step.actor,
          title: step.title,
          body: step.body,
          labels: 0,
        })),
      )
      // An ordered list, so a screen reader counts the eight and says where each one is.
      await expect(page.locator('ol.order-steps')).toHaveCount(1)
    })
  }

  test('the guide no longer words the steps its own way', async ({ page }) => {
    await open(page, 1440, 900, { path: GUIDE })
    // The guide's own names until polish D4 (2026-10-05): "1. You send what you have" and so on.
    for (const old of [/You send what you have/, /We send your quote/, /We make your sample/]) {
      await expect(page.locator('main')).not.toContainText(old)
    }
    await expect(page.getByRole('heading', { level: 2, name: 'The eight steps' })).toHaveCount(1)
  })

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width}px every card is its step’s photo, cut by cover at its focus, with a size hint that fits`, async ({
      page,
    }) => {
      await open(page, width, height)
      const images = await page.locator('.order-step__photo').evaluateAll((all) =>
        all.map((element) => {
          const img = element as HTMLImageElement
          const style = getComputedStyle(img)
          return {
            src: img.getAttribute('src') ?? '',
            alt: img.getAttribute('alt') ?? '',
            loading: img.getAttribute('loading'),
            width: Number(img.getAttribute('width')),
            height: Number(img.getAttribute('height')),
            srcset: img.getAttribute('srcset') ?? '',
            sizes: img.getAttribute('sizes') ?? '',
            fit: style.objectFit,
            position: style.objectPosition,
            drawn: img.getBoundingClientRect().width,
            card: (img.closest('.order-step') as HTMLElement).getBoundingClientRect().width,
          }
        }),
      )
      expect(images).toHaveLength(8)
      for (const [index, image] of images.entries()) {
        const step = STEPS[index]
        const photo = photoOf(step?.photo ?? '')
        const label = `step ${index + 1} (${step?.title})`
        expect(image.src, label).toMatch(new RegExp(`^/factory/${photo?.slug}-\\d+\\.webp$`))
        expect(image.alt, `${label}: not the photo's own alt text`).toBe(photo?.alt)
        expect(image.loading, `${label}: not lazy (nothing in №04 is on the first screen)`).toBe(
          'lazy',
        )
        expect(image.width * image.height, `${label}: no size reserved`).toBeGreaterThan(0)
        expect(image.srcset, `${label}: the two widths are not offered`).toMatch(/\d+w, .*\d+w/)
        expect(image.fit, `${label}: the picture is squeezed, not cut`).toBe('cover')
        expect(image.position, `${label}: not aimed at the photo's own focus`).toBe(
          `${photo?.focus?.[0]}% ${photo?.focus?.[1]}%`,
        )
        expect(
          Math.abs(image.drawn - image.card),
          `${label}: the photo does not fill its card`,
        ).toBeLessThanOrEqual(1)
        const hint = await hintedWidth(page, image.sizes)
        expect(
          hint,
          `${label}: the hint (${hint}px) is narrower than the card (${image.drawn}px)`,
        ).toBeGreaterThanOrEqual(image.drawn - 1)
        expect(
          hint,
          `${label}: the hint (${hint}px) is far wider than the card (${image.drawn}px)`,
        ).toBeLessThanOrEqual(image.drawn * 1.1 + 1)
      }
    })
  }
})

test.describe('D4 — the layout', () => {
  test('from 900px the heading stays beside the cards while they pass, and the cards take the right half', async ({
    page,
  }) => {
    await open(page, 1440, 900, { motion: 'no-preference' })
    const head = page.locator('.order-layout__head')
    const box = async (selector: string) =>
      page
        .locator(selector)
        .first()
        .evaluate((element) => {
          const { left, right, top, width } = element.getBoundingClientRect()
          return { left, right, top, width }
        })
    const words = await box('.order-layout__head')
    const cards = await box('.order-steps')
    expect(cards.left - words.right, 'the cards are not beside the heading').toBeGreaterThanOrEqual(
      63,
    )
    expect(Math.abs(cards.width - words.width), 'the two halves differ').toBeLessThanOrEqual(1)
    const stop = await head.evaluate((element) => Number.parseFloat(getComputedStyle(element).top))
    const s = await stack(page)
    for (const k of [3, 6]) {
      await scrollTo(page, settledAt(s, k, s.gap / 2))
      expect(
        Math.abs((await box('.order-layout__head')).top - stop),
        `the heading left the screen while card ${k + 1} passed`,
      ).toBeLessThanOrEqual(1)
    }
  })

  test('on the guide, "The eight steps" stays beside its cards while they pass', async ({
    page,
  }) => {
    await open(page, 1440, 900, { path: GUIDE, motion: 'no-preference' })
    const heading = page.getByRole('heading', { level: 2, name: 'The eight steps' })
    const stop = await heading.evaluate((element) =>
      Number.parseFloat(getComputedStyle(element).top),
    )
    expect(stop, 'the heading does not stop anywhere').toBeGreaterThan(0)
    const s = await stack(page)
    await scrollTo(page, settledAt(s, 5, s.gap / 2))
    const top = await heading.evaluate((element) => element.getBoundingClientRect().top)
    expect(Math.abs(top - stop), 'the heading scrolled away from its cards').toBeLessThanOrEqual(1)
  })

  for (const width of [320, 390, 768]) {
    test(`at ${width}px the heading comes first and the cards take the column’s full width`, async ({
      page,
    }) => {
      await open(page, width, 844)
      const measured = await page.evaluate(() => {
        const box = (selector: string) => {
          const element = document.querySelector(selector) as HTMLElement
          return element.getBoundingClientRect()
        }
        const container = document.querySelector('.order-layout') as HTMLElement
        const style = getComputedStyle(container)
        return {
          head: box('.order-layout__head').bottom,
          list: box('.order-steps').top,
          listWidth: box('.order-steps').width,
          column:
            container.clientWidth -
            Number.parseFloat(style.paddingLeft) -
            Number.parseFloat(style.paddingRight),
          headPosition: getComputedStyle(document.querySelector('.order-layout__head') as Element)
            .position,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      expect(measured.list, 'the cards start before the heading ends').toBeGreaterThanOrEqual(
        measured.head,
      )
      expect(Math.abs(measured.listWidth - measured.column)).toBeLessThanOrEqual(1)
      expect(measured.headPosition, 'the heading sticks on a phone').not.toBe('sticky')
      expect(measured.sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }
})

test.describe('D4 — the cards stack as the page scrolls', () => {
  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`at ${width}px each card stops 8px below the one before, and the next one slides over it`, async ({
      page,
    }) => {
      await open(page, width, height, { motion: 'no-preference' })
      const s = await stack(page)
      expect(s.positions.every((position) => position === 'sticky')).toBe(true)
      const height0 = s.heights[0] ?? 0
      expect(spread(s.heights), 'the cards are not one height').toBeLessThanOrEqual(1)
      for (let k = 1; k < 8; k++) {
        expect((s.stops[k] ?? 0) - (s.stops[k - 1] ?? 0), `card ${k + 1}'s stop`).toBeCloseTo(8, 1)
      }
      for (let k = 0; k < 8; k++) {
        await scrollTo(page, settledAt(s, k, s.gap / 2))
        const now = await tops(page)
        for (let j = 0; j <= k; j++) {
          expect(
            Math.abs((now[j] ?? 0) - (s.stops[j] ?? 0)),
            `with card ${k + 1} stopped, card ${j + 1} is not at its stop`,
          ).toBeLessThanOrEqual(1)
        }
        if (k < 7) {
          // The next card is half a gap short of the one it is about to cover.
          expect(
            Math.abs((now[k + 1] ?? 0) - ((s.stops[k] ?? 0) + height0 + s.gap / 2)),
            `card ${k + 2} is not arriving under card ${k + 1}`,
          ).toBeLessThanOrEqual(1)
        }
      }
    })
  }

  test('the covered card sinks and darkens as the next one slides over it', async ({
    page,
    browserName,
  }) => {
    await open(page, 1440, 900, { motion: 'no-preference' })
    const supported = await page.evaluate(
      () => CSS.supports('animation-timeline: view()') && CSS.supports('animation-range: 0% 100%'),
    )
    test.skip(!supported, `${browserName} has no scroll timelines: its cards stack without sinking`)
    const s = await stack(page)
    const height0 = s.heights[0] ?? 0
    const read = (k: number) =>
      page
        .locator('.order-steps > .order-step')
        .nth(k)
        .evaluate((card) => {
          const scale = getComputedStyle(card).scale
          return {
            scale: scale === 'none' ? 1 : Number.parseFloat(scale),
            dim: Number(getComputedStyle(card, '::after').opacity),
          }
        })
    const k = 2
    // Before the next card touches it: untouched.
    await scrollTo(page, settledAt(s, k, s.gap / 2))
    await expect.poll(() => read(k)).toEqual({ scale: 1, dim: 0 })
    // Half covered: half sunk, half dark.
    await scrollTo(page, settledAt(s, k, 0) + (height0 - 8) / 2)
    const half = await read(k)
    expect(half.scale).toBeCloseTo(0.97, 2)
    expect(half.dim).toBeCloseTo(0.275, 1)
    // Covered, the next card stopped 8px below its top: fully sunk and dark.
    await scrollTo(page, settledAt(s, k + 1, s.gap / 2))
    const covered = await read(k)
    expect(covered.scale).toBeCloseTo(0.94, 2)
    expect(covered.dim).toBeCloseTo(0.55, 2)
    // The last card has nothing over it, so it never sinks.
    await scrollTo(page, settledAt(s, 7, s.gap / 2))
    expect(await read(7)).toEqual({ scale: 1, dim: 0 })
  })

  test('a browser without scroll timelines stacks the cards with nothing half-drawn', async ({
    page,
    browserName,
  }) => {
    await open(page, 1440, 900, { motion: 'no-preference' })
    const supported = await page.evaluate(
      () => CSS.supports('animation-timeline: view()') && CSS.supports('animation-range: 0% 100%'),
    )
    test.skip(supported, `${browserName} draws scroll timelines: the test above covers it`)
    const s = await stack(page)
    await scrollTo(page, settledAt(s, 3, s.gap / 2))
    const covered = await page
      .locator('.order-steps > .order-step')
      .nth(2)
      .evaluate((card) => ({
        scale: getComputedStyle(card).scale,
        dim: getComputedStyle(card, '::after').opacity,
      }))
    expect(covered).toEqual({ scale: 'none', dim: '0' })
  })

  // A stopped card whose foot is below the screen would hide its words for good: the next card
  // covers it from the foot up. A phone held sideways is the case (site.css, "only on a screen tall
  // enough to hold it").
  test('on a screen too short to hold a stopped card, the cards are a plain list', async ({
    page,
  }) => {
    await open(page, 844, 390, { motion: 'no-preference' })
    const s = await stack(page)
    expect(s.positions.some((position) => position === 'sticky')).toBe(false)
    const running = await page
      .locator('.order-steps')
      .evaluate((list) => list.getAnimations({ subtree: true }).length)
    expect(running, 'something in the list animates').toBe(0)
  })

  test('under reduced motion the cards are a plain list: none stops, none sinks', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const s = await stack(page)
    expect(s.positions.some((position) => position === 'sticky')).toBe(false)
    const before = await tops(page)
    await scrollTo(page, settledAt(s, 4, 0))
    const after = await tops(page)
    const moved = after.map((top, index) => (before[index] ?? 0) - top)
    expect(spread(moved), 'a card moved against the page').toBeLessThanOrEqual(1)
    const running = await page
      .locator('.order-steps')
      .evaluate((list) => list.getAnimations({ subtree: true }).length)
    expect(running, 'something in the list animates').toBe(0)
    for (let k = 1; k < 8; k++) {
      expect((after[k] ?? 0) - (after[k - 1] ?? 0)).toBeCloseTo((s.heights[0] ?? 0) + s.gap, 0)
    }
  })
})

test.describe('D4 — every card holds its words, and they read over the photos', () => {
  const PARTS = [
    '.order-step__number',
    '.order-step__tag',
    '.order-step__title',
    '.order-step__body',
  ]

  for (const width of [320, 360, 390, 560, 768, 900, 1024, 1280, 1440, 1920]) {
    test(`at ${width}px every card holds its words, with the photo between them, all one height`, async ({
      page,
    }) => {
      await open(page, width, 900)
      const cards = await page.locator('.order-steps > .order-step').evaluateAll(
        (all, parts) =>
          all.map((card) => {
            const outer = card.getBoundingClientRect()
            const boxes = parts.map((selector) => {
              const element = card.querySelector(selector)
              if (!element) return { selector, missing: true, top: 0, bottom: 0, left: 0, right: 0 }
              const { top, bottom, left, right } = element.getBoundingClientRect()
              return { selector, missing: false, top, bottom, left, right }
            })
            return {
              title: card.querySelector('.order-step__title')?.textContent ?? '',
              outer: { top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right },
              height: (card as HTMLElement).offsetHeight,
              boxes,
            }
          }),
        PARTS,
      )
      expect(
        spread(cards.map((card) => card.height)),
        'the cards are not one height',
      ).toBeLessThanOrEqual(1)
      for (const card of cards) {
        for (const part of card.boxes) {
          const label = `${card.title}: ${part.selector}`
          expect(part.missing, `${label} is missing`).toBe(false)
          expect(part.top, `${label} starts above the card`).toBeGreaterThanOrEqual(
            card.outer.top + 8,
          )
          expect(part.bottom, `${label} runs out of the card`).toBeLessThanOrEqual(
            card.outer.bottom - 8,
          )
          expect(part.left, `${label} starts left of the card`).toBeGreaterThanOrEqual(
            card.outer.left + 8,
          )
          expect(part.right, `${label} runs out of the card`).toBeLessThanOrEqual(
            card.outer.right - 8,
          )
        }
        // The number and the stage on top, the words at the foot, the photo showing between.
        const [number, tag, title] = card.boxes
        const topRow = Math.max(number?.bottom ?? 0, tag?.bottom ?? 0)
        expect(
          (title?.top ?? 0) - topRow,
          `${card.title}: no room left for the photo between the top row and the words`,
        ).toBeGreaterThanOrEqual(16)
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ),
        'the page scrolls sideways',
      ).toBeLessThanOrEqual(0)
    })
  }

  for (const width of [390, 1440]) {
    test(`at 200% text and ${width}px nothing in a card is cut off`, async ({
      page,
      context,
      browserName,
    }) => {
      test.skip(browserName !== 'chromium', 'Page.setFontSizes is a CDP command')
      const cdp = await context.newCDPSession(page)
      await cdp.send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 32 } })
      await open(page, width, 900)
      const root = await page.evaluate(() => getComputedStyle(document.documentElement).fontSize)
      expect(root, 'the text size never moved to 200%').toBe('32px')
      const cut = await page.locator('.order-steps > .order-step').evaluateAll(
        (all, parts) =>
          all.flatMap((card) => {
            const outer = card.getBoundingClientRect()
            return parts.flatMap((selector) => {
              const element = card.querySelector(selector)
              if (!element) return [`${selector} missing`]
              const box = element.getBoundingClientRect()
              return box.bottom > outer.bottom || box.right > outer.right || box.left < outer.left
                ? [`${card.querySelector('.order-step__title')?.textContent}: ${selector}`]
                : []
            })
          }),
        PARTS,
      )
      expect(cut).toEqual([])
    })
  }

  /**
   * The lightest pixels behind an element (90th percentile), with every word of the cards hidden.
   * The words' CHILDREN are hidden, not the words' box: the wash is that box's own background.
   */
  async function behind(page: Page, selector: string, index: number) {
    const element = page.locator('.order-steps > .order-step').nth(index).locator(selector)
    await element.scrollIntoViewIfNeeded()
    const box = await element.boundingBox()
    if (!box) throw new Error(`${selector} has no box`)
    const hide = await page.addStyleTag({
      content:
        '.order-step__words > * { visibility: hidden !important; transition: none !important; }',
    })
    await expect
      .poll(() => element.evaluate((node) => getComputedStyle(node).visibility))
      .toBe('hidden')
    const png = (await page.screenshot({ clip: box })).toString('base64')
    await hide.evaluate((style) => style.remove())
    return page.evaluate(async (data) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.createElement('canvas')
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const context = canvas.getContext('2d') as CanvasRenderingContext2D
      context.drawImage(image, 0, 0)
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data
      const linear = (value: number) => {
        const c = value / 255
        return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
      }
      const luminance: number[] = []
      for (let i = 0; i < pixels.length; i += 4) {
        luminance.push(
          0.2126 * linear(pixels[i] ?? 0) +
            0.7152 * linear(pixels[i + 1] ?? 0) +
            0.0722 * linear(pixels[i + 2] ?? 0),
        )
      }
      luminance.sort((a, b) => a - b)
      return luminance[Math.floor(luminance.length * 0.9)] ?? 1
    }, png)
  }

  const textLuminance = (page: Page, selector: string, index: number) =>
    page
      .locator('.order-steps > .order-step')
      .nth(index)
      .locator(selector)
      .evaluate((element) => {
        const [r, g, b] = (getComputedStyle(element).color.match(/[\d.]+/g) ?? []).map(Number)
        const linear = (value = 0) => {
          const c = value / 255
          return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
        }
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
      })

  const ratio = (light: number, dark: number) => (light + 0.05) / (dark + 0.05)

  /** Each line a buyer reads, with the floor it must keep: the big number is large text (3:1). */
  const LINES = [
    ['.order-step__phase', 4.5],
    ['.order-step__actor', 4.5],
    ['.order-step__title', 4.5],
    ['.order-step__body', 4.5],
    ['.order-step__number', 3],
  ] as const

  async function worstLine(page: Page, cards: readonly number[]) {
    const found: string[] = []
    let worst = Number.POSITIVE_INFINITY
    for (const index of cards) {
      // The photos are lazy: bring the card in, and let its picture arrive before measuring on it.
      const card = page.locator('.order-steps > .order-step').nth(index)
      await card.scrollIntoViewIfNeeded()
      await card
        .locator('img')
        .evaluate((img: HTMLImageElement) =>
          Promise.race([
            img.decode().catch(() => undefined),
            new Promise((done) => setTimeout(done, 5000)),
          ]),
        )
      for (const [selector, floor] of LINES) {
        const contrast = ratio(
          await textLuminance(page, selector, index),
          await behind(page, selector, index),
        )
        worst = Math.min(worst, contrast / floor)
        if (contrast < floor) found.push(`card ${index + 1} ${selector}: ${contrast.toFixed(2)}:1`)
      }
    }
    return { found, worst }
  }

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`at ${width}px every line over every photo keeps its contrast, measured from the pixels behind it`, async ({
      page,
    }) => {
      // Eight cards, each line's pixels read from a screenshot: measured alone in CI's image
      // (2026-10-05) 6-7 s in Chromium and Firefox but 10.8 s (390px) and 14.6 s (1440px) in WebKit,
      // which ran out of the 30 s default in CI's parallel run on PR #128, twice. Its own limit.
      test.setTimeout(90_000)
      await open(page, width, height)
      const { found } = await worstLine(page, [0, 1, 2, 3, 4, 5, 6, 7])
      expect(found).toEqual([])
    })
  }

  test('over a white photo, the worst any photo could be, the wash alone keeps every line readable', async ({
    page,
  }) => {
    await open(page, 390, 844)
    await page.addStyleTag({
      content:
        '.order-step__photo { visibility: hidden !important } .order-step { background: #fff !important }',
    })
    const { found } = await worstLine(page, [0])
    expect(found).toEqual([])
  })

  test('the probe fails when the wash is taken away (negative control)', async ({ page }) => {
    await open(page, 390, 844)
    await page.addStyleTag({
      content:
        '.order-step__photo { visibility: hidden !important } .order-step { background: #fff !important } .order-step__words { background: none !important }',
    })
    const { found } = await worstLine(page, [0])
    expect(found.length, 'with no wash over white, every line still read').toBeGreaterThan(0)
  })

  for (const scheme of ['light', 'dark'] as const) {
    for (const path of ['/', GUIDE]) {
      test(`${scheme} ${path}: axe finds no naming, list or contrast fault in the steps`, async ({
        page,
      }) => {
        await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' })
        await open(page, 1440, 900, { path })
        const results = await new AxeBuilder({ page })
          .include('.order-steps')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze()
        expect(
          results.violations.map(
            (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
          ),
        ).toEqual([])
      })
    }
  }
})

test.describe('VA-34 — the "Inside the factory" strip is gone, and no photo is drawn twice', () => {
  test('there is no such heading, grid or lightbox, and "Talk to us" is №06', async ({ page }) => {
    await open(page, 1440, 900)
    await expect(page.getByRole('heading', { name: /inside the factory/i })).toHaveCount(0)
    await expect(page.locator('.factory-grid, .factory-tile, .lightbox')).toHaveCount(0)
    const labels = await page.locator('.section-number').allTextContents()
    expect(labels.join('\n')).not.toMatch(/inside the factory/i)
    expect(labels.at(-1)).toBe('№06 — Talk to us')
  })

  test('each factory photo is on the home page once: №01 draws two, №04 draws eight', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    const slugs = await page.locator('main img').evaluateAll((all) =>
      all
        .map((img) => img.getAttribute('src') ?? '')
        // The hero's own crops (`hero-wide-…`) are a different picture on purpose.
        .filter((src) => src.startsWith('/factory/') && !src.startsWith('/factory/hero-'))
        .map((src) => src.replace(/^\/factory\/(.+)-\d+\.webp$/, '$1')),
    )
    expect(slugs.sort(), 'a factory photo is missing, or drawn twice').toEqual(
      FACTORY_PHOTOS.map((photo) => photo.slug).sort(),
    )
  })
})

/*
 * Polish X16 (2026-10-05): on a 2x screen at 1,920px a step card is 704px wide and asks for 1,408px,
 * where the files stopped at 1,200 (wide) and 800 (tall). `src/factoryPhotos.test.ts` works out
 * which file each screen takes from the engines' own selection rule; this asks the engines. Each card
 * is scrolled to so its lazy picture starts, and `currentSrc` names the file chosen. Tagging and
 * packing stop at 1,200 because their originals do. The same page on a 1x screen is the control:
 * if density were not what picks the file, both would come back the same.
 */
for (const [density, label] of [
  [2, 'the widest file each photo has'],
  [1, 'the file that covers 704px'],
] as const) {
  test.describe(`X16 — step photos at 1920px on a ${density}x screen`, () => {
    test.use({ deviceScaleFactor: density })

    test(`each card takes ${label}`, async ({ page }) => {
      await open(page, 1920, 1080)
      const photos = page.locator('.order-step__photo')
      for (let index = 0; index < STEPS.length; index++) {
        const photo = photos.nth(index)
        await photo.scrollIntoViewIfNeeded()
        await expect
          .poll(() => photo.evaluate((img) => (img as HTMLImageElement).currentSrc))
          .toMatch(/\/factory\/.+-\d+\.webp$/)
      }
      const chosen = await photos.evaluateAll((all) =>
        all.map((img) =>
          (img as HTMLImageElement).currentSrc.replace(/^.*\/factory\/(.+)-(\d+)\.webp$/, '$1 $2'),
        ),
      )
      expect(chosen).toEqual(
        STEPS.map((step) => {
          const photo = photoOf(step.photo)
          const widths = photo ? factoryPhotoWidths(photo) : []
          // 1x: the smallest file at least 704px wide. 2x: 1,408px is past every file but the widest.
          const file =
            density === 1 ? widths.find((width) => width >= 704) : widths[widths.length - 1]
          return `${step.photo} ${file}`
        }),
      )
    })
  })
}
