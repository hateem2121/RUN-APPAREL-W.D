import {
  DEFAULT_SITE_SETTINGS,
  type ViewerApiSuccess,
  type ViewerColourway,
  type ViewerMediaAsset,
} from '@run-apparel/shared'

/**
 * Pure projection from CMS documents to the public ViewerApiSuccess shape.
 * Extracted from the endpoint so the data-exposure contract (only whitelisted
 * fields ever cross the boundary — never users, notes, drafts or source
 * references) is unit-testable without a database. The lexical→HTML converter
 * is injected so this module carries no heavy Payload richtext dependency.
 */

export const absolutize = (url: string | null | undefined, origin: string): string | null => {
  if (!url) return null
  if (/^https?:\/\//.test(url)) return url
  return `${origin}${url.startsWith('/') ? '' : '/'}${url}`
}

export const toMediaAsset = (media: unknown, origin: string): ViewerMediaAsset | null => {
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

type Doc = Record<string, unknown>

export interface ProjectionDeps {
  /** Convert a lexical richtext value to sanitised HTML. */
  richTextToHtml: (value: unknown) => string
}

/**
 * Build the public viewer payload, or `null` when the product has no active
 * colourway with a usable poster (the endpoint turns null into a 404).
 */
export function buildViewerResponse(
  product: Doc,
  colourwayDocs: Doc[],
  settings: Doc,
  origin: string,
  colourSlug: string,
  deps: ProjectionDeps,
): ViewerApiSuccess | null {
  const separateMode = product.variantMode === 'separate-glb-per-colour'

  const colourways: ViewerColourway[] = []
  for (const doc of colourwayDocs) {
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
  if (colourways.length === 0) return null

  const requested = colourways.find((c) => c.slug === colourSlug) ?? null
  const fallback = colourways.find((c) => c.isDefault) ?? colourways[0]!
  const selectedColourway = requested ?? fallback
  const requestedColourwayUnavailable = requested === null

  return {
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
      customisationIntroHtml: deps.richTextToHtml(product.customisationIntro),
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
}
