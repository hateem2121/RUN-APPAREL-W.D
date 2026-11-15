/**
 * The garment page's `<title>`: the line a search result prints in blue.
 *
 * WHY IT IS SHARED (2026-09-30). Two places write this title and they must agree. The
 * viewer's Worker writes it into the HTML a search robot first receives
 * (`apps/viewer/worker/preview.ts`), and the app sets `document.title` once it has loaded
 * (`apps/viewer/src/App.tsx`). Google reads the title AFTER running the page, so a Worker
 * title the app then overwrote with different words would never be the one indexed. Until
 * this day the two differed: `R-XPS X-MILO PRO SKIN-SUIT — Wine` from the Worker and
 * `X-MILO PRO SKIN-SUIT · Wine — RUN APPAREL 3D Reference` from the app.
 *
 * WHY A GARMENT TYPE. Measured on the 40 live garments the same day: every product name is
 * a brand name ("MINECUT MOTION"), so no title said what the garment IS. The owner added a
 * plain type per product (`garmentType` in the CMS, e.g. "Women's Tennis Dress") and
 * approved this format: `NAME — Garment Type, Colour | BRAND`.
 *
 * The link-preview title (`og:title`) is this one without the brand since 2026-10-25
 * (`preview.ts`, called with `brand: ''`): Meta asks for a title with no site name, and the
 * product code moved to the front of the card's description.
 */

/** About what a search result shows before it cuts the title with an ellipsis. */
export const PAGE_TITLE_MAX = 60

/**
 * The brand a page title ends with. A constant, not `siteSettings.companyName`: that field
 * is the legal name ("RUN APPAREL (PVT) LTD"), which would spend a third of a 60-character
 * title on "(PVT) LTD". Both callers pass this one.
 */
export const PAGE_TITLE_BRAND = 'RUN APPAREL'

export interface GarmentTitleParts {
  productName: string
  productCode: string
  /** Empty for a garment the owner has not typed one for; the title then leads with the code. */
  garmentType: string
  /** The colour that LOADS, which is not always the one the address asked for. */
  colour: string
  brand: string
  /**
   * The page shows the garment's MAIN colour, the one the sitemap lists (`isDefault`). Only that
   * page drops the colour of a title too long (owner, 2026-11-15); the others keep it, so no two
   * colour pages share one title, and drop the type instead when they must (15 Nov, evening).
   */
  isDefaultColour?: boolean
}

const words = (value: string) => value.toLowerCase().match(/[a-z0-9]+/g) ?? []

/** True when every word of the type is already in the name ("… TENNIS DRESS" / "Tennis Dress"). */
function nameAlreadySays(name: string, type: string): boolean {
  const inName = new Set(words(name))
  const typeWords = words(type)
  return typeWords.length > 0 && typeWords.every((word) => inName.has(word))
}

export function garmentPageTitle(parts: GarmentTitleParts): string {
  const name = (parts.productName ?? '').trim()
  const code = (parts.productCode ?? '').trim()
  const type = (parts.garmentType ?? '').trim()
  const colour = (parts.colour ?? '').trim()
  const brand = (parts.brand ?? '').trim()

  const coreWith = (shade: string): string => {
    if (type && !nameAlreadySays(name, type)) {
      return `${name} — ${[type, shade].filter(Boolean).join(', ')}`
    }
    // The name says what it is; repeating the type would only spend the 60 characters.
    if (type) return [name, shade].filter(Boolean).join(' — ')
    // No type yet: the code-led title this page has always had.
    return [[code, name].filter(Boolean).join(' '), shade].filter(Boolean).join(' — ')
  }
  const branded = (core: string) => (brand ? `${core} | ${brand}` : core)
  const fits = (title: string) => title.length <= PAGE_TITLE_MAX

  const core = coreWith(colour)
  if (fits(branded(core))) return branded(core)
  // The main colour's page: lose the colour first, then the brand (owner, 2026-11-15). The
  // name and the type are what a searcher matches on, so they are never the part dropped.
  if (parts.isDefaultColour && colour) {
    const plain = coreWith('')
    return fits(branded(plain)) ? branded(plain) : plain
  }
  // Every other colour: lose the brand (it is beside every result anyway); the colour keeps this
  // page's title its own.
  if (fits(core)) return core
  /*
   * Still too long: lose the TYPE and keep the colour (owner, 15 Nov 2026 evening). Measured as
   * Googlebot that evening, 77 of the 168 colour pages outside the sitemap were over 60 even
   * without the brand, up to 86. Losing the colour instead would have given those pages their
   * main colour's title (24 distinct titles for 77 pages) and failed AC-11 (a11y.spec.ts: every
   * colour page has a title of its own, WCAG 2.4.2), so the owner chose this: all 77 then fit,
   * at 54 characters at most, every title still its own. The main colour's page keeps the type,
   * so a searcher matching on the type still finds the garment.
   */
  if (type && colour && !nameAlreadySays(name, type)) {
    const named = `${name} — ${colour}`
    return fits(branded(named)) ? branded(named) : named
  }
  return core
}
