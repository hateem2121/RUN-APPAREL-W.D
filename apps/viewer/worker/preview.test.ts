import type { ViewerApiSuccess, ViewerColourway } from '@run-apparel/shared'
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

const ORIGIN = 'https://viewer.wear-run.help'

const CARDS: Record<string, OgCard> = {
  'n001/wine': { width: 1200, height: 1500 },
  'n001/blush': { width: 1200, height: 1500 },
}

/** Shaped from the real live payload for n001/wine, captured 2026-08-08. */
function colourway(overrides: Partial<ViewerColourway> = {}): ViewerColourway {
  return {
    variantId: 'N001-WINE',
    displayName: 'Wine',
    slug: 'wine',
    sequence: 1,
    poster: {
      url: 'https://media.wear-run.help/n001-wine-poster.webp',
      alt: 'Velocity Performance Skinsuit in Wine',
      width: 1200,
      height: 1500,
      mimeType: 'image/webp',
    },
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
      category: 'Sportswear',
      variantMode: 'single-glb-variants',
      presentationMode: 'floatingGarment',
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
        'Rotate, zoom and compare all 3 colourways in 3D.',
    )
  })

  it('never returns an empty description, however little the CMS holds', () => {
    // Garment #2 arrives with these fields blank. A blank og:description makes a
    // platform fall back to scraping the page — which is a JavaScript shell.
    const bare = build(
      payload({
        product: { category: '' as never, garmentFit: '', fabricComposition: '', gsm: '' },
      }),
    ).description
    expect(bare).toBe('Rotate, zoom and compare all 3 colourways in 3D.')
  })

  it('says "this reference" rather than "all 1 colourways"', () => {
    const one = colourway()
    expect(
      build(payload({ colourways: [one], selectedColourway: one })).description,
    ).toContain('Rotate and zoom this reference in 3D.')
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
      poster: { ...colourway().poster, mimeType: 'image/png' },
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
      poster: { ...colourway().poster, url: '' },
    })
    expect(build(payload({ colourways: [only], selectedColourway: only })).image).toBeNull()
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
      poster: { ...colourway().poster, alt: '' },
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
  const html = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'),
    'utf8',
  ).replace(/<!--[\s\S]*?-->/g, '')

  it.each(REWRITTEN_META)('index.html declares %s', (key) => {
    expect(html).toMatch(new RegExp(`<meta\\s+(?:property|name)="${key}"`, 'i'))
  })

  it('has a <title> and a description for the Worker to overwrite', () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/i)
    expect(html).toMatch(/<meta\s+name="description"/i)
  })
})
