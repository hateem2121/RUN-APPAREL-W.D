import type {
  ViewerApiError,
  ViewerApiSuccess,
  ViewerColourway,
  ViewerMediaAsset,
} from '@run-apparel/shared'
import { DEFAULT_SITE_SETTINGS, normalizeSlug } from '@run-apparel/shared'
import { convertLexicalToHTML } from '@payloadcms/richtext-lexical/html'
import type { Endpoint, PayloadRequest } from 'payload'

/**
 * GET /api/public/viewer/:productSlug/:colourSlug
 *
 * The single read-only door between the private CMS and the public viewer.
 * Returns published data only, projected to the shared ViewerApiSuccess
 * shape — never drafts, users, internal notes or source-file references.
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

const absolutize = (url: string | null | undefined, origin: string): string | null => {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

const toMediaAsset = (media: unknown, origin: string): ViewerMediaAsset | null => {
  if (!media || typeof media !== 'object') return null
  const doc = media as {
    url?: string | null
    alt?: string | null
    width?: number | null
    height?: number | null
    mimeType?: string | null
  }
  const url = absolutize(doc.url, origin)
  if (!url) return null
  return {
    url,
    alt: doc.alt ?? '',
    width: doc.width ?? null,
    height: doc.height ?? null,
    mimeType: doc.mimeType ?? null,
  }
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

    const colourwayDocs = await req.payload.find({
      collection: 'colourways',
      where: {
        and: [{ product: { equals: product.id } }, { active: { equals: true } }],
      },
      sort: 'sequence',
      limit: 100,
      depth: 1,
      req,
    })

    const separateMode = product.variantMode === 'separate-glb-per-colour'
    const colourways: ViewerColourway[] = []
    for (const doc of colourwayDocs.docs) {
      const poster = toMediaAsset(doc.posterPreview, origin)
      if (!poster) continue // never expose a colourway without its required poster
      colourways.push({
        variantId: String(doc.variantId),
        displayName: String(doc.displayName),
        slug: String(doc.slug),
        sequence: Number(doc.sequence ?? 0),
        poster,
        glbUrl: separateMode ? (toMediaAsset(doc.glbAsset, origin)?.url ?? null) : null,
        isDefault: Boolean(doc.isDefault),
        altText: String(doc.altText ?? ''),
        hexSwatch: (doc.hexSwatch as string | null) ?? null,
      })
    }
    if (colourways.length === 0) {
      return notFound('This product reference is not currently available.')
    }

    const requested = colourways.find((c) => c.slug === colourSlug) ?? null
    const fallback = colourways.find((c) => c.isDefault) ?? colourways[0]!
    const selectedColourway = requested ?? fallback
    const requestedColourwayUnavailable = requested === null

    const settings = await req.payload.findGlobal({ slug: 'site-settings', depth: 0, req })

    const body: ViewerApiSuccess = {
      product: {
        productCode: String(product.productCode),
        slug: String(product.slug),
        productName: String(product.productName),
        category: product.category as ViewerApiSuccess['product']['category'],
        variantMode: separateMode ? 'separate-glb-per-colour' : 'single-glb-variants',
        presentationMode:
          product.presentationMode === 'invisibleMannequin' ? 'invisibleMannequin' : 'floatingGarment',
        glbUrl: separateMode ? null : (toMediaAsset(product.glbAsset, origin)?.url ?? null),
        posterFallback: toMediaAsset(product.posterFallback, origin),
        fabricComposition: String(product.fabricComposition ?? ''),
        gsm: String(product.gsm ?? ''),
        performanceFeatures: Array.isArray(product.performanceFeatures)
          ? product.performanceFeatures
              .map((item) => String((item as { feature?: unknown }).feature ?? ''))
              .filter(Boolean)
          : [],
        garmentFit: String(product.garmentFit ?? ''),
        customisationIntroHtml: richTextToHtml(product.customisationIntro),
        customisationSteps: Array.isArray(product.customisationSteps)
          ? product.customisationSteps.map((step) => {
              const s = step as { number?: unknown; title?: unknown; body?: unknown }
              return {
                number: Number(s.number ?? 0),
                title: String(s.title ?? ''),
                body: String(s.body ?? ''),
              }
            })
          : [],
        camera: {
          frontCameraOrbit: String(product.frontCameraOrbit ?? '0deg 82deg 105%'),
          backCameraOrbit: String(product.backCameraOrbit ?? '180deg 82deg 105%'),
          sideCameraOrbit: String(product.sideCameraOrbit ?? '90deg 82deg 105%'),
          cameraTarget: String(product.cameraTarget ?? 'auto auto auto'),
          defaultFieldOfView: String(product.defaultFieldOfView ?? '30deg'),
        },
        catalogueUrl: String(
          product.catalogueUrl ?? settings.catalogueUrl ?? DEFAULT_SITE_SETTINGS.catalogueUrl,
        ),
        retiredMessage: String(product.retiredMessage ?? ''),
      },
      colourways,
      selectedColourway,
      requestedColourwayUnavailable,
      fallbackMessage: requestedColourwayUnavailable ? String(product.retiredMessage ?? '') : null,
      siteSettings: {
        companyName: String(settings.companyName ?? DEFAULT_SITE_SETTINGS.companyName),
        email: String(settings.email ?? DEFAULT_SITE_SETTINGS.email),
        whatsappNumber: String(settings.whatsappNumber ?? DEFAULT_SITE_SETTINGS.whatsappNumber),
        catalogueUrl: String(settings.catalogueUrl ?? DEFAULT_SITE_SETTINGS.catalogueUrl),
        temporaryWordmark: String(settings.temporaryWordmark ?? DEFAULT_SITE_SETTINGS.temporaryWordmark),
        footerLine: String(settings.footerLine ?? DEFAULT_SITE_SETTINGS.footerLine),
        legalLine: String(settings.legalLine ?? DEFAULT_SITE_SETTINGS.legalLine),
      },
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
