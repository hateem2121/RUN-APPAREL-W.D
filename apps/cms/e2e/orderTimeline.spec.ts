import AxeBuilder from '@axe-core/playwright'
import { FACTORY_PHOTOS, factoryPhotoWidths } from '../src/lib/factoryPhotos'
import { ORDER_PHASES } from '../src/lib/orderProcess'
import { expect, type Page, test } from './offlineMedia'
import { hintedWidth } from './sizesHint'

/**
 * D42 (owner, option A3, 2026-10-15; the guide's cards confirmed 2026-10-16): "How an order works"
 * is four full-screen stage cards, two steps to a card, each step's own factory photo behind its
 * words. As the page scrolls each card stops 8px under the one before and the next slides up over
 * it; nothing animates. The SAME cards, from the same list, are the order guide's "The eight steps",
 * so the steps have one set of names everywhere (X21: home, guide and buyer pages once told the
 * order three ways). `src/orderTimelinePhotos.test.ts` holds the data and the markup; this holds
 * what only a browser can say. Eight half-width cards, each one step, came before (polish D4).
 *
 * What would have to break for these to fail: a step with another step's words or photo, the guide
 * wording its steps its own way again, a card that does not stop or stops in the wrong place, a
 * stopped card taller than the screen (its foot, and its second step's words, hidden under the
 * next card for good), motion for someone who asked for none, words spilling out of their half, a
 * line of text a buyer cannot read over a photo, or a size hint that hands a sharp screen a file
 * it must stretch further than the owner accepted.
 *
 * ⚠️ THE STACK IS MEASURED WITH MOTION ALLOWED, everything else under reduced motion, where the
 * cards are a plain list (polish D4's rule, kept: "reduce motion shows the steps without movement").
 */

const GUIDE = '/guides/how-a-private-label-order-works'
const STEPS = ORDER_PHASES.flatMap((phase) =>
  phase.steps.map((step) => ({ ...step, phase: phase.name })),
)
const photoOf = (slug: string) => FACTORY_PHOTOS.find((photo) => photo.slug === slug)
const HALVES = '.order-stage__steps .order-step'

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
  await expect(page.locator('.order-stages > .order-stage')).toHaveCount(4)
  await expect(page.locator(HALVES)).toHaveCount(8)
}

/**
 * The stack's own numbers, read from the page: each card's place in the page, its stop and height,
 * the gap between cards, the screen's height and the bar's foot.
 * ⚠️ READ ONCE THE LIST HAS ARRIVED, just above it, where no card has stopped yet. An entrance
 * still running moves what it is on (`site-reveal`, a 24px transform), and a list top read there
 * once put every scroll in this file 24px too far (measured 2026-10-05).
 * ⚠️ AND ONCE `OrderStagesList` HAS WRITTEN THE HEIGHTS (`data-stage-fit`): before, a card taller
 * than the screen still stops under the bar.
 */
/**
 * The stack's cards at the screen's width: the four stage cards from 900px, and below it, where the
 * stage steps aside (owner, 2026-10-19: one step to a card on a phone), the eight steps. Read in
 * the page, from the same media query site.css uses.
 */
// On a phone the step's SLOT is what sticks and sinks; its card fills it (OrderSteps.tsx, 2026-10-20).
const CARDS_IN_PAGE = [
  '.order-stage__steps .order-step-slot',
  '.order-stages > .order-stage',
] as const

const cardsOf = (page: Page) =>
  page.evaluate(
    (source) =>
      [
        ...document.querySelectorAll<HTMLElement>(
          matchMedia('(max-width: 899px)').matches ? source[0] : source[1],
        ),
      ].length,
    CARDS_IN_PAGE,
  )

async function stack(page: Page) {
  await expect(page.locator('.order-stages[data-stage-fit]')).toHaveCount(1)
  await page.locator('.order-stages').evaluate((list) => {
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
  return page.locator('.order-stages').evaluate((list, source) => {
    const cards = [
      ...document.querySelectorAll<HTMLElement>(
        matchMedia('(max-width: 899px)').matches ? source[0] : source[1],
      ),
    ]
    return {
      screen: window.innerHeight,
      bar: document.querySelector('.notch')?.getBoundingClientRect().bottom ?? 0,
      gap: Number.parseFloat(getComputedStyle(list).rowGap),
      places: cards.map((card) => card.getBoundingClientRect().top + window.scrollY),
      heights: cards.map((card) => card.getBoundingClientRect().height),
      stops: cards.map((card) => Number.parseFloat(getComputedStyle(card).top)),
      positions: cards.map((card) => getComputedStyle(card).position),
    }
  }, CARDS_IN_PAGE)
}

type Stack = Awaited<ReturnType<typeof stack>>

/**
 * The scroll at which card `k` has stopped and the next card's edge is still `before` px short of
 * the screen's foot (which is card k's foot, once it has stopped): card k stops when its place
 * reaches its stop, and the next one is a gap below its foot.
 */
const settledAt = (s: Stack, k: number, before: number) =>
  (s.places[k] ?? 0) - (s.stops[k] ?? 0) + (s.gap - before)

async function scrollTo(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), y)
  await page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
  )
}

const tops = (page: Page) =>
  page
    .locator('.order-stages > .order-stage')
    .evaluateAll((cards) => cards.map((card) => card.getBoundingClientRect().top))

const spread = (values: number[]) => Math.max(...values) - Math.min(...values)

test.describe('D42 — the eight steps, as four stage cards, everywhere (A3, Q41, X21)', () => {
  for (const path of ['/', GUIDE]) {
    test(`${path}: four cards carry the eight steps, word for word, each stage named once`, async ({
      page,
    }) => {
      await open(page, 1440, 900, { path })
      const stages = await page.locator('.order-stages > .order-stage').evaluateAll((all) =>
        all.map((card) => ({
          name: card.querySelector('.order-stage__name')?.textContent ?? '',
          start: card.querySelector('ol.order-stage__steps')?.getAttribute('start'),
          steps: [...card.querySelectorAll('.order-stage__steps .order-step')].map((half) => ({
            number: half.querySelector('.order-step__number')?.textContent ?? '',
            numberHidden: half.querySelector('.order-step__number')?.getAttribute('aria-hidden'),
            actor: half.querySelector('.order-step__actor')?.textContent ?? '',
            title: half.querySelector('h3.order-step__title')?.textContent ?? '',
            body: half.querySelector('.order-step__body')?.textContent ?? '',
            detail: half.querySelector('.order-step__detail')?.textContent ?? '',
            // No label naming the room (the owner, 2026-10-05): the photo's alt describes it.
            labels: half.querySelectorAll('.order-step__room, figcaption').length,
          })),
        })),
      )
      let number = 0
      expect(stages).toEqual(
        ORDER_PHASES.map((phase, index) => ({
          name: `Stage ${index + 1} · ${phase.name}`,
          start: String(number + 1),
          steps: phase.steps.map((step) => {
            number += 1
            return {
              number: String(number).padStart(2, '0'),
              numberHidden: 'true',
              actor: step.actor,
              title: step.title,
              body: step.body,
              detail: step.detail,
              labels: 0,
            }
          }),
        })),
      )
      // Ordered lists, so a screen reader counts the stages and each stage's steps from where the
      // last one stopped.
      await expect(page.locator('ol.order-stages')).toHaveCount(1)
      await expect(page.locator('ol.order-stage__steps')).toHaveCount(4)
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

  // "Start with step 1" went with D42 (owner, 2026-10-16): the hero's button and the ask under №05
  // lead to the same form.
  test('the home page’s №04 ends on the cards, with no button of its own', async ({ page }) => {
    await open(page, 1440, 900)
    const section = page.locator('section', { has: page.locator('.order-stages') })
    await expect(section.locator('a')).toHaveCount(0)
    await expect(page.getByText('Start with step 1')).toHaveCount(0)
  })

  for (const [width, height] of [
    [390, 844],
    [768, 1024],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width}px every step is its photo, cut by cover at its focus, with a size hint that fits`, async ({
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
            half: (img.closest('.order-step') as HTMLElement).getBoundingClientRect().width,
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
        expect(image.srcset, `${label}: the widths are not offered`).toMatch(/\d+w, .*\d+w/)
        expect(image.fit, `${label}: the picture is squeezed, not cut`).toBe('cover')
        expect(image.position, `${label}: not aimed at the photo's own focus`).toBe(
          `${photo?.focus?.[0]}% ${photo?.focus?.[1]}%`,
        )
        expect(
          Math.abs(image.drawn - image.half),
          `${label}: the photo does not fill its half`,
        ).toBeLessThanOrEqual(1)
        const hint = await hintedWidth(page, image.sizes)
        expect(
          hint,
          `${label}: the hint (${hint}px) is narrower than the half (${image.drawn}px)`,
        ).toBeGreaterThanOrEqual(image.drawn - 1)
        // `vw` counts a scrollbar the half does not span: 15px at most here.
        expect(
          hint,
          `${label}: the hint (${hint}px) is far wider than the half (${image.drawn}px)`,
        ).toBeLessThanOrEqual(image.drawn * 1.1 + 1)
      }
    })
  }
})

test.describe('D42 — the layout', () => {
  for (const [path, width] of [
    ['/', 390],
    ['/', 768],
    ['/', 1440],
    ['/', 1920],
    [GUIDE, 1440],
  ] as const) {
    test(`${path} at ${width}px: the heading in the column, the cards the screen's width under it, words on the column's edge`, async ({
      page,
    }) => {
      await open(page, width, 900, { path })
      const measured = await page.evaluate(() => {
        const list = document.querySelector('.order-stages') as HTMLElement
        const heading = list.closest('section')?.querySelector('h2') as HTMLElement
        const first = document.querySelector('.order-stage__steps .order-step') as HTMLElement
        const words = first.querySelector('.order-step__title') as HTMLElement
        const name = document.querySelector('.order-stage__name') as HTMLElement
        return {
          headingBottom: heading.getBoundingClientRect().bottom,
          headingLeft: heading.getBoundingClientRect().left,
          listTop: list.getBoundingClientRect().top,
          listLeft: list.getBoundingClientRect().left,
          listWidth: list.getBoundingClientRect().width,
          screen: document.documentElement.clientWidth,
          titleLeft: words.getBoundingClientRect().left,
          nameLeft: name.getBoundingClientRect().left,
          sideways: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      expect(measured.listTop, 'the cards start before the heading ends').toBeGreaterThanOrEqual(
        measured.headingBottom,
      )
      expect(measured.listLeft, 'the cards do not start at the screen’s edge').toBeCloseTo(0, 0)
      expect(
        Math.abs(measured.listWidth - measured.screen),
        'the cards are not the screen’s width',
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(measured.titleLeft - measured.headingLeft),
        'the first step’s words leave the column’s edge',
      ).toBeLessThanOrEqual(1)
      expect(
        Math.abs(measured.nameLeft - measured.headingLeft),
        'the stage’s name leaves the column’s edge',
      ).toBeLessThanOrEqual(1)
      expect(measured.sideways, 'the page scrolls sideways').toBeLessThanOrEqual(0)
    })
  }

  for (const width of [900, 1024, 1440]) {
    test(`at ${width}px a card's two steps sit side by side, their titles on one line`, async ({
      page,
    }) => {
      await open(page, width, 900)
      const cards = await page.locator('.order-stages > .order-stage').evaluateAll((all) =>
        all.map((card) => {
          const [a, b] = [...card.querySelectorAll('.order-stage__steps .order-step')].map(
            (half) => {
              const box = half.getBoundingClientRect()
              const title = (
                half.querySelector('.order-step__title') as HTMLElement
              ).getBoundingClientRect()
              return {
                top: box.top,
                left: box.left,
                right: box.right,
                bottom: box.bottom,
                title: title.top,
              }
            },
          )
          return { a, b }
        }),
      )
      for (const [index, { a, b }] of cards.entries()) {
        const label = `stage ${index + 1}`
        expect(a && b, `${label}: not two steps`).toBeTruthy()
        if (!a || !b) continue
        expect(
          Math.abs(a.top - b.top),
          `${label}: the halves do not start level`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(a.right - b.left),
          `${label}: the halves are not side by side`,
        ).toBeLessThanOrEqual(1)
        expect(
          Math.abs(a.title - b.title),
          `${label}: the two titles are not level`,
        ).toBeLessThanOrEqual(1)
      }
    })
  }

  test('below 900px a card’s two steps stack, one above the other', async ({ page }) => {
    await open(page, 390, 844)
    const halves = await page.locator(HALVES).evaluateAll((all) =>
      all.map((half) => {
        const { top, bottom, left } = half.getBoundingClientRect()
        return { top, bottom, left }
      }),
    )
    for (let index = 0; index < halves.length; index += 2) {
      const [a, b] = [halves[index], halves[index + 1]]
      expect(
        b && a && b.top >= a.bottom - 1,
        `stage ${index / 2 + 1}: the second step is not under the first`,
      ).toBe(true)
      expect(
        Math.abs((a?.left ?? 0) - (b?.left ?? 1)),
        'the halves are not one column',
      ).toBeLessThanOrEqual(1)
    }
  })
})

test.describe('D42 — the cards stack as the page scrolls', () => {
  /*
   * ⚠️ EVERY SCREEN STACKS, AND A STOPPED CARD HOLDS ALL ITS WORDS ON THE SCREEN (home page audit,
   * 2026-10-17: the owner's "stack on all phones" and "scroll, then stop"). Until then the stack ran
   * only on a screen 800px tall or more, so no iPhone in Safari stacked while the robot's 390 × 844
   * phone did. 393 × 659 is Playwright's iPhone 15 in Safari, 320 × 568 the first iPhone SE, and
   * 844 × 390 a phone held sideways: on those the fullest card is taller than the screen.
   *
   * At each size, as each card stops: the cards before it are still at their stops; its foot is the
   * screen's foot; a card that fits stops right under the bar's foot (no pale strip) and 8px below
   * the one before; every line of its words is on the screen; and for the whole rest, a third of a
   * screen, the next card has not come up over it.
   */
  for (const [width, height] of [
    [320, 568],
    [360, 640],
    [375, 667],
    [393, 659],
    [390, 844],
    [412, 915],
    [844, 390],
    [768, 1024],
    [900, 640],
    [1024, 640],
    [1280, 720],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`at ${width}x${height} each card stops with its foot on the screen's, rests, and only then is covered`, async ({
      page,
    }) => {
      await open(page, width, height, { motion: 'no-preference' })
      const s = await stack(page)
      expect(s.positions.every((position) => position === 'sticky')).toBe(true)
      expect(s.gap, 'the rest is shorter than a third of the screen').toBeGreaterThanOrEqual(
        s.screen / 3 - 1,
      )
      const count = await cardsOf(page)
      expect(count, 'the stack has neither four stage cards nor eight step cards').toBe(
        width < 900 ? 8 : 4,
      )
      for (let k = 0; k < count; k++) {
        // A card that fits stops 8px below the one before, from the screen's top edge: the bar
        // floats over it (no pale page beside the bar, the owner's rule, 2026-10-17).
        const fits = (s.heights[k] ?? 0) <= s.screen - 8 * k + 1
        if (fits) {
          expect(
            Math.abs((s.stops[k] ?? 0) - 8 * k),
            `card ${k + 1} does not stop at the top edge, 8px below the one before`,
          ).toBeLessThanOrEqual(1)
        }
        // Just before the rest ends: card k is stopped, the next still 2px below the screen.
        await scrollTo(page, settledAt(s, k, 2))
        const now = await page.evaluate(
          (source) =>
            [
              ...document.querySelectorAll<HTMLElement>(
                matchMedia('(max-width: 899px)').matches ? source[0] : source[1],
              ),
            ].map((card) => ({
              top: card.getBoundingClientRect().top,
              bottom: card.getBoundingClientRect().bottom,
              // Each step's last line of text, not its box: the box ends at the card's foot, 24px below it.
              words: [...card.querySelectorAll('.order-step__words')].map(
                (words) => (words.lastElementChild ?? words).getBoundingClientRect().bottom,
              ),
            })),
          CARDS_IN_PAGE,
        )
        for (let j = 0; j <= k; j++) {
          expect(
            Math.abs((now[j]?.top ?? 0) - (s.stops[j] ?? 0)),
            `with card ${k + 1} stopped, card ${j + 1} is not at its stop`,
          ).toBeLessThanOrEqual(1)
        }
        // Down to the last pixel row: a card 1px short left that row pale (393 × 659, 2026-10-17).
        expect(
          now[k]?.bottom ?? 0,
          `card ${k + 1}'s foot is above the screen's foot`,
        ).toBeGreaterThanOrEqual(s.screen)
        expect(
          now[k]?.bottom ?? 0,
          `card ${k + 1}'s foot is past the screen's foot`,
        ).toBeLessThanOrEqual(s.screen + 1)
        for (const bottom of now[k]?.words ?? []) {
          expect(bottom, `card ${k + 1}'s words run off the screen`).toBeLessThanOrEqual(
            s.screen + 0.5,
          )
        }
        if (k < count - 1) {
          expect(
            now[k + 1]?.top ?? 0,
            `card ${k + 2} covers card ${k + 1} before its rest is over`,
          ).toBeGreaterThanOrEqual(s.screen)
        }
        // ⚠️ NO BLANK SPACE AT ANY EDGE (the owner, said many times; 2026-10-17). What a visitor
        // sees at each corner, and beside the bar at its own height, under the bar itself: a card,
        // never the page. The first build of this branch stopped the cards at the bar's foot and
        // the pale page showed on both sides of the bar; this is the check that sees it.
        const edges = await page.evaluate(() => {
          const w = innerWidth
          const h = innerHeight
          const points: [string, number, number][] = [
            ['top left', 2, 2],
            ['top right', w - 3, 2],
            ['beside the bar, left', 2, 40],
            ['beside the bar, right', w - 3, 40],
            ['bottom left', 2, h - 1],
            ['bottom right', w - 3, h - 1],
          ]
          // On a phone a covered card sinks narrower (owner, 2026-10-19), and beside its strip lies
          // the stack's own ground, the cards' ink: a card's colour, not the pale page.
          const ink = getComputedStyle(
            document.querySelector('.order-step') as Element,
          ).backgroundColor
          return points.flatMap(([where, x, y]) => {
            const first = document.elementsFromPoint(x, y).find((el) => !el.closest('.notch-shell'))
            const deck =
              first?.matches('.order-stages') && getComputedStyle(first).backgroundColor === ink
            return first?.closest('.order-stage') || deck
              ? []
              : [`${where}: ${first?.className || first?.tagName}`]
          })
        })
        expect(edges, `with card ${k + 1} stopped, the page shows at the screen's edge`).toEqual([])
      }
    })
  }

  /*
   * The sink (owner, 2026-10-19, phones only): what would have to break is a covered card that stays
   * full size, one that sinks before the next card reaches it, or one whose strip moves (it sinks
   * about its top edge). Skipped where the browser has no scroll-driven animations (Firefox).
   */
  for (const [width, height] of [
    [393, 659],
    [360, 640],
  ] as const) {
    test(`at ${width}x${height} a covered step sinks back as the next one comes over it, and not before`, async ({
      page,
    }) => {
      await open(page, width, height, { motion: 'no-preference' })
      const supported = await page.evaluate(
        () => CSS.supports('timeline-scope: --a') && CSS.supports('animation-timeline: view()'),
      )
      test.skip(!supported, 'no scroll-driven animations in this browser')
      const s = await stack(page)
      const read = () =>
        page.evaluate((source) => {
          const cards = [
            ...document.querySelectorAll<HTMLElement>(
              matchMedia('(max-width: 899px)').matches ? source[0] : source[1],
            ),
          ]
          return cards.slice(0, 2).map((card) => ({
            scale: getComputedStyle(card).scale,
            top: card.getBoundingClientRect().top,
          }))
        }, CARDS_IN_PAGE)
      // Step 1 stopped, step 2 still below the screen: nothing has sunk.
      await scrollTo(page, settledAt(s, 0, 2))
      expect((await read())[0]?.scale, 'step 1 sank before step 2 reached it').toMatch(/^(none|1)$/)
      // Step 2 stopped over it: step 1 is at 94%, its strip still where it stopped.
      await scrollTo(page, settledAt(s, 1, 2))
      const [first, second] = await read()
      expect(Number.parseFloat(first?.scale ?? '1')).toBeCloseTo(0.94, 2)
      expect(
        Math.abs((first?.top ?? 0) - (s.stops[0] ?? 0)),
        'step 1’s strip moved',
      ).toBeLessThanOrEqual(1)
      expect(second?.scale, 'step 2 sank with nothing over it').toMatch(/^(none|1)$/)
    })
  }

  test('on a phone the steps are still lists to a screen reader (Chromium’s own tree)', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'reads Chromium’s accessibility tree')
    await open(page, 393, 659, { motion: 'no-preference' })
    // The control that the phone's stack is on: the stage and its list are stepped aside.
    expect(
      await page
        .locator('.order-stages > .order-stage')
        .first()
        .evaluate((li) => getComputedStyle(li).display),
    ).toBe('contents')
    const cdp = await page.context().newCDPSession(page)
    const { root } = (await cdp.send('DOM.getDocument', { depth: -1 })) as {
      root: { nodeId: number }
    }
    const roleOf = async (selector: string) => {
      const { nodeId } = (await cdp.send('DOM.querySelector', {
        nodeId: root.nodeId,
        selector,
      })) as {
        nodeId: number
      }
      const { nodes } = (await cdp.send('Accessibility.getPartialAXTree', {
        nodeId,
        fetchRelatives: false,
      })) as { nodes: { role?: { value?: string }; ignored?: boolean }[] }
      const node = nodes[0]
      return node?.ignored ? 'ignored' : (node?.role?.value ?? 'none')
    }
    expect({
      stages: await roleOf('ol.order-stages'),
      stage: await roleOf('.order-stages > .order-stage'),
      steps: await roleOf('ol.order-stage__steps'),
      step: await roleOf('.order-stage__steps > .order-step-item'),
    }).toEqual({ stages: 'list', stage: 'listitem', steps: 'list', step: 'listitem' })
  })

  test('nothing in the cards animates while they stack', async ({ page }) => {
    await open(page, 1440, 900, { motion: 'no-preference' })
    const s = await stack(page)
    await scrollTo(page, settledAt(s, 1, 0) + (s.heights[1] ?? 0) / 2)
    const running = await page
      .locator('.order-stages')
      .evaluate((list) => list.getAnimations({ subtree: true }).length)
    expect(running, 'something in the cards animates').toBe(0)
    const covered = await page
      .locator('.order-stages > .order-stage')
      .first()
      .evaluate((card) => ({
        scale: getComputedStyle(card).scale,
        opacity: getComputedStyle(card).opacity,
      }))
    expect(covered, 'a covered card changes as it is covered').toEqual({
      scale: 'none',
      opacity: '1',
    })
  })

  test('under reduced motion the cards are a plain list: none stops', async ({ page }) => {
    await open(page, 1440, 900)
    const s = await stack(page)
    expect(s.positions.some((position) => position === 'sticky')).toBe(false)
    const before = await tops(page)
    await scrollTo(page, settledAt(s, 2, 0))
    const after = await tops(page)
    const moved = after.map((top, index) => (before[index] ?? 0) - top)
    expect(spread(moved), 'a card moved against the page').toBeLessThanOrEqual(1)
  })
})

test.describe('D42 — every step holds its words, and they read over the photos', () => {
  const PARTS = [
    '.order-step__number',
    '.order-step__actor',
    '.order-step__title',
    '.order-step__body',
    '.order-step__detail',
  ]

  for (const width of [320, 360, 390, 560, 768, 900, 1024, 1280, 1440, 1920]) {
    test(`at ${width}px every step holds its words inside its half, with the photo between`, async ({
      page,
    }) => {
      await open(page, width, 900)
      const halves = await page.locator(HALVES).evaluateAll(
        (all, parts) =>
          all.map((half) => {
            const outer = half.getBoundingClientRect()
            const boxes = parts.map((selector) => {
              const element = half.querySelector(selector)
              if (!element) return { selector, missing: true, top: 0, bottom: 0, left: 0, right: 0 }
              const { top, bottom, left, right } = element.getBoundingClientRect()
              return { selector, missing: false, top, bottom, left, right }
            })
            return {
              title: half.querySelector('.order-step__title')?.textContent ?? '',
              outer: { top: outer.top, bottom: outer.bottom, left: outer.left, right: outer.right },
              boxes,
            }
          }),
        PARTS,
      )
      for (const half of halves) {
        for (const part of half.boxes) {
          const label = `${half.title}: ${part.selector}`
          expect(part.missing, `${label} is missing`).toBe(false)
          expect(part.top, `${label} starts above its half`).toBeGreaterThanOrEqual(
            half.outer.top + 8,
          )
          expect(part.bottom, `${label} runs out of its half`).toBeLessThanOrEqual(
            half.outer.bottom - 8,
          )
          expect(part.left, `${label} starts left of its half`).toBeGreaterThanOrEqual(
            half.outer.left + 8,
          )
          expect(part.right, `${label} runs out of its half`).toBeLessThanOrEqual(
            half.outer.right - 8,
          )
        }
        // The number and whose move it is on top, the words at the foot, the photo showing between.
        const [number, actor, title] = half.boxes
        const topRow = Math.max(number?.bottom ?? 0, actor?.bottom ?? 0)
        expect(
          (title?.top ?? 0) - topRow,
          `${half.title}: no room left for the photo between the top row and the words`,
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
    test(`at 200% text and ${width}px nothing in a step is cut off`, async ({
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
      const cut = await page.locator(HALVES).evaluateAll(
        (all, parts) =>
          all.flatMap((half) => {
            const outer = half.getBoundingClientRect()
            return parts.flatMap((selector) => {
              const element = half.querySelector(selector)
              if (!element) return [`${selector} missing`]
              const box = element.getBoundingClientRect()
              return box.bottom > outer.bottom || box.right > outer.right || box.left < outer.left
                ? [`${half.querySelector('.order-step__title')?.textContent}: ${selector}`]
                : []
            })
          }),
        PARTS,
      )
      expect(cut).toEqual([])
    })
  }

  /**
   * The lightest pixels behind an element (90th percentile), with every word of the steps hidden.
   * The parts' CHILDREN are hidden, not the words' box: the words' wash is that box's own background.
   * Hidden by colour, not `visibility`: whose move it is sits on its own dark pill, and hiding the
   * pill measured its words against the photo they never sit on (2.40:1 over white, 2026-10-16).
   */
  async function behind(page: Page, selector: string, index: number) {
    const element = page.locator(HALVES).nth(index).locator(selector)
    await element.scrollIntoViewIfNeeded()
    const box = await element.boundingBox()
    if (!box) throw new Error(`${selector} has no box`)
    const hide = await page.addStyleTag({
      content:
        '.order-step__words > *, .order-step__top > * { color: transparent !important; border-color: transparent !important; transition: none !important; }',
    })
    await expect
      .poll(() => element.evaluate((node) => getComputedStyle(node).color))
      .toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
    const png = (await page.screenshot({ clip: box })).toString('base64')
    await hide.evaluate((style) => style.remove())
    // ⚠️ AND WAIT FOR THE WORDS TO COME BACK. After a screenshot, Chromium still reported
    // `rgba(0, 0, 0, 0)` right after the style was removed, and its colour 200ms later (2026-10-16),
    // so the next line's own colour was read as black: 0.35:1 to 0.69:1 for every line but the first.
    await expect
      .poll(() => element.evaluate((node) => getComputedStyle(node).color))
      .not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/)
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
      .locator(HALVES)
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
    ['.order-step__actor', 4.5],
    ['.order-step__title', 4.5],
    ['.order-step__body', 4.5],
    ['.order-step__detail', 4.5],
    ['.order-step__number', 3],
  ] as const

  async function worstLine(page: Page, halves: readonly number[]) {
    const found: string[] = []
    for (const index of halves) {
      // The photos are lazy: bring the step in, and let its picture arrive before measuring on it.
      const half = page.locator(HALVES).nth(index)
      await half.scrollIntoViewIfNeeded()
      await half
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
        if (contrast < floor) found.push(`step ${index + 1} ${selector}: ${contrast.toFixed(2)}:1`)
      }
    }
    return { found }
  }

  for (const [width, height] of [
    [390, 844],
    [1440, 900],
  ] as const) {
    test(`at ${width}px every line over every photo keeps its contrast, measured from the pixels behind it`, async ({
      page,
    }) => {
      // Eight steps, five lines each, every one read from a screenshot: WebKit ran the eight-card
      // version past the 30 s default in CI (PR #128). Its own limit.
      test.setTimeout(120_000)
      await open(page, width, height)
      const { found } = await worstLine(page, [0, 1, 2, 3, 4, 5, 6, 7])
      expect(found).toEqual([])
    })
  }

  test('over a white photo, the worst any photo could be, the washes alone keep every line readable', async ({
    page,
  }) => {
    await open(page, 390, 844)
    await page.addStyleTag({
      content:
        '.order-step__photo { visibility: hidden !important } .order-step { background: #fff !important }',
    })
    const { found } = await worstLine(page, [0, 1])
    expect(found).toEqual([])
  })

  test('the probe fails when the washes are taken away (negative control)', async ({ page }) => {
    await open(page, 390, 844)
    await page.addStyleTag({
      content:
        '.order-step__photo { visibility: hidden !important } .order-step { background: #fff !important } .order-step__words, .order-step::after { background: none !important }',
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
          .include('.order-stages')
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
  test('there is no such heading, grid or lightbox, and the works close the page as №05', async ({
    page,
  }) => {
    await open(page, 1440, 900)
    await expect(page.getByRole('heading', { name: /inside the factory/i })).toHaveCount(0)
    await expect(page.locator('.factory-grid, .factory-tile, .lightbox')).toHaveCount(0)
    const labels = await page.locator('.section-number').allTextContents()
    expect(labels.join('\n')).not.toMatch(/inside the factory/i)
    // "Talk to us" was №06 until the owner merged it into №05 (2026-10-16).
    expect(labels.at(-1)).toBe('№05 — The works')
  })

  // №01 draws one since D41 (2026-10-16): the roof, as its ground. Since 2026-10-17 №04's step 05
  // draws the front of the building, so the one left out is the stitching floor: the hero shows it
  // (its own `hero-` crops), and the owner chose not to show it twice (Q12).
  test('each factory photo is on the home page once: №01 draws one, №04 draws eight', async ({
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
      FACTORY_PHOTOS.map((photo) => photo.slug)
        .filter((slug) => slug !== 'stitching')
        .sort(),
    )
  })
})

/*
 * Polish X16 (2026-10-05), on D42's halves: at 1,920px a step is half the screen, 960px, and a 2x
 * screen asks for 1,920px, past every file but the widest (the owner chose the site's own photos for
 * the full-screen cards, knowing so: `src/factoryPhotos.test.ts`). This asks the engines which file
 * they take. Each step is scrolled to so its lazy picture starts, and `currentSrc` names the file.
 * The same page on a 1x screen is the control: if density were not what picks the file, both would
 * come back the same.
 */
for (const [density, label] of [
  [2, 'the widest file each photo has'],
  [1, 'the file that covers 960px'],
] as const) {
  test.describe(`X16 — step photos at 1920px on a ${density}x screen`, () => {
    test.use({ deviceScaleFactor: density })

    test(`each step takes ${label}`, async ({ page }) => {
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
          // 1x: the smallest file at least 960px wide, or the widest where none is. 2x: the widest.
          const file =
            density === 1
              ? (widths.find((width) => width >= 960) ?? widths[widths.length - 1])
              : widths[widths.length - 1]
          return `${step.photo} ${file}`
        }),
      )
    })
  })
}

/*
 * ⚠️ SAFARI'S BOTTOM STRIP FORGETS A STEP THAT LEFT THE SCREEN'S FOOT (2026-10-20). iOS 26 Safari
 * colours the strip under its pill from the sticky box at the screen's foot, and when there is none
 * it keeps the last one's colour while that box is still `visibility: visible` (WebKit,
 * Page::updateFixedContainerEdges). A step's ink card did that: after the stack, and after the footer
 * and back, the strip stayed ink over paper (owner's report; reproduced in the iOS 26.5 simulator).
 * No browser here draws Safari's bar, so this holds WebKit's own rule instead: a slot is visible
 * exactly while it covers the foot, and every card is always visible, so nothing on screen moves.
 * Checked mid-stack, at the stack's tail (still on screen, the paper below it: the case that stayed
 * stale) and past it. What would have to break: the observer gone, its band moved, or a card that
 * inherits `hidden` and vanishes.
 */
test.describe('Safari’s bottom strip — a step is shown to it only while it covers the foot', () => {
  test('phone stack: slot visible ⇔ it covers the foot, and every card stays visible', async ({
    page,
  }) => {
    await open(page, 393, 659, { motion: 'no-preference' })
    const s = await stack(page)
    const list = await page.locator('.order-stages').evaluate((ol) => {
      const r = ol.getBoundingClientRect()
      return { top: r.top + scrollY, height: r.height }
    })
    const spots = {
      'mid-stack': settledAt(s, 3, 0) + 40,
      'the stack’s tail, paper below': list.top + list.height - 0.5 * 659,
      'past the stack': list.top + list.height + 200,
    }
    for (const [where, y] of Object.entries(spots)) {
      await scrollTo(page, Math.round(y))
      await expect
        .poll(
          () =>
            page.locator('.order-stage__steps .order-step-slot').evaluateAll((slots) => {
              const foot = innerHeight - 4
              return slots.flatMap((slot, i) => {
                const r = slot.getBoundingClientRect()
                const covers = r.top <= foot && r.bottom > foot
                const shown = getComputedStyle(slot).visibility === 'visible'
                const card = getComputedStyle(slot.querySelector('.order-step') as Element)
                const wrong = []
                if (covers !== shown)
                  wrong.push(`slot ${i + 1}: covers ${covers}, visible ${shown}`)
                if (card.visibility !== 'visible') wrong.push(`card ${i + 1} is ${card.visibility}`)
                return wrong
              })
            }),
          { message: where, timeout: 3000 },
        )
        .toEqual([])
    }
    // The control that the band can find a slot at all: mid-stack one covers the foot.
    await scrollTo(page, Math.round(spots['mid-stack']))
    await expect
      .poll(() => page.locator('.order-stage__steps .order-step-slot[data-edge="on"]').count())
      .toBeGreaterThan(0)
  })
})
