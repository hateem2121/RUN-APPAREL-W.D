import type { PayloadRequest } from 'payload'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { publicViewerDefaultColourEndpoint, publicViewerEndpoint } from './publicViewer'

/**
 * The HANDLER half of the only public door in this system.
 *
 * WHY THIS IS A SEPARATE FILE FROM projectViewer.test.ts. That file tests the
 * projection — which fields cross the boundary — and it is thorough. It cannot test
 * any of what is here, because none of it is in the projection: the two route
 * registrations, the slug normalisation, the 404 body/status/headers, the cache
 * lifetime, and the `expectColour` distinction. All of that lives in the handler,
 * and the handler was at 0% coverage. "The projection is tested" reads as "the
 * endpoint is tested" and is not the same claim.
 *
 * THE ONE THAT WOULD ACTUALLY BITE. `expectColour` separates "the visitor named a
 * colour and it was mangled" (a broken QR → 404) from "the visitor named no colour"
 * (→ the default). Collapsing the two — the obvious "simplification", since both
 * end up checking an empty string — makes a mistyped colourway slug silently serve
 * the default garment as though nothing were wrong. A buyer scanning a tag for Wine
 * would be shown Navy and told nothing. There is no error, no log, and no automated
 * signal anywhere else in the repo that would notice; the colourway-slug contract is
 * printed on physical tags, so this is unrecoverable after the fact.
 *
 * `X-Robots-Tag: noindex` on the 404 is likewise asserted rather than assumed: these
 * URLs are printed on garment tags and get scraped, and an indexed "not available"
 * page for a real product code is a lasting embarrassment rather than a bug.
 */

const media = (url: string) => ({
  url,
  alt: 'a',
  width: 1200,
  height: 1500,
  mimeType: 'image/webp',
})

const PRODUCT = {
  productCode: 'N001',
  slug: 'n001',
  productName: 'Velocity Tee',
  category: 'Sportswear',
  variantMode: 'single-glb-variants',
  glbAsset: media('/media/n001.glb'),
  posterFallback: media('/media/fallback.webp'),
  status: 'published',
  colourways: [
    {
      variantId: 'N001-NAVY',
      displayName: 'Navy',
      slug: 'navy',
      sequence: 1,
      posterPreview: media('/media/navy.webp'),
      altText: 'navy',
      active: true,
    },
    {
      variantId: 'N001-WINE',
      displayName: 'Wine',
      slug: 'wine',
      sequence: 2,
      posterPreview: media('/media/wine.webp'),
      altText: 'wine',
      active: true,
    },
  ],
}

interface ReqOptions {
  product?: Record<string, unknown> | null
  settings?: Record<string, unknown>
  url?: string
}

const makeReq = (
  routeParams: Record<string, string>,
  { product = PRODUCT, settings = {}, url = 'https://cms.example/api/x' }: ReqOptions = {},
): { req: PayloadRequest; find: ReturnType<typeof vi.fn> } => {
  const find = vi.fn().mockResolvedValue({ docs: product ? [product] : [] })
  const req = {
    routeParams,
    url,
    payload: {
      find,
      findGlobal: vi.fn().mockResolvedValue(settings),
    },
  } as unknown as PayloadRequest
  return { req, find }
}

const withColour = publicViewerEndpoint.handler as (req: PayloadRequest) => Promise<Response>
const defaultColour = publicViewerDefaultColourEndpoint.handler as (
  req: PayloadRequest,
) => Promise<Response>

afterEach(() => {
  delete process.env.CMS_PUBLIC_URL
})

describe('public viewer endpoint registration', () => {
  it('registers both routes, and the colourless one is a distinct path', () => {
    expect(publicViewerEndpoint.path).toBe('/public/viewer/:productSlug/:colourSlug')
    expect(publicViewerDefaultColourEndpoint.path).toBe('/public/viewer/:productSlug')
    expect(publicViewerEndpoint.method).toBe('get')
    expect(publicViewerDefaultColourEndpoint.method).toBe('get')
  })
})

describe('GET /api/public/viewer/:productSlug/:colourSlug', () => {
  it('serves the requested colourway with a cacheable response', async () => {
    const { req } = makeReq({ productSlug: 'n001', colourSlug: 'wine' })
    const res = await withColour(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      colourways: { slug: string }[]
      selectedColourway: { slug: string }
    }
    expect(body.colourways.map((c) => c.slug)).toEqual(['navy', 'wine'])
    expect(body.selectedColourway.slug).toBe('wine')
    // L1 + L2, 2026-08-18. These two used to prove a CONFIGURABLE value reached
    // the header. The value is now a constant, because all three configuration
    // layers controlled something with no observable effect — perfProbe.test.ts
    // records that a Worker's own response never reaches the edge cache. The
    // directives themselves are unchanged on purpose: the finding was the inert
    // knob, not the header.
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
    // ACAO on this response varies by request Origin (Payload's cors allowlist,
    // verified live against a hostile origin). Without Origin in Vary a shared
    // cache can serve the no-ACAO variant to the viewer's cross-origin fetch and
    // the browser blocks it — "REFERENCE UNAVAILABLE", intermittently.
    expect(res.headers.get('Vary')).toContain('Origin')
    expect(res.headers.get('Vary')).toContain('Sec-CH-Prefers-Color-Scheme')
  })

  it('only ever queries for PUBLISHED products', async () => {
    // The single most important line in the handler: drop the status clause and every
    // draft garment — including ones with placeholder pricing or half-finished
    // artwork — becomes reachable by anyone who guesses the slug.
    const { req, find } = makeReq({ productSlug: 'n001', colourSlug: 'navy' })
    await withColour(req)

    const where = find.mock.calls[0]?.[0]?.where as { and?: Record<string, unknown>[] }
    expect(JSON.stringify(where.and)).toContain('"status":{"equals":"published"}')
  })

  it.each([
    ['an empty product slug', { productSlug: '', colourSlug: 'navy' }],
    ['a missing product slug', { colourSlug: 'navy' }],
    ['an empty colour slug', { productSlug: 'n001', colourSlug: '' }],
    ['a colour slug that normalises to nothing', { productSlug: 'n001', colourSlug: '///' }],
  ])('404s on %s without touching the database', async (_label, params) => {
    const { req, find } = makeReq(params as Record<string, string>)
    const res = await withColour(req)

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({
      error: 'not_found',
      message: 'This reference link is not valid.',
    })
    expect(find, 'a malformed link must not cost a D1 query').not.toHaveBeenCalled()
  })

  it('404s when the product is not published or does not exist', async () => {
    const { req } = makeReq({ productSlug: 'nope', colourSlug: 'navy' }, { product: null })
    const res = await withColour(req)

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toMatchObject({ error: 'not_found' })
  })

  it('404s when the product has no active colourway left', async () => {
    const retired = {
      ...PRODUCT,
      colourways: PRODUCT.colourways.map((c) => ({ ...c, active: false })),
    }
    const { req } = makeReq({ productSlug: 'n001', colourSlug: 'navy' }, { product: retired })
    const res = await withColour(req)

    expect(res.status).toBe(404)
  })

  it('marks every 404 noindex and gives it a short shared cache life', async () => {
    const { req } = makeReq({ productSlug: 'gone', colourSlug: 'navy' }, { product: null })
    const res = await withColour(req)

    expect(res.headers.get('X-Robots-Tag')).toBe('noindex')
    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=30')
    // A 404 is the cheapest thing a shared cache would keep, and its ACAO varies
    // by Origin exactly as the 200's does.
    expect(res.headers.get('Vary')).toContain('Origin')
  })

  it('IGNORES a cache lifetime left in site settings — the knob is gone', async () => {
    // L2, 2026-08-18. This test used to assert the opposite: that a settings value
    // reached the header. It is INVERTED rather than deleted, because the removal
    // is the behaviour worth pinning. A stale `cacheSeconds` may still sit in the
    // D1 row — the column was deliberately left in place rather than rebuilding
    // the table — and it must not come back to life.
    const { req } = makeReq(
      { productSlug: 'n001', colourSlug: 'navy' },
      { settings: { viewerApi: { cacheSeconds: 120 } } },
    )
    const res = await withColour(req)

    expect(res.headers.get('Cache-Control')).toBe('public, s-maxage=60, stale-while-revalidate=300')
    expect(res.headers.get('Cache-Control')).not.toContain('120')
  })
})

describe('GET /api/public/viewer/:productSlug (colourless form)', () => {
  /**
   * This route exists because a tag printed with only the product code, or a buyer
   * trimming the URL back, produced the "reference unavailable" page for a product
   * that was published and working.
   */
  it('resolves to the default colour with no colour slug supplied', async () => {
    const { req } = makeReq({ productSlug: 'n001' })
    const res = await defaultColour(req)

    expect(res.status).toBe(200)
    const body = (await res.json()) as {
      selectedColourway: { slug: string }
      requestedColourwayUnavailable: boolean
      fallbackMessage: string | null
    }
    expect(body.selectedColourway.slug).toBe('navy')

    // The handler's own comment says this route "deliberately does NOT set
    // requestedColourwayUnavailable", and that is a visitor-facing difference rather
    // than an implementation detail: setting it would show someone who simply trimmed
    // the URL the notice "the colourway linked by this QR is no longer active",
    // implying their tag is dead when nothing is wrong with it.
    expect(body.requestedColourwayUnavailable).toBe(false)
    expect(body.fallbackMessage).toBeNull()
  })

  it('still 404s on a product slug that normalises to nothing', async () => {
    const { req, find } = makeReq({ productSlug: '  ' })
    const res = await defaultColour(req)

    expect(res.status).toBe(404)
    expect(find).not.toHaveBeenCalled()
  })

  /**
   * THE ASYMMETRY THAT MUST NOT BE "SIMPLIFIED" AWAY. Same empty colour slug, two
   * different correct answers, decided only by which route was matched. If these two
   * assertions ever agree, a mangled colourway on a printed QR tag has started
   * silently serving the default garment.
   */
  it('distinguishes "named no colour" from "named a colour that was mangled"', async () => {
    const trimmed = makeReq({ productSlug: 'n001' })
    const mangled = makeReq({ productSlug: 'n001', colourSlug: '' })

    expect(await defaultColour(trimmed.req).then((r) => r.status)).toBe(200)
    expect(await withColour(mangled.req).then((r) => r.status)).toBe(404)
  })
})

describe('asset origin resolution', () => {
  it('uses CMS_PUBLIC_URL when set, so media URLs are absolute for crawlers', async () => {
    process.env.CMS_PUBLIC_URL = 'https://cms.wear-run.help/'
    const { req } = makeReq({ productSlug: 'n001', colourSlug: 'navy' })
    const body = (await withColour(req).then((r) => r.json())) as {
      product: { posterFallback: { url: string } }
    }

    // Note the trailing slash on the env var: it must be stripped, or every asset URL
    // arrives with a double slash and the link-preview card silently loses its image.
    expect(body.product.posterFallback.url).toBe('https://cms.wear-run.help/media/fallback.webp')
  })

  it('falls back to the request origin when CMS_PUBLIC_URL is unset', async () => {
    const { req } = makeReq(
      { productSlug: 'n001', colourSlug: 'navy' },
      { url: 'https://fallback.example/api/public/viewer/n001/navy' },
    )
    const body = (await withColour(req).then((r) => r.json())) as {
      product: { posterFallback: { url: string } }
    }

    expect(body.product.posterFallback.url).toBe('https://fallback.example/media/fallback.webp')
  })
})
