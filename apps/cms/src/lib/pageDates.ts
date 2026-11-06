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
 * The privacy page names the UK regulator by its new name, the Information Commission (owner approved,
 * 2026-11-05): the office of Information Commissioner was abolished on 30 Sep 2026 (SI 2026/1015).
 * It replaced the privacy page's date of 2026-10-30 (the cookie paragraph on contact taps), its last
 * use, so that constant went with it.
 */
const UK_REGULATOR = '2026-11-05T22:05:04+05:00'
/** The buyer pages' "What we make" lines became links (`makesHref`, written 2026-10-29, landed on 2026-11-01). */
const MAKES_LINKS = '2026-11-01T12:11:19+05:00'

/*
 * 27 Oct: the faster-taps work (#278) changed one line, the `Link` import, in 13 of the files
 * these fingerprints read, and the markup rule moved 17 of these dates to that day. Checked with
 * `git diff` against a7191f72 (the commit before it): no other line of those files changed.
 * Imports are now left out of the fingerprint, and each of the 17 is back on the date its words
 * last changed.
 */
/** The accessory pages say products, and the ball page leads with a logo (2026-11-01). */
const ACCESSORY_WORDS = '2026-11-01T13:30:57+05:00'

/**
 * The order block's photo (owner, 2026-11-05): on the four main buyer pages the factory photo is the
 * whole background of "How an order works", shown whole; the accessories and soccer ball pages draw
 * the same component without a photo, and their fingerprints move with its source, as the rule at
 * the top of this file says (a date a little early to move is the lesser fault).
 */
const ORDER_PHOTO = '2026-11-05T09:21:13+05:00'

/**
 * Wave 1 of the buyer library (owner approved the words, 2026-11-05): a sample "usually" takes its
 * days everywhere the site says so (the owner: sample time varies product to product), and the two
 * new guides join the guides index, the FAQ topics that point back at them, and the lists that name
 * every guide (the home page's and the journal's among them). It replaced the journal's date of
 * 2026-10-31 (the Kaizen), its last use, so that constant went with it.
 */
const WAVE_ONE = '2026-11-05T20:07:40+05:00'

/**
 * The buyer library (owner approved every word, 2026-11-06): fifteen new guides join the guides index,
 * the journal's list of guides and the FAQ topics that point back at them, and the shipping topic's
 * answer on import duty names FCA and DAP. The time the words were committed. It replaced the date
 * of the FAQ topics' closing block (#246, 2026-10-25), its last use, so that constant went with it.
 */
const LIBRARY = '2026-11-06T17:05:02+05:00'
/**
 * FCA (on request) and DAP join the price terms wherever the site lists them (owner, 2026-11-06): the
 * home page's order step, the FAQ's Incoterms answer and its topic's description, and the glossary.
 */
const PRICE_TERMS = '2026-11-06T17:20:46+05:00'
/** The tech pack guide joins the index and the "Working with us" topic (C1, owner approved 2026-11-06). */
const TECH_PACK_AND_TOOLS = '2026-11-06T20:34:06+05:00'

export const PAGE_DATES: Readonly<Record<string, PageDate>> = {
  '/': page(PRICE_TERMS, '00140939a970'),
  '/products': page(SITE_CHECK, '6c05164a0d6a'),
  '/custom-teamwear-manufacturer': page(WAVE_ONE, '16390fbc1582'),
  '/custom-activewear-manufacturer': page(WAVE_ONE, '9ec97e679558'),
  '/custom-outerwear-manufacturer': page(WAVE_ONE, 'bcea85c40063'),
  '/custom-sports-accessories-manufacturer': page(ORDER_PHOTO, '8ac20e5aad55'),
  '/custom-soccer-ball-manufacturer': page(ORDER_PHOTO, 'b26b21c57af7'),
  '/private-label-casual-wear-manufacturer': page(WAVE_ONE, '6c189a2a18d2'),
  '/guides': page(TECH_PACK_AND_TOOLS, '8ea40a495c75'),
  '/policies': page(LEGAL_FRAMING, '935cd64fac95'),
  '/community': page(SITE_CHECK, 'aa8161150adb'),
  '/press': page(WAVE_ONE, 'ae0578799d9e'),
  '/faq': page(PRICE_TERMS, 'bf487444473d'),
  '/faq/orders-and-samples': page(LIBRARY, 'a085ccb257a2'),
  '/faq/quality-and-certifications': page(LIBRARY, '2f8e683d8b4c'),
  '/faq/shipping-and-importing': page(PRICE_TERMS, '3337ef9c9fe5'),
  '/faq/fabrics-and-printing': page(LIBRARY, 'f8be1d9e562e'),
  '/faq/working-with-us': page(TECH_PACK_AND_TOOLS, '326403c492f4'),
  '/glossary': page(PRICE_TERMS, 'c22e311ba5df'),
  '/journal': page(TECH_PACK_AND_TOOLS, '5b438efb3862'),
  '/case-studies': page(FINDABILITY, '9c1974b3c7f3'),
  '/contact': page(WIDE_AVIF, 'dfbaaa5f5bcc'),
  '/privacy': page(UK_REGULATOR, '060578c2bd49'),
  '/terms': page(SITE_CHECK, '852a77676dab'),
}

/** The date of a page this registry holds. */
export function pageDateFor(path: string): PageDate | undefined {
  return PAGE_DATES[path]
}
