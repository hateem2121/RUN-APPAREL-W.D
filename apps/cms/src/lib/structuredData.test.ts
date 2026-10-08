import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { BYLINES } from './bylines'
import { CALL_NUMBER, PARENT_COMPANY } from './companyFacts'
import { GUIDES } from './guides'
import { EMPTY_FOOTER, type ProductCard, type PublicSiteSettings } from './projectPublic'
import { GARMENT_PAGES, SITE_NAME, SITE_ORIGIN } from './seo'
import { shareCardFor, shareImageUrl } from './shareImages'
import {
  articleJsonLd,
  blogJsonLd,
  blogPostingJsonLd,
  breadcrumbTrailJsonLd,
  caseStudiesJsonLd,
  contactPageJsonLd,
  formatAddress,
  guideArticleJsonLd,
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
    expect(organizationJsonLd(settings()).image).toBe(`${SITE_ORIGIN}/share/home.jpg?v=2`)
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
    // is not what an empty footer list means.
    expect(organizationJsonLd(settings())).not.toHaveProperty('sameAs')
  })

  /*
   * 2026-10-08: Google's Organization guide (updated 2026-09-08) defines sameAs as a page on
   * another website with more about the company. A wa.me chat link is not one; the number is
   * in `telephone` instead.
   */
  it('never lists the WhatsApp chat link as a profile', () => {
    const org = organizationJsonLd(
      settings({
        footer: {
          ...EMPTY_FOOTER,
          socialLinks: [{ label: 'LinkedIn', url: 'https://www.linkedin.com/company/x' }],
        },
      }),
    )
    expect(JSON.stringify(org.sameAs)).not.toContain('wa.me')
  })

  /*
   * 2026-09-30: measured live, `sameAs` held the WhatsApp link and nothing else, while the
   * footer of the same page linked the company's LinkedIn and Instagram. Those links are
   * how a search engine ties the website to the company's other profiles. They come from
   * the one list the footer prints (`footer.socialLinks`), so the two cannot disagree.
   */
  it('names every profile the footer links, in order and without repeats', () => {
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

  /*
   * Owner, 2026-10-08: the site's name, the registered name, and the short form the pages print.
   * Google's Organization guide asks for the same name and alternateName as the site name.
   */
  it('is named as the site is, with the registered name and the short form beside it', () => {
    const org = organizationJsonLd(settings({ companyName: 'RUN APPAREL (PVT) LTD' }))
    expect(org.name).toBe('RUN APPAREL')
    expect(org.name).toBe(SITE_NAME)
    expect(org.legalName).toBe('RUN APPAREL (PRIVATE) LIMITED')
    expect(org.alternateName).toEqual(['RUN APPAREL (PVT) LTD', 'RUN APPAREL (PRIVATE) LIMITED'])
    expect(websiteJsonLd(settings({ companyName: 'RUN APPAREL (PVT) LTD' })).alternateName).toEqual(
      org.alternateName,
    )
  })

  it('never repeats the site name as an alternate name', () => {
    const org = organizationJsonLd(settings({ companyName: 'RUN APPAREL' }))
    expect(org.alternateName).toEqual(['RUN APPAREL (PRIVATE) LIMITED'])
  })

  /*
   * Both numbers, and only numbers the Contact page shows: Google's structured-data policy
   * (updated 2026-07-10) says not to mark up what a visitor cannot see.
   */
  it('gives both phone numbers, the WhatsApp one first', () => {
    const org = organizationJsonLd(settings({ whatsappNumber: '+92 336 1777313' }))
    expect(org.telephone).toEqual(['+92 336 1777313', CALL_NUMBER])
    expect(CALL_NUMBER).toBe('+92 305 6161313')
  })

  it('drops the WhatsApp number when the CMS has none, and keeps the call line', () => {
    expect(organizationJsonLd(settings({ whatsappNumber: '' })).telephone).toEqual([CALL_NUMBER])
  })

  it('claims no number the Contact page does not show', () => {
    // The call line is a constant the page must render; the WhatsApp number is the CMS value
    // the page renders through formatPhoneForDisplay. Remove either from the page and the
    // structured data would describe a number nobody can see.
    const page = readFileSync(
      fileURLToPath(new URL('../app/(frontend)/contact/page.tsx', import.meta.url)),
      'utf8',
    )
    expect(page).toContain('{CALL_NUMBER}')
    expect(page).toContain('href={telHref(CALL_NUMBER)}')
    expect(page).toContain('{formatPhoneForDisplay(settings.whatsappNumber)}')
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
  it('is a WebSite node for the home page, named as the title and og:site_name name it', () => {
    const site = websiteJsonLd(settings())
    expect(site['@type']).toBe('WebSite')
    expect(site.name).toBe(SITE_NAME)
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
    expect(JSON.parse(rendered).alternateName[0]).toBe('</script><img src=x onerror=1>')
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
      author: { '@type': 'Organization', '@id': `${SITE_ORIGIN}/#organization`, name: SITE_NAME },
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

/**
 * The buyer guides as Articles (findability audit, 2026-10-08), from the facts their bylines print
 * (`bylines.ts`). Google's Article guide (updated 2026-09-08): only a name in `author.name`, a
 * Person for a person and an Organization for an organisation. A role names no person, so a
 * guide signed by a role is the company's.
 */
describe('a buyer guide’s Article data', () => {
  const guide = (path: string) => {
    const found = GUIDES.find((entry) => entry.path === path)
    if (!found) throw new Error(path)
    return found
  }

  it('is by the person when the byline names one', () => {
    const data = guideArticleJsonLd(guide('/guides/3d-garment-reference'))
    expect(data.author).toEqual({ '@type': 'Person', name: 'M. Hateem Jamshaid' })
  })

  it('is the company’s when the byline is a role, never a role written as a name', () => {
    const data = guideArticleJsonLd(guide('/guides/minimum-order-and-samples'))
    expect(data.author).toEqual({
      '@type': 'Organization',
      '@id': `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      url: SITE_ORIGIN,
    })
    expect(JSON.stringify(data)).not.toContain('Merchandiser')
  })

  it('dates and pictures every guide from its byline and its own share card', () => {
    for (const entry of GUIDES) {
      const data = guideArticleJsonLd(entry)
      expect(data['@type']).toBe('Article')
      expect(data.headline).toBe(entry.title)
      expect(data.datePublished).toBe(BYLINES[entry.path]?.published)
      expect(data.dateModified).toBe(BYLINES[entry.path]?.changed.on)
      expect(data.image?.[0]?.url).toBe(shareImageUrl(shareCardFor(entry.path), SITE_ORIGIN))
    }
  })
})
