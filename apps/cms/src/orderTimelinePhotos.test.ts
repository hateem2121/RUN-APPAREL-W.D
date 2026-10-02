import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AboutSection } from './components/site/AboutSection'
import { OrderTimeline } from './components/site/OrderTimeline'
import { FACTORY_PHOTO_WIDTHS, FACTORY_PHOTOS } from './lib/factoryPhotos'
import { ORDER_PHASES } from './lib/orderProcess'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * VA-29 with VA-34 (visual audit 2026-10-01, owner's choice 2026-10-02): "How an order works"
 * had eight steps and four photos in mixed shapes, so its rows did not line up, and a strip
 * below the numbers showed all ten photos a second time. Now every step has its own photo,
 * all cut to one square, and the strip is gone.
 *
 * What would have to break for these to fail: a step loses its picture or shares one with
 * another step; a photo is drawn twice on the home page; the pictures stop being one shape;
 * the removed strip comes back; or the closing section loses its place in the numbering.
 * `e2e/orderTimeline.spec.ts` measures the same promises in a real browser.
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

  it('names a real photo for every step, and every one of them is cut to a square by its focus', () => {
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
   * In a square a wide file loses width and a tall one loses height, so only one number of each
   * `focus` can matter (lib/factoryPhotos.ts says so). A number that is not 50 on the axis that
   * is not cropped steers nothing and would read as a decision somebody made.
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

describe('what the timeline draws', () => {
  const figures = imgTags(timelineHtml)

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
      expect(attr(tag, 'sizes'), `step ${index + 1} has no sizes`).toMatch(/400px/)
    }
  })

  it('cuts every picture to the same square frame and aims each one at its own focus', () => {
    const frames = [...timelineHtml.matchAll(/class="photo-figure__frame ([^"]*)"/g)].map(
      (match) => match[1] ?? '',
    )
    expect(frames).toHaveLength(8)
    for (const frame of frames) {
      expect(frame).toContain('photo-figure__frame--square')
      expect(frame).not.toMatch(/--wide|--single/)
    }
    for (const [index, tag] of figures.entries()) {
      const [across, down] = photoOf(steps[index]?.photo ?? '')?.focus ?? []
      expect(attr(tag, 'style'), `step ${index + 1}`).toBe(`object-position:${across}% ${down}%`)
    }
  })

  it('captions every picture with the words it already had', () => {
    for (const step of steps) {
      expect(timelineHtml).toContain(
        `<figcaption class="photo-figure__caption">${photoOf(step.photo)?.caption}</figcaption>`,
      )
    }
  })

  /*
   * The words come first in the markup and CSS lifts the picture above them on a phone, so a
   * screen reader hears "Your quote" before "Two technicians in lab coats…".
   */
  it('puts each step’s words before its picture in the markup', () => {
    const rows = timelineHtml.split('<li class="timeline__step">').slice(1)
    expect(rows).toHaveLength(8)
    for (const [index, row] of rows.entries()) {
      expect(row.indexOf('timeline__text'), `step ${index + 1}`).toBeGreaterThan(-1)
      expect(row.indexOf('timeline__text'), `step ${index + 1}`).toBeLessThan(
        row.indexOf('<figure'),
      )
    }
  })

  it('keeps the four phases and the You / We markers (decision D23)', () => {
    const names = [...timelineHtml.matchAll(/timeline__name">([^<]*)</g)].map((match) => match[1])
    expect(names).toEqual(ORDER_PHASES.map((phase) => phase.name))
    const actors = [...timelineHtml.matchAll(/timeline__actor timeline__actor--(\w+)">/g)].map(
      (match) => match[1],
    )
    expect(actors).toEqual(steps.map((step) => step.actor))
    expect(timelineHtml).toContain('class="timeline__line"')
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

describe('the square frame, in the stylesheet', () => {
  const rule = (selector: string) =>
    new RegExp(`(?:^|\\n)${selector.replace(/[.>]/g, '\\$&')}\\s*\\{([^}]*)\\}`).exec(
      SITE_CSS,
    )?.[1] ?? ''

  it('is one 1:1 box, and the picture fills it by cover', () => {
    expect(rule('.photo-figure__frame--square')).toMatch(/aspect-ratio:\s*1\s*\/\s*1/)
    expect(rule('.photo-figure__img')).toMatch(/object-fit:\s*cover/)
  })

  it('puts the picture above its words on a phone and beside them from 900px', () => {
    expect(rule('.timeline__step > .photo-figure')).toMatch(/order:\s*-1/)
    const wide = /@media \(min-width: 900px\) \{([\s\S]*?)\n\}/g
    const blocks = [...SITE_CSS.matchAll(wide)].map((match) => match[1] ?? '')
    const own = blocks.find((block) => block.includes('.timeline__step {')) ?? ''
    expect(own).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\) minmax\(0, 400px\)/)
    expect(own).toMatch(/\.timeline__step > \.photo-figure \{\s*order:\s*0/)
  })
})
