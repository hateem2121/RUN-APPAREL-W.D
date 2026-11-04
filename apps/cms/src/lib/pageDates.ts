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
/**
 * The hero picture offered to wide screens in AVIF as well (site speed, 2026-11-04): markup only,
 * the words the same, moved by the rule at the top of this file. Home was dated by the dye
 * (2026-10-26T23:49:22+05:00) and Contact by the one phone number (2026-10-26T20:13:15+05:00).
 */
const WIDE_AVIF = '2026-11-04T19:52:09+05:00'
/**
 * The legal framing of 2026-11-04 (owner's go-ahead after the legal review): DURUS INDUSTRIES
 * named as a separate family company, never a parent; RUN never a division; no GOTS claim; 1889
 * labelled the family's. `companyRelationship.test.ts` holds the words.
 */
const LEGAL_FRAMING = '2026-11-04T21:34:36+05:00'
/**
 * The privacy page's cookie paragraph now says Google Analytics sees whether a visitor taps the
 * WhatsApp, phone or email link (2026-10-30, branch `site/contact-click-events`; the branch
 * commit's time, as a byline's is, a little before the page changes live).
 */
const CONTACT_TAPS = '2026-10-30T10:50:04+05:00'
/** The buyer pages' "What we make" lines became links (`makesHref`, written 2026-10-29, landed on 2026-11-01). */
const MAKES_LINKS = '2026-11-01T12:11:19+05:00'

/*
 * 27 Oct: the faster-taps work (#278) changed one line, the `Link` import, in 13 of the files
 * these fingerprints read, and the markup rule moved 17 of these dates to that day. Checked with
 * `git diff` against a7191f72 (the commit before it): no other line of those files changed.
 * Imports are now left out of the fingerprint, and each of the 17 is back on the date its words
 * last changed.
 */
/** The soccer ball and accessories pages, and the buyer pages' template (2026-10-31). */
const KAIZEN = '2026-10-31T22:30:00+05:00'

/** The accessory pages say products, and the ball page leads with a logo (2026-11-01). */
const ACCESSORY_WORDS = '2026-11-01T13:30:57+05:00'

/**
 * Every buyer page links to the factory page, "Inside the factory", under "How an order works"
 * (2026-11-05, the order-checks change; the branch's time, a little before the pages change live).
 */
const FACTORY_LINK = '2026-11-05T00:09:00+05:00'

export const PAGE_DATES: Readonly<Record<string, PageDate>> = {
  '/': page(LEGAL_FRAMING, 'cf1148e20f75'),
  '/products': page(SITE_CHECK, '6c05164a0d6a'),
  '/custom-teamwear-manufacturer': page(FACTORY_LINK, '426bc8a7d7b7'),
  '/custom-activewear-manufacturer': page(FACTORY_LINK, '8f4aa178f931'),
  '/custom-outerwear-manufacturer': page(FACTORY_LINK, 'ddc4a254eb48'),
  '/custom-sports-accessories-manufacturer': page(FACTORY_LINK, '7b8219dab97a'),
  '/custom-soccer-ball-manufacturer': page(FACTORY_LINK, '477eba48b4ab'),
  '/private-label-casual-wear-manufacturer': page(FACTORY_LINK, 'f32346f82c55'),
  '/guides': page(SITE_CHECK, 'bc271cb03a6b'),
  '/policies': page(LEGAL_FRAMING, '935cd64fac95'),
  '/community': page(SITE_CHECK, 'aa8161150adb'),
  '/press': page(LEGAL_FRAMING, '5143d1505a09'),
  '/faq': page(LEGAL_FRAMING, '977d847bbe71'),
  '/faq/orders-and-samples': page(SITE_CHECK, '6ad5f92a5cb5'),
  '/faq/quality-and-certifications': page(LEGAL_FRAMING, '9a644e472e7e'),
  '/faq/shipping-and-importing': page(SITE_CHECK, 'd589cfcdf9ba'),
  '/faq/fabrics-and-printing': page(CLOSING_BLOCK, 'd838e1a06292'),
  '/faq/working-with-us': page(LEGAL_FRAMING, 'b2c2f9e7c29e'),
  '/glossary': page(LEGAL_FRAMING, '90d509da86b8'),
  '/journal': page(KAIZEN, 'e34315afc7aa'),
  '/case-studies': page(FINDABILITY, '9c1974b3c7f3'),
  '/contact': page(WIDE_AVIF, 'dfbaaa5f5bcc'),
  '/privacy': page(CONTACT_TAPS, '10fe05331ee5'),
  '/terms': page(SITE_CHECK, '852a77676dab'),
}

/** The date of a page this registry holds. */
export function pageDateFor(path: string): PageDate | undefined {
  return PAGE_DATES[path]
}
