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
  /**
   * The `build-process` global — ONE "How we build your product" text for the
   * whole catalogue, since 2026-08-17 (owner decision).
   *
   * ⚠️ AN UNSAVED GLOBAL DOES NOT ARRIVE AS `{}`. This was written believing it
   * did — Products.ts's readCatalogueDefaults says so, and that is true for a
   * global whose fields are all scalars — and it was WRONG here, because this one
   * has an array field. Probed against a real local D1 on 2026-08-17:
   *
   *   never saved   {"customisationSteps":[]}                     <- no id
   *   saved         {id:1, customisationSteps:[…], updatedAt, createdAt, globalType}
   *   saved+cleared {id:1, customisationSteps:[],  updatedAt, …}
   *
   * So the unsaved case and the deliberately-cleared case carry the SAME empty
   * array, and only `id` tells them apart. Deciding on the array alone — which is
   * what shipped first — meant an unsaved global won, discarding every product's
   * own steps on every page at once, for the entire window between this migration
   * deploying and somebody first opening the new screen. That is precisely the
   * failure this fallback exists to prevent, and its own test could not see it
   * because the test asserted a shape Payload never returns.
   *
   * Once SAVED, an empty step list is a real answer and wins — otherwise "delete
   * them all" would silently mean "revert to whatever each product had".
   */
  buildProcess?: Doc | null,
): ViewerApiSuccess | null {
  const separateMode = product.variantMode === 'separate-glb-per-colour'

  // `id` is the discriminator, NOT the array — see the `buildProcess` parameter's
  // comment. It is the only field present in every saved shape and absent from
  // the unsaved one, so it is what separates "nobody has opened this screen yet"
  // from "somebody deliberately cleared it".
  const buildProcessSaved = buildProcess != null && buildProcess.id != null
  const buildSteps =
    buildProcessSaved && Array.isArray(buildProcess.customisationSteps)
      ? buildProcess.customisationSteps
      : product.customisationSteps

  const colourways: ViewerColourway[] = []
  for (const doc of colourwayDocs) {
    // `active` defaults to true, so only an explicit false retires a colour.
    if (doc.active === false) continue
    /**
     * ⚠️ THIS GUARD USED TO BE `if (!poster) continue`, AND REMOVING IT NAIVELY
     * WOULD REGRESS SOMETHING ELSE. Measured live 2026-08-21: with the poster no
     * longer required to publish and no longer painted by the stage, detaching all
     * five of a product's posters dropped every colourway here, `colourways.length`
     * hit 0, and the endpoint 404'd a PUBLISHED garment with QR tags in the field.
     * The publish gate and the viewer were both relaxed that day; this projection
     * was not, so the CMS would happily save a product it then refused to serve.
     *
     * The old line was ALSO the filter that kept a blank imported catalogue row out
     * of the rail — the comment below still relies on something doing that job. A
     * poster is the wrong proxy for it. What actually makes a colourway usable is
     * being ADDRESSABLE: the slug is the URL segment and the string printed on the
     * physical tag, so a row without one can be neither linked nor scanned.
     */
    if (!String(doc.slug ?? '').trim()) continue
    const poster = toMediaAsset(doc.posterPreview, origin)
    colourways.push({
      variantId: String(doc.variantId ?? ''),
      // `?? ''`, not a bare String(doc.displayName): both fields stopped being
      // `required` in the CMS on 2026-08-11 (colourways.ts) so a swatch-only
      // imported row can be saved blank — without the fallback, a colour that
      // somehow reached here still blank would render the literal text "null" or
      // "undefined" on a live button instead of an empty string. The publish gate
      // (publishGating.ts) already refuses to publish one in that state, and the
      // empty-slug guard above already drops an imported row before this line —
      // this is the same defence altText already has three lines down, extended
      // here.
      displayName: String(doc.displayName ?? ''),
      slug: String(doc.slug ?? ''),
      // Numbered by what a visitor actually sees, so a retired or unaddressable
      // colour never leaves a gap in the tab order.
      sequence: colourways.length + 1,
      poster: poster ?? null,
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
      shortDescription: String(product.shortDescription ?? ''),
      // Same gate as the steps: an unsaved global must not blank the paragraph
      // either. `??` on top of it, so a SAVED global with no paragraph written
      // yet still shows the product's rather than nothing.
      customisationIntroHtml: deps.richTextToHtml(
        (buildProcessSaved ? buildProcess.customisationIntro : null) ?? product.customisationIntro,
      ),
      customisationSteps: Array.isArray(buildSteps)
        ? buildSteps.map((step) => {
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
