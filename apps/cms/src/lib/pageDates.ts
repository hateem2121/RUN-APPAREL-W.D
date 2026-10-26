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
 * comments and spaces taken out, so a change to its markup moves the date too: a date a little
 * early to move is the lesser fault, beside one that stays put while the words change.
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
/** #192, six buildings on one site: the guides hub's cards. */
const SIX_BUILDINGS = '2026-10-16T10:56:20+05:00'
/** #231: two buyer guides linked from every buyer page, and from the Journal. */
const BUYER_GUIDE_LINKS = '2026-10-23T17:32:37+05:00'
/** #246: the closing block written once, on every FAQ topic. */
const CLOSING_BLOCK = '2026-10-25T11:44:02+05:00'
/** The site check's words (2026-10-26): titles, em dashes, the factory and contact fixes. */
const SITE_CHECK = '2026-10-26T14:04:04+05:00'

export const PAGE_DATES: Readonly<Record<string, PageDate>> = {
  '/': page(SITE_CHECK, 'f819acb36dea'),
  '/products': page(SITE_CHECK, '033a56dfbd1f'),
  '/custom-teamwear-manufacturer': page(BUYER_GUIDE_LINKS, 'df1adaf98877'),
  '/custom-activewear-manufacturer': page(BUYER_GUIDE_LINKS, 'bd5d1e77a7ab'),
  '/custom-outerwear-manufacturer': page(BUYER_GUIDE_LINKS, 'f6cd71b4034d'),
  '/private-label-casual-wear-manufacturer': page(BUYER_GUIDE_LINKS, '2df29c0e708d'),
  '/guides': page(SIX_BUILDINGS, '82d6307506a4'),
  '/policies': page(SITE_CHECK, '77c728cd6d39'),
  '/community': page(SITE_CHECK, '82a687c86d9d'),
  '/press': page(SITE_CHECK, '2b73a863f26b'),
  '/faq': page(SITE_CHECK, 'f03571679b6c'),
  '/faq/orders-and-samples': page(CLOSING_BLOCK, 'f9f9eca6e4d3'),
  '/faq/quality-and-certifications': page(CLOSING_BLOCK, 'cfb7053a641d'),
  '/faq/shipping-and-importing': page(SITE_CHECK, 'f0d4229b86ec'),
  '/faq/fabrics-and-printing': page(CLOSING_BLOCK, '2b50b5a34a59'),
  '/faq/working-with-us': page(CLOSING_BLOCK, '9e2d6a850e39'),
  '/glossary': page(SITE_CHECK, '92789da87f82'),
  '/journal': page(BUYER_GUIDE_LINKS, '70ef49791a5f'),
  '/case-studies': page(FINDABILITY, '41b19e1d9a71'),
  '/contact': page(SITE_CHECK, '1814a94bea1b'),
  '/privacy': page(SITE_CHECK, '0a96254ac2f9'),
  '/terms': page(SITE_CHECK, '6d0e930fcd18'),
}

/** The date of a page this registry holds. */
export function pageDateFor(path: string): PageDate | undefined {
  return PAGE_DATES[path]
}
