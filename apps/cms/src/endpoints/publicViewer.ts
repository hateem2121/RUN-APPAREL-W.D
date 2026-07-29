import type { ViewerApiError } from '@run-apparel/shared'
import { normalizeSlug } from '@run-apparel/shared'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Endpoint, PayloadRequest } from 'payload'
import { buildViewerResponse } from './projectViewer'

/**
 * GET /api/public/viewer/:productSlug/:colourSlug
 *
 * The single read-only door between the private CMS and the public viewer.
 * Returns published data only, projected to the shared ViewerApiSuccess
 * shape — never drafts, users, internal notes or source-file references. The
 * projection itself lives in ./projectViewer (pure + unit-tested).
 */

const notFound = (message: string): Response => {
  const body: ViewerApiError = { error: 'not_found', message }
  return Response.json(body, {
    status: 404,
    headers: {
      'Cache-Control': 'public, s-maxage=30',
      'X-Robots-Tag': 'noindex',
    },
  })
}

const richTextToHtml = (value: unknown): string => {
  if (!value || typeof value !== 'object') return ''
  try {
    return convertLexicalToHTML({ data: value as Parameters<typeof convertLexicalToHTML>[0]['data'] })
  } catch {
    return ''
  }
}

export const publicViewerEndpoint: Endpoint = {
  path: '/public/viewer/:productSlug/:colourSlug',
  method: 'get',
  handler: async (req: PayloadRequest) => {
    const params = (req.routeParams ?? {}) as { productSlug?: string; colourSlug?: string }
    const productSlug = normalizeSlug(String(params.productSlug ?? ''))
    const colourSlug = normalizeSlug(String(params.colourSlug ?? ''))
    if (!productSlug || !colourSlug) {
      return notFound('This reference link is not valid.')
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

    const settings = await req.payload.findGlobal({ slug: 'site-settings', depth: 0, req })

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

    const cacheSeconds = Number(
      (settings.viewerApi as { cacheSeconds?: number } | undefined)?.cacheSeconds ??
        process.env.VIEWER_API_CACHE_SECONDS ??
        60,
    )
    return Response.json(body, {
      headers: {
        'Cache-Control': `public, s-maxage=${cacheSeconds}, stale-while-revalidate=${cacheSeconds * 5}`,
      },
    })
  },
}
