/**
 * Who wrote a page, when it first went live, and when its words last changed (findability audit,
 * 2026-10-08).
 *
 * WHY. Google's Article guide (updated 2026-09-08) recommends `author`, `datePublished` and
 * `dateModified`; a sitemap's `lastmod` is used only when it is "consistently and verifiably
 * accurate" (Google's sitemap guide, updated 2026-07-08); and a reader, person or AI, trusts a
 * page more when it says who wrote it and when. Until this day the guides said none of it.
 *
 * WHO (owner, 2026-10-08): orders, minimums and samples, packaging, and shipping by the
 * merchandiser; printing and fabrics by the production in-charge; the 3D reference, the cost guide
 * and the country comparison by M. Hateem Jamshaid; the policies and careers by HR. A role is printed as the owner wrote it. In
 * structured data a role is not a person's name, so those pages are the company's
 * (`guideArticleJsonLd` in `structuredData.ts`).
 *
 * ⚠️ THE DATES ARE MEASURED, NEVER TYPED FROM MEMORY. `published` is the time of the commit that
 * first shipped the page; `changed.on` the time of the last commit that changed its visible words,
 * found on 2026-10-08 by rebuilding every earlier version of the page and comparing. `words` is the
 * fingerprint of the words at that moment: `bylines.test.ts` fingerprints them now and fails when
 * they differ, so the words cannot change while the date stands still (the owner's choice: the date
 * is the last real change to the text, kept true automatically). When it fails, set `on` to the time
 * of your change and `words` to the fingerprint the failure prints.
 *
 * ⚠️ A POLICY'S DATE IS THE DAY THE OWNER APPROVED ITS WORDS (`lastReviewed`, policies.ts), and the
 * test holds the two to the same day: new words for a policy mean a new approval.
 */

export type Author =
  | { readonly kind: 'person'; readonly name: string }
  | { readonly kind: 'role'; readonly role: string }

export const AUTHORS = {
  hateem: { kind: 'person', name: 'M. Hateem Jamshaid' },
  merchandiser: { kind: 'role', role: 'Merchandiser, RUN APPAREL' },
  production: { kind: 'role', role: 'Production in-charge, RUN APPAREL' },
  hr: { kind: 'role', role: 'HR, RUN APPAREL' },
  // The about and factory pages (the about-factory build, 2026-10-09): factual pages, so a
  // content role rather than a person (owner offered "Content Team" or "Marketing Team" and
  // left the choice; Content was chosen for exactly this reason).
  contentTeam: { kind: 'role', role: 'Content Team, RUN APPAREL' },
} as const satisfies Record<string, Author>

export type Byline = {
  readonly author: Author
  /** ISO 8601 with the zone, as Google's Article guide asks. */
  readonly published: string
  readonly changed: { readonly on: string; readonly words: string }
}

const byline = (author: Author, published: string, on: string, words: string): Byline => ({
  author,
  published,
  changed: { on, words },
})

/** The first three guides shipped together (#104), the next three in #105, shipping in #107. */
const GUIDES_1 = '2026-09-30T20:06:49+05:00'
const GUIDES_2 = '2026-09-30T20:43:00+05:00'
const GUIDES_3 = '2026-09-30T22:15:50+05:00'
/** The reference garments joined the 3D, printing and fabrics guides (findability audit). */
const GARMENT_LINKS = '2026-10-08T16:26:29+05:00'
/** The cost guide and the country comparison, approved by the owner (findability audit). */
const NEW_GUIDES = '2026-10-08T16:38:58+05:00'
/** The policies, careers and community pages (#141). */
const POLICIES_LIVE = '2026-10-07T12:40:02+05:00'
/** The commit that shipped the about and factory pages' approved words (092a086). */
const ABOUT_FACTORY_WORDS = '2026-10-09T12:15:37+05:00'
/**
 * "One building" corrected to six buildings on one site, every word approved by the owner. It
 * replaced the dates of the polish build (#128), careers' form (#143) and the factory headline's fix
 * on every page it touched, so those three constants went with it.
 */
const SIX_BUILDINGS = '2026-10-15T15:41:44+05:00'
/** Step 05's photo became the front of the works (owner, home page audit 2026-10-17). */
const STEP_FIVE_PHOTO = '2026-10-17T20:56:34+05:00'
/*
 * The words' fingerprints, as `bylines.test.ts` computes them. Filled from that test's failure
 * output the first time (the same way every date here is measured, never guessed); the test then
 * fails again if the words move without this moving.
 */
const ABOUT_FACTORY_FINGERPRINTS = {
  '/about': 'e20c171297da',
  '/inside-the-factory': '6dbbda2a5dae',
} as const

export const BYLINES: Readonly<Record<string, Byline>> = {
  '/guides/how-a-private-label-order-works': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    STEP_FIVE_PHOTO,
    'fba06078c80f',
  ),
  '/guides/3d-garment-reference': byline(AUTHORS.hateem, GUIDES_1, GARMENT_LINKS, '9afd7f827218'),
  '/guides/minimum-order-and-samples': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    SIX_BUILDINGS,
    '69202031e4bb',
  ),
  '/guides/garment-printing-methods': byline(
    AUTHORS.production,
    GUIDES_2,
    SIX_BUILDINGS,
    '14f01dcef536',
  ),
  '/guides/sportswear-fabrics-and-weights': byline(
    AUTHORS.production,
    GUIDES_2,
    GARMENT_LINKS,
    'e5d99bfe8009',
  ),
  '/guides/private-label-packaging': byline(
    AUTHORS.merchandiser,
    GUIDES_2,
    SIX_BUILDINGS,
    '2fc3ab65674b',
  ),
  '/guides/shipping-and-import-duties': byline(
    AUTHORS.merchandiser,
    GUIDES_3,
    SIX_BUILDINGS,
    'e4a623dd5ca7',
  ),
  '/guides/cost-to-start-an-activewear-brand': byline(
    AUTHORS.hateem,
    NEW_GUIDES,
    SIX_BUILDINGS,
    'bf7e9d7b6282',
  ),
  '/guides/pakistan-vs-china-vs-turkey': byline(
    AUTHORS.hateem,
    NEW_GUIDES,
    SIX_BUILDINGS,
    '4534a342ef7d',
  ),
  '/policies/workplace-conduct': byline(AUTHORS.hr, POLICIES_LIVE, SIX_BUILDINGS, 'c46e5065c8c4'),
  '/policies/health-and-safety': byline(AUTHORS.hr, POLICIES_LIVE, SIX_BUILDINGS, 'f28729f2a376'),
  '/policies/health-and-vaccination': byline(
    AUTHORS.hr,
    POLICIES_LIVE,
    POLICIES_LIVE,
    '0f373df3c882',
  ),
  '/policies/equal-opportunity': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'f7b578a1207f'),
  '/policies/labor-rights': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'e7040ea909d2'),
  '/policies/quality': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'e442ac2701ef'),
  '/policies/environmental': byline(AUTHORS.hr, POLICIES_LIVE, SIX_BUILDINGS, '2192f91d468f'),
  '/careers': byline(AUTHORS.hr, POLICIES_LIVE, SIX_BUILDINGS, '77747b8b8d27'),
  // The about and factory pages: the commit that shipped their approved words (092a086), and
  // its time. The fingerprint is `bylines.test.ts`'s of the words at that moment.
  '/about': byline(
    AUTHORS.contentTeam,
    ABOUT_FACTORY_WORDS,
    ABOUT_FACTORY_WORDS,
    ABOUT_FACTORY_FINGERPRINTS['/about'],
  ),
  '/inside-the-factory': byline(
    AUTHORS.contentTeam,
    ABOUT_FACTORY_WORDS,
    SIX_BUILDINGS,
    ABOUT_FACTORY_FINGERPRINTS['/inside-the-factory'],
  ),
}

/** The byline of a page that has one; `bylines.test.ts` checks every guide, policy and careers has. */
export function bylineFor(path: string): Byline | undefined {
  return BYLINES[path]
}

/** The words the byline prints for its writer. */
export const authorName = (author: Author): string =>
  author.kind === 'person' ? author.name : author.role
