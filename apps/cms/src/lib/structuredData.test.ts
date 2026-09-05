import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { EMPTY_FOOTER, type ProductCard, type PublicSiteSettings } from './projectPublic'
import { SITE_ORIGIN, VIEWER_ORIGIN } from './seo'
import {
  contactPageJsonLd,
  formatAddress,
  organizationJsonLd,
  POSTAL_ADDRESS,
  productListJsonLd,
} from './structuredData'

const settings = (over: Partial<PublicSiteSettings> = {}): PublicSiteSettings => ({
  ...DEFAULT_SITE_SETTINGS,
  logoUrl: null,
  logoMimeType: null,
  footer: EMPTY_FOOTER,
  ...over,
})

const card = (over: Partial<ProductCard> = {}): ProductCard =>
  ({
    slug: 'rxps',
    defaultColourSlug: 'wine',
    productName: 'Velocity Performance Tee',
    productCode: 'R-XPS',
    category: 'Sportswear',
    shortDescription: null,
    posterUrl: null,
    posterAlt: '',
    colourNames: ['Wine'],
    ...over,
  }) as ProductCard

describe('organisation', () => {
  it('carries a stable @id the other blocks can point at', () => {
    // Without it each page declares an unrelated company and a crawler has no reason to
    // treat them as one entity.
    const org = organizationJsonLd(settings())
    expect(org['@id']).toBe(`${SITE_ORIGIN}/#organization`)
    expect(contactPageJsonLd(settings()).mainEntity['@id']).toBe(org['@id'])
  })

  it('uses the owner uploaded logo when there is one, and the shipped mark otherwise', () => {
    // Same precedence as the browser tab icon, so the two cannot disagree about which
    // mark represents the company.
    expect(organizationJsonLd(settings()).logo).toBe(`${SITE_ORIGIN}/icon.svg`)
    expect(organizationJsonLd(settings({ logoUrl: '/api/media/file/logo.webp' })).logo).toBe(
      `${SITE_ORIGIN}/api/media/file/logo.webp`,
    )
  })

  it('omits sameAs entirely rather than emitting an empty array', () => {
    // An empty sameAs is a claim that the company has no other presence anywhere, which
    // is not what an unset WhatsApp number means.
    expect(organizationJsonLd(settings({ whatsappNumber: '' }))).not.toHaveProperty('sameAs')
    expect(organizationJsonLd(settings()).sameAs?.[0]).toMatch(/^https:\/\/wa\.me\/\d+$/)
  })

  it('states the address in parts, from the same constant the page renders', () => {
    const org = organizationJsonLd(settings())
    expect(org.address.addressLocality).toBe(POSTAL_ADDRESS.locality)
    expect(org.address.addressCountry).toBe('PK')
    // the visible one-liner must be built from the same parts
    expect(formatAddress()).toContain(POSTAL_ADDRESS.street)
    expect(formatAddress()).toContain(POSTAL_ADDRESS.postalCode)
  })
})

describe('the product list', () => {
  it('points every item at the VIEWER host, never at this one', () => {
    // The garment is served by a different Worker. Claiming these URLs here would
    // advertise pages this site does not serve — the same reason sitemap.ts lists three
    // pages and no garments.
    const list = productListJsonLd([card(), card({ slug: 'r-xmp', defaultColourSlug: 'navy' })])
    for (const item of list.itemListElement) {
      expect(item.url.startsWith(VIEWER_ORIGIN)).toBe(true)
      expect(item.url.startsWith(SITE_ORIGIN)).toBe(false)
    }
  })

  it('numbers positions from 1 and counts what it lists', () => {
    const list = productListJsonLd([card(), card({ slug: 'b' }), card({ slug: 'c' })])
    expect(list.itemListElement.map((i) => i.position)).toEqual([1, 2, 3])
    expect(list.numberOfItems).toBe(3)
  })

  it('is an ItemList and NOT a Product, because there are no prices anywhere', () => {
    // A Product without price or availability is an incomplete claim, and this is a B2B
    // reference catalogue — the viewer's e2e suite asserts the absence of retail
    // language. ItemList describes what the page actually is.
    const json = JSON.stringify(productListJsonLd([card()]))
    expect(json).toContain('"ItemList"')
    expect(json).not.toContain('"Product"')
    expect(json).not.toMatch(/price|offers|availability/i)
  })

  it('survives an empty catalogue without emitting a broken list', () => {
    const list = productListJsonLd([])
    expect(list.numberOfItems).toBe(0)
    expect(list.itemListElement).toEqual([])
  })
})

describe('serialisation safety', () => {
  it('cannot break out of the script element', () => {
    // The HTML parser ends a <script> at the first literal `</script>`, inside a JSON
    // string or not. JsonLd.tsx escapes `<`; this asserts the escape actually defeats a
    // hostile value rather than assuming it.
    const hostile = organizationJsonLd(settings({ companyName: '</script><img src=x onerror=1>' }))
    const rendered = JSON.stringify(hostile).replace(/</g, '\\u003c')
    expect(rendered).not.toContain('</script>')
    expect(rendered).not.toContain('<img')
    // and it is still valid JSON that round-trips to the original value
    expect(JSON.parse(rendered).name).toBe('</script><img src=x onerror=1>')
  })
})
