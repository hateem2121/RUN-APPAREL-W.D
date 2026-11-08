import { faqTopicForGuide } from '../../lib/faqs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { describe, expect, it } from 'vitest'
import { FAMILIES } from '../../lib/families'
import { familyPageFor } from '../../lib/familyPages'
import { FACTORY_PHOTOS, factoryPhotoWidths } from '../../lib/factoryPhotos'
import { type Guide, GUIDES, GUIDES_INDEX, guideAt, READ_NEXT } from '../../lib/guides'
import type { ProductCard } from '../../lib/projectPublic'
import { HALF_COLUMN_SIZES } from './FactoryFigure'
import {
  FIT_FROM_LETTERS,
  fitLetters,
  GuidePage,
  isWideTable,
  LinkedWords,
  longestWord,
  WholeWords,
  wordEm,
} from './GuidePage'

/**
 * Polish X22 (audit of 3 October 2026): the guides were walls of text. What a visitor is given,
 * read as HTML: the printing guide's table, a factory photo beside the words that name it, and the
 * links at the end in two labelled groups instead of one cloud of chips under the quote button.
 *
 * The drawn half (a 320px phone, the photo in the left half on a computer, the groups side by side)
 * is `e2e/guides.spec.ts`.
 */

const render = (guide: Guide, cards: readonly ProductCard[] = []) =>
  renderToStaticMarkup(createElement(GuidePage, { guide, cards }))

/** Markup text as a reader gets it: React escapes "&" and the apostrophe. */
const text = (html: string) =>
  stripUntilStable(html, /<[^>]*>/g, '')
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

/** The `<section>` whose `<h2>` is `heading`, as markup. */
function sectionOf(html: string, heading: string): string {
  const found = [...html.matchAll(/<section\b[^>]*>([\s\S]*?)<\/section>/g)].find((match) =>
    text(/<h2\b[^>]*>([\s\S]*?)<\/h2>/.exec(match[1] ?? '')?.[1] ?? '').startsWith(heading),
  )
  if (!found) throw new Error(`no section headed "${heading}"`)
  return found[1] ?? ''
}

describe('the printing guide’s table is a real table (polish X22)', () => {
  const guide = guideAt('/guides/garment-printing-methods')
  const section = sectionOf(render(guide), 'Which method for your garment')
  const block = guide.sections
    .flatMap((entry) => entry.blocks)
    .find((entry) => entry.kind === 'table')

  /** Everything wrong with a table's markup, as sentences. */
  function problemsWith(html: string): string[] {
    if (block?.kind !== 'table') return ['the guide has no table']
    const problems: string[] = []
    const table = /<table\b[^>]*>([\s\S]*?)<\/table>/.exec(html)?.[1]
    if (!table) return ['no <table>']
    const caption = /<caption\b[^>]*>([\s\S]*?)<\/caption>/.exec(table)?.[1]
    if (caption === undefined || text(caption) !== block.caption) problems.push('no caption')
    const columns = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map((match) =>
      text(match[1] ?? ''),
    )
    if (columns.join(' | ') !== block.columns.join(' | ')) {
      problems.push(`column headers "${columns.join(' | ')}"`)
    }
    const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)]
      .map((match) => match[1] ?? '')
      .filter((row) => !row.includes('scope="col"'))
    if (rows.length !== block.rows.length) {
      problems.push(`${rows.length} body rows for ${block.rows.length}`)
    }
    for (const [index, row] of rows.entries()) {
      const head = /<th scope="row"[^>]*>([\s\S]*?)<\/th>/.exec(row)?.[1]
      const cells = [...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/g)].map((match) =>
        text(match[1] ?? ''),
      )
      const wanted = block.rows[index] ?? []
      if (head === undefined) problems.push(`row ${index + 1} has no row header`)
      else if (text(head) !== wanted[0]) problems.push(`row ${index + 1} is "${text(head)}"`)
      if (cells.join(' | ') !== wanted.slice(1).join(' | ')) {
        problems.push(`row ${index + 1}'s cells are "${cells.join(' | ')}"`)
      }
    }
    return problems
  }

  it('has a caption, a header per column, a row header per method, and the cells in order', () => {
    expect(problemsWith(section)).toEqual([])
  })

  // NEGATIVE CONTROL: the page before X22 (a paragraph), headers without `scope`, and a table
  // with no caption are each named.
  it('sees a missing table, a header without scope and a missing caption', () => {
    expect(problemsWith('<p>It depends on the fabric.</p>')).toEqual(['no <table>'])
    expect(problemsWith(section.replace(/ scope="(?:row|col)"/g, ''))).toContain(
      'row 1 has no row header',
    )
    expect(problemsWith(section.replace(/<caption\b[\s\S]*?<\/caption>/, ''))).toContain(
      'no caption',
    )
  })
})

describe('a factory photo beside the words that name it (polish X22)', () => {
  for (const guide of GUIDES) {
    for (const section of guide.sections.filter((entry) => entry.photo)) {
      it(`${guide.path}: "${section.heading}" draws ${section.photo} under its heading`, () => {
        const html = sectionOf(render(guide), section.heading)
        const photo = FACTORY_PHOTOS.find((entry) => entry.slug === section.photo)
        if (!photo) throw new Error(`no factory photo "${section.photo}"`)
        // In the heading's half, so the words keep the other half (`.spread`).
        const head = /<div class="spread__head">([\s\S]*?)<\/div><div class="spread__body">/.exec(
          html,
        )?.[1]
        expect(head, 'the photo is not in the heading’s half').toMatch(/<h2\b[\s\S]*<figure\b/)
        const img = /<img\b[^>]*>/.exec(head ?? '')?.[0] ?? ''
        // Every width the photo has, the larger ones for sharp screens included (polish X16).
        const widths = factoryPhotoWidths(photo)
        expect(widths.length, 'no widths for the photo').toBeGreaterThanOrEqual(2)
        expect(img).toContain(`alt="${photo.alt}"`)
        expect(img).toContain(`src="/factory/${photo.slug}-${widths[0]}.webp"`)
        expect(img).toContain(
          `srcSet="${widths.map((width) => `/factory/${photo.slug}-${width}.webp ${width}w`).join(', ')}"`,
        )
        // The heading's half is `.about`'s half: the same grid, the same 64px gap (site.css).
        expect(img).toContain(`sizes="${HALF_COLUMN_SIZES}"`)
        expect(img).toMatch(/ width="\d+" height="\d+"/)
        // Lazy, except the first section's photo, which is fetched early (`priority`, below).
        expect(img).toContain(guide.sections[0] === section ? 'loading="eager"' : 'loading="lazy"')
        // No label under the photo (the owner, 2026-10-05: "remove all the image names").
        expect(head, 'the photo carries a label').not.toMatch(/<figcaption\b/)
        expect(head).not.toContain(`>${photo.caption}<`)
      })
    }
  }

  it('draws no photo in a section that names none', () => {
    const guide = guideAt('/guides/3d-garment-reference')
    expect(render(guide)).not.toContain('photo-figure')
  })
})

/**
 * A page's first-screen picture is not lazy (web.dev "Optimize Largest Contentful Paint", updated
 * 31 Mar 2025: "Never lazy-load your LCP image"; `fetchpriority="high"` on that one image only).
 * On a guide that is the photo of its FIRST section; every photo further down stays lazy, and a
 * second high-priority image would take bandwidth from the first.
 */
describe('a guide fetches its first spread’s photo early and no other (2026-10-24)', () => {
  /** Every factory figure's `<img>` on the page, as its loading and priority attributes. */
  const figuresIn = (html: string) =>
    [...html.matchAll(/<img\b[^>]*class="photo-figure__img[^>]*>/g)].map((match) => ({
      loading: /\bloading="([^"]*)"/.exec(match[0])?.[1],
      priority: /\bfetchpriority="([^"]*)"/i.exec(match[0])?.[1],
    }))

  /** Everything wrong with a guide's photo loading, as sentences. */
  function problemsWith(html: string, wantEarly: boolean): string[] {
    const figures = figuresIn(html)
    const problems: string[] = []
    const early = figures.filter((figure) => figure.loading === 'eager' || figure.priority)
    if (early.length !== (wantEarly ? 1 : 0)) {
      problems.push(`${early.length} early figures where ${wantEarly ? 1 : 0} were wanted`)
    }
    for (const figure of early) {
      if (figure.loading !== 'eager' || figure.priority !== 'high') {
        problems.push(`an early figure is loading=${figure.loading} priority=${figure.priority}`)
      }
    }
    for (const figure of figures.filter((entry) => !early.includes(entry))) {
      if (figure.loading !== 'lazy') problems.push(`a later figure is loading=${figure.loading}`)
    }
    return problems
  }

  const withPhotos = GUIDES.filter((guide) => guide.sections.some((section) => section.photo))

  it('has the five guides with photos to look at', () => {
    expect(withPhotos.map((guide) => guide.path)).toEqual([
      '/guides/minimum-order-and-samples',
      '/guides/garment-printing-methods',
      '/guides/sportswear-fabrics-and-weights',
      '/guides/private-label-packaging',
      '/guides/shipping-and-import-duties',
    ])
  })

  for (const guide of withPhotos) {
    const first = Boolean(guide.sections[0]?.photo)
    const rule = first
      ? 'its first section’s photo is eager and high, the rest lazy'
      : 'every photo is lazy (its photos start later)'
    it(`${guide.path}: ${rule}`, () => {
      const html = render(guide)
      expect(figuresIn(html).length, 'no figures were found, so nothing was measured').toBe(
        guide.sections.filter((section) => section.photo).length,
      )
      expect(problemsWith(html, first)).toEqual([])
    })
  }

  // NEGATIVE CONTROL, run both ways: the good page is clean, then a second priority image, a
  // lazy first photo and an eager photo without high priority are each named. Each plant is
  // asserted to have landed first.
  it('sees a second priority image, a lazy first photo and a missing priority', () => {
    const guide = guideAt('/guides/minimum-order-and-samples')
    const html = render(guide)
    expect(problemsWith(html, true)).toEqual([])
    // The same guide with a second photo, so there is a later figure to promote by mistake.
    const two: Guide = {
      ...guide,
      sections: guide.sections.map((section, index) =>
        index === 1 ? { ...section, photo: 'lab' } : section,
      ),
    }
    const twoHtml = render(two)
    expect(figuresIn(twoHtml)).toHaveLength(2)
    expect(problemsWith(twoHtml, true)).toEqual([])
    const second = twoHtml.replace(
      /(<img\b[^>]*)loading="lazy"/,
      '$1loading="eager" fetchPriority="high"',
    )
    expect(second, 'the planted second priority did not land').not.toBe(twoHtml)
    expect(problemsWith(second, true)).toContain('2 early figures where 1 were wanted')
    // React also hoists a preload `<link>` for the priority image, so edit the `<img>` only.
    const inImg = (page: string, edit: (img: string) => string) =>
      page.replace(/<img\b[^>]*photo-figure__img[^>]*>/, edit)
    const lazy = inImg(html, (img) =>
      img.replace('loading="eager"', 'loading="lazy"').replace(' fetchPriority="high"', ''),
    )
    expect(lazy, 'the planted lazy first photo did not land').not.toBe(html)
    expect(problemsWith(lazy, true)).toContain('0 early figures where 1 were wanted')
    const noPriority = inImg(html, (img) => img.replace(' fetchPriority="high"', ''))
    expect(noPriority, 'the planted missing priority did not land').not.toBe(html)
    expect(problemsWith(noPriority, true)).toContain(
      'an early figure is loading=eager priority=undefined',
    )
  })
})

/**
 * The links at the end of a guide (polish X22). The audit: "links to other guides and to product
 * families sit together in one cloud of 12 small 'filter' chips under the quote button". Now two
 * groups, each with its own heading, and every link that was there before is still there. A third,
 * "Answers" (the guide's FAQ topic, all the questions, the glossary), joined on 2026-10-07.
 */
describe('the end of a guide: three labelled groups, every link kept (polish X22, Task 3.4)', () => {
  const familyPaths = FAMILIES.flatMap((family) => familyPageFor(family)?.path ?? [])

  /** The `<nav>` named "More to read", its group headings, and each group's link targets. */
  function endOf(html: string) {
    const nav = /<nav class="see-also" aria-labelledby="more-to-read">([\s\S]*?)<\/nav>/.exec(
      html,
    )?.[1]
    if (!nav) return null
    const groups = [...nav.matchAll(/<h3\b[^>]*>([\s\S]*?)<\/h3>([\s\S]*?)<\/ul>/g)].map(
      (match) => ({
        title: text(match[1] ?? ''),
        hrefs: [...(match[2] ?? '').matchAll(/href="([^"]*)"/g)].map((href) => href[1] ?? ''),
      }),
    )
    return { groups, chips: /filter-chip/.test(nav), all: [...nav.matchAll(/href="/g)].length }
  }

  /** Everything wrong with one guide's end links, as sentences. */
  function problemsWith(guide: Guide, html: string): string[] {
    const end = endOf(html)
    if (!end) return ['no "More to read" navigation']
    const problems: string[] = []
    if (end.chips) problems.push('still drawn as filter chips')
    const titles = end.groups.map((group) => group.title)
    if (titles.join(' | ') !== 'Read next | What we make | Answers') {
      problems.push(`groups "${titles.join(' | ')}"`)
    }
    // 2–3 guides with reasons, then all of them (owner, 2026-10-08), where every guide was listed.
    const guides = [...(READ_NEXT[guide.path] ?? []), GUIDES_INDEX.path]
    if (end.groups[0]?.hrefs.join(' ') !== guides.join(' ')) {
      problems.push(`the guides group links ${end.groups[0]?.hrefs.join(' ')}`)
    }
    if (end.groups[1]?.hrefs.join(' ') !== familyPaths.join(' ')) {
      problems.push(`the families group links ${end.groups[1]?.hrefs.join(' ')}`)
    }
    const answers = [faqTopicForGuide(guide.path) ?? '(no topic)', '/faq', '/glossary']
    if (end.groups[2]?.hrefs.join(' ') !== answers.join(' ')) {
      problems.push(`the answers group links ${end.groups[2]?.hrefs.join(' ')}`)
    }
    if (end.all !== guides.length + familyPaths.length + answers.length) {
      problems.push(
        `${end.all} links where ${guides.length + familyPaths.length + answers.length} were`,
      )
    }
    return problems
  }

  for (const guide of GUIDES) {
    it(`${guide.path}: the other guides and the families, each under its heading`, () => {
      expect(familyPaths.length, 'no family pages to look for').toBeGreaterThan(0)
      expect(problemsWith(guide, render(guide))).toEqual([])
    })
  }

  // NEGATIVE CONTROL: the end of a guide before X22, one row of chips under one title.
  it('sees the old chip cloud', () => {
    const guide = guideAt('/guides/garment-printing-methods')
    const old = `<nav class="see-also" aria-labelledby="more-to-read"><p class="subhead" id="more-to-read">More to read</p><div class="filter-bar filter-bar--titles">${[
      ...GUIDES.filter((entry) => entry.path !== guide.path).map((entry) => entry.path),
      GUIDES_INDEX.path,
      ...familyPaths,
    ]
      .map((path) => `<a class="filter-chip" href="${path}">x</a>`)
      .join('')}</div></nav>`
    const problems = problemsWith(guide, old)
    expect(problems).toContain('still drawn as filter chips')
    expect(problems).toContain('groups ""')
  })
})

/**
 * 2026-10-08: each "Read next" guide carries its own approved description as the reason, and the
 * 3D, printing and fabrics guides link reference garments from the live catalogue, by plain
 * anchors to each garment's default colour; a garment the catalogue does not hold is left out.
 */
describe('read-next reasons and reference garments (2026-10-08)', () => {
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

  it('draws each read-next guide’s own description under its link', () => {
    const guide = guideAt('/guides/minimum-order-and-samples')
    const words = text(render(guide))
    for (const path of READ_NEXT[guide.path] ?? []) {
      expect(words).toContain(guideAt(path).description)
    }
  })

  it('links each pick the catalogue holds, to its default colour, with its type and what it shows', () => {
    const guide = guideAt('/guides/garment-printing-methods')
    const html = render(guide, [card('r-vpj'), card('r-au', { defaultColourSlug: 'bone' })])
    const section = sectionOf(html, 'Seen on our reference garments')
    expect(section).toContain('href="/products/r-vpj/wine"')
    expect(section).toContain('href="/products/r-au/bone"')
    expect(text(section)).toContain('Type r-vpj · Sublimation')
    // Not in the catalogue: left out, never linked dead.
    expect(section).not.toContain('r-mrp')
  })

  it('draws no garment section at all when none of its picks is in the catalogue', () => {
    const html = render(guideAt('/guides/garment-printing-methods'), [card('someone-else')])
    expect(html).not.toContain('Seen on our reference garments')
  })

  it('puts the garments right after the section the guide names', () => {
    const guide = guideAt('/guides/3d-garment-reference')
    const html = render(guide, [card('rxps'), card('r-ect'), card('r-pps')])
    const order = [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => text(m[1] ?? ''))
    expect(order.indexOf('Turn one now')).toBe(order.indexOf('How to use one') + 1)
  })
})

describe('the comparison guide’s sources (2026-10-08)', () => {
  it('draws every source as a link out, with its date under it', () => {
    const guide = guideAt('/guides/pakistan-vs-china-vs-turkey')
    const section = sectionOf(render(guide), 'Sources')
    for (const source of guide.sources ?? []) {
      expect(section).toContain(`href="${source.url.replace(/&/g, '&amp;')}"`)
      expect(section).toContain(`dateTime="${source.date}"`)
    }
    expect(text(section)).toContain('Read October 8, 2026')
  })

  it('draws no Sources section on a guide that quotes none', () => {
    expect(render(guideAt('/guides/minimum-order-and-samples'))).not.toContain('>Sources<')
  })
})

/*
 * The buyer library's page parts (2026-11-06): links inside the words, the owner's legal line, wide
 * tables stacked, and headings that keep their words whole. Each with a planted case that must fail.
 */
describe('the buyer library’s page parts (2026-11-06)', () => {
  const card = (
    slug: string,
    defaultColourSlug = 'black',
    over: Partial<ProductCard> = {},
  ): ProductCard =>
    ({
      slug,
      productName: `NAME ${slug}`,
      productCode: slug.toUpperCase(),
      category: 'Sportswear',
      garmentType: `Type ${slug}`,
      shortDescription: '',
      posterUrl: null,
      posterAlt: '',
      defaultColourSlug,
      colourNames: [],
      colours: [],
      updatedAt: null,
      ...over,
    }) as ProductCard

  it('links a phrase where it first appears, and leaves the words around it as they are', () => {
    const html = renderToStaticMarkup(
      createElement(LinkedWords, {
        text: 'Weight is in our fabrics guide; our fabrics guide has a table.',
        links: [{ phrase: 'our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' }],
      }),
    )
    expect(html.match(/<a /g)).toHaveLength(1)
    expect(html).toContain('href="/guides/sportswear-fabrics-and-weights"')
    expect(text(html)).toBe('Weight is in our fabrics guide; our fabrics guide has a table.')
  })

  it('links a garment to its default colour from the catalogue, and draws plain words without it', () => {
    const link = { phrase: 'Apex Flex Pullover', href: '/products/r-afp' }
    const words = 'Our Apex Flex Pullover is waffle.'
    const linked = renderToStaticMarkup(
      createElement(LinkedWords, { text: words, links: [link], cards: [card('r-afp', 'stone')] }),
    )
    expect(linked).toContain('href="/products/r-afp/stone"')
    const unlinked = renderToStaticMarkup(
      createElement(LinkedWords, { text: words, links: [link] }),
    )
    expect(unlinked).not.toContain('<a ')
    expect(text(unlinked)).toBe(words)
  })

  it('draws the owner’s legal line under a law section, and the fibers guide links its labels guide', () => {
    const html = render(guideAt('/guides/sportswear-compliance-by-market'))
    expect(html).toContain('class="guide-legal"')
    expect(text(html)).toContain(
      'Checked on 6 November 2026. Not legal or tax advice; confirm with your customs broker or adviser.',
    )
    expect(render(guideAt('/guides/sportswear-fibers'))).toContain('href="/guides/clothing-labels"')
  })

  it('stacks exactly the wide tables, all in the library’s new guides', () => {
    const stacked = GUIDES.flatMap((guide) =>
      guide.sections
        .flatMap((section) => section.blocks)
        .flatMap((block) =>
          block.kind === 'table' && isWideTable(block) ? [`${guide.path}: ${block.caption}`] : [],
        ),
    )
    expect(stacked).toEqual([
      '/guides/how-to-vet-a-clothing-manufacturer: What to ask for, and where to check it',
      '/guides/how-to-vet-a-clothing-manufacturer: The schemes side by side',
      '/guides/clothing-labels: What the label must carry, in five markets',
      '/guides/sportswear-fibers: What each fiber brings, and its cost next to polyester',
      '/guides/sportswear-fibers: The same fiber under US and EU names',
      '/guides/stitch-and-seam-types: Overlock and flatlock seams in published studies',
      '/guides/sportswear-compliance-by-market: Where each rule applies (read 6 November 2026)',
      '/guides/apparel-manufacturing-machinery: Machines on our floor, area by area',
      '/guides/apparel-design-software: Kinds of software, and the files they use',
      '/guides/apparel-manufacturing-technology: Eight changes, what each means for your order, and where we stand',
      // C7 (held): four columns, and a guide's name in the last one is a word of 14 letters.
      '/guides/what-sportswear-buyers-ask: Inquiries that asked about each topic',
    ])
    const html = render(guideAt('/guides/sportswear-compliance-by-market'))
    expect(html).toContain('class="guide-table guide-table--stack"')
    expect(html).toContain('data-label="European Union"')
    // The ball guide's tables stay tables, with no labels.
    expect(render(guideAt('/guides/how-soccer-balls-are-made'))).not.toContain('guide-table--stack')
  })

  // NEGATIVE CONTROL, run both ways: each reason to stack is seen, and a short table is left alone.
  it('stacks for a long cell or a long word with three columns, and never for two', () => {
    const table = (columns: string[], rows: string[][]) =>
      ({ kind: 'table', caption: 'x', columns, rows }) as const
    expect(isWideTable(table(['a', 'b', 'c'], [['x', 'y'.repeat(41), 'z']]))).toBe(true)
    expect(isWideTable(table(['a', 'b', 'c'], [['x', 'Polypropylene', 'z']]))).toBe(true)
    expect(isWideTable(table(['a', 'b', 'c'], [['Size 3', 'Under 7', '8 and under']]))).toBe(false)
    expect(isWideTable(table(['a', 'b'], [['x', 'y'.repeat(80)]]))).toBe(false)
  })

  it('keeps a hyphenated heading word whole, and fits a heading with a very long word', () => {
    const whole = renderToStaticMarkup(
      createElement(WholeWords, { text: 'What moisture-wicking means' }),
    )
    expect(whole).toBe('What <span class="whole-word">moisture-wicking</span> means')
    expect(renderToStaticMarkup(createElement(WholeWords, { text: 'Knit or woven' }))).toBe(
      'Knit or woven',
    )
    expect(longestWord('What moisture-wicking means')).toBe(16)
    const fitted = render(guideAt('/guides/apparel-manufacturing-technology'))
    expect(fitted).toContain('fit-heading')
    expect(fitted).toContain('--fit-letters:14')
    // A guide with no word that long carries neither.
    expect(longestWord(`${guideAt('/guides/garment-cutting').heading}`)).toBeLessThan(
      FIT_FROM_LETTERS,
    )
  })

  it('fits a heading by its widest word’s real width, not its letter count (TY-12, 6 Nov 2026)', () => {
    // "MEASUREMENTS" is 12 letters and 11.03em measured: two M's at 1.13em. At 12 "letters" of 0.9em
    // (10.8em) it split; its width with the 4% margin needs 12.75.
    expect(wordEm('measurements')).toBeCloseTo(11.03, 1)
    expect(fitLetters('Body measurements and garment measurements')).toBeGreaterThan(12.7)
    // NEGATIVE CONTROL: the rule that split it counted letters.
    expect(longestWord('Body measurements and garment measurements') * 0.9).toBeLessThan(
      wordEm('measurements'),
    )
    // A word of narrow letters never shrinks less than the letter count did.
    expect(fitLetters('specifications')).toBe(14)
    expect(fitLetters('What moisture-wicking means')).toBe(16)
    // An accented letter counts as its base letter; an unmeasured character as the widest, W.
    expect(wordEm('é')).toBeCloseTo(wordEm('e'), 5)
    expect(wordEm('þ')).toBeCloseTo(wordEm('w'), 5)
    // "ß" draws in capitals as "SS", as text-transform does, so it counts as two S's.
    expect(wordEm('ß')).toBeCloseTo(wordEm('ss'), 5)
    const fitted = render(guideAt('/guides/tech-pack-template'))
    expect(fitted).toContain(
      `--fit-letters:${fitLetters('Body measurements and garment measurements')}`,
    )
  })
})
