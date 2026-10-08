import type { ViewerApiSuccess, ViewerColourway, ViewerMediaAsset } from '@run-apparel/shared'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { OgCard } from './og-cards'
import { MAX_DESCRIPTION, REWRITTEN_META, buildPreview } from './preview'

/**
 * The link-preview decisions, tested on plain objects.
 *
 * Everything here is a SILENT failure in production. A card that names the wrong
 * colour, a canonical URL pointing at a colourway that 404s, or an og:image
 * declared as JPEG while serving WebP all render a perfect-looking page and a
 * wrong link — and nobody unfurls a link on purpose to check. Same class as the
 * poster and artwork bugs in CLAUDE.md, and the reason scripts/og.test.ts exists.
 */

/**
 * Repeat until stable. One pass is not enough: removing a comment can splice a
 * fresh `<!--` out of the text either side of it, and the survivor could then
 * satisfy the very assertion this strip exists to protect — a false PASS, not a
 * false failure. (CodeQL js/incomplete-multi-character-sanitization.)
 */
function stripComments(source: string): string {
  let previous: string
  let current = source
  do {
    previous = current
    current = current.replace(/<!--[\s\S]*?-->/g, '')
  } while (current !== previous)
  return current
}

const ORIGIN = 'https://viewer.wear-run.help'

const CARDS: Record<string, OgCard> = {
  'n001/wine': { width: 1200, height: 1500 },
  'n001/blush': { width: 1200, height: 1500 },
}

/** Shaped from the real live payload for n001/wine, captured 2026-08-08. */
/**
 * Hoisted out of the factory 2026-08-21, when `ViewerColourway.poster` became
 * nullable. Several tests below build a variant by spreading the default poster
 * and changing one field; spreading `colourway().poster` now spreads a
 * `ViewerMediaAsset | null`, which TypeScript widens into all-optional properties
 * and rejects. A named non-null constant says what those tests mean — "the normal
 * poster, but with X different" — without scattering `!` assertions.
 */
const BASE_POSTER: ViewerMediaAsset = {
  url: 'https://media.wear-run.help/n001-wine-poster.webp',
  alt: 'Velocity Performance Skinsuit in Wine',
  width: 1200,
  height: 1500,
  mimeType: 'image/webp',
}

function colourway(overrides: Partial<ViewerColourway> = {}): ViewerColourway {
  return {
    variantId: 'N001-WINE',
    displayName: 'Wine',
    slug: 'wine',
    sequence: 1,
    poster: { ...BASE_POSTER },
    render: null,
    glbUrl: null,
    glbBytes: null,
    isDefault: true,
    altText: 'Velocity Performance Skinsuit in Wine',
    hexSwatch: '#825353',
    ...overrides,
  }
}

function payload(overrides: {
  product?: Partial<ViewerApiSuccess['product']>
  colourways?: ViewerColourway[]
  selectedColourway?: ViewerColourway
  related?: ViewerApiSuccess['related']
}): ViewerApiSuccess {
  const colourways = overrides.colourways ?? [
    colourway(),
    colourway({ displayName: 'Blush', slug: 'blush', sequence: 2, isDefault: false }),
    colourway({ displayName: 'Lime', slug: 'lime', sequence: 3, isDefault: false }),
  ]
  return {
    product: {
      productCode: 'N001',
      slug: 'n001',
      productName: 'Velocity Performance Skinsuit',
      shortDescription: '',
      garmentType: '',
      category: 'Sportswear',
      variantMode: 'single-glb-variants',
      glbUrl: 'https://media.wear-run.help/cycling-all-colours-optimized-4.glb',
      glbBytes: 3_839_756,
      posterFallback: null,
      fabricComposition: '80% recycled polyester / 20% elastane',
      gsm: '160 GSM',
      performanceFeatures: [],
      garmentFit: 'Race fit',
      customisationIntroHtml: '',
      customisationSteps: [],
      camera: {
        frontCameraOrbit: '0deg 82deg 105%',
        backCameraOrbit: '180deg 82deg 105%',
        sideCameraOrbit: '90deg 82deg 105%',
        cameraTarget: 'auto auto auto',
        defaultFieldOfView: '30deg',
      },
      catalogueUrl: 'https://wear-run.help/catalogue',
      retiredMessage: '',
      ...overrides.product,
    },
    colourways,
    selectedColourway: overrides.selectedColourway ?? colourways[0]!,
    requestedColourwayUnavailable: false,
    fallbackMessage: null,
    siteSettings: {
      companyName: 'RUN APPAREL',
      email: 'hello@wear-run.help',
      whatsappNumber: '',
      catalogueUrl: 'https://wear-run.help/catalogue',
      temporaryWordmark: 'RUN',
      footerLine: '',
      legalLine: '',
    },
    related: overrides.related,
  }
}

const build = (p: ViewerApiSuccess) => buildPreview(p, { origin: ORIGIN, cards: CARDS })

describe('buildPreview — title', () => {
  it('leads with the product code and ends with the colour', () => {
    // The code is what is printed on the physical tag and quoted back in email;
    // the colour is last because it is the part that differs between two links
    // someone has been sent side by side.
    expect(build(payload({})).title).toBe('N001 Velocity Performance Skinsuit — Wine')
  })

  it('names the colour the visitor will actually see, not the one they asked for', () => {
    // A QR tag printed with a colourway that has since been retired resolves to
    // the default. A card naming the dead colour would promise something the page
    // never shows.
    const colourways = [colourway(), colourway({ displayName: 'Blush', slug: 'blush' })]
    const p = payload({ colourways, selectedColourway: colourways[0]! })
    p.requestedColourwayUnavailable = true
    expect(build(p).title).toContain('Wine')
  })

  it('degrades to the product alone when a colourway has no display name', () => {
    const only = colourway({ displayName: '' })
    expect(build(payload({ colourways: [only], selectedColourway: only })).title).toBe(
      'N001 Velocity Performance Skinsuit',
    )
  })
})

/*
 * THE PAGE'S OWN <title> IS NOT THE LINK-PREVIEW TITLE (2026-09-30). A shared link leads
 * with the code a buyer quotes back; a search result needs to say what the garment IS.
 * The rules are tested in packages/shared/src/pageTitle.test.ts; this pins that the Worker
 * passes the right values to them, and that the two titles stay separate.
 */
describe('buildPreview — the page title search engines show', () => {
  it('says the garment type when the owner has typed one, and ends with the brand', () => {
    const preview = build(payload({ product: { garmentType: "Women's Cycling Skinsuit" } }))
    expect(preview.pageTitle).toBe("Velocity Performance Skinsuit — Women's Cycling Skinsuit, Wine")
    // …and the link preview still leads with the code.
    expect(preview.title).toBe('N001 Velocity Performance Skinsuit — Wine')
  })

  it('keeps the code-led title, with the brand, for a garment with no type yet', () => {
    expect(build(payload({})).pageTitle).toBe(
      'N001 Velocity Performance Skinsuit — Wine | RUN APPAREL',
    )
  })

  it('names the colour that LOADS, as every other field here does', () => {
    const preview = build(
      payload({
        product: { garmentType: 'Tee' },
        selectedColourway: colourway({ displayName: 'Blush', slug: 'blush' }),
      }),
    )
    expect(preview.pageTitle).toContain('Tee, Blush')
  })

  it('gives each colour of one garment a different title', () => {
    const titles = ['Wine', 'Blush', 'Lime'].map(
      (displayName) => build(payload({ selectedColourway: colourway({ displayName }) })).pageTitle,
    )
    expect(new Set(titles).size).toBe(3)
  })
})

describe('buildPreview — description', () => {
  it('is built from the garment’s own specs, not a fixed sentence', () => {
    const { description } = build(payload({}))
    expect(description).toBe(
      'Race fit · 80% recycled polyester / 20% elastane, 160 GSM. ' +
        'Shown in Wine. See all 3 colorways in 3D.',
    )
  })

  /**
   * ⚠️ THE COLOUR WAS ABSENT UNTIL 2026-09-05, AND IT WAS AN SEO DEFECT RATHER THAN
   * a wording preference. Measured across all 55 live pages: 55 unique titles and
   * only **11 unique descriptions** — a garment's five colourway pages all carried
   * byte-identical text while each declared itself canonical, so Google saw five
   * near-duplicates per garment.
   */
  it('names the colourway, so a garment’s five pages are not five duplicates', () => {
    const first = colourway({ slug: 'wine', displayName: 'Wine' })
    const second = colourway({ slug: 'lime', displayName: 'Lime' })
    const all = [first, second]
    const a = build(payload({ colourways: all, selectedColourway: first })).description
    const b = build(payload({ colourways: all, selectedColourway: second })).description
    expect(a).toContain('Wine')
    expect(b).toContain('Lime')
    expect(a, 'two colourways of one garment still describe themselves identically').not.toBe(b)
  })

  it('describes the colourway that will LOAD, not the one that was asked for', () => {
    // A QR tag pointing at a retired colour resolves to the default one. Describing
    // the requested colour would name something the visitor never sees — the same
    // reasoning that puts `selectedColourway` in the canonical URL.
    const live = colourway({ slug: 'wine', displayName: 'Wine' })
    const retired = colourway({ slug: 'ochre', displayName: 'Ochre' })
    const { description } = build(payload({ colourways: [live], selectedColourway: live }))
    expect(description).toContain('Wine')
    expect(description).not.toContain(retired.displayName)
  })

  it('never returns an empty description, however little the CMS holds', () => {
    // Garment #2 arrives with these fields blank. A blank og:description makes a
    // platform fall back to scraping the page — which is a JavaScript shell.
    const bare = build(
      payload({
        product: { category: '' as never, garmentFit: '', fabricComposition: '', gsm: '' },
      }),
    ).description
    expect(bare).toBe('Shown in Wine. See all 3 colorways in 3D.')
  })

  it('promises no 3D for a garment marked "3D coming soon" (2026-10-08)', () => {
    const soon = payload({ product: { glbUrl: null, glbBytes: null, modelComingSoon: true } })
    const description = build(soon).description
    expect(description).toContain('See all 3 colorways. 3D view coming soon.')
    expect(description).not.toContain('in 3D')
    // NEGATIVE CONTROL: without the flag the same payload keeps today's wording.
    expect(build(payload({})).description).toContain('See all 3 colorways in 3D.')
    const one = colourway()
    const single = payload({
      product: { glbUrl: null, glbBytes: null, modelComingSoon: true },
      colourways: [one],
      selectedColourway: one,
    })
    expect(build(single).description).toContain('3D view coming soon.')
    expect(build(single).description).not.toMatch(/rotate and zoom/i)
  })

  it('says "this reference" rather than "all 1 colourways"', () => {
    const one = colourway()
    expect(build(payload({ colourways: [one], selectedColourway: one })).description).toContain(
      'Rotate and zoom this reference in 3D.',
    )
  })

  it('truncates on a word boundary rather than mid-word', () => {
    const long = build(
      payload({ product: { fabricComposition: 'Recycled polyester '.repeat(30) } }),
    ).description
    expect(long.length).toBeLessThanOrEqual(MAX_DESCRIPTION)
    expect(long.endsWith('…')).toBe(true)
    // The cut lands after a whole word, so the visible text never reads
    // "…polyeste…". Everything before the ellipsis is complete words.
    expect(long.slice(0, -1).trimEnd()).toMatch(/\w$/)
  })

  /**
   * Owner decision 2026-09-16 (FI-01): 15 of the 80 live pages ran 161-176 characters, so
   * the end of each was cut off in search results. The owner chose "both changes": drop the
   * leading category, and close with the shorter sentence. The category is still in the
   * page's structured data.
   */
  it('leaves the category out of the description', () => {
    expect(build(payload({})).description).not.toContain('Sportswear')
  })

  it('fits the longest live garment whole, without cutting it', () => {
    const colourways = [
      colourway({ displayName: 'Bottle Green / Mint', slug: 'bottle-green' }),
      colourway({ displayName: 'Terracotta', slug: 'terracotta', sequence: 2, isDefault: false }),
      colourway({ displayName: 'Coral', slug: 'coral', sequence: 3, isDefault: false }),
      colourway({ displayName: 'Beige', slug: 'beige', sequence: 4, isDefault: false }),
      colourway({ displayName: 'Powder Blue', slug: 'powder-blue', sequence: 5, isDefault: false }),
    ]
    const { description } = build(
      payload({
        product: {
          category: 'Teamwear & Uniforms',
          garmentFit: 'Contoured, masculine-specific cut',
          fabricComposition: '95% Polyester / 5% Spandex',
          gsm: '220-260 GSM',
        },
        colourways,
        selectedColourway: colourways[0]!,
      }),
    )
    expect(description).toBe(
      'Contoured, masculine-specific cut · 95% Polyester / 5% Spandex, 220-260 GSM. ' +
        'Shown in Bottle Green / Mint. See all 5 colorways in 3D.',
    )
    expect(description.length).toBeLessThanOrEqual(160)
  })

  it('never exceeds 160 characters, whatever the CMS holds', () => {
    const long = build(
      payload({
        product: {
          garmentFit: 'Contoured fit '.repeat(20),
          fabricComposition: 'Recycled polyester '.repeat(30),
        },
      }),
    ).description
    expect(long.length).toBeLessThanOrEqual(160)
  })
})

describe('buildPreview — canonical url', () => {
  it('is absolute, per-colourway, and built from the origin the visitor used', () => {
    const colourways = [colourway(), colourway({ displayName: 'Lime', slug: 'lime' })]
    expect(build(payload({ colourways, selectedColourway: colourways[1]! })).url).toBe(
      'https://viewer.wear-run.help/n001/lime',
    )
  })

  it('resolves "/n001" to the default colourway rather than advertising a bare path', () => {
    // The API answers a colourless request with the default colour, so the
    // canonical URL has to name it. Leaving it bare would make two URLs compete
    // for the same page.
    expect(build(payload({})).url).toBe('https://viewer.wear-run.help/n001/wine')
  })

  it('points at the substituted colourway when the requested one is retired', () => {
    const colourways = [colourway()]
    const p = payload({ colourways, selectedColourway: colourways[0]! })
    p.requestedColourwayUnavailable = true
    // NOT the slug from the URL — that one 404s at the API.
    expect(build(p).url).toBe('https://viewer.wear-run.help/n001/wine')
  })

  // On wear-run.com the page lives at /products/<product>/<colour> (2026-09-28). The
  // canonical URL must name THAT page; the bare shape there is not a garment page at all.
  it('names the /products page when the visitor is on the website', () => {
    const preview = buildPreview(payload({}), {
      origin: 'https://wear-run.com',
      cards: CARDS,
      prefix: '/products',
    })
    expect(preview.url).toBe('https://wear-run.com/products/n001/wine')
    expect(preview.image!.url).toBe('https://wear-run.com/og/n001/wine.jpg')
  })
})

describe('buildPreview — image', () => {
  it('prefers the shipped JPEG card, with the manifest’s real dimensions', () => {
    const image = build(payload({})).image!
    expect(image.url).toBe('https://viewer.wear-run.help/og/n001/wine.jpg')
    expect(image.type).toBe('image/jpeg')
    expect(image.width).toBe(1200)
    expect(image.height).toBe(1500)
  })

  it('falls back to the colourway’s own poster when no card was generated', () => {
    // Garment #2 before anyone runs `pnpm og:cards`. The right garment in the
    // right colour on the platforms that take WebP beats a polished card of a
    // different garment on all of them.
    const colourways = [colourway({ displayName: 'Butter', slug: 'butter' })]
    const image = build(payload({ colourways, selectedColourway: colourways[0]! })).image!
    expect(image.url).toBe('https://media.wear-run.help/n001-wine-poster.webp')
    expect(image.type).toBe('image/webp')
  })

  it('declares the poster’s ACTUAL type, never index.html’s hard-coded jpeg', () => {
    // index.html ships `og:image:type content="image/jpeg"` for its static card.
    // Overwriting the URL without the type would tell every crawler the WebP
    // bytes are a JPEG — which some of them act on.
    const only = colourway({
      slug: 'butter',
      poster: { ...BASE_POSTER, mimeType: 'image/png' },
    })
    expect(build(payload({ colourways: [only], selectedColourway: only })).image!.type).toBe(
      'image/png',
    )
  })

  it('returns null rather than an unrelated garment when there is nothing to show', () => {
    // index.ts then REMOVES the image tags. A card with no picture is worse
    // looking; a card showing N001 for a different garment is false.
    const only = colourway({
      slug: 'butter',
      poster: { ...BASE_POSTER, url: '' },
    })
    expect(build(payload({ colourways: [only], selectedColourway: only })).image).toBeNull()
  })

  it('returns no image, and does not throw, for a colourway with NO poster at all', () => {
    /**
     * ⚠️ REGRESSION TEST FOR A LIVE 404 ON 2026-08-21. `poster` was non-nullable
     * until that day, and projectViewer.ts enforced it by DROPPING any colourway
     * without one — so detaching a garment's five posters left zero colourways and
     * the public endpoint 404'd a published product. Making it nullable is only
     * half the fix; this pins the other half, which is that everything downstream
     * copes. A poster-less colourway must yield a card with no picture, never a
     * crash and never a different garment's photograph.
     */
    const only = colourway({ slug: 'butter', displayName: 'Butter', poster: null })
    const built = build(payload({ colourways: [only], selectedColourway: only }))
    expect(built.image).toBeNull()
    // The rest of the card still works — the visitor keeps title and description.
    expect(built.title).toBeTruthy()
  })

  it('keys cards by product AND colour so two garments cannot collide', () => {
    const only = colourway({ slug: 'wine' })
    const p = payload({ product: { slug: 'n002' }, colourways: [only], selectedColourway: only })
    // 'n002/wine' is not in the manifest even though 'n001/wine' is.
    expect(build(p).image!.url).toContain('media.wear-run.help')
  })

  it('falls back through altText to a composed alt', () => {
    const only = colourway({
      altText: '',
      displayName: 'Butter',
      slug: 'butter',
      poster: { ...BASE_POSTER, alt: '' },
    })
    expect(build(payload({ colourways: [only], selectedColourway: only })).image!.alt).toBe(
      'Velocity Performance Skinsuit in Butter',
    )
  })
})

/*
 * THE WORDS A SEARCH ROBOT READS ON A GARMENT PAGE (2026-09-30).
 *
 * Measured live that day, fetching /products/rxps/wine as Googlebot: the head was complete
 * (title, description, structured data) and the body held NO heading, NO picture and NO
 * sentence, because every visible word is drawn by JavaScript. Google runs JavaScript, late;
 * Bing runs little; the AI answer engines robots.txt invites run none. So the robot-only
 * copy of the page now carries the garment's own words inside `#root`, where the app
 * replaces them the moment it starts.
 *
 * ⚠️ ONLY WHAT THE PAGE ITSELF SHOWS. Showing a robot text a visitor never sees is cloaking,
 * which search engines penalise. Every value below is one the loaded page prints: the name,
 * the colour, the owner's description, the four specification lines and the colour list.
 */
describe('buildPreview — the readable page body for robots', () => {
  const SITE = 'https://wear-run.com'
  const onSite = (p: ViewerApiSuccess) =>
    buildPreview(p, { origin: SITE, cards: CARDS, prefix: '/products' }).bodyHtml

  const full = () =>
    payload({
      product: {
        shortDescription: 'A women’s performance cycling skinsuit.',
        performanceFeatures: ['Moisture management', 'Four-way stretch'],
      },
    })

  it('has exactly one heading, and it is the garment’s name', () => {
    const html = onSite(full())
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1)
    expect(html).toContain('<h1>Velocity Performance Skinsuit</h1>')
  })

  it('names the colour that loads, the code, the family and the description', () => {
    const html = onSite(full())
    expect(html).toContain('Shown in Wine.')
    expect(html).toContain('N001')
    expect(html).toContain('Sportswear')
    expect(html).toContain('A women’s performance cycling skinsuit.')
  })

  it('lists the specifications the page shows, and skips an empty one', () => {
    const html = onSite(full())
    expect(html).toContain(
      '<dt>Fabric composition</dt><dd>80% recycled polyester / 20% elastane</dd>',
    )
    expect(html).toContain('<dt>Weight</dt><dd>160 GSM</dd>')
    expect(html).toContain('<dt>Fit</dt><dd>Race fit</dd>')
    expect(html).toContain(
      '<dt>Performance features</dt><dd>Moisture management, Four-way stretch</dd>',
    )
    const bare = onSite(payload({ product: { gsm: '', garmentFit: '  ' } }))
    expect(bare).not.toContain('<dt>Weight</dt>')
    expect(bare).not.toContain('<dt>Fit</dt>')
    expect(bare).not.toContain('<dd></dd>')
  })

  it('shows the picture of this colour, with its description and real size', () => {
    const html = onSite(full())
    expect(html).toContain('<img src="https://wear-run.com/og/n001/wine.jpg"')
    expect(html).toContain('alt="Velocity Performance Skinsuit in Wine"')
    expect(html).toContain('width="1200" height="1500"')
    const none = onSite(
      payload({ product: { slug: 'zzz' }, selectedColourway: colourway({ poster: null }) }),
    )
    expect(none).not.toContain('<img')
  })

  it('links every colour’s own page, so a robot can walk from one to the next', () => {
    const html = onSite(full())
    expect(html).toContain('<a href="https://wear-run.com/products/n001/wine">Wine</a>')
    expect(html).toContain('<a href="https://wear-run.com/products/n001/blush">Blush</a>')
    expect(html).toContain('<a href="https://wear-run.com/products/n001/lime">Lime</a>')
  })

  it('links back to the catalogue, the category and the contact page, on the website only', () => {
    const html = onSite(full())
    expect(html).toContain('<a href="https://wear-run.com/products">All products</a>')
    // The category's own page since polish S5 (2026-10-04), not the /products filter.
    expect(html).toContain(
      '<a href="https://wear-run.com/custom-activewear-manufacturer">Sportswear</a>',
    )
    expect(html).toContain('<a href="https://wear-run.com/contact">Contact RUN APPAREL</a>')
    // The old viewer host only forwards; it has no catalogue or contact page of its own.
    const old = build(full()).bodyHtml
    expect(old).not.toContain('All products')
    expect(old).not.toContain('/contact')
  })

  // "More from this category" (polish S6), as the page draws it.
  const related = [
    {
      slug: 'r-xmp',
      colourSlug: 'black',
      productName: 'X-Max Pro',
      productCode: 'R-XMP',
      imageUrl: null,
    },
    {
      slug: 'r-cch',
      colourSlug: 'wine',
      productName: 'Coach <b>Jacket',
      productCode: 'R-CCH',
      imageUrl: null,
    },
  ]

  it('links the garments "More from this category" shows, and the category’s gallery, on the website only', () => {
    const html = onSite(payload({ related }))
    expect(html).toContain(
      '<h2>More Sportswear in 3D.</h2><ul><li><a href="https://wear-run.com/products/r-xmp/black">X-Max Pro</a></li>',
    )
    // CMS text, escaped like every other line here.
    expect(html).toContain(
      '<li><a href="https://wear-run.com/products/r-cch/wine">Coach &lt;b&gt;Jacket</a></li>',
    )
    expect(html).toContain(
      '<p><a href="https://wear-run.com/custom-activewear-manufacturer">See all sportswear in 3D</a></p>',
    )
    // Before the links to the website's other pages, as the section sits before the contact one.
    expect(html.indexOf('More Sportswear in 3D.')).toBeLessThan(html.indexOf('All products'))
    expect(build(payload({ related })).bodyHtml).not.toContain('More Sportswear')
  })

  it('says nothing of other garments when the answer carries none', () => {
    for (const none of [undefined, []]) {
      const html = onSite(payload({ related: none }))
      expect(html).not.toContain('More Sportswear')
      expect(html).not.toContain('See all')
    }
  })

  it('escapes CMS text, so a description cannot inject markup', () => {
    const html = onSite(
      payload({
        product: {
          productName: 'Tee <b>& "co"',
          shortDescription: '</div><script>alert(1)</script>',
        },
      }),
    )
    expect(html).not.toContain('<script')
    expect(html).not.toContain('<b>')
    expect(html).toContain('Tee &lt;b&gt;&amp; &quot;co&quot;')
    expect(html).toContain('&lt;/div&gt;&lt;script&gt;alert(1)&lt;/script&gt;')
  })

  it('states no price, like the structured data beside it', () => {
    expect(onSite(full())).not.toMatch(/price|\$|USD|PKR/i)
  })

  it('says nothing it cannot back: no description line when the owner wrote none', () => {
    const html = onSite(payload({}))
    expect(html).not.toContain('<p></p>')
    expect(html).toContain('<h1>Velocity Performance Skinsuit</h1>')
  })
})

describe('the tags index.ts rewrites still exist in index.html', () => {
  /**
   * THE POINT OF THIS TEST. HTMLRewriter treats a selector that matches nothing
   * as a no-op, not an error. Delete one `<meta>` from index.html and the Worker
   * keeps returning 200 while silently ceasing to set that value on every link it
   * touches — no exception, no log, no failing test anywhere else in this repo.
   */
  const html = stripComments(
    readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'), 'utf8'),
  )

  it.each(REWRITTEN_META)('index.html declares %s', (key) => {
    expect(html).toMatch(new RegExp(`<meta\\s+(?:property|name)="${key}"`, 'i'))
  })

  /*
   * The post-deploy check proves the rewrite ran by the title no longer being this static
   * one (scripts/smoke-viewer-preview.mjs, STATIC_TITLE). If the static title is reworded
   * and that copy is not, every rewritten page "differs" and the check can never fail.
   */
  it('has the static title the post-deploy check compares against', () => {
    const staticTitle = html.match(/<title>([^<]+)<\/title>/i)?.[1] ?? ''
    const smoke = readFileSync(
      join(
        dirname(fileURLToPath(import.meta.url)),
        '..',
        '..',
        '..',
        'scripts',
        'smoke-viewer-preview.mjs',
      ),
      'utf8',
    )
    expect(staticTitle).not.toBe('')
    expect(smoke).toContain(`const STATIC_TITLE = '${staticTitle}'`)
  })

  // The robot-readable body is appended INSIDE this element, where the app replaces it.
  it('has the #root element the Worker appends the readable body to', () => {
    expect(html).toMatch(/<div id="root">/)
  })

  it('has a <title> and a description for the Worker to overwrite', () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/i)
    expect(html).toMatch(/<meta\s+name="description"/i)
  })
})

describe('schema.org Product JSON-LD', () => {
  /**
   * This is the only machine-readable description of the product that a crawler
   * which runs no JavaScript ever sees — `<div id="root">` is empty in the served
   * HTML. Every failure here is silent: the page renders perfectly and the
   * structured data is wrong, absent, or malformed, and nobody inspects a rich
   * result on purpose.
   */
  const parse = (p: ReturnType<typeof buildPreview>) => JSON.parse(p.jsonLd)

  it('describes the garment with the values the CMS actually holds', () => {
    const data = parse(
      buildPreview(
        payload({
          product: {
            shortDescription: 'A four-way stretch skinsuit.',
            performanceFeatures: ['Moisture management', 'Four-way stretch'],
          },
        }),
        { origin: ORIGIN, cards: CARDS },
      ),
    )

    expect(data['@context']).toBe('https://schema.org')
    expect(data['@type']).toBe('Product')
    expect(data.name).toBe('Velocity Performance Skinsuit')
    expect(data.sku).toBe('N001')
    expect(data.category).toBe('Sportswear')
    expect(data.description).toBe('A four-way stretch skinsuit.')
    expect(data.material).toBe('80% recycled polyester / 20% elastane')
    expect(data.color).toBe('Wine')
    expect(data.brand).toEqual({ '@type': 'Brand', name: 'RUN' })
    expect(data.url).toBe(`${ORIGIN}/n001/wine`)
    expect(data.image).toBe(`${ORIGIN}/og/n001/wine.jpg`)
    expect(data.subjectOf).toEqual({
      '@type': '3DModel',
      name: 'Velocity Performance Skinsuit 3D Digital Reference',
      encoding: [
        {
          '@type': 'MediaObject',
          contentUrl: 'https://media.wear-run.help/cycling-all-colours-optimized-4.glb',
          encodingFormat: 'model/gltf-binary',
        },
      ],
    })

    const specs = Object.fromEntries(
      (data.additionalProperty as Array<{ name: string; value: string }>).map((s) => [
        s.name,
        s.value,
      ]),
    )
    expect(specs.Weight).toBe('160 GSM')
    expect(specs.Fit).toBe('Race fit')
    expect(specs['Performance features']).toBe('Moisture management, Four-way stretch')
    expect(specs['Colorways available']).toBe('3')
  })

  it('omits subjectOf 3DModel when no glbUrl is available', () => {
    const only = colourway({ glbUrl: null })
    const data = parse(
      buildPreview(
        payload({
          product: { glbUrl: null },
          colourways: [only],
          selectedColourway: only,
        }),
        { origin: ORIGIN, cards: CARDS },
      ),
    )
    expect(data).not.toHaveProperty('subjectOf')
  })

  it('declares made-to-order, because silence is not the same as no price', () => {
    /*
     * Owner decision 2026-09-07 (D10). This asserted `data.offers` was UNDEFINED until
     * then, on the reasoning that Google's Product docs want a price and inventing one
     * would put a false claim on 55 public URLs. That reasoning survives intact and is
     * the next test; what it got wrong was treating "no price" as "say nothing".
     * `MadeToOrder` and `Sell` are facts about this business, not inventions.
     */
    const data = parse(buildPreview(payload({}), { origin: ORIGIN, cards: CARDS })) as {
      offers?: Record<string, unknown>
    }
    expect(data.offers).toBeDefined()
    expect(data.offers?.['@type']).toBe('Offer')
    expect(data.offers?.availability).toBe('https://schema.org/MadeToOrder')
    expect(data.offers?.businessFunction).toBe('http://purl.org/goodrelations/v1#Sell')
  })

  it('states no price ANYWHERE in the block, which is the failure worth guarding', () => {
    /*
     * ⚠️ ASSERTED OVER THE WHOLE SERIALISED BLOCK, NOT OVER `offers.price`. The thing
     * that must never happen is a number appearing beside a garment in a search result
     * that nobody chose — and it could arrive as `price`, `lowPrice`, `highPrice` or
     * inside a `priceSpecification` a later edit adds one level down. Checking one
     * property would pass while any of the others shipped.
     */
    const raw = buildPreview(payload({}), { origin: ORIGIN, cards: CARDS })
    const block = JSON.stringify(parse(raw))
    expect(block, 'a price reached the structured data').not.toMatch(
      /"(?:price|lowPrice|highPrice|minPrice|maxPrice)"\s*:\s*"?\d/,
    )
    expect(block, 'a currency reached the structured data').not.toMatch(/"priceCurrency"/)
    expect(block).not.toMatch(/"priceSpecification"/)
  })

  it('omits an empty field rather than emitting an empty string', () => {
    // "" is a claim that the value is blank. Absence says nothing, which is what
    // an unfilled CMS field actually means. Ten of eleven live products had empty
    // customisation fields on 2026-09-04, so partly-filled records are the norm.
    const data = parse(
      buildPreview(
        payload({
          product: {
            shortDescription: '   ',
            // NOT category: it is a closed union (ProductCategory) with no empty
            // member, so a blank one is unrepresentable and asserting it would be
            // testing a state that cannot occur. The runtime guard in
            // buildProductJsonLd stays anyway — the payload crosses a network
            // boundary and TypeScript does not validate what actually arrives.
            garmentFit: '',
            fabricComposition: '',
            gsm: '',
            performanceFeatures: [],
          },
        }),
        { origin: ORIGIN, cards: CARDS },
      ),
    )
    expect(data).not.toHaveProperty('description')
    expect(data).not.toHaveProperty('material')
    expect(data.category).toBe('Sportswear')
    const names = (data.additionalProperty as Array<{ name: string }>).map((s) => s.name)
    expect(names).toEqual(['Colorways available'])
    // …and the fields that always exist are still there.
    expect(data.name).toBe('Velocity Performance Skinsuit')
    expect(data.url).toBe(`${ORIGIN}/n001/wine`)
  })

  it('escapes < so CMS text cannot break out of the script block', () => {
    const hostile = 'Ends here.</script><script>alert(1)</script>'
    const preview = buildPreview(payload({ product: { shortDescription: hostile } }), {
      origin: ORIGIN,
      cards: CARDS,
    })

    // The literal sequence must not survive into the emitted string …
    expect(preview.jsonLd).not.toContain('</script>')
    expect(preview.jsonLd).not.toContain('<script')
    expect(preview.jsonLd).toContain('\\u003c/script>')
    // … while the VALUE round-trips intact, so escaping has not corrupted content.
    expect(parse(preview).description).toBe(hostile)

    // NEGATIVE CONTROL: prove the assertion can fail. Without the escape in
    // buildProductJsonLd, JSON.stringify alone leaves `</script>` verbatim — it is
    // a legal JSON string — and the block would close early on a live page.
    expect(JSON.stringify({ description: hostile })).toContain('</script>')
  })

  it('describes the colourway that will LOAD, not the one that was requested', () => {
    // A QR tag pointing at a retired colour resolves to the default. Structured
    // data naming the requested colour would advertise a page nobody can reach —
    // the same reason `url` uses selectedColourway.
    const colourways = [
      colourway({ displayName: 'Wine', slug: 'wine' }),
      colourway({ displayName: 'Lime', slug: 'lime', sequence: 2, isDefault: false }),
    ]
    const data = parse(
      buildPreview(payload({ colourways, selectedColourway: colourways[1]! }), {
        origin: ORIGIN,
        cards: CARDS,
      }),
    )
    expect(data.color).toBe('Lime')
    expect(data.url).toBe(`${ORIGIN}/n001/lime`)
  })
})

/**
 * The garment's place on the website, for search results (domain move, 2026-09-28). The
 * category is deliberately NOT in the address — it is an editable dropdown and the address
 * is printed on QR tags — so it lives here, as data, pointing at the category's own page
 * (polish S5, 2026-10-04; it was the /products family filter).
 */
describe('buildPreview — breadcrumbs on the website', () => {
  const SITE = 'https://wear-run.com'
  const onSite = (p: ViewerApiSuccess) =>
    buildPreview(p, { origin: SITE, cards: CARDS, prefix: '/products' })

  it('walks Home › Products › the category › the garment, ending at the canonical URL', () => {
    const preview = onSite(payload({}))
    const data = JSON.parse(preview.breadcrumbJsonLd ?? 'null')
    expect(data['@type']).toBe('BreadcrumbList')
    expect(
      data.itemListElement.map((item: { position: number; name: string; item: string }) => [
        item.position,
        item.name,
        item.item,
      ]),
    ).toEqual([
      [1, 'Home', `${SITE}/`],
      [2, 'Products', `${SITE}/products`],
      [3, 'Sportswear', `${SITE}/custom-activewear-manufacturer`],
      [4, 'Velocity Performance Skinsuit', preview.url],
    ])
  })

  it('sends each category to its own page, and one with no page to the family filter', () => {
    const categoryStep = (category: string) =>
      JSON.parse(
        onSite(payload({ product: { category: category as never } })).breadcrumbJsonLd ?? 'null',
      ).itemListElement[2].item
    expect(categoryStep('Teamwear & Uniforms')).toBe(`${SITE}/custom-teamwear-manufacturer`)
    expect(categoryStep('Sports Accessories')).toBe(`${SITE}/products#sports-accessories`)
  })

  it('skips the category step when a garment has none, rather than inventing one', () => {
    const data = JSON.parse(
      onSite(payload({ product: { category: '' as never } })).breadcrumbJsonLd ?? 'null',
    )
    expect(data.itemListElement.map((item: { name: string }) => item.name)).toEqual([
      'Home',
      'Products',
      'Velocity Performance Skinsuit',
    ])
    expect(data.itemListElement.at(-1).position).toBe(3)
  })

  // The old viewer host only forwards; a breadcrumb there would name a site it is not on.
  it('says nothing on the old viewer host', () => {
    expect(build(payload({})).breadcrumbJsonLd).toBeNull()
  })
})
