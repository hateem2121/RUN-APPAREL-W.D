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
 * The link-preview title (`og:title`) is NOT this one: a shared link leads with the
 * product code, which is what a buyer quotes back. `preview.ts` keeps that separately.
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

  let core: string
  if (type && !nameAlreadySays(name, type)) {
    core = `${name} — ${[type, colour].filter(Boolean).join(', ')}`
  } else if (type) {
    // The name says what it is; repeating the type would only spend the 60 characters.
    core = [name, colour].filter(Boolean).join(' — ')
  } else {
    // No type yet: the code-led title this page has always had.
    core = [[code, name].filter(Boolean).join(' '), colour].filter(Boolean).join(' — ')
  }

  const withBrand = brand ? `${core} | ${brand}` : core
  // A result cuts a long title; lose the brand (it is beside every result anyway) rather
  // than let the cut fall on the garment type, which is what a searcher matches on.
  return withBrand.length > PAGE_TITLE_MAX ? core : withBrand
}
