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
 * merchandiser; printing and fabrics by the production in-charge; the 3D reference by M. Hateem
 * Jamshaid; the policies and careers by HR. A role is printed as the owner wrote it. In
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
/** The polish build (#128): photos and tables in six guides, the order steps in one. */
const POLISH = '2026-10-05T14:20:27+05:00'
/** The policies, careers and community pages (#141), and careers' form the same evening (#143). */
const POLICIES_LIVE = '2026-10-07T12:40:02+05:00'
const CAREERS_FORM = '2026-10-07T19:11:24+05:00'

export const BYLINES: Readonly<Record<string, Byline>> = {
  '/guides/how-a-private-label-order-works': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    POLISH,
    'acb37f283da5',
  ),
  '/guides/3d-garment-reference': byline(AUTHORS.hateem, GUIDES_1, GUIDES_1, 'c5a3d665ec8d'),
  '/guides/minimum-order-and-samples': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    POLISH,
    '8043a7303169',
  ),
  '/guides/garment-printing-methods': byline(AUTHORS.production, GUIDES_2, POLISH, '670bcc44ff34'),
  '/guides/sportswear-fabrics-and-weights': byline(
    AUTHORS.production,
    GUIDES_2,
    POLISH,
    '05b94bb9453e',
  ),
  '/guides/private-label-packaging': byline(AUTHORS.merchandiser, GUIDES_2, POLISH, '52c935d60b2d'),
  '/guides/shipping-and-import-duties': byline(
    AUTHORS.merchandiser,
    GUIDES_3,
    POLISH,
    'f070ac50da5f',
  ),
  '/policies/workplace-conduct': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, '6da51606a09c'),
  '/policies/health-and-safety': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, '9e4eaa8e29d7'),
  '/policies/health-and-vaccination': byline(
    AUTHORS.hr,
    POLICIES_LIVE,
    POLICIES_LIVE,
    '0f373df3c882',
  ),
  '/policies/equal-opportunity': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'f7b578a1207f'),
  '/policies/labor-rights': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'e7040ea909d2'),
  '/policies/quality': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, 'e442ac2701ef'),
  '/policies/environmental': byline(AUTHORS.hr, POLICIES_LIVE, POLICIES_LIVE, '91196555a7a8'),
  '/careers': byline(AUTHORS.hr, POLICIES_LIVE, CAREERS_FORM, '04917a5d247d'),
}

/** The byline of a page that has one; `bylines.test.ts` checks every guide, policy and careers has. */
export function bylineFor(path: string): Byline | undefined {
  return BYLINES[path]
}

/** The words the byline prints for its writer. */
export const authorName = (author: Author): string =>
  author.kind === 'person' ? author.name : author.role
