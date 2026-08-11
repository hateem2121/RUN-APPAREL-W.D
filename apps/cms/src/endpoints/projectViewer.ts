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
 *
 * `colourwayDocs` used to be separate `colourways` documents fetched with their
 * own query; it is now `product.colourways`, the inline array. The signature is
 * unchanged on purpose — this projection IS the public API contract, and its
 * tests are the only thing standing between a refactor and a broken viewer.
 *
 * Three values are now DERIVED here rather than stored, so nobody has to keep
 * them in step by hand:
 *   - `sequence`  — position among the colours actually on show (01, 02, 03…)
 *   - `isDefault` — the first colour on show, i.e. the topmost switched-on row
 *   - the active filter — previously a `where` clause on the dropped collection
 */
export function buildViewerResponse(
  product: Doc,
  colourwayDocs: Doc[],
  settings: Doc,
  origin: string,
  /** null = the visitor did not name a colour ("/n001"), not "the colour is gone". */
  colourSlug: string | null,
  deps: ProjectionDeps,
): ViewerApiSuccess | null {
  const separateMode = product.variantMode === 'separate-glb-per-colour'

  const colourways: ViewerColourway[] = []
  for (const doc of colourwayDocs) {
    // `active` defaults to true, so only an explicit false retires a colour.
    if (doc.active === false) continue
    const poster = toMediaAsset(doc.posterPreview, origin)
    if (!poster) continue // never expose a colourway without its required poster
    colourways.push({
      variantId: String(doc.variantId ?? ''),
      // `?? ''`, not a bare String(doc.displayName): both fields stopped being
      // `required` in the CMS on 2026-08-11 (colourways.ts) so a swatch-only
      // imported row can be saved blank — without the fallback, a colour that
      // somehow reached here still blank would render the literal text "null" or
      // "undefined" on a live button instead of an empty string. The publish gate
      // (publishGating.ts) already refuses to publish one in that state, and
      // `!poster` above already drops an imported row before this line — this is
      // the same defence altText already has three lines down, extended here.
      displayName: String(doc.displayName ?? ''),
      slug: String(doc.slug ?? ''),
      // Numbered by what a visitor actually sees, so a retired or poster-less
      // colour never leaves a gap in the tab order.
      sequence: colourways.length + 1,
      poster,
      glbUrl: separateMode ? (toMediaAsset(doc.glbAsset, origin)?.url ?? null) : null,
      isDefault: colourways.length === 0,
      altText: String(doc.altText ?? ''),
      hexSwatch: (doc.hexSwatch as string | null) ?? null,
    })
  }
  if (colourways.length === 0) return null

  // `colourSlug === null` is "/n001" — no colour was named at all. That is not a
  // missing colour, so it must not raise the retired notice: telling a visitor a
  // colourway has been discontinued when they never asked for one is a lie the
  // page cannot walk back.
  const requested =
    colourSlug === null ? null : (colourways.find((c) => c.slug === colourSlug) ?? null)
  // The first colour on show is the default, by construction above.
  const selectedColourway = requested ?? colourways[0]!
  const requestedColourwayUnavailable = colourSlug !== null && requested === null

  return {
    product: {
      productCode: String(product.productCode),
      slug: String(product.slug),
      productName: String(product.productName),
      category: product.category as ViewerApiSuccess['product']['category'],
      variantMode: separateMode ? 'separate-glb-per-colour' : 'single-glb-variants',
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
      temporaryWordmark: String(
        settings.temporaryWordmark ?? DEFAULT_SITE_SETTINGS.temporaryWordmark,
      ),
      footerLine: String(settings.footerLine ?? DEFAULT_SITE_SETTINGS.footerLine),
      legalLine: String(settings.legalLine ?? DEFAULT_SITE_SETTINGS.legalLine),
    },
  }
}
