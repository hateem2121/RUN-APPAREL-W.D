import { FACTS, LEAD_TIME, LINEAGE } from './companyFacts'
import {
  FACTORY_PHOTOS,
  type FactoryPhoto,
  factoryPhotoSrc,
  factoryPhotoWidths,
} from './factoryPhotos'

/**
 * The press page's own facts (PLAN.md D8; words approved by the owner 2026-10-07). The page's
 * title, headings and links are `PRESS_PAGE` in `companyPages.ts`, beside careers and community;
 * what is here is what that file must not hold: an email address (`companyPages.test.ts` refuses
 * one there) and the lists the page draws.
 */

/**
 * Where journalists write (owner, 2026-10-07: "media@wear-run.com (will make alias)"). Not the
 * Site Settings email, which is partner@ and stays the buyers' address.
 */
export const MEDIA_EMAIL = 'media@wear-run.com'

/** The press page's hero photo: the showroom, with the RUN APPAREL wall behind the garments. */
export const PRESS_HERO_PHOTO = 'showroom'

/**
 * ⚠️ EVERY FACTORY PHOTO ON THE SITE, FOR REUSE (owner, 2026-10-07, choosing "All factory photos
 * on the site: the people in them have agreed to press use"). Some show workers' faces; that
 * answer is the consent this list rests on (PLAN.md G19). A photo added to `FACTORY_PHOTOS` joins
 * here, so a new photo with a person in it needs the same answer first.
 */
export const PRESS_PHOTOS: readonly FactoryPhoto[] = FACTORY_PHOTOS

/** The usage line under the photos, as approved. */
export const PRESS_PHOTO_USAGE =
  'Free to use with the credit “RUN APPAREL”, in articles about RUN APPAREL.'

/** The largest file written for a photo: what "Download" offers. */
export function pressPhotoDownload(photo: FactoryPhoto): { href: string; width: number } {
  const widths = factoryPhotoWidths(photo)
  const width = widths[widths.length - 1] ?? 0
  return { href: factoryPhotoSrc(photo, width), width }
}

const fact = (prefix: string) => FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** The year the family trade began, read from `LINEAGE` rather than typed twice. */
export const FAMILY_SINCE = LINEAGE.match(/\b(1[89]\d\d)\b/)?.[1] ?? ''

/**
 * The "Quick facts" rows that do not depend on Site Settings, from the site's constants only.
 * The legal name and the address are read at render time (`PressPage.tsx`). No "Founded" row
 * (D8): the company names changed over time, so no founding year is claimed.
 */
export const PRESS_FACTS: readonly { label: string; value: string }[] = [
  { label: 'Family trade since', value: FAMILY_SINCE },
  { label: 'Parent company', value: 'DURUS INDUSTRIES' },
  { label: 'People', value: `About ${fact('People')}` },
  { label: 'Capacity', value: `${fact('Pieces per month')} pieces a month` },
  { label: 'Under roof', value: `${fact('Sq ft')} sq ft` },
  { label: 'Minimum order', value: `${fact('Minimum')} pieces per style` },
  { label: 'Sample', value: `${fact('Working days')} working days` },
  { label: 'Lead time', value: LEAD_TIME },
]
