import type { ViewerApiError } from '@run-apparel/shared'
import { normalizeSlug } from '@run-apparel/shared'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Endpoint, PayloadRequest } from 'payload'
import { buildViewerResponse } from './projectViewer'
import { pickRelated, publishedCards } from './relatedGarments'
import { readViewerCache, viewerCacheKey, writeViewerCache } from './viewerCache'

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
 *
 * ⚠️ THIS HEADER IS NOT WHAT SHIPS, AND SETTING IT HERE WAS NOT ENOUGH. `withPayload`
 * appends a blanket `/:path*` rule carrying `Vary: Sec-CH-Prefers-Color-Scheme`
 * AFTER the app's own `headers()`, and Next lets the last matching rule win — so
 * from the merge of L1 until 2026-08-18 production answered without `Origin` while
 * this constant, and the test asserting it, were both green. What actually puts
 * `Origin` on the wire is the rule appended in `apps/cms/publicViewerHeaders.mjs`,
 * which is pinned by `src/publicViewerHeaders.test.ts` with a negative control.
 * Keep this value in step with `PUBLIC_VIEWER_VARY` there.
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
 * Headers for every 200, from the database or from the in-process cache. One function so
 * the two answers cannot drift apart.
 *
 * ⚠️ `noindex` SINCE 2026-09-30, WHEN robots.txt BEGAN LETTING CRAWLERS FETCH THIS PATH.
 * It had to: a garment page cannot be rendered without this answer, and with the fetch
 * refused Google drew all 205 pages in their did-not-load state (`lib/robotsTxt.ts`,
 * `RENDER_ALLOW`). A crawlable URL is a candidate for a search result, and raw JSON is not
 * a page. The header governs indexing THIS address only; a renderer still uses the body.
 */
const successHeaders = (): Record<string, string> => ({
  'Cache-Control': PUBLIC_CACHE_CONTROL,
  'X-Robots-Tag': 'noindex',
  Vary: ORIGIN_VARY,
})

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

    /*
     * ⚠️ BEFORE THE DATABASE, WHICH IS THE ENTIRE POINT. Measured 2026-09-06, five samples
     * per URL: this endpoint answers in 1,178–1,291 ms against 41–49 ms for the viewer's
     * own HTML and 37–42 ms for the model — 25× slower than anything else on the page, and
     * not a cold start. Isolated against `/api/health` on the same host (265–338 ms),
     * ~900 ms of it is the two D1 reads below plus the projection.
     *
     * The poster's address only arrives in this answer, so nothing on the page can paint
     * until it does. See viewerCache.ts for why the BODY is cached and the Response is
     * not, and for the honest limit: a first scan of a cold isolate is unaffected.
     */
    const cacheKey = viewerCacheKey(origin, productSlug, colourSlug)
    const cached = readViewerCache(cacheKey)
    if (cached) {
      return Response.json(cached, { headers: successHeaders() })
    }

    /*
     * ⚠️ THREE READS AT ONCE, AND EACH AS FEW ROUND TRIPS AS IT CAN BE (2026-10-07). Measured
     * that day from Pakistan: an uncached answer took 4.0–4.5 s, because the CMS Worker runs
     * beside the visitor (`cf-placement: local-ISB`) and the database is in ENAM, ~0.4 s away,
     * and an answer made about ten trips there ONE AFTER ANOTHER: the garment's count, the
     * garment, its pictures, its CLO files, then the settings beside the list's count, the
     * list, its pictures and its CLO files. Three changes, none of which alters a byte of the
     * answer (publicViewer.test.ts proves that and counts the trips):
     * - `pagination: false`: Payload otherwise runs a COUNT before the read (drizzle
     *   `findMany`), and nothing here reads totalDocs or a page number;
     * - `joins: false`: the `rawUploads` join (the 3D file tab's "Your CLO files") is a
     *   subquery plus a fetch of those uploads, and neither projectViewer.ts nor
     *   projectPublic.ts reads it;
     * - the settings and the list start WITH the garment instead of after it. On an unknown
     *   slug that spends a settings read on a 404 (the list is kept a minute per isolate), a
     *   fair price for every real scan.
     */
    const [products, settings, cards] = await Promise.all([
      req.payload.find({
        collection: 'products',
        where: {
          and: [{ slug: { equals: productSlug } }, { status: { equals: 'published' } }],
        },
        limit: 1,
        depth: 1,
        pagination: false,
        joins: false,
        req,
      }),
      // ⚠️ ONE global now, not two. `build-process` was read here on every public
      // request until 2026-09-05 and is retired — see the docblock on
      // buildViewerResponse for why a shared copy that silently overrode eleven
      // garments' bespoke text had to go.
      req.payload.findGlobal({ slug: 'site-settings', depth: 0, req }),
      // The other garments for "More from <category>" (polish S6): relatedGarments.ts says
      // why they travel in this answer, and keeps them a minute per isolate.
      publishedCards(req.payload),
    ])
    const product = products.docs[0]
    if (!product) {
      return notFound('This product reference is not currently available.')
    }

    // Colours arrive with the product (inline array, populated at depth 1), so
    // the second query this endpoint used to run — a `where` against the old
    // top-level `colourways` collection — is gone. Ordering, the active filter and
    // the default colour are all derived from the array itself inside buildViewerResponse.
    const colourwayDocs = Array.isArray(product.colourways) ? product.colourways : []

    // The public projection (only whitelisted fields cross this boundary) lives
    // in a pure, unit-tested function. Null → no usable colourway → 404.
    const body = buildViewerResponse(
      product as unknown as Record<string, unknown>,
      colourwayDocs as unknown as Record<string, unknown>[],
      settings as unknown as Record<string, unknown>,
      origin,
      colourSlug,
      { richTextToHtml },
    )
    if (!body) {
      return notFound('This product reference is not currently available.')
    }
    body.related = pickRelated(cards, body.product.slug, body.product.category)

    // Only a successful projection is stored. A 404 or a D1 wobble stays a bad request
    // rather than becoming a bad minute — the same rule src/lib/content.ts follows.
    writeViewerCache(cacheKey, body)

    return Response.json(body, { headers: successHeaders() })
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
