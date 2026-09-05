import { DEFAULT_SITE_SETTINGS, type ViewerSiteSettings } from '@run-apparel/shared'
import { isAddressableColourway } from './colourwayAccess'

/**
 * Pure projections for the public marketing pages.
 *
 * WHY THESE ARE SEPARATE FROM content.ts. `apps/cms/vitest.config.ts` excludes
 * "bootstrap + I/O shells with no branch of their own" from coverage and says the
 * honest way to raise the number is an integration suite, not a wider include
 * pattern. The rules below are neither bootstrap nor I/O: they decide what a buyer
 * sees, they have real branches, and they are exactly the logic that would silently
 * rot. So they live here, take plain objects, and are unit-tested — while content.ts
 * stays a thin Payload wrapper around them.
 */

/**
 * The shared settings the viewer also uses, plus the one field only the public site
 * needs. Kept as an EXTENSION rather than added to ViewerSiteSettings in
 * packages/shared: that type is the viewer's API contract, and the viewer has no tab
 * icon to set. Widening it would push a field into the public viewer payload that
 * nothing there reads.
 */
/** Working hours, parsed. Days are 0–6 with Sunday 0, matching `Date#getDay()`. */
export interface FooterHours {
  firstDay: number
  lastDay: number
  /** `HH:MM`, works local time (Asia/Karachi). */
  open: string
  close: string
}

export interface FooterSettings {
  ctaLabel: string
  ctaQuestion: string
  ctaSubline: string
  ctaPromise: string
  capacity: { moq: string; leadTime: string; hours: FooterHours | null }
  worksCoordinates: string
  certifications: string[]
  socialLinks: { label: string; url: string }[]
}

export interface PublicSiteSettings extends ViewerSiteSettings {
  /** Owner-uploaded tab icon. `null` falls back to the built-in mark in public/. */
  logoUrl: string | null
  logoMimeType: string | null
  /**
   * cms-only, NOT on the shared ViewerSiteSettings: the viewer API returns that type
   * to the 3D pages, and its fixtures and smoke gates must not move for a footer.
   */
  footer: FooterSettings
}

/**
 * Copy has a default; a claim does not. The split is the whole point of this object —
 * a blank certification list renders NO block, never an example one.
 */
export const EMPTY_FOOTER: FooterSettings = {
  ctaLabel: 'Start an enquiry',
  ctaQuestion: 'Have a garment that needs making properly?',
  ctaSubline: 'Send a tech pack, a sketch, or just the idea.',
  ctaPromise: 'Reply within 2 business days',
  capacity: { moq: '', leadTime: '', hours: null },
  worksCoordinates: '',
  certifications: [],
  socialLinks: [],
}

const DAY_INDEX: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 }
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

function projectHours(capacity: Record<string, unknown> | null): FooterHours | null {
  const first = DAY_INDEX[text(capacity?.hoursFirstDay)]
  const last = DAY_INDEX[text(capacity?.hoursLastDay)]
  const open = text(capacity?.hoursOpen)
  const close = text(capacity?.hoursClose)
  if (first === undefined || last === undefined) return null
  if (!CLOCK.test(open) || !CLOCK.test(close)) return null
  return { firstDay: first, lastDay: last, open, close }
}

export function projectFooter(doc: Record<string, unknown> | null | undefined): FooterSettings {
  const copy = (key: 'ctaLabel' | 'ctaQuestion' | 'ctaSubline' | 'ctaPromise') =>
    text(doc?.[key]) || EMPTY_FOOTER[key]
  const capacity =
    doc?.capacity && typeof doc.capacity === 'object'
      ? (doc.capacity as Record<string, unknown>)
      : null
  const rows = (value: unknown): Record<string, unknown>[] =>
    Array.isArray(value)
      ? value.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object')
      : []
  return {
    ctaLabel: copy('ctaLabel'),
    ctaQuestion: copy('ctaQuestion'),
    ctaSubline: copy('ctaSubline'),
    ctaPromise: copy('ctaPromise'),
    capacity: {
      moq: text(capacity?.moq),
      leadTime: text(capacity?.leadTime),
      hours: projectHours(capacity),
    },
    worksCoordinates: text(doc?.worksCoordinates),
    certifications: rows(doc?.certifications)
      .map((r) => text(r.name))
      .filter(Boolean),
    socialLinks: rows(doc?.socialLinks)
      .map((r) => ({ label: text(r.label), url: text(r.url) }))
      .filter((r) => r.label && /^https:\/\/\S+$/.test(r.url)),
  }
}

/** One card on the public product gallery. */
export interface ProductCard {
  slug: string
  productName: string
  productCode: string
  category: string
  shortDescription: string
  /** Poster for the card. `null` renders the drawn placeholder, never a broken image. */
  posterUrl: string | null
  posterAlt: string
  /** The colourway the card links to — the first addressable one, i.e. the default. */
  defaultColourSlug: string
  /** Colour NAMES. Never hex — see the warning on `toProductCard`. */
  colourNames: string[]
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '')

/**
 * Merge a saved `site-settings` global over the shared defaults, field by field.
 *
 * Field by field rather than `doc ?? DEFAULT`, because a global saved once with one
 * blank optional field should fall back for that value alone rather than discard
 * every other value the owner did fill in.
 */
export function mergeSiteSettings(
  doc: Record<string, unknown> | null | undefined,
): PublicSiteSettings {
  const pick = (key: keyof ViewerSiteSettings): string =>
    text(doc?.[key]) || DEFAULT_SITE_SETTINGS[key]
  // Populated only at depth >= 1. At depth 0 Payload leaves an upload as a bare row
  // id, which is a number, not a URL — rendering it would emit a broken icon link.
  const logo = doc?.logo
  const logoDoc =
    logo && typeof logo === 'object' ? (logo as { url?: unknown; mimeType?: unknown }) : null
  return {
    logoUrl: text(logoDoc?.url) || null,
    logoMimeType: text(logoDoc?.mimeType) || null,
    companyName: pick('companyName'),
    email: pick('email'),
    whatsappNumber: pick('whatsappNumber'),
    catalogueUrl: pick('catalogueUrl'),
    temporaryWordmark: pick('temporaryWordmark'),
    footerLine: pick('footerLine'),
    legalLine: pick('legalLine'),
    footer: projectFooter(doc),
  }
}

/**
 * Project one product document into a gallery card, or `null` if the viewer could not
 * serve it.
 *
 * ⚠️ RETURNING null IS THE POINT. `buildViewerResponse` 404s a published product with
 * no addressable colourway, and both use `isAddressableColourway` so they cannot
 * disagree. A looser rule here would advertise a garment whose detail page refuses to
 * load, with both sides green — the only symptom a buyer clicking a card and meeting
 * "[ REFERENCE UNAVAILABLE ]".
 *
 * ⚠️ `hexSwatch` IS DELIBERATELY NOT PROJECTED. Its field description in colourways.ts
 * reads "Buyers never see it" — it exists so an editor can recognise a row at a
 * glance and is not maintained as a public-facing colour. Painting the gallery with it
 * would turn an internal aid into a design surface without anyone deciding to.
 */
export function toProductCard(
  product: Record<string, unknown> | null | undefined,
): ProductCard | null {
  if (!product) return null
  const slug = text(product.slug)
  if (!slug) return null

  const colourways = (Array.isArray(product.colourways) ? product.colourways : []).filter(
    (colour): colour is Record<string, unknown> =>
      !!colour &&
      typeof colour === 'object' &&
      isAddressableColourway(colour as Record<string, unknown>),
  )
  if (colourways.length === 0) return null

  const productName = text(product.productName) || slug
  const poster = pickPoster(product, colourways[0]?.posterPreview)

  return {
    slug,
    productName,
    productCode: text(product.productCode),
    category: text(product.category),
    shortDescription: text(product.shortDescription),
    posterUrl: poster.url,
    posterAlt: poster.alt || `${productName} — 3D product reference`,
    defaultColourSlug: text(colourways[0]?.slug),
    colourNames: colourways.map((colour) => text(colour.displayName) || text(colour.slug)),
  }
}

/**
 * The card image: the default colourway's poster, else the product-level fallback.
 *
 * ⚠️ THE URL IS ABSOLUTE ONLY WHEN `PUBLIC_MEDIA_BASE_URL` IS SET. Measured against the
 * local D1 on 2026-09-04: with that wrangler var absent (as under `next dev`), the
 * r2Storage plugin's `generateFileURL` does not fire and Payload emits its own relative
 * `/api/media/file/<name>` route. Correct locally; in production it would put every
 * gallery poster on the uncached Payload API route instead of media.wear-run.help, so
 * `publicSite.test.ts` asserts the var at its source in wrangler.jsonc.
 *
 * A depth-0 read leaves these as numeric IDs rather than objects — that is not a
 * poster, and it must not be rendered as one.
 */
function pickPoster(
  product: Record<string, unknown>,
  colourPoster: unknown,
): { url: string | null; alt: string } {
  for (const candidate of [colourPoster, product.posterFallback]) {
    if (!candidate || typeof candidate !== 'object') continue
    const media = candidate as { url?: unknown; alt?: unknown }
    const url = text(media.url)
    if (url) return { url, alt: text(media.alt) }
  }
  return { url: null, alt: '' }
}
