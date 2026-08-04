import { DEFAULT_SITE_SETTINGS } from '@run-apparel/shared'
import { describe, expect, it } from 'vitest'
import { absolutize, buildViewerResponse, toMediaAsset } from './projectViewer'

const deps = { richTextToHtml: () => '<p>intro</p>' }
const origin = 'https://cms.example'
const media = (url: string) => ({ url, alt: 'a', width: 1200, height: 1500, mimeType: 'image/webp' })

const product = (o: Record<string, unknown> = {}) => ({
  productCode: 'N001',
  slug: 'n001',
  productName: 'Velocity Tee',
  category: 'Sportswear',
  variantMode: 'single-glb-variants',
  presentationMode: 'floatingGarment',
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
        'presentationMode',
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

  it('skips colourways without a poster and returns null when none are usable', () => {
    expect(
      buildViewerResponse(product(), [colourway({ posterPreview: null })], {}, origin, 'navy', deps),
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
