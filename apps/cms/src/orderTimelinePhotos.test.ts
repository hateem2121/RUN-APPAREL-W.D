import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AboutSection } from './components/site/AboutSection'
import { GuidePage } from './components/site/GuidePage'
import { OrderSteps } from './components/site/OrderSteps'
import { OrderTimeline } from './components/site/OrderTimeline'
import { FACTORY_PHOTO_WIDTHS, FACTORY_PHOTOS } from './lib/factoryPhotos'
import { guideAt } from './lib/guides'
import { ORDER_PHASES } from './lib/orderProcess'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * VA-29 with VA-34 (visual audit 2026-10-01, owner's choice 2026-10-02): "How an order works"
 * had eight steps and four photos in mixed shapes, so its rows did not line up, and a strip
 * below the numbers showed all ten photos a second time. Now every step has its own photo and
 * the strip is gone. Since polish D4 (2026-10-05, the owner's answers Q14 and Q41) the eight are
 * photo cards that stack as the page scrolls, and the order guide draws the SAME cards from the
 * same list, so the steps have one set of names everywhere (X21).
 *
 * What would have to break for these to fail: a step loses its picture or shares one with
 * another step; a photo is drawn twice on the home page; the removed strip comes back; the
 * closing section loses its place in the numbering; or the guide words the steps its own way
 * again. `e2e/orderTimeline.spec.ts` measures the cards in a real browser.
 */

const FRONTEND = join(import.meta.dirname, 'app', '(frontend)')
const SITE_CSS = readFileSync(join(FRONTEND, 'site.css'), 'utf8')
// Comments are left out: the page's own comments name what was removed and why, in the words
// that must no longer be DRAWN, so a check on the file's text would fail on its own history.
const HOME_PAGE = readFileSync(join(FRONTEND, 'page.tsx'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')

const steps = ORDER_PHASES.flatMap((phase) => phase.steps)
const photoOf = (slug: string) => FACTORY_PHOTOS.find((photo) => photo.slug === slug)

/** The owner's eight, step by step (2026-10-02). Steps 2 and 8 have no photo of their own subject. */
const CHOSEN = [
  ['Send what you have', 'showroom'],
  ['Your quote', 'lab'],
  ['Your sample', 'screen-printing'],
  ['You approve', 'inspection'],
  ['Bulk production', 'stitching'],
  ['Checked', 'final-check'],
  ['Packed and shipped', 'packing'],
  ['Your order arrives', 'tagging'],
] as const

const timelineHtml = renderToStaticMarkup(createElement(OrderTimeline))
const stepsHtml = renderToStaticMarkup(createElement(OrderSteps))
const ORDER_GUIDE = guideAt('/guides/how-a-private-label-order-works')
const guideHtml = renderToStaticMarkup(createElement(GuidePage, { guide: ORDER_GUIDE }))
const aboutHtml = renderToStaticMarkup(createElement(AboutSection))

const imgTags = (html: string) => [...html.matchAll(/<img\b[^>]*>/g)].map((match) => match[0])
const attr = (tag: string, name: string) =>
  tag.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1]?.replace(/&amp;/g, '&') ?? null
/** `/factory/showroom-640.webp` → `showroom`. */
const slugOf = (src: string | null) => src?.match(/^\/factory\/(.+)-\d+\.webp$/)?.[1] ?? null
const duplicates = (list: readonly string[]) =>
  list.filter((entry, index) => list.indexOf(entry) !== index)

describe('every step of the timeline has its own photo (VA-29)', () => {
  it('shows the eight photos the owner chose, step for step', () => {
    expect(steps.map((step) => [step.title, step.photo])).toEqual(CHOSEN)
  })

  it('never gives two steps the same photo', () => {
    expect(duplicates(steps.map((step) => step.photo))).toEqual([])
    expect(steps).toHaveLength(8)
  })

  it('names a real photo for every step, and every one of them is aimed by its focus', () => {
    for (const step of steps) {
      const photo = photoOf(step.photo)
      expect(photo, `${step.title}: no photo "${step.photo}" in FACTORY_PHOTOS`).toBeDefined()
      const [across, down] = photo?.focus ?? [Number.NaN, Number.NaN]
      for (const value of [across, down]) {
        expect(value, `${step.photo}: focus is not a percentage`).toBeGreaterThanOrEqual(0)
        expect(value, `${step.photo}: focus is not a percentage`).toBeLessThanOrEqual(100)
      }
    }
  })

  /*
   * A card is cut from a file by `cover`, and every card's shape lies between the files' two
   * (4:5 and 8:5; 0.85 to 1.65 measured from 320 to 1920px), so a wide file only ever loses width
   * and a tall one only height. Only one number of each `focus` can matter (lib/factoryPhotos.ts
   * says so); a number that is not 50 on the other axis steers nothing and would read as a
   * decision somebody made.
   */
  it('moves a wide photo across and a tall photo down, and leaves the other axis at 50', () => {
    for (const step of steps) {
      const photo = photoOf(step.photo)
      const [across, down] = photo?.focus ?? []
      if (photo?.shape === 'wide')
        expect(down, `${photo.slug}: a wide photo has no vertical crop`).toBe(50)
      if (photo?.shape === 'single')
        expect(across, `${photo.slug}: a tall photo has no sideways crop`).toBe(50)
      expect(across !== undefined && down !== undefined).toBe(true)
    }
  })
})

describe('what the order steps draw (D4)', () => {
  const figures = imgTags(stepsHtml)
  const cards = stepsHtml.split(/<li class="order-step"/).slice(1)

  it('is one ordered list of eight cards, and the home page draws exactly that list', () => {
    expect(stepsHtml.startsWith('<ol class="order-steps"')).toBe(true)
    expect(cards).toHaveLength(8)
    expect(timelineHtml).toContain(stepsHtml)
  })

  it('draws eight pictures, in step order, each with its own alt text', () => {
    expect(figures).toHaveLength(8)
    expect(figures.map((tag) => slugOf(attr(tag, 'src')))).toEqual(steps.map((step) => step.photo))
    for (const [index, tag] of figures.entries()) {
      const photo = photoOf(steps[index]?.photo ?? '')
      expect(attr(tag, 'alt'), `step ${index + 1}`).toBe(photo?.alt)
      expect(photo?.alt.length ?? 0).toBeGreaterThan(20)
    }
  })

  it('sizes every picture before it arrives, loads it lazily and offers both widths', () => {
    for (const [index, tag] of figures.entries()) {
      const photo = photoOf(steps[index]?.photo ?? '')
      const [small, large] = FACTORY_PHOTO_WIDTHS[photo?.shape ?? 'wide']
      expect(attr(tag, 'loading'), `step ${index + 1} is not lazy`).toBe('lazy')
      expect(attr(tag, 'width'), `step ${index + 1} has no width`).toBe(String(small))
      expect(Number(attr(tag, 'height')), `step ${index + 1} has no height`).toBeGreaterThan(0)
      const srcset = attr(tag, 'srcSet') ?? ''
      expect(srcset, `step ${index + 1}`).toContain(
        `/factory/${photo?.slug}-${small}.webp ${small}w`,
      )
      expect(srcset, `step ${index + 1}`).toContain(
        `/factory/${photo?.slug}-${large}.webp ${large}w`,
      )
      // One hint for all eight: every card is the same width. The browser suite checks it against
      // the width each card is really drawn at.
      expect(attr(tag, 'sizes'), `step ${index + 1} has no sizes`).toBe(
        attr(figures[0] ?? '', 'sizes'),
      )
      expect(attr(tag, 'sizes')).toMatch(/\(max-width: 899px\)/)
    }
  })

  it('fills every card with its picture and aims each one at its own focus', () => {
    for (const [index, tag] of figures.entries()) {
      const [across, down] = photoOf(steps[index]?.photo ?? '')?.focus ?? []
      expect(attr(tag, 'class'), `step ${index + 1}`).toBe('order-step__photo')
      expect(attr(tag, 'style'), `step ${index + 1}`).toBe(`object-position:${across}% ${down}%`)
    }
  })

  it('names each picture’s room with the words the picture already had', () => {
    for (const [index, card] of cards.entries()) {
      const photo = photoOf(steps[index]?.photo ?? '')
      expect(card, `step ${index + 1}`).toContain(
        `<p class="order-step__room">${photo?.caption}</p>`,
      )
    }
  })

  /*
   * The words come first in the markup and the picture is laid behind them by CSS, so a screen
   * reader hears "Your quote" before "Two technicians in lab coats…".
   */
  it('puts each step’s words before its picture in the markup', () => {
    for (const [index, card] of cards.entries()) {
      expect(card.indexOf('order-step__words'), `step ${index + 1}`).toBeGreaterThan(-1)
      expect(card.indexOf('order-step__words'), `step ${index + 1}`).toBeLessThan(
        card.indexOf('<img'),
      )
    }
  })

  it('marks every card with its stage and whose move it is (decision D23), and numbers it for the eye only', () => {
    const phases = [...stepsHtml.matchAll(/order-step__phase">([^<]*)</g)].map((match) => match[1])
    expect(phases).toEqual(ORDER_PHASES.flatMap((phase) => phase.steps.map(() => phase.name)))
    const actors = [...stepsHtml.matchAll(/order-step__actor order-step__actor--(\w+)">(\w+)</g)]
    expect(actors.map((match) => match[1])).toEqual(steps.map((step) => step.actor))
    expect(actors.map((match) => match[2])).toEqual(steps.map((step) => step.actor))
    const numbers = [
      ...stepsHtml.matchAll(/<span class="order-step__number[^"]*" aria-hidden="true">(\d+)</g),
    ]
    expect(numbers.map((match) => match[1])).toEqual(
      steps.map((_, index) => String(index + 1).padStart(2, '0')),
    )
    // The drawn line went with the timeline it ran down (polish D4).
    expect(timelineHtml).not.toContain('timeline__line')
  })
})

describe('the order guide draws the home page’s eight steps (Q41, X21)', () => {
  it('its "The eight steps" section is the order steps, with no steps of its own', () => {
    const section = ORDER_GUIDE.sections.find((entry) => entry.heading === 'The eight steps')
    expect(section?.blocks).toEqual([{ kind: 'orderSteps' }])
    const points = ORDER_GUIDE.sections.flatMap((entry) =>
      entry.blocks.flatMap((block) => (block.kind === 'point' ? [block.title] : [])),
    )
    expect(
      points.filter((title) => /^\d\./.test(title)),
      'a numbered step of its own',
    ).toEqual([])
  })

  it('renders the same list, word for word, as the home page', () => {
    expect(guideHtml).toContain(stepsHtml)
    for (const old of ['You send what you have', 'We send your quote', 'We make your sample']) {
      expect(guideHtml).not.toContain(old)
    }
  })
})

describe('no photo appears twice on the home page (VA-34)', () => {
  const slugs = [
    ...imgTags(aboutHtml).map((tag) => slugOf(attr(tag, 'src'))),
    ...imgTags(timelineHtml).map((tag) => slugOf(attr(tag, 'src'))),
  ]

  it('draws №01 and №04 from ten different files', () => {
    expect(slugs).toHaveLength(10)
    expect(duplicates(slugs.filter((slug): slug is string => slug !== null))).toEqual([])
  })

  it('uses every one of the ten photos exactly once, so none of the files is orphaned', () => {
    expect([...slugs].sort()).toEqual(FACTORY_PHOTOS.map((photo) => photo.slug).sort())
  })

  // NEGATIVE CONTROL, on a list of its own so it holds whatever the page draws: the check
  // names a repeat when one is planted, and a clean list gives it nothing to name.
  it('sees a photo that is shown twice', () => {
    expect(duplicates(['exterior', 'lab', 'packing', 'lab'])).toEqual(['lab'])
    expect(duplicates(['exterior', 'lab', 'packing'])).toEqual([])
  })
})

describe('the factory strip is gone, and the numbering closed up (VA-29)', () => {
  it('the home page no longer draws "Inside the factory"', () => {
    expect(HOME_PAGE).not.toContain('FactoryPhotos')
    expect(HOME_PAGE).not.toMatch(/Inside the factory/i)
    expect(existsSync(join(import.meta.dirname, 'components', 'site', 'FactoryPhotos.tsx'))).toBe(
      false,
    )
    expect(existsSync(join(import.meta.dirname, 'components', 'site', 'FactoryLightbox.tsx'))).toBe(
      false,
    )
    expect(SITE_CSS).not.toMatch(/\.factory-grid|\.factory-tile|\.lightbox/)
  })

  it('numbers the sections №01 to №06 with "Talk to us" last, as №06', () => {
    const numbers = [...HOME_PAGE.matchAll(/section-number">(№\d+) — ([^<]+)</g)].map((match) => [
      match[1],
      match[2],
    ])
    // №01 and №04 are drawn by AboutSection and OrderTimeline, not in this file.
    expect(numbers).toEqual([
      ['№02', 'What we make'],
      ['№03', 'See it before it exists'],
      ['№05', 'The works'],
      ['№06', 'Talk to us'],
    ])
    expect(HOME_PAGE).not.toContain('№07')
  })
})

describe('the cards, in the stylesheet (D4)', () => {
  it('no longer cuts anything to the timeline’s square', () => {
    expect(SITE_CSS).not.toContain('.photo-figure__frame--square')
    expect(SITE_CSS).not.toMatch(/\.timeline__/)
  })

  /*
   * The stack stops cards only for someone who allows motion, and the sink runs only where the
   * browser has scroll timelines AND animation ranges (a browser with the first but not the
   * second would run the sink over the whole page). Both are measured in a browser; this pins
   * where the rules sit, so a later edit cannot lift one out of its guard unnoticed.
   */
  it('stops and sinks the cards only inside their guards', () => {
    const motion =
      /@media screen and \(prefers-reduced-motion: no-preference\) and \(min-height: 40rem\) \{([\s\S]*?)\n\}/g
    const blocks = [...SITE_CSS.matchAll(motion)].map((match) => match[1] ?? '')
    const own = blocks.find((block) => block.includes('.order-step {')) ?? ''
    expect(own).toMatch(/position:\s*sticky/)
    expect(own).toMatch(
      /@supports \(\(animation-timeline: view\(\)\) and \(animation-range: 0% 100%\)\)/,
    )
    expect(own).toMatch(/animation-timeline:\s*--order-steps/)
    const outside = SITE_CSS.replace(own, '')
    expect(outside).not.toMatch(/\.order-step\b[^{]*\{[^}]*position:\s*sticky/)
    expect(outside).not.toMatch(/animation-timeline:\s*--order-steps/)
  })
})
