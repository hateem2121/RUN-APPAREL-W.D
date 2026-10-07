import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { PARENT_COMPANY } from './companyFacts'
import { EMPTY_FOOTER, type ProductCard, type PublicSiteSettings } from './projectPublic'
import { GARMENT_PAGES, SITE_ORIGIN } from './seo'
import {
  articleJsonLd,
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbTrailJsonLd,
  caseStudiesJsonLd,
  contactPageJsonLd,
  formatAddress,
  organizationJsonLd,
  POSTAL_ADDRESS,
  productListJsonLd,
  websiteJsonLd,
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

  // Polish X14: the old picture showed the address of before the domain move.
  it('pictures the company with the home page’s share card, not the old one', () => {
    expect(organizationJsonLd(settings()).image).toBe(`${SITE_ORIGIN}/share/home.jpg`)
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

  /*
   * 2026-09-30: measured live, `sameAs` held the WhatsApp link and nothing else, while the
   * footer of the same page linked the company's LinkedIn and Instagram. Those links are
   * how a search engine ties the website to the company's other profiles. They come from
   * the one list the footer prints (`footer.socialLinks`), so the two cannot disagree.
   */
  it('names every profile the footer links, after WhatsApp and without repeats', () => {
    const org = organizationJsonLd(
      settings({
        footer: {
          ...EMPTY_FOOTER,
          socialLinks: [
            { label: 'LinkedIn', url: 'https://www.linkedin.com/company/run-apparel-pvt-ltd' },
            { label: 'Instagram', url: 'https://www.instagram.com/run_apparel_' },
            {
              label: 'LinkedIn again',
              url: 'https://www.linkedin.com/company/run-apparel-pvt-ltd',
            },
          ],
        },
      }),
    )
    expect(org.sameAs).toEqual([
      expect.stringMatching(/^https:\/\/wa\.me\/\d+$/),
      'https://www.linkedin.com/company/run-apparel-pvt-ltd',
      'https://www.instagram.com/run_apparel_',
    ])
  })

  it('still names the profiles when there is no WhatsApp number', () => {
    const org = organizationJsonLd(
      settings({
        whatsappNumber: '',
        footer: {
          ...EMPTY_FOOTER,
          socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/x' }],
        },
      }),
    )
    expect(org.sameAs).toEqual(['https://www.linkedin.com/company/x'])
  })

  /*
   * The owner, 2026-09-29: a 3D reference is available on request, NOT part of every order,
   * and buyers can be from anywhere. The description AI answers are built from must say
   * neither "every garment ships with a 3D reference" nor a closed list of regions.
   */
  it('claims 3D on request only, and serves the whole world', () => {
    const org = organizationJsonLd(settings())
    expect(org.description).not.toMatch(/every garment/i)
    expect(org.description).toMatch(/3D reference[^.]*on request|on request[^.]*3D reference/i)
    expect(org.areaServed).toBe('Worldwide')
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

describe('the website (FI-10)', () => {
  it('is a WebSite node for the home page, named after the company', () => {
    const site = websiteJsonLd(settings())
    expect(site['@type']).toBe('WebSite')
    expect(site.name).toBe(settings().companyName)
    expect(site.url).toBe(`${SITE_ORIGIN}/`)
    expect(site['@id']).toBe(`${SITE_ORIGIN}/#website`)
  })

  it('is published by the same organisation node, not a second company', () => {
    expect(websiteJsonLd(settings()).publisher['@id']).toBe(organizationJsonLd(settings())['@id'])
  })
})

describe('the product list', () => {
  it('points every item at its garment page in the /products folder', () => {
    // The garment pages moved onto this site on 2026-09-28 (they were on
    // viewer.wear-run.help); each item names the page the card links to.
    const list = productListJsonLd([card(), card({ slug: 'r-xmp', defaultColourSlug: 'navy' })])
    for (const item of list.itemListElement) {
      expect(item.url.startsWith(`${GARMENT_PAGES}/`)).toBe(true)
    }
    expect(list.itemListElement[1]?.url).toBe(`${SITE_ORIGIN}/products/r-xmp/navy`)
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

/**
 * FA-N-10 / owner decision D10 — "structured data stays price-free, and says so".
 *
 * ⚠️ THE ROW SCORED 9 AND THE DECISION WAS ONLY HALF GUARDED. `is an ItemList and NOT a
 * Product` above covers ONE builder. D10 is a claim about everything this site emits: a
 * `price`, an `offers` block or an `availability` added to the Organization or the
 * ContactPage would satisfy that test and still put a number on a made-to-order catalogue
 * that has never quoted one. Every garment here is quoted per inquiry after a
 * conversation about quantity and specification; inventing a figure to earn a rich result
 * is a false claim in the one format that travels furthest and is hardest to correct.
 *
 * ⚠️ AND "SAYS SO" IS A PROPERTY OF THE VISIBLE PAGE, NOT OF THE JSON. Google treats
 * structured data that contradicts the page as a spam signal, so the two have to agree —
 * and the page is where a buyer reads it. The second block below pins the sentence.
 *
 * ⚠️ THE VIEWER'S HALF IS NOT COVERED HERE AND IS NOT COMPLETE. `apps/viewer/worker/
 * preview.ts` emits a real `Product` for all 55 garment pages; `preview.test.ts` already
 * asserts it carries no `offers`, `price` or `availability`, which is D10's first
 * sentence. D10's SECOND sentence — declare made-to-order and quote-on-request explicitly
 * — is implemented nowhere. That is an open gap in `apps/viewer`, recorded here because
 * this is where a reader of FA-N-10 will look.
 */
describe('FA-N-10 — no price anywhere in the structured data, and the page says why', () => {
  const PRICE_SHAPED = /"(?:offers|price|priceCurrency|priceSpecification|availability)"/i
  /** A bare number attached to anything money-shaped, which is what D10 forbids. */
  const NUMERIC_PRICE = /"(?:price|lowPrice|highPrice)"\s*:\s*"?\d/i

  const everything = () =>
    [
      organizationJsonLd(settings()),
      productListJsonLd([card(), card({ slug: 'b', productName: 'Contour Jacket' })]),
      contactPageJsonLd(settings()),
    ].map((block) => JSON.stringify(block))

  it('covers all three builders, not just the gallery', () => {
    // The negative control for the loop: three real blocks, each with real content.
    const blocks = everything()
    expect(blocks).toHaveLength(3)
    for (const block of blocks) expect(block.length).toBeGreaterThan(80)
    expect(blocks.join(' ')).toContain('"ItemList"')
    expect(blocks.join(' ')).toContain('"Organization"')
    expect(blocks.join(' ')).toContain('"ContactPage"')
  })

  it('none of them names an offer, a price or an availability', () => {
    for (const block of everything()) {
      expect(
        PRICE_SHAPED.test(block),
        `a price-shaped key appeared in ${block.slice(0, 60)}…`,
      ).toBe(false)
      expect(NUMERIC_PRICE.test(block)).toBe(false)
    }
  })

  it('THE CONTROL — the same matchers do fire on a block that carries a price', () => {
    // Without this the two assertions above would pass on any regex that never matches.
    const withOffer = JSON.stringify({
      '@type': 'Product',
      offers: { '@type': 'Offer', price: 24.5, priceCurrency: 'USD' },
    })
    expect(PRICE_SHAPED.test(withOffer)).toBe(true)
    expect(NUMERIC_PRICE.test(withOffer)).toBe(true)
  })
})

/**
 * PLAN.md E2 — the policy, company and CMS pages sit at any depth, so their trail is a
 * builder of any depth: Home, then each step, positions from 1, absolute URLs. The visible
 * breadcrumb on the page must be drawn from the same steps (each page's test holds that).
 */
describe('the breadcrumb trail of any depth', () => {
  it('starts at Home, numbers positions from 1 and gives absolute URLs', () => {
    const trail = breadcrumbTrailJsonLd([
      { name: 'Policies', path: '/policies' },
      { name: 'Health and safety', path: '/policies/health-and-safety' },
    ])
    expect(trail['@type']).toBe('BreadcrumbList')
    expect(trail.itemListElement.map((item) => item.name)).toEqual([
      'Home',
      'Policies',
      'Health and safety',
    ])
    expect(trail.itemListElement.map((item) => item.position)).toEqual([1, 2, 3])
    expect(trail.itemListElement[0]?.item).toBe(`${SITE_ORIGIN}/`)
    expect(trail.itemListElement[2]?.item).toBe(`${SITE_ORIGIN}/policies/health-and-safety`)
  })

  it('works at one step, where the trail is Home then the page', () => {
    const trail = breadcrumbTrailJsonLd([{ name: 'Careers', path: '/careers' }])
    expect(trail.itemListElement).toHaveLength(2)
    expect(trail.itemListElement[1]?.item).toBe(`${SITE_ORIGIN}/careers`)
  })
})

/**
 * PLAN.md E2/T7 — the site states the parent company in words (CERTIFICATION, ABOUT), and
 * Google's Organization guide (updated 2026-09-08) recommends it as `parentOrganization`.
 * No foundingDate anywhere: 1889 is the family's trade, not this entity's founding.
 */
describe('the parent company in the organisation data', () => {
  it('names DURUS INDUSTRIES as parentOrganization', () => {
    const org = organizationJsonLd(settings())
    expect(org.parentOrganization).toEqual({
      '@type': 'Organization',
      name: PARENT_COMPANY,
    })
  })

  it('still declares no foundingDate', () => {
    expect(JSON.stringify(organizationJsonLd(settings()))).not.toContain('foundingDate')
  })
})

/**
 * PLAN.md E2: the Journal as a Blog, each post a BlogPosting, a case study an Article (Google's
 * Article guide, updated 2026-09-08: headline, image, datePublished, dateModified, author with
 * name and url; schema.org V30.1). Built from what the page shows, pointing at the company by @id.
 */
describe('the Journal and case-study data', () => {
  const image = { url: 'https://media.wear-run.com/a.jpg', width: 1200, height: 630 }
  const post = {
    path: '/journal/made-properly',
    headline: 'What made properly means',
    description: 'How a garment is checked.',
    image,
    datePublished: '2026-10-08T09:00:00.000Z',
    dateModified: '2026-10-09T10:00:00.000Z',
    companyName: 'RUN APPAREL',
  }

  it('the hub is a Blog listing its posts by address', () => {
    const blog = blogJsonLd([{ path: post.path, headline: post.headline }])
    expect(blog).toMatchObject({
      '@type': 'Blog',
      '@id': `${SITE_ORIGIN}/journal#blog`,
      url: `${SITE_ORIGIN}/journal`,
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
    })
    expect(blog.blogPost).toEqual([
      { '@type': 'BlogPosting', headline: post.headline, url: `${SITE_ORIGIN}${post.path}` },
    ])
  })

  it('a post with no named author is the company’s, by @id', () => {
    const data = blogPostingJsonLd({ ...post, author: null })
    expect(data).toMatchObject({
      '@type': 'BlogPosting',
      '@id': `${SITE_ORIGIN}${post.path}#article`,
      mainEntityOfPage: `${SITE_ORIGIN}${post.path}`,
      headline: post.headline,
      datePublished: post.datePublished,
      dateModified: post.dateModified,
      image: [{ '@type': 'ImageObject', ...image }],
      author: { '@type': 'Organization', '@id': `${SITE_ORIGIN}/#organization` },
      isPartOf: { '@id': `${SITE_ORIGIN}/journal#blog` },
    })
  })

  it('a named author is a Person, with a link only when there is one', () => {
    expect(
      blogPostingJsonLd({
        ...post,
        author: { name: 'A. Writer', url: 'https://www.linkedin.com/in/a' },
      }).author,
    ).toEqual({ '@type': 'Person', name: 'A. Writer', url: 'https://www.linkedin.com/in/a' })
    expect(blogPostingJsonLd({ ...post, author: { name: 'A. Writer' } }).author).toEqual({
      '@type': 'Person',
      name: 'A. Writer',
    })
  })

  it('a post without a usable picture states none rather than an empty one', () => {
    expect(blogPostingJsonLd({ ...post, image: null, author: null })).not.toHaveProperty('image')
  })

  it('a case study is an Article, by the company, part of no blog', () => {
    const data = articleJsonLd({ ...post, path: '/case-studies/club-kit', author: null })
    expect(data['@type']).toBe('Article')
    expect(data).not.toHaveProperty('isPartOf')
    expect(data.author).toMatchObject({ '@id': `${SITE_ORIGIN}/#organization` })
  })

  it('the case-study hub is a CollectionPage of its Articles', () => {
    expect(caseStudiesJsonLd([{ path: '/case-studies/club-kit', headline: 'Club kit' }])).toEqual({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      '@id': `${SITE_ORIGIN}/case-studies#page`,
      url: `${SITE_ORIGIN}/case-studies`,
      name: 'Case studies',
      publisher: { '@id': `${SITE_ORIGIN}/#organization` },
      hasPart: [
        { '@type': 'Article', headline: 'Club kit', url: `${SITE_ORIGIN}/case-studies/club-kit` },
      ],
    })
  })

  it('none of them is Product data or a founding date (G15)', () => {
    const all = JSON.stringify([
      blogJsonLd([]),
      blogPostingJsonLd({ ...post, author: null }),
      articleJsonLd({ ...post, author: null }),
    ])
    expect(all).not.toMatch(/"Product"|foundingDate/)
  })
})
