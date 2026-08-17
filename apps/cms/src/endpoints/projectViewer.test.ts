import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { absolutize, buildViewerResponse, toMediaAsset } from './projectViewer'

const deps = { richTextToHtml: () => '<p>intro</p>' }
const origin = 'https://cms.example'
const media = (url: string) => ({
  url,
  alt: 'a',
  width: 1200,
  height: 1500,
  mimeType: 'image/webp',
})

const product = (o: Record<string, unknown> = {}) => ({
  productCode: 'N001',
  slug: 'n001',
  productName: 'Velocity Tee',
  category: 'Sportswear',
  variantMode: 'single-glb-variants',
  glbAsset: media('/media/n001.glb'),
  posterFallback: media('/media/fallback.webp'),
  fabricComposition: 'Poly',
  gsm: '160',
  performanceFeatures: [{ feature: 'Stretch' }],
  garmentFit: 'Regular',
  customisationIntro: { root: {} },
  customisationSteps: [{ number: 1, title: 'A', body: 'b' }],
  retiredMessage: 'retired notice',
  // Internal fields that must NEVER cross the public boundary:
  note: 'INTERNAL NOTE',
  sourceReference: 'zprj://secret-source',
  status: 'published',
  ...o,
})

const colourway = (o: Record<string, unknown> = {}) => ({
  variantId: 'N001-NAVY',
  displayName: 'Navy',
  slug: 'navy',
  sequence: 1,
  posterPreview: media('/media/navy.webp'),
  glbAsset: media('/media/navy.glb'),
  isDefault: true,
  altText: 'navy',
  hexSwatch: '#123456',
  note: 'internal colourway note',
  ...o,
})

describe('absolutize', () => {
  it('prefixes relative urls with the origin', () => {
    expect(absolutize('/media/x.webp', origin)).toBe('https://cms.example/media/x.webp')
  })
  it('leaves absolute urls unchanged', () => {
    expect(absolutize('https://cdn.example/x', origin)).toBe('https://cdn.example/x')
  })
  it('returns null for empty input', () => {
    expect(absolutize(null, origin)).toBeNull()
    expect(toMediaAsset(null, origin)).toBeNull()
  })
})

describe('the universal build-process copy', () => {
  /**
   * "How we build your product" is ONE text for the whole catalogue since
   * 2026-08-17, by owner decision.
   *
   * It used to be per-product: `CatalogueDefaults` seeded each new product's own
   * `customisationIntro`/`customisationSteps` at CREATE time and nothing read it
   * again, so editing the defaults changed what the NEXT garment started with and
   * left every existing page saying whatever it said the day it was made. At 100+
   * products that is 100 chances to leave stale copy live on one page and the
   * current wording on another.
   *
   * The projection is where the switch happens, which is why the viewer needed no
   * change at all: it still consumes `customisationIntroHtml` and
   * `customisationSteps` exactly as before.
   */
  const buildProcess = {
    customisationIntro: { root: { NEW: true } },
    customisationSteps: [{ number: 1, title: 'NEW STEP', body: 'new body' }],
  }

  it('overrides whatever the product itself stored', () => {
    const body = buildViewerResponse(
      product({ customisationSteps: [{ number: 9, title: 'OLD STEP', body: 'old body' }] }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
      { id: 1, ...buildProcess },
    )!
    expect(body.product.customisationSteps).toEqual([
      { number: 1, title: 'NEW STEP', body: 'new body' },
    ])
    expect(JSON.stringify(body)).not.toContain('OLD STEP')
  })

  /**
   * ⚠️ THE FALLBACK IS NOT DEFENSIVENESS — it covers a real window, and the shape
   * it has to survive was MEASURED rather than assumed.
   *
   * This test used `{}`, `null` and `undefined` until 2026-08-17 and passed —
   * against code that was broken. Payload does not return `{}` for a never-saved
   * global with an array field. Probed against a real local D1:
   *
   *   never saved   {"customisationSteps":[]}                    <- no id
   *   saved         {id:1, customisationSteps:[...], updatedAt, createdAt, globalType}
   *   saved+cleared {id:1, customisationSteps:[],    updatedAt,  …}
   *
   * So an unsaved global arrives as an EMPTY ARRAY, `Array.isArray` said true,
   * and the projection used it — discarding the product's own four steps on
   * every page at once, for the whole window between the migration deploying and
   * somebody first opening the new screen. Exactly the failure the fallback
   * exists to prevent, caused by the fallback's own test asserting a shape that
   * never occurs.
   *
   * `id` is the discriminator, because it is the only field present in the saved
   * shapes and absent from the unsaved one.
   */
  it('falls back to the product’s own copy when the global has never been saved', () => {
    const own = [{ number: 4, title: 'OWN STEP', body: 'own body' }]
    const unsavedShapes = [
      // What Payload ACTUALLY returns — measured, and the case that was broken.
      { customisationSteps: [] },
      // Belt and braces: a read that failed, and a global with no fields at all.
      null,
      undefined,
      {},
    ]
    for (const unsaved of unsavedShapes) {
      const body = buildViewerResponse(
        product({ customisationSteps: own }),
        [colourway()],
        {},
        origin,
        'navy',
        deps,
        unsaved,
      )!
      expect(body.product.customisationSteps, `unsaved global: ${JSON.stringify(unsaved)}`).toEqual(
        own,
      )
    }
  })

  it('an empty step list on a SAVED global is a real answer, not a missing one', () => {
    // Deleting every step must actually remove the accordion from every page —
    // otherwise "clear it" silently means "revert to whatever each product had".
    //
    // `id: 1` is what makes this a saved document rather than the unsaved shape
    // above. Both carry `customisationSteps: []`; only the id tells them apart,
    // which is why the projection cannot decide on the array alone.
    const body = buildViewerResponse(
      product({ customisationSteps: [{ number: 4, title: 'OWN STEP', body: 'b' }] }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
      { id: 1, customisationIntro: null, customisationSteps: [], updatedAt: '2026-08-17' },
    )!
    expect(body.product.customisationSteps).toEqual([])
  })
})

describe('the product’s short description', () => {
  it('is projected when set, and is an empty string when not', () => {
    const withText = buildViewerResponse(
      product({ shortDescription: 'A race-fit skinsuit.' }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
    )!
    expect(withText.product.shortDescription).toBe('A race-fit skinsuit.')

    // Every existing product has none — it must project as '' rather than
    // undefined, so the viewer's `||` fallback is the only branch that decides.
    const without = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)!
    expect(without.product.shortDescription).toBe('')
  })
})

describe('buildViewerResponse', () => {
  it('exposes only whitelisted product keys — no internal fields leak', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)
    expect(body).not.toBeNull()
    expect(Object.keys(body!.product).sort()).toEqual(
      [
        'productCode',
        'slug',
        'productName',
        'category',
        'variantMode',
        'glbUrl',
        'posterFallback',
        'fabricComposition',
        'gsm',
        'performanceFeatures',
        'garmentFit',
        'customisationIntroHtml',
        'customisationSteps',
        'camera',
        'catalogueUrl',
        'retiredMessage',
        'shortDescription',
      ].sort(),
    )
    const serialized = JSON.stringify(body)
    expect(serialized).not.toContain('INTERNAL NOTE')
    expect(serialized).not.toContain('secret-source')
    expect(serialized).not.toContain('sourceReference')
  })

  it('exposes only whitelisted colourway keys', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)!
    expect(Object.keys(body.colourways[0]!).sort()).toEqual(
      [
        'variantId',
        'displayName',
        'slug',
        'sequence',
        'poster',
        'glbUrl',
        'isDefault',
        'altText',
        'hexSwatch',
      ].sort(),
    )
  })

  it('never renders the literal text "null"/"undefined" for a blank name or slug', () => {
    // displayName/slug stopped being `required` in the CMS on 2026-08-11, so a
    // swatch-only imported row (buildImportedRow) can reach here with either
    // missing. It would be filtered out by `!poster` above and by the publish
    // gate before a real request ever sees it, but this is the projection's own
    // defence — matching altText's existing `?? ''` three lines below it.
    const body = buildViewerResponse(
      product(),
      [colourway({ displayName: null, slug: undefined })],
      {},
      origin,
      null,
      deps,
    )!
    expect(body.colourways[0]!.displayName).toBe('')
    expect(body.colourways[0]!.slug).toBe('')
  })

  it('skips colourways without a poster and returns null when none are usable', () => {
    expect(
      buildViewerResponse(
        product(),
        [colourway({ posterPreview: null })],
        {},
        origin,
        'navy',
        deps,
      ),
    ).toBeNull()
  })

  it('single-glb: product.glbUrl set, colourway.glbUrl null', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)!
    expect(body.product.glbUrl).toBe('https://cms.example/media/n001.glb')
    expect(body.colourways[0]!.glbUrl).toBeNull()
  })

  it('separate-glb: product.glbUrl null, colourway.glbUrl set', () => {
    const body = buildViewerResponse(
      product({ variantMode: 'separate-glb-per-colour' }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
    )!
    expect(body.product.glbUrl).toBeNull()
    expect(body.colourways[0]!.glbUrl).toBe('https://cms.example/media/navy.glb')
  })

  it('substitutes the default and flags fallback when the requested colourway is missing', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'sage', deps)!
    expect(body.requestedColourwayUnavailable).toBe(true)
    expect(body.fallbackMessage).toBe('retired notice')
    expect(body.selectedColourway.slug).toBe('navy')
  })

  it('no fallback when the requested colourway is present', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)!
    expect(body.requestedColourwayUnavailable).toBe(false)
    expect(body.fallbackMessage).toBeNull()
  })

  // /n001 with no colour segment. The default is served, but this is NOT a
  // fallback: nothing was retired and the visitor asked for nothing, so raising
  // the retired notice here would tell them a colour had gone away when none had.
  it('serves the default without flagging fallback when no colour is requested', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, null, deps)!
    expect(body.selectedColourway.slug).toBe('navy')
    expect(body.requestedColourwayUnavailable).toBe(false)
    expect(body.fallbackMessage).toBeNull()
  })

  it('falls back to DEFAULT_SITE_SETTINGS when the global is empty', () => {
    const body = buildViewerResponse(product(), [colourway()], {}, origin, 'navy', deps)!
    expect(body.siteSettings).toEqual(DEFAULT_SITE_SETTINGS)
  })
})
