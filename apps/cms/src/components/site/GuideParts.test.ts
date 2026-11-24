import { SITE_MEDIA_ORIGIN } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { type Guide, GUIDES, GUIDES_INDEX, guideAt } from '../../lib/guides'
import { guideAtRu } from '../../lib/i18n/ruNames'
import type { Locale } from '../../lib/locale'
import type { ProductCard } from '../../lib/projectPublic'
import {
  GuidePage,
  garmentPreview,
  guidePreview,
  headingId,
  SOURCES_ID,
  sectionIds,
} from './GuidePage'

/**
 * The guides audit of 23 and 24 November 2026, read as HTML: every part of a guide has an address
 * and is listed under the intro ("On this page"), the label is the way back to every guide, a
 * reference garment's link shows its picture, and a link's card says only what the linked page
 * says. The drawn half (44px rows, the jump landing below the bar, the card on hover and on the
 * keyboard in three engines) is `e2e/guideParts.spec.ts`.
 */

const render = (guide: Guide, locale: Locale = 'en', cards: readonly ProductCard[] = []) =>
  renderToStaticMarkup(createElement(GuidePage, { guide, cards, locale }))

const text = (html: string) =>
  stripUntilStable(html, /<[^>]*>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

/** Every `id` in a page's markup, in order. */
const idsIn = (html: string) => [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1] ?? '')

/** "On this page" as the page draws it: each link's target and words. */
function contentsOf(html: string): { href: string; words: string }[] {
  const nav = /<nav\b[^>]*class="legal__toc guide-toc"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1]
  if (nav === undefined) throw new Error('no "On this page" list on the page')
  return [...nav.matchAll(/<a\b[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)].map((match) => ({
    href: match[1] ?? '',
    words: text(match[2] ?? ''),
  }))
}

const card = (slug: string, over: Partial<ProductCard> = {}): ProductCard =>
  ({
    slug,
    productName: `NAME ${slug}`,
    productCode: slug.toUpperCase(),
    category: 'Sportswear',
    garmentType: `Type ${slug}`,
    shortDescription: '',
    posterUrl: null,
    posterAlt: '',
    defaultColourSlug: 'wine',
    colourNames: ['Wine'],
    colours: [],
    updatedAt: null,
    ...over,
  }) as ProductCard

describe('every part of a guide has an address, and the guide lists them (2026-11-24)', () => {
  it('has all thirty guides to look at', () => {
    expect(GUIDES.length).toBeGreaterThanOrEqual(30)
  })

  for (const guide of GUIDES) {
    it(`${guide.path}: each section's heading has its id, listed in order under the intro`, () => {
      const html = render(guide)
      const ids = sectionIds(guide)
      expect(ids).toHaveLength(guide.sections.length)
      const expected = [
        ...guide.sections.map((section, index) => ({
          href: `#${ids[index]}`,
          words: section.heading,
        })),
        ...(guide.sources ? [{ href: `#${SOURCES_ID}`, words: 'Sources' }] : []),
      ]
      expect(contentsOf(html)).toEqual(expected)
      // Each link lands on a heading that is really on the page, and no id is used twice.
      const onPage = idsIn(html)
      for (const { href } of expected) expect(onPage).toContain(href.slice(1))
      expect(onPage.filter((id, at) => onPage.indexOf(id) !== at)).toEqual([])
      for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    })

    it(`${guide.path}: the Russian page has the same addresses, with Russian words`, () => {
      const russian = guideAtRu(guide.path)
      const html = render(russian, 'ru')
      expect(sectionIds(russian)).toEqual(sectionIds(guide))
      const contents = contentsOf(html)
      expect(contents.slice(0, russian.sections.length).map((link) => link.words)).toEqual(
        russian.sections.map((section) => section.heading),
      )
      const onPage = idsIn(html)
      expect(onPage.filter((id, at) => onPage.indexOf(id) !== at)).toEqual([])
    })
  }

  it('makes an address from a heading’s own words', () => {
    expect(headingId('What FIFA’s quality marks mean')).toBe('what-fifa-s-quality-marks-mean')
    expect(headingId('  Pakistan vs China vs Turkey? ')).toBe('pakistan-vs-china-vs-turkey')
    expect(headingId('Décret n° 2022-748')).toBe('decret-n-2022-748')
  })

  it('NEGATIVE CONTROL: two headings with the same words, and a heading named like Sources', () => {
    const guide = guideAt('/guides/private-label-packaging')
    const [first] = guide.sections
    if (!first) throw new Error('the packaging guide has no section')
    const twice: Guide = {
      ...guide,
      // Not a real guide's path, so the ids come from position: no English twin to read.
      path: '/guides/not-a-guide',
      sections: [first, first, { ...first, heading: 'Sources' }],
    }
    expect(sectionIds(twice)).toEqual(['part-1', 'part-2', 'part-3'])
    // With the English twin lined up, the words make the id and a repeat gets a number.
    const repeated: Guide = { ...guide, sections: guide.sections.map(() => first) }
    const ids = sectionIds({ ...repeated, path: guide.path })
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('NEGATIVE CONTROL: a Russian guide with a section missing gets positions, not wrong words', () => {
    const russian = guideAtRu('/guides/private-label-packaging')
    const short: Guide = { ...russian, sections: russian.sections.slice(1) }
    expect(sectionIds(short)).toEqual(short.sections.map((_section, index) => `part-${index + 1}`))
  })
})

describe('the guide’s label is the way back to every guide (2026-11-24)', () => {
  it('links the label to the guides list, in both languages, once', () => {
    for (const [guide, locale, words] of [
      [guideAt('/guides/aql-inspection'), 'en', '[ Buyer guide ]'],
      [guideAtRu('/guides/aql-inspection'), 'ru', '[ Руководство для заказчика ]'],
    ] as const) {
      const html = render(guide, locale)
      const label = /<p class="label label--guide">([\s\S]*?)<\/p>/.exec(html)?.[1] ?? ''
      expect(label).toContain(`href="${GUIDES_INDEX.path}"`)
      expect(label).toContain('class="label__way"')
      expect(text(label)).toBe(words)
      expect(html.match(/class="label__way"/g)).toHaveLength(1)
    }
  })
})

describe('a reference garment’s link shows its own picture (2026-11-24)', () => {
  const poster = `${SITE_MEDIA_ORIGIN}/posters/r-vpj-wine.png`

  it('draws the catalogue’s picture beside the name, small, whole and decorative', () => {
    const guide = guideAt('/guides/garment-printing-methods')
    const html = render(guide, 'en', [card('r-vpj', { posterUrl: poster }), card('r-au')])
    const pictured = /<li class="see-also__pictured">([\s\S]*?)<\/li>/.exec(html)?.[1] ?? ''
    expect(pictured).toContain('href="/products/r-vpj/wine"')
    const img = /<img\b[^>]*>/.exec(pictured)?.[0] ?? ''
    expect(img).toContain('class="see-also__thumb"')
    expect(img).toContain('alt=""')
    expect(img).toContain('width="64"')
    expect(img).toContain('height="80"')
    expect(img).toContain('loading="lazy"')
    expect(img).toContain('sizes="64px"')
    // A resized copy from the site's own media address, never the full-size file.
    expect(img).toMatch(/srcSet="[^"]*400w/)
    // The garment with no picture keeps its plain link: no empty frame, no broken image.
    expect(html.match(/class="see-also__thumb"/g)).toHaveLength(1)
    expect(html).toContain('href="/products/r-au/wine"')
  })

  it('NEGATIVE CONTROL: with no picture in the catalogue nothing is drawn as one', () => {
    const html = render(guideAt('/guides/garment-printing-methods'), 'en', [card('r-vpj')])
    expect(html).not.toContain('see-also__thumb')
    expect(html).not.toContain('see-also__pictured')
  })
})

describe('a link’s card says only what the linked page says (2026-11-24)', () => {
  it('gives a guide link that guide’s own title and description, in the page’s language', () => {
    const path = '/guides/sportswear-fabrics-and-weights'
    expect(guidePreview(path, 'en')).toEqual({
      title: guideAt(path).title,
      text: guideAt(path).description,
    })
    expect(guidePreview(`${path}#weights`, 'ru')).toEqual({
      title: guideAtRu(path).title,
      text: guideAtRu(path).description,
    })
  })

  it('gives no card to any other page, or to a guide that does not exist', () => {
    expect(guidePreview('/glossary#gsm', 'en')).toBeNull()
    expect(guidePreview('/faq/working-with-us', 'en')).toBeNull()
    expect(guidePreview(GUIDES_INDEX.path, 'en')).toBeNull()
    expect(guidePreview('/guides/not-a-guide', 'en')).toBeNull()
  })

  it('gives a garment link its name, type and picture, and no picture when there is none', () => {
    const pictured = garmentPreview(
      card('rxps', { posterUrl: `${SITE_MEDIA_ORIGIN}/posters/rxps-wine.png` }),
      'en',
    )
    expect(pictured.title).toBe('NAME rxps')
    expect(pictured.text).toBe('Type rxps')
    expect(pictured.image?.srcSet).toMatch(/400w/)
    expect(garmentPreview(card('rxps'), 'en').image).toBeUndefined()
  })

  it('still draws every in-text link as a plain link in the page’s own markup', () => {
    const guide = guideAt('/guides/sportswear-fibers')
    const html = render(guide)
    const links = guide.sections.flatMap((section) =>
      section.blocks.flatMap((block) =>
        block.kind === 'text' || block.kind === 'list' || block.kind === 'table'
          ? (block.links ?? [])
          : [],
      ),
    )
    const toGuides = links.filter((link) => link.href.startsWith(`${GUIDES_INDEX.path}/`))
    expect(toGuides.length).toBeGreaterThan(0)
    // Base UI gives each link an id of its own for the card; the link is otherwise as it was.
    const anchors = [...html.matchAll(/<a\b[^>]*class="prose__link"[^>]*>/g)].map(
      (match) => match[0],
    )
    for (const link of toGuides) {
      expect(anchors.some((anchor) => anchor.includes(`href="${link.href}"`))).toBe(true)
    }
    // No card is in the page until a visitor asks for one.
    expect(html).not.toContain('link-preview')
  })
})
