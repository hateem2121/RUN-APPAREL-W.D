import {
  DEFAULT_SITE_SETTINGS,
  specGroups,
  specNote,
  type ViewerApiSuccess,
  type ViewerColourway,
  type ViewerMediaAsset,
} from '@run-apparel/shared'
import { isAddressableColourway } from '../lib/colourwayAccess'
import { projectFooter } from '../lib/projectPublic'
import { onSiteMedia } from '../lib/siteMedia'

/**
 * Pure projection from CMS documents to the public ViewerApiSuccess shape.
 * Extracted from the endpoint so the data-exposure contract (only whitelisted
 * fields ever cross the boundary — never users, notes, drafts or source
 * references) is unit-testable without a database. The lexical→HTML converter
 * is injected so this module carries no heavy Payload richtext dependency.
 */

export const absolutize = (url: string | null | undefined, origin: string): string | null => {
  if (!url) return null
  // The garment pages are on wear-run.com since 2026-09-28: name the media bucket by its
  // address on that site, or `same-site` blocks every poster (lib/siteMedia.ts).
  if (/^https?:\/\//.test(url)) return onSiteMedia(url)
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

/**
 * A model's size in bytes, as Payload recorded it on upload, or null (polish F12, 2026-10-04).
 * The garment page's download percentage needs a total, and the media host sends models gzipped
 * with no `content-length` (ViewerProduct.glbBytes). Checked live before relying on it: all 40
 * models in use carry one, and three read back from the host byte for byte.
 */
export const mediaBytes = (media: unknown): number | null => {
  if (!media || typeof media !== 'object') return null
  const size = (media as { filesize?: unknown }).filesize
  return typeof size === 'number' && Number.isFinite(size) && size > 0 ? size : null
}

/** The name a render's screen-sized copy is made under: `<render name>-screen.webp` (F16). */
export const screenCopyName = (renderFilename: string): string =>
  `${renderFilename.replace(/\.[^.]+$/, '')}-screen.webp`

/**
 * The colour's screen-sized render copy, or null (polish D9 / F16, 2026-10-04). Sent only while
 * its file name is the one made from the render the colour holds NOW: a render replaced in the
 * CMS keeps its old copy linked until a new copy is made, and that copy would show the old
 * picture in the 3D window while the full-screen view showed the new one. Without a match the
 * page shows the full render, which is always right, only heavier.
 */
export const toScreenCopy = (
  render: unknown,
  copy: unknown,
  origin: string,
): ViewerMediaAsset | null => {
  if (!render || typeof render !== 'object' || !copy || typeof copy !== 'object') return null
  const renderName = (render as { filename?: unknown }).filename
  const copyName = (copy as { filename?: unknown }).filename
  if (typeof renderName !== 'string' || copyName !== screenCopyName(renderName)) return null
  return toMediaAsset(copy, origin)
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
   * ⚠️ THE `build-process` GLOBAL IS NO LONGER READ HERE, AND THIS PARAMETER IS
   * GONE. Retired 2026-09-05 by owner decision, reversing the 2026-08-17 one.
   *
   * That global held ONE "How we build your product" text for the whole
   * catalogue, and it won over every product's own copy the moment it was saved
   * — the discriminator was `id`, i.e. "has anyone ever opened this screen",
   * not "does it have anything in it". So a single save replaced the
   * customisation copy on all eleven live garments, and saving it EMPTY served
   * zero steps everywhere, because `Array.isArray([])` is true.
   *
   * On 2026-09-04 the owner asked for per-garment copy instead — "for each
   * garment you can draft its unique version that is personalised according to
   * that garment" — and eleven bespoke step sets were written and published.
   * A global that silently overwrites all of them is then not a feature with a
   * warning attached; it is a loaded gun, and a note telling people not to open
   * a screen in their own CMS is not a control.
   *
   * The steps and the intro now come from the product, always. The global still
   * exists in the schema and its table is untouched — `presentation_mode` is the
   * precedent, retired in place on 2026-08-09 — but nothing reads it, and it is
   * hidden from the admin so it cannot be opened by accident. Deleting the
   * columns would mean a D1 table rebuild, which the root CLAUDE.md calls the
   * single most hazardous operation in this repo.
   */
): ViewerApiSuccess | null {
  const separateMode = product.variantMode === 'separate-glb-per-colour'

  const buildSteps = product.customisationSteps

  const colourways: ViewerColourway[] = []
  for (const doc of colourwayDocs) {
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
    if (!isAddressableColourway(doc)) continue
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
      // The HD studio render behind the "HD IMAGE" button; null hides the button.
      render: toMediaAsset(doc.renderImage, origin),
      // Its screen-sized copy, for the 3D window (D9 / F16); null when none matches it.
      renderScreen: toScreenCopy(doc.renderImage, doc.renderScreen, origin),
      glbUrl: separateMode ? (toMediaAsset(doc.glbAsset, origin)?.url ?? null) : null,
      glbBytes: separateMode ? mediaBytes(doc.glbAsset) : null,
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

  const specFields = {
    fabricComposition: String(product.fabricComposition ?? ''),
    gsm: String(product.gsm ?? ''),
    performanceFeatures: Array.isArray(product.performanceFeatures)
      ? product.performanceFeatures
          .map((item) => String((item as { feature?: unknown }).feature ?? ''))
          .filter(Boolean)
      : [],
    garmentFit: String(product.garmentFit ?? ''),
  }

  return {
    product: {
      productCode: String(product.productCode),
      slug: String(product.slug),
      productName: String(product.productName),
      category: product.category as ViewerApiSuccess['product']['category'],
      variantMode: separateMode ? 'separate-glb-per-colour' : 'single-glb-variants',
      glbUrl: separateMode ? null : (toMediaAsset(product.glbAsset, origin)?.url ?? null),
      glbBytes: separateMode ? null : mediaBytes(product.glbAsset),
      posterFallback: toMediaAsset(product.posterFallback, origin),
      ...specFields,
      // The page's four fact groups with the glossary's notes (polish D10). Built here, not in
      // the page, so a corrected note goes live with a CMS deploy and the page stays small.
      specs: specGroups(specFields, specNote),
      shortDescription: String(product.shortDescription ?? ''),
      garmentType: String(product.garmentType ?? '').trim(),
      customisationIntroHtml: deps.richTextToHtml(product.customisationIntro),
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
      /*
       * The website's footer, projected by the website's own function from the same document
       * (visual audit VA-31, owner-approved 2026-10-01; the test that kept it off this payload,
       * XS-08 in contactParity.test.ts, was changed with the owner's okay on 2026-10-02). Every
       * field is public website copy or a public claim, the same words every website page
       * prints, so the whitelist above still holds: nothing private crosses.
       */
      footer: projectFooter(settings),
    },
  }
}
