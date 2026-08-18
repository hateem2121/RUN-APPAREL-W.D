import type { ViewerApiError } from '@run-apparel/shared'
import { normalizeSlug } from '@run-apparel/shared'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Endpoint, PayloadRequest } from 'payload'
import { buildViewerResponse } from './projectViewer'

/**
 * GET /api/public/viewer/:productSlug/:colourSlug
 * GET /api/public/viewer/:productSlug            → the default colour
 *
 * The single read-only door between the private CMS and the public viewer.
 * Returns published data only, projected to the shared ViewerApiSuccess
 * shape — never drafts, users, internal notes or source-file references. The
 * projection itself lives in ./projectViewer (pure + unit-tested).
 *
 * The colourless form exists because a tag printed with only the product code,
 * or a buyer trimming the URL, produced the "reference unavailable" page for a
 * product that was published and working. It resolves to the default colour and
 * deliberately does NOT set `requestedColourwayUnavailable` — see projectViewer.
 */

/**
 * L2, 2026-08-18. This value used to be built from a three-layer cascade — a
 * `viewerApi.cacheSeconds` field in the CMS, then `VIEWER_API_CACHE_SECONDS`, then
 * a default of 60 — and four tests pinned it.
 *
 * All three layers controlled something with no observable effect here.
 * `perfProbe.test.ts` already recorded the measurement: "a Worker's own response
 * does not pass through the edge cache, so s-maxage buys nothing", and live probes
 * on 2026-08-17 found NO `cf-cache-status` header on these responses at all. A
 * settings field the owner can edit, expecting a performance change and getting
 * none, is worse than no field.
 *
 * ⚠️ THE VALUE IS DELIBERATELY UNCHANGED. The finding is that the knob was inert,
 * not that the directives were wrong — they are correct for the day a shared cache
 * sits in front of this, and changing them here would be an unrequested behaviour
 * change to every repeat view. Hardcoding removes the misleading control, nothing
 * else.
 */
const PUBLIC_CACHE_CONTROL = 'public, s-maxage=60, stale-while-revalidate=300'

/**
 * L1, 2026-08-18. `Vary` named only `Sec-CH-Prefers-Color-Scheme`, and this
 * response's `access-control-allow-origin` VARIES by request Origin — Payload's
 * `cors: allowedOrigins` is an allowlist, verified live: viewer.wear-run.help gets
 * an ACAO header and a hostile origin gets none.
 *
 * A shared cache keyed without Origin can therefore store the no-ACAO variant and
 * serve it to the viewer's cross-origin fetch, which the browser blocks — the page
 * renders "REFERENCE UNAVAILABLE" intermittently, inside the 60s/300s window.
 *
 * Inert today, because nothing caches these (above). Correct now so it stays
 * correct if anything ever does.
 */
const ORIGIN_VARY = 'Origin, Sec-CH-Prefers-Color-Scheme'

const notFound = (message: string): Response => {
  const body: ViewerApiError = { error: 'not_found', message }
  return Response.json(body, {
    status: 404,
    headers: {
      'Cache-Control': 'public, s-maxage=30',
      'X-Robots-Tag': 'noindex',
      // Same reasoning as ORIGIN_VARY below — this response's ACAO varies by
      // request Origin too, and a 404 is exactly the kind of cheap response a
      // shared cache would be most willing to keep.
      Vary: ORIGIN_VARY,
    },
  })
}

const richTextToHtml = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  try {
    return convertLexicalToHTML({
      data: value as Parameters<typeof convertLexicalToHTML>[0]['data'],
    })
  } catch {
    return ''
  }
}

/**
 * One handler, two routes. `expectColour` is what separates "the visitor named a
 * colour and it was mangled" (a broken link → 404) from "the visitor named no
 * colour at all" (→ the default). Deriving that from `params.colourSlug` being
 * empty would collapse the two, and a mangled colour would silently serve the
 * default as though nothing were wrong.
 */
const buildHandler =
  (expectColour: boolean) =>
  async (req: PayloadRequest): Promise<Response> => {
    const params = (req.routeParams ?? {}) as { productSlug?: string; colourSlug?: string }
    const productSlug = normalizeSlug(String(params.productSlug ?? ''))
    if (!productSlug) {
      return notFound('This reference link is not valid.')
    }
    let colourSlug: string | null = null
    if (expectColour) {
      colourSlug = normalizeSlug(String(params.colourSlug ?? ''))
      if (!colourSlug) {
        return notFound('This reference link is not valid.')
      }
    }

    const origin =
      process.env.CMS_PUBLIC_URL && process.env.CMS_PUBLIC_URL.length > 0
        ? process.env.CMS_PUBLIC_URL.replace(/\/$/, '')
        : new URL(req.url ?? 'http://localhost').origin

    const products = await req.payload.find({
      collection: 'products',
      where: {
        and: [{ slug: { equals: productSlug } }, { status: { equals: 'published' } }],
      },
      limit: 1,
      depth: 1,
      req,
    })
    const product = products.docs[0]
    if (!product) {
      return notFound('This product reference is not currently available.')
    }

    // Colours arrive with the product (inline array, populated at depth 1), so
    // the second query this endpoint used to run — a `where` against the old
    // top-level `colourways` collection — is gone. One fewer D1 round trip on
    // every QR scan. Ordering, the active filter and the default colour are all
    // derived from the array itself inside buildViewerResponse.
    const colourwayDocs = Array.isArray(product.colourways) ? product.colourways : []

    // Two globals, one round trip each, in parallel with each other. `build-process`
    // is the universal "How we build your product" copy — read on EVERY request
    // rather than seeded at create time, which is the whole point of it (see
    // globals/BuildProcess.ts). `.catch(() => null)` because a global that cannot
    // be read must degrade to the product's own stored copy, not 500 a garment
    // page: buildViewerResponse treats null exactly as it treats a never-saved
    // global.
    const [settings, buildProcess] = await Promise.all([
      req.payload.findGlobal({ slug: 'site-settings', depth: 0, req }),
      req.payload.findGlobal({ slug: 'build-process', depth: 0, req }).catch(() => null),
    ])

    // The public projection (only whitelisted fields cross this boundary) lives
    // in a pure, unit-tested function. Null → no usable colourway → 404.
    const body = buildViewerResponse(
      product as unknown as Record<string, unknown>,
      colourwayDocs as unknown as Record<string, unknown>[],
      settings as unknown as Record<string, unknown>,
      origin,
      colourSlug,
      { richTextToHtml },
      buildProcess as Record<string, unknown> | null,
    )
    if (!body) {
      return notFound('This product reference is not currently available.')
    }

    return Response.json(body, {
      headers: {
        'Cache-Control': PUBLIC_CACHE_CONTROL,
        Vary: ORIGIN_VARY,
      },
    })
  }

export const publicViewerEndpoint: Endpoint = {
  path: '/public/viewer/:productSlug/:colourSlug',
  method: 'get',
  handler: buildHandler(true),
}

/** GET /api/public/viewer/:productSlug — resolves to the product's default colour. */
export const publicViewerDefaultColourEndpoint: Endpoint = {
  path: '/public/viewer/:productSlug',
  method: 'get',
  handler: buildHandler(false),
}
