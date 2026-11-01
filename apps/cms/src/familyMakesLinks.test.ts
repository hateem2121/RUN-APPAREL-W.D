import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FamilyLanding } from './components/site/FamilyLanding'
import { FAMILIES } from './lib/families'
import { FAMILY_PAGES, makesHref } from './lib/familyPages'
import { EMPTY_FOOTER, type ProductCard, type PublicSiteSettings } from './lib/projectPublic'

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown }) =>
    createElement('a', { ...rest, href }, children as never),
}))

/**
 * The "What we make" lines open what they name (2026-10-29). PostHog, 26 and 27 Oct: one buyer on a
 * phone tapped "Sherpa fleece jackets." on the outerwear page three times over two visits; the words
 * were plain text, and the first visit reached the Pro-Pile Sherpa Jacket only by way of /products.
 * A line naming one garment now opens that garment; a line naming several jumps to the cards below.
 *
 * What would have to break for these to fail: a line goes back to plain text, a line links to a
 * garment the page does not list (unpublished, or moved family) instead of falling back, a link
 * opens a colour other than the garment's first one, or the list draws a jump to a `#garments`
 * section the page did not draw.
 */

const card = (slug: string, category: string, defaultColourSlug = 'first'): ProductCard => ({
  slug,
  productName: slug.toUpperCase(),
  productCode: slug.toUpperCase(),
  category,
  garmentType: '',
  shortDescription: '',
  posterUrl: null,
  posterAlt: '',
  defaultColourSlug,
  colourNames: [],
  colours: [],
  model: null,
  updatedAt: null,
})

const settings: PublicSiteSettings = {
  ...DEFAULT_SITE_SETTINGS,
  logoUrl: null,
  logoMimeType: null,
  footer: EMPTY_FOOTER,
  familyLists: {},
}

const pageAt = (path: string) => {
  const page = FAMILY_PAGES.find((entry) => entry.path === path)
  if (!page) throw new Error(`no family page at ${path}`)
  return page
}
const OUTERWEAR = pageAt('/custom-outerwear-manufacturer')
const familyName = (slug: string) => FAMILIES.find((entry) => entry.slug === slug)?.name ?? ''

/** The "What we make" section of a rendered buyer page. */
const makesSection = (products: ProductCard[]) => {
  const html = renderToStaticMarkup(
    createElement(FamilyLanding, { page: OUTERWEAR, products, settings }),
  )
  return (
    html.match(/<section[^>]*>(?:(?!<\/section>)[\s\S])*What we make[\s\S]*?<\/section>/)?.[0] ?? ''
  )
}

describe('a line naming one garment opens that garment', () => {
  it('"Sherpa fleece jackets." opens the Pro-Pile Sherpa Jacket in its first colour', () => {
    const outerwear = familyName('outerwear')
    const html = makesSection([card('r-alj', outerwear), card('r-pps', outerwear, 'maroon')])
    expect(html).toMatch(
      /<a class="makes-link" href="https:\/\/wear-run\.com\/products\/r-pps\/maroon"><h3[^>]*>Fleece<\/h3><p>Sherpa fleece jackets\.<\/p><\/a>/,
    )
  })

  it('falls back to the cards below when the page does not list that garment', () => {
    const html = makesSection([card('r-alj', familyName('outerwear'))])
    expect(html).not.toContain('/products/r-pps/')
    expect(html).toMatch(/<a class="makes-link" href="#garments"><h3[^>]*>Fleece<\/h3>/)
  })
})

describe('a line naming several garments jumps to the cards below', () => {
  it('"Softshell" jumps to #garments', () => {
    const html = makesSection([card('r-alj', familyName('outerwear'))])
    expect(html).toMatch(/<a class="makes-link" href="#garments"><h3[^>]*>Softshell<\/h3>/)
  })

  it('draws no link at all when the page draws no garments', () => {
    const html = makesSection([])
    expect(html).toContain('Sherpa fleece jackets.')
    expect(html).not.toContain('makes-link')
    expect(html).not.toContain('#garments')
  })
})

describe('every named garment belongs to its page’s family', () => {
  // A slug here is a promise the line names that garment; it must at least be a product code's
  // shape, and each line names one garment at most.
  for (const page of FAMILY_PAGES) {
    for (const entry of page.makes) {
      if (!entry.garment) continue
      it(`${page.path} "${entry.group}" names a garment slug`, () => {
        expect(entry.garment).toMatch(/^r-[a-z0-9-]+$/)
      })
    }
  }

  it('makesHref ignores a garment of another family', () => {
    const entry = { group: 'Fleece', garments: 'Sherpa fleece jackets.', garment: 'r-pps' }
    expect(
      makesHref(entry, [card('r-cch', familyName('casual-wear'))], 'https://wear-run.com/products'),
    ).toBe('#garments')
  })
})

/*
 * The accessory pages (2026-11-01). With the ball the only card, a jump from "Bags and backpacks"
 * would land on a ball, and "Your logo" names a choice, so those lines stay words.
 */
describe('a line with nothing on the page to open stays words', () => {
  const ball = card('kaizen', 'Sports Accessories')
  const lines = (path: string) =>
    pageAt(path).makes.map((entry) => [entry.group, makesHref(entry, [ball], '/products')])

  it('the accessories page links only its soccer ball line, to the ball page', () => {
    expect(lines('/custom-sports-accessories-manufacturer')).toEqual([
      ['Soccer balls', '/custom-soccer-ball-manufacturer'],
      ['Bags and backpacks', null],
      ['Caps and headwear', null],
      ['Socks and gloves', null],
    ])
  })

  it('the ball page links none of its choices', () => {
    for (const [group, href] of lines('/custom-soccer-ball-manufacturer')) {
      expect(href, String(group)).toBeNull()
    }
  })

  // NEGATIVE CONTROL: without `plain`, the same line would jump to the ball's card.
  it('sees a line that loses its plain mark', () => {
    expect(makesHref({ group: 'Bags', garments: 'Bags.' }, [ball], '/products')).toBe('#garments')
  })
})
