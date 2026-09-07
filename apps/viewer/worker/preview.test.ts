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
    glbUrl: null,
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
      category: 'Sportswear',
      variantMode: 'single-glb-variants',
      glbUrl: 'https://media.wear-run.help/cycling-all-colours-optimized-4.glb',
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

describe('buildPreview — description', () => {
  it('is built from the garment’s own specs, not a fixed sentence', () => {
    const { description } = build(payload({}))
    expect(description).toBe(
      'Sportswear · Race fit · 80% recycled polyester / 20% elastane, 160 GSM. ' +
        'Shown in Wine. Rotate, zoom and compare all 3 colorways in 3D.',
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
    expect(bare).toBe('Shown in Wine. Rotate, zoom and compare all 3 colorways in 3D.')
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
