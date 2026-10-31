/**
 * When the words of each page WITHOUT a byline last changed: the home page, /products, the buyer
 * pages, the hubs, the FAQ, the glossary, contact and the legal pages (site check of 2026-10-26,
 * claude-seo S-07). The guides, policies, careers, about and factory pages keep theirs in
 * `bylines.ts`, which this copies.
 *
 * WHY. The sitemap gave these 22 pages no `lastmod`, so Google had no signal to fetch them again
 * after a change; it uses the field only when it is "consistently and verifiably accurate"
 * (Google's sitemap guide, updated 2026-07-08, read again 2026-10-26). A date nobody updates is
 * worse than none, so each one is held by a fingerprint of the words it dates.
 *
 * ⚠️ THE DATES ARE MEASURED, NEVER TYPED FROM MEMORY. `words` is the fingerprint `pageDates.test.ts`
 * computes of what the page shows; it fails when the words differ, so they cannot change while the
 * date stands still. When it fails, set `on` to the time of your change and `words` to the
 * fingerprint the failure prints. A page drawn in JSX is fingerprinted from its source with the
 * imports, comments and spaces taken out, so a change to its markup moves the date too: a date a
 * little early to move is the lesser fault, beside one that stays put while the words change.
 * Imports are left out since 27 Oct: where a page takes a component from is not its words.
 *
 * A page that also shows garments or posts (the home page, /products, a buyer page, the Journal,
 * the case studies) is dated by whichever is newer: its words or its newest item
 * (`searchVisibility.ts`).
 */
export type PageDate = {
  /** ISO 8601 with the zone, like a byline's. */
  readonly on: string
  readonly words: string
}

const page = (on: string, words: string): PageDate => ({ on, words })

/*
 * Each date is the time the commit that brought the page's present words landed on `main`, found
 * on 2026-10-26 by fingerprinting the page at every earlier `main` commit and keeping the oldest
 * that still matched. (A byline's date is its branch commit's time instead, a few hours earlier
 * for #192; this file follows `main`, where the live page changed.)
 */
/** #152: the case studies hub's words. */
const FINDABILITY = '2026-10-08T21:50:32+05:00'
/** #231: the Journal hub's links to two buyer guides. */
const BUYER_GUIDE_LINKS = '2026-10-23T17:32:37+05:00'
/** #246: the closing block written once, on every FAQ topic. */
const CLOSING_BLOCK = '2026-10-25T11:44:02+05:00'
/** The site check's words (2026-10-26): titles, em dashes, the factory and contact fixes. */
const SITE_CHECK = '2026-10-26T16:22:42+05:00'
/** One phone number for the company (2026-10-26): the Contact page's call line and the structured data. */
const ONE_NUMBER = '2026-10-26T20:13:15+05:00'
/**
 * The dye (the home page draws the island that turns №02's cards colour), met with the one phone
 * number from `main` (2026-10-26).
 */
const DYE = '2026-10-26T23:49:22+05:00'
/**
 * The privacy page's cookie paragraph now says Google Analytics sees whether a visitor taps the
 * WhatsApp, phone or email link (2026-10-30, branch `site/contact-click-events`; the branch
 * commit's time, as a byline's is, a little before the page changes live).
 */
const CONTACT_TAPS = '2026-10-30T10:50:04+05:00'

/*
 * 27 Oct: the faster-taps work (#278) changed one line, the `Link` import, in 13 of the files
 * these fingerprints read, and the markup rule moved 17 of these dates to that day. Checked with
 * `git diff` against a7191f72 (the commit before it): no other line of those files changed.
 * Imports are now left out of the fingerprint, and each of the 17 is back on the date its words
 * last changed.
 */
/** The soccer ball and accessories pages, and the buyer pages' template (2026-10-31). */
const KAIZEN = '2026-10-31T22:30:00+05:00'

export const PAGE_DATES: Readonly<Record<string, PageDate>> = {
  '/': page(DYE, '75c60e311c5a'),
  '/products': page(SITE_CHECK, '6c05164a0d6a'),
  '/custom-teamwear-manufacturer': page(KAIZEN, 'd83e54955668'),
  '/custom-activewear-manufacturer': page(KAIZEN, 'c5bdd0685268'),
  '/custom-outerwear-manufacturer': page(KAIZEN, '1ac29316a8f2'),
  '/custom-sports-accessories-manufacturer': page(KAIZEN, '4671eb2785bb'),
  '/custom-soccer-ball-manufacturer': page(KAIZEN, '8deb7a3781fd'),
  '/private-label-casual-wear-manufacturer': page(KAIZEN, 'fb078ffdb3ad'),
  '/guides': page(SITE_CHECK, 'bc271cb03a6b'),
  '/policies': page(SITE_CHECK, '4858c8669cda'),
  '/community': page(SITE_CHECK, 'aa8161150adb'),
  '/press': page(SITE_CHECK, '9b7eeaf6a7f9'),
  '/faq': page(SITE_CHECK, 'f1bd5f772454'),
  '/faq/orders-and-samples': page(SITE_CHECK, '6ad5f92a5cb5'),
  '/faq/quality-and-certifications': page(CLOSING_BLOCK, 'f21148cdf235'),
  '/faq/shipping-and-importing': page(SITE_CHECK, 'd589cfcdf9ba'),
  '/faq/fabrics-and-printing': page(CLOSING_BLOCK, 'd838e1a06292'),
  '/faq/working-with-us': page(CLOSING_BLOCK, '39eb383bf2dc'),
  '/glossary': page(SITE_CHECK, '5f4675bd3f09'),
  '/journal': page(KAIZEN, 'e34315afc7aa'),
  '/case-studies': page(FINDABILITY, '9c1974b3c7f3'),
  '/contact': page(ONE_NUMBER, '360e3b9976c6'),
  '/privacy': page(CONTACT_TAPS, '10fe05331ee5'),
  '/terms': page(SITE_CHECK, '852a77676dab'),
}

/** The date of a page this registry holds. */
export function pageDateFor(path: string): PageDate | undefined {
  return PAGE_DATES[path]
}
