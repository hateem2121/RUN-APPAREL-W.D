import { beforeEach, describe, expect, it, vi } from 'vitest'

// `vi.hoisted`, not a bare `const`: vi.mock's factory is hoisted above module scope, so
// a plain `const getCloudflareContext = vi.fn()` is in its temporal dead zone when the
// factory runs ("Cannot access 'getCloudflareContext' before initialization").
const { getCloudflareContext } = vi.hoisted(() => ({ getCloudflareContext: vi.fn() }))
vi.mock('@opennextjs/cloudflare', () => ({ getCloudflareContext }))

import { parseSearchVisibility, robotsFor, searchVisibility, sitemapFor } from './searchVisibility'

/**
 * The switch that keeps a beta out of search engines. Owner decision 2026-09-06: a
 * deploy-time setting, not an admin field, and hidden until the owner calls it final.
 *
 * ⚠️ FAILS CLOSED. Every branch here is a way the site could become indexable by
 * accident — a missing var, a typo, a wrong case — and every one must resolve to hidden.
 */
describe('parseSearchVisibility', () => {
  it.each([undefined, null, '', 'hidden', 'HIDDEN', 'Visible', 'visible ', 'true', 1])(
    'treats %j as hidden',
    (raw) => {
      expect(parseSearchVisibility(raw)).toBe('hidden')
    },
  )

  it('opens only on the exact word', () => {
    expect(parseSearchVisibility('visible')).toBe('visible')
  })
})

describe('searchVisibility reads the Worker first, then the process, then fails closed', () => {
  beforeEach(() => {
    getCloudflareContext.mockReset()
    delete process.env.SITE_INDEXING
  })

  it('takes the Worker binding when there is one', async () => {
    getCloudflareContext.mockResolvedValue({ env: { SITE_INDEXING: 'visible' } })
    process.env.SITE_INDEXING = 'hidden'
    expect(await searchVisibility()).toBe('visible')
  })

  it('falls back to the process when there is no Worker context (next start, tests)', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    process.env.SITE_INDEXING = 'visible'
    expect(await searchVisibility()).toBe('visible')
  })

  it('is hidden when nothing says otherwise', async () => {
    getCloudflareContext.mockRejectedValue(new Error('no cloudflare context'))
    expect(await searchVisibility()).toBe('hidden')
  })
})

/**
 * A garment's entry, whatever comes before it. These tests used to skip "the first five";
 * the buyer pages joined the list on 2026-09-30, and a count like that breaks on every page
 * added.
 */
const isGarment = (url: string): boolean => url.includes('/products/')

describe('what the switch does', () => {
  it('hidden means noindex; visible means the layout declares nothing', () => {
    // `undefined`, not `{ index: true }`: declaring index in the layout broke the 404's
    // own noindex after hydration (measured 2026-09-05, recorded in layout.tsx).
    expect(robotsFor('hidden')).toEqual({ index: false })
    expect(robotsFor('visible')).toBeUndefined()
  })

  it('hidden means an empty sitemap; visible lists the site pages on the given origin', () => {
    expect(sitemapFor('hidden', 'https://wear-run.com')).toEqual([])
    expect(sitemapFor('visible', 'https://wear-run.com').map((e) => e.url)).toEqual([
      'https://wear-run.com',
      'https://wear-run.com/products',
      'https://wear-run.com/custom-teamwear-manufacturer',
      'https://wear-run.com/custom-activewear-manufacturer',
      'https://wear-run.com/custom-outerwear-manufacturer',
      'https://wear-run.com/private-label-casual-wear-manufacturer',
      'https://wear-run.com/guides',
      'https://wear-run.com/guides/how-a-private-label-order-works',
      'https://wear-run.com/guides/3d-garment-reference',
      'https://wear-run.com/guides/minimum-order-and-samples',
      'https://wear-run.com/guides/garment-printing-methods',
      'https://wear-run.com/guides/sportswear-fabrics-and-weights',
      'https://wear-run.com/guides/private-label-packaging',
      'https://wear-run.com/guides/shipping-and-import-duties',
      'https://wear-run.com/policies',
      'https://wear-run.com/policies/workplace-conduct',
      'https://wear-run.com/policies/health-and-safety',
      'https://wear-run.com/policies/health-and-vaccination',
      'https://wear-run.com/policies/equal-opportunity',
      'https://wear-run.com/policies/labor-rights',
      'https://wear-run.com/policies/quality',
      'https://wear-run.com/policies/environmental',
      'https://wear-run.com/careers',
      'https://wear-run.com/community',
      'https://wear-run.com/faq',
      'https://wear-run.com/faq/orders-and-samples',
      'https://wear-run.com/faq/quality-and-certifications',
      'https://wear-run.com/faq/shipping-and-importing',
      'https://wear-run.com/faq/fabrics-and-printing',
      'https://wear-run.com/glossary',
      'https://wear-run.com/contact',
      'https://wear-run.com/privacy',
      'https://wear-run.com/terms',
    ])
  })

  /**
   * THE GARMENTS JOINED THE SITEMAP ON 2026-09-28, when they moved onto the site's own
   * host at /products/<product>/<colour>. Until then they lived on viewer.wear-run.help,
   * and a sitemap may only speak for the host that serves it. One entry per colour, in the
   * catalogue's own order — each colour page is its own canonical URL (the viewer Worker
   * writes it) — and never the colourless /products/<product>, which is the default
   * colour's page under a second address.
   */
  it('lists every colour of every garment when visible, and none when hidden', () => {
    const garments = [
      { slug: 'rxps', colours: [{ slug: 'wine' }, { slug: 'navy' }] },
      { slug: 'r-xmp', colours: [{ slug: 'black' }] },
    ]
    expect(sitemapFor('hidden', 'https://wear-run.com', garments)).toEqual([])
    expect(
      sitemapFor('visible', 'https://wear-run.com', garments)
        .map((e) => e.url)
        .filter(isGarment),
    ).toEqual([
      'https://wear-run.com/products/rxps/wine',
      'https://wear-run.com/products/rxps/navy',
      'https://wear-run.com/products/r-xmp/black',
    ])
  })

  /*
   * 2026-09-30: what Google actually reads in a sitemap. It ignores `changefreq` and
   * `priority` (its own documentation says so) and uses `lastmod`, and an image entry is how
   * it finds a picture the page only draws with JavaScript, which is every garment picture.
   * Measured live that day: 205 garment pages listed, 0 dates, 0 pictures.
   */
  it('gives each garment colour its own picture and the date the garment last changed', () => {
    const garments = [
      {
        slug: 'rxps',
        updatedAt: '2026-09-28T10:15:00.000Z',
        colours: [
          { slug: 'wine', image: { url: 'https://media.wear-run.com/rxps-wine-render.webp' } },
          { slug: 'navy', image: null },
        ],
      },
    ]
    const [wine, navy] = sitemapFor('visible', 'https://wear-run.com', garments).filter((e) =>
      isGarment(e.url),
    )
    expect(wine?.images).toEqual(['https://media.wear-run.com/rxps-wine-render.webp'])
    expect(wine?.lastModified).toEqual(new Date('2026-09-28T10:15:00.000Z'))
    // A colour with no picture lists none, rather than borrowing another colour's.
    expect(navy).not.toHaveProperty('images')
    expect(navy?.lastModified).toEqual(new Date('2026-09-28T10:15:00.000Z'))
  })

  /*
   * ⚠️ A DATE NOBODY UPDATES IS WORSE THAN NONE (the rule this file has carried since the
   * sitemap was written), so a date appears ONLY when the database supplied a real one. A
   * missing or malformed value must produce no `lastModified` at all, never "now": a sitemap
   * that says every page changed today teaches a crawler to ignore the field site-wide.
   */
  it('states no date when the garment has none, and never invents one', () => {
    const entries = sitemapFor('visible', 'https://wear-run.com', [
      { slug: 'a', colours: [{ slug: 'x' }] },
      { slug: 'b', updatedAt: null, colours: [{ slug: 'x' }] },
      { slug: 'c', updatedAt: 'not a date', colours: [{ slug: 'x' }] },
    ])
    for (const entry of entries) expect(entry).not.toHaveProperty('lastModified')
  })

  it('lists a picture only when it is an absolute https address a crawler can fetch', () => {
    const [relative, plain] = sitemapFor('visible', 'https://wear-run.com', [
      { slug: 'a', colours: [{ slug: 'x', image: { url: '/api/media/file/a.webp' } }] },
      { slug: 'b', colours: [{ slug: 'x', image: { url: 'http://media.wear-run.com/b.webp' } }] },
    ]).filter((e) => isGarment(e.url))
    expect(relative).not.toHaveProperty('images')
    expect(plain).not.toHaveProperty('images')
  })

  /*
   * Next writes the address into the XML as it is, unescaped. A single `&` would make the
   * whole file malformed, and a malformed sitemap offers a crawler nothing at all.
   */
  it('leaves out a picture whose address would break the XML, and keeps the page', () => {
    const entries = sitemapFor('visible', 'https://wear-run.com', [
      {
        slug: 'a',
        colours: [{ slug: 'x', image: { url: 'https://media.wear-run.com/a.webp?w=1&h=2' } }],
      },
      {
        slug: 'b',
        colours: [{ slug: 'x', image: { url: 'https://media.wear-run.com/b <1>.webp' } }],
      },
    ]).filter((e) => isGarment(e.url))
    expect(entries.map((e) => e.url)).toEqual([
      'https://wear-run.com/products/a/x',
      'https://wear-run.com/products/b/x',
    ])
    for (const entry of entries) expect(entry).not.toHaveProperty('images')
  })
})

/**
 * The Journal and the case studies (2026-10-07): their hubs and pages are listed only once
 * something is published (T5 and the empty-hub rule), each page with the database's own date.
 */
describe('the Journal and case studies in the sitemap', () => {
  const ORIGIN = 'https://wear-run.com'
  const urls = (content: Parameters<typeof sitemapFor>[3]) =>
    sitemapFor('visible', ORIGIN, [], content).map((entry) => entry.url)

  it('lists neither hub while nothing is published', () => {
    const empty = urls({ posts: [], caseStudies: [] })
    expect(empty).not.toContain(`${ORIGIN}/journal`)
    expect(empty).not.toContain(`${ORIGIN}/case-studies`)
    expect(urls(undefined).some((url) => /journal|case-studies/.test(url))).toBe(false)
  })

  it('lists the hub and every published post with its own date once one is published', () => {
    const entries = sitemapFor('visible', ORIGIN, [], {
      posts: [{ path: '/journal/made-properly', updatedAt: '2026-10-09T10:00:00.000Z' }],
      caseStudies: [{ path: '/case-studies/club-kit', updatedAt: 'not a date' }],
    })
    const post = entries.find((entry) => entry.url === `${ORIGIN}/journal/made-properly`)
    expect(post?.lastModified).toEqual(new Date('2026-10-09T10:00:00.000Z'))
    expect(entries.map((entry) => entry.url)).toEqual(
      expect.arrayContaining([
        `${ORIGIN}/journal`,
        `${ORIGIN}/case-studies`,
        `${ORIGIN}/case-studies/club-kit`,
      ]),
    )
    // An unreadable date is no date, never "now".
    const study = entries.find((entry) => entry.url === `${ORIGIN}/case-studies/club-kit`)
    expect(study).not.toHaveProperty('lastModified')
  })

  it('lists nothing at all while the site is hidden', () => {
    expect(
      sitemapFor('hidden', ORIGIN, [], {
        posts: [{ path: '/journal/a', updatedAt: null }],
        caseStudies: [],
      }),
    ).toEqual([])
  })
})
