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

describe('the customisation copy comes from the product, and only the product', () => {
  /**
   * ⚠️ THIS SUITE ASSERTED THE OPPOSITE UNTIL 2026-09-05, and the behaviour it
   * guarded was a loaded gun.
   *
   * "How we build your product" was ONE text for the whole catalogue from
   * 2026-08-17 (owner decision), read from the `build-process` global on every
   * public request. It won over a product's own copy as soon as it was SAVED —
   * the discriminator was `id`, "has anyone ever opened this screen", not "does
   * it contain anything". So one save replaced the customisation copy on all
   * eleven live garments at once, and saving it EMPTY served zero steps
   * everywhere, because `Array.isArray([])` is true.
   *
   * On 2026-09-04 the owner asked for the reverse — "for each garment you can
   * draft its unique version that is personalised according to that garment" —
   * and eleven bespoke step sets were written and published. The global then had
   * exactly one effect available to it: destroying that work in a single click,
   * from a screen labelled invitingly in the sidebar. A note in a CLAUDE.md
   * telling people not to open it is not a control, which is why this is a code
   * change rather than a warning.
   *
   * The projection no longer takes the global at all. These tests exist to keep
   * it that way: the first one fails the moment anything reintroduces an
   * override.
   */
  const own = [{ number: 4, title: 'OWN STEP', body: 'own body' }]

  it('is the product’s own, with no global able to reach it', () => {
    const body = buildViewerResponse(
      product({ customisationSteps: own }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
    )!
    expect(body.product.customisationSteps).toEqual(own)
  })

  it('an empty step list on the product is a real answer', () => {
    // Deleting a product's steps must actually remove the accordion from ITS
    // page — the section is hidden when the array is empty.
    const body = buildViewerResponse(
      product({ customisationSteps: [] }),
      [colourway()],
      {},
      origin,
      'navy',
      deps,
    )!
    expect(body.product.customisationSteps).toEqual([])
  })

  it('the intro is the product’s own richText', () => {
    // A capturing stub rather than the shared one at the top of this file, which
    // returns a constant and so cannot tell WHICH value reached it. What is being
    // proved here is the argument, not the output.
    const seen: unknown[] = []
    const capture = {
      richTextToHtml: (v: unknown) => {
        seen.push(v)
        return '<p>x</p>'
      },
    }
    buildViewerResponse(
      product({ customisationIntro: { root: { OWN: true } } }),
      [colourway()],
      {},
      origin,
      'navy',
      capture,
    )
    expect(seen).toContainEqual({ root: { OWN: true } })
  })

  /**
   * ⚠️ THE ARITY IS THE GUARD, and it is deliberate rather than incidental.
   * `buildViewerResponse` used to take the global as a seventh argument. Removing
   * the parameter means any attempt to pass one is a TYPE ERROR rather than a
   * silently ignored argument — so a future change cannot half-reintroduce the
   * override and have it look wired up.
   */
  it('takes no global argument at all', () => {
    expect(buildViewerResponse.length).toBe(6)
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

  it('never renders the literal text "null"/"undefined" for a blank name', () => {
    // displayName stopped being `required` in the CMS on 2026-08-11, so a
    // swatch-only imported row (buildImportedRow) can reach here without one. The
    // publish gate refuses to publish it and the empty-slug guard drops it before a
    // real request ever sees it, but this is the projection's own defence —
    // matching altText's existing `?? ''` a few lines below it.
    //
    // SPLIT from a combined name+slug test on 2026-08-21: a blank SLUG is no longer
    // rendered as '', it is dropped outright (next test), so the two halves now
    // assert opposite things and cannot share a case.
    const body = buildViewerResponse(
      product(),
      [colourway({ displayName: null })],
      {},
      origin,
      null,
      deps,
    )!
    expect(body.colourways[0]!.displayName).toBe('')
  })

  it('drops a colourway with no slug — it can be neither linked nor scanned', () => {
    // The addressability guard that REPLACED `if (!poster) continue`. A row with no
    // slug has no URL segment and nothing to print on a tag, so it must not reach
    // the rail; when it is the only row there is nothing to serve.
    expect(
      buildViewerResponse(product(), [colourway({ slug: undefined })], {}, origin, null, deps),
    ).toBeNull()
  })

  it('SERVES a colourway that has no poster', () => {
    /**
     * ⚠️ THIS TEST ASSERTED THE OPPOSITE UNTIL 2026-08-21, and the behaviour it
     * pinned took the live site down. It read "skips colourways without a poster
     * and returns null when none are usable" — so when the poster stopped being
     * required to publish and stopped being painted by the stage, detaching a
     * published garment's five posters dropped all five colourways here and the
     * endpoint 404'd it. Every gate was green; the test agreed with the bug because
     * the bug was the specification.
     *
     * A poster is no longer part of what makes a colourway usable. Being
     * ADDRESSABLE is, which the test above pins.
     */
    const body = buildViewerResponse(
      product(),
      [colourway({ posterPreview: null })],
      {},
      origin,
      'navy',
      deps,
    )
    expect(body, 'a poster-less colourway must still be served').not.toBeNull()
    expect(body!.colourways).toHaveLength(1)
    expect(body!.colourways[0]!.slug).toBe('navy')
    expect(body!.colourways[0]!.poster).toBeNull()
    // The rest of the payload is unaffected — this is the whole point.
    expect(body!.colourways[0]!.hexSwatch).toBe('#123456')
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
