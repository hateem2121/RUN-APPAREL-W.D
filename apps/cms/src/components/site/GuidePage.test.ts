import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { stripUntilStable } from '../../../../../scripts/strip-until-stable.mjs'
import { describe, expect, it } from 'vitest'
import { FAMILIES } from '../../lib/families'
import { familyPageFor } from '../../lib/familyPages'
import { FACTORY_PHOTOS, factoryPhotoWidths } from '../../lib/factoryPhotos'
import { type Guide, GUIDES, GUIDES_INDEX, guideAt } from '../../lib/guides'
import { HALF_COLUMN_SIZES } from './FactoryFigure'
import { GuidePage } from './GuidePage'

/**
 * Polish X22 (audit of 3 October 2026): the guides were walls of text. What a visitor is given,
 * read as HTML: the printing guide's table, a factory photo beside the words that name it, and the
 * links at the end in two labelled groups instead of one cloud of chips under the quote button.
 *
 * The drawn half (a 320px phone, the photo in the left half on a computer, the groups side by side)
 * is `e2e/guides.spec.ts`.
 */

const render = (guide: Guide) => renderToStaticMarkup(createElement(GuidePage, { guide }))

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
        expect(img).toContain('loading="lazy"')
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
 * The links at the end of a guide (polish X22). The audit: "links to other guides and to product
 * families sit together in one cloud of 12 small 'filter' chips under the quote button". Now two
 * groups, each with its own heading, and every link that was there before is still there.
 */
describe('the end of a guide: two labelled groups, every link kept (polish X22)', () => {
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
    if (titles.join(' | ') !== 'Buyer guides | What we make') {
      problems.push(`groups "${titles.join(' | ')}"`)
    }
    const guides = [
      ...GUIDES.filter((entry) => entry.path !== guide.path).map((entry) => entry.path),
      GUIDES_INDEX.path,
    ]
    if (end.groups[0]?.hrefs.join(' ') !== guides.join(' ')) {
      problems.push(`the guides group links ${end.groups[0]?.hrefs.join(' ')}`)
    }
    if (end.groups[1]?.hrefs.join(' ') !== familyPaths.join(' ')) {
      problems.push(`the families group links ${end.groups[1]?.hrefs.join(' ')}`)
    }
    if (end.all !== guides.length + familyPaths.length) {
      problems.push(`${end.all} links where ${guides.length + familyPaths.length} were`)
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
