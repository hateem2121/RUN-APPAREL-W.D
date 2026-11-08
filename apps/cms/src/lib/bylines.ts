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
  | {
      readonly kind: 'person'
      readonly name: string
      /** Google's Article guide: the role in `jobTitle`, never in the name. */
      readonly jobTitle: string
      /** The site page that identifies the person (Google: `author.url`). */
      readonly path: string
    }
  | { readonly kind: 'role'; readonly role: string }

export const AUTHORS = {
  // One name and one title everywhere, About included (owner, 2026-10-26, site check S-04: the
  // guides said "M. Hateem Jamshaid" with no title and About "M. Hateem Jamshaid Iqbal").
  hateem: {
    kind: 'person',
    name: 'M. Hateem Jamshaid',
    jobTitle: 'Business Development Director',
    path: '/about',
  },
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
/**
 * The site check's words (owner, 2026-10-26): About's bands merged and its repeated figures cut,
 * the factory gallery and its policy links, careers' two policy links, the em dashes replaced, and
 * eight guides' approved sections. It replaced the date of the reference garments' links
 * (2026-10-08) on the 3D and fabrics guides, so that constant went with it.
 */
const SITE_CHECK = '2026-10-26T16:22:42+05:00'
/**
 * "Eco-poly" gone (owner, 2026-11-05/06): the Apex Flex Pullover is 88% recycled polyester, and EU law
 * has banned generic environmental words such as "eco" since 27 Sep 2026. On the 3D guide it replaced
 * the date of the line on sports accessories (the Kaizen, 2026-10-31), so that constant went with it;
 * on the fabrics guide (the garment table's pullover row) it replaced the fiber-lines date.
 */
const RECYCLED_POLY = '2026-11-06T00:58:56+05:00'
/**
 * Wave 1 of the buyer library (owner approved the words, 2026-11-05): the soccer-ball guide and the
 * page on how the guides are written are new; the order and minimum-order guides gained sections;
 * and a sample "usually" takes its days on every page that says so (owner: sample time varies).
 * It replaced the dates of step 05's photo (2026-10-17, the order guide) and of the legal framing
 * (2026-11-04, the country guide and About), their last uses, so those constants went with them.
 */
const WAVE_ONE = '2026-11-05T20:07:40+05:00'
/**
 * The page on how the guides are written says who really checks (owner, 2026-11-05): AI checks every
 * outside fact against its source, and the owner approves every word. No person at RUN reviews each
 * guide, so the page no longer says one does.
 */
const AI_CHECK = '2026-11-05T20:46:11+05:00'
/**
 * The buyer library (owner approved every word, 2026-11-06, "All approved as written"): fifteen new
 * guides, four guides deepened (printing, fabrics, shipping, cost), the ball guide's US age groups,
 * and the factory page's cutting line without its "90–95%". The time the words were committed.
 * It replaced the dates of the factory page's wash tests (2026-11-05) and of the ball guide's fact
 * checks (2026-11-05), their last uses, so those constants went with them.
 */
const LIBRARY = '2026-11-06T17:05:02+05:00'
/** The order steps name FCA and DAP among the terms (owner, 2026-11-06); the order guide draws them. */
const PRICE_TERMS = '2026-11-06T17:20:46+05:00'
/**
 * The tech pack guide and its free template (C1), and the three small tools in the fabrics, shipping
 * and ball guides (C6): owner approved every word on 2026-11-06. The time the words were committed.
 */
const TECH_PACK_AND_TOOLS = '2026-11-06T20:34:06+05:00'
/** The vetting guide's SECP QR-code line, owner approved as written on 2026-11-07. */
const SECP_QR_LINE = '2026-11-07T00:05:06+05:00'
/*
 * The compliance guide's line that France's "tissage" includes knitting (owner approved, 2026-11-07),
 * and its sources without the drafting team's "†" (it meant "read through the web-fetch tool").
 */
const FRANCE_KNIT_LINE = '2026-11-07T12:23:35+05:00'
/**
 * The three held guides (C2, C3, C7) and the links to them that came back in the stitches and
 * machinery guides (owner approved every word on 2026-11-06). The time the words were committed on
 * `site/held-guides`; it moves again when a team fact is filled in, as the test says.
 */
const HELD_GUIDES = '2026-11-06T22:45:00+05:00'
/**
 * C2, C3 and C7 go live with the team's facts in (owner, 2026-11-08, question tool rounds 1-3: the
 * QC checklist's defect examples, the six check methods, and the C7 counts to 8 November 2026,
 * email and form only). First live AND last changed then; the time the facts were committed.
 */
const HELD_GUIDES_LIVE = '2026-11-08T19:05:18+05:00'
/*
 * The fabrics guide's fiber list after the wave-2 fact check (owner approved, 2026-11-05): "bamboo" is
 * gone (the FTC: most bamboo textiles are rayon) and nylon is "strong and hard-wearing". Its date is
 * RECYCLED_POLY above, the same branch's later change to this guide.
 */
/*
 * The words' fingerprints, as `bylines.test.ts` computes them. Filled from that test's failure
 * output the first time (the same way every date here is measured, never guessed); the test then
 * fails again if the words move without this moving.
 */
const ABOUT_FACTORY_FINGERPRINTS = {
  '/about': 'cafca5ef2989',
  '/inside-the-factory': 'b29f19971607',
} as const

export const BYLINES: Readonly<Record<string, Byline>> = {
  '/guides/how-a-private-label-order-works': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    PRICE_TERMS,
    'b0ead3f206e3',
  ),
  '/guides/3d-garment-reference': byline(AUTHORS.hateem, GUIDES_1, RECYCLED_POLY, '36ec04abfa9a'),
  '/guides/minimum-order-and-samples': byline(
    AUTHORS.merchandiser,
    GUIDES_1,
    WAVE_ONE,
    'e3c4c1fc01d8',
  ),
  '/guides/garment-printing-methods': byline(AUTHORS.production, GUIDES_2, LIBRARY, 'ca4c7a3e86a4'),
  '/guides/sportswear-fabrics-and-weights': byline(
    AUTHORS.production,
    GUIDES_2,
    TECH_PACK_AND_TOOLS,
    'c61d9b0785e3',
  ),
  '/guides/private-label-packaging': byline(
    AUTHORS.merchandiser,
    GUIDES_2,
    SITE_CHECK,
    '42dd0cb36541',
  ),
  '/guides/shipping-and-import-duties': byline(
    AUTHORS.merchandiser,
    GUIDES_3,
    TECH_PACK_AND_TOOLS,
    'a2458d39054a',
  ),
  '/guides/cost-to-start-an-activewear-brand': byline(
    AUTHORS.hateem,
    NEW_GUIDES,
    LIBRARY,
    'ac7e8ef359a1',
  ),
  '/guides/pakistan-vs-china-vs-turkey': byline(
    AUTHORS.hateem,
    NEW_GUIDES,
    WAVE_ONE,
    'c1a93eac0097',
  ),
  // Writers chosen by the owner, 2026-11-05: the ball guide by production, the page on how the
  // guides are written by the Content Team.
  '/guides/how-soccer-balls-are-made': byline(
    AUTHORS.production,
    WAVE_ONE,
    TECH_PACK_AND_TOOLS,
    '00aefc6b61b3',
  ),
  '/guides/how-we-write-our-guides': byline(
    AUTHORS.contentTeam,
    WAVE_ONE,
    AI_CHECK,
    'f823fed5cad0',
  ),
  // The buyer library's new guides, each signed as the owner chose (2026-11-06; drafts' section 1).
  '/guides/how-to-vet-a-clothing-manufacturer': byline(
    AUTHORS.merchandiser,
    LIBRARY,
    SECP_QR_LINE,
    '61d050ce6a67',
  ),
  '/guides/clothing-labels': byline(AUTHORS.merchandiser, LIBRARY, LIBRARY, '77895275599e'),
  '/guides/apparel-trims': byline(AUTHORS.production, LIBRARY, LIBRARY, 'b94de6c5ba53'),
  '/guides/sportswear-fibers': byline(AUTHORS.production, LIBRARY, LIBRARY, '1a47decee35b'),
  '/guides/yarn-count-and-denier': byline(AUTHORS.production, LIBRARY, LIBRARY, '961eae748c05'),
  '/guides/sportswear-pattern-making': byline(
    AUTHORS.production,
    LIBRARY,
    TECH_PACK_AND_TOOLS,
    'd07809665122',
  ),
  '/guides/stitch-and-seam-types': byline(AUTHORS.production, LIBRARY, HELD_GUIDES, '74f4c8f28cd2'),
  '/guides/outerwear-and-waterproof-fabrics': byline(
    AUTHORS.production,
    LIBRARY,
    LIBRARY,
    '9daf6c1686f0',
  ),
  '/guides/dyeing-and-color-matching': byline(AUTHORS.production, LIBRARY, LIBRARY, 'ea6796c8deb0'),
  '/guides/garment-cutting': byline(AUTHORS.production, LIBRARY, LIBRARY, '639a05723561'),
  '/guides/sportswear-compliance-by-market': byline(
    AUTHORS.merchandiser,
    LIBRARY,
    FRANCE_KNIT_LINE,
    'bb4939039ea9',
  ),
  '/guides/apparel-manufacturing-machinery': byline(
    AUTHORS.production,
    LIBRARY,
    HELD_GUIDES,
    '8b889da72798',
  ),
  '/guides/apparel-design-software': byline(
    AUTHORS.contentTeam,
    LIBRARY,
    TECH_PACK_AND_TOOLS,
    '68ac190a4b52',
  ),
  '/guides/how-to-order-team-kits': byline(AUTHORS.merchandiser, LIBRARY, LIBRARY, 'fa70bce55438'),
  '/guides/apparel-manufacturing-technology': byline(
    AUTHORS.contentTeam,
    LIBRARY,
    LIBRARY,
    '26652bbfd4fb',
  ),
  // C1, signed by the merchandiser (owner, 2026-11-06).
  '/guides/tech-pack-template': byline(
    AUTHORS.merchandiser,
    TECH_PACK_AND_TOOLS,
    TECH_PACK_AND_TOOLS,
    '90d1d0002502',
  ),
  // C2, C3 and C7 (held 6-8 Nov 2026 for the team's facts): signed by the merchandiser, the
  // production in-charge and the Content Team.
  '/guides/aql-inspection': byline(
    AUTHORS.merchandiser,
    HELD_GUIDES_LIVE,
    HELD_GUIDES_LIVE,
    'df55a18eba36',
  ),
  '/guides/fabric-and-garment-testing': byline(
    AUTHORS.production,
    HELD_GUIDES_LIVE,
    HELD_GUIDES_LIVE,
    '95672f7a7b35',
  ),
  '/guides/what-sportswear-buyers-ask': byline(
    AUTHORS.contentTeam,
    HELD_GUIDES_LIVE,
    HELD_GUIDES_LIVE,
    'bd1aea93e31c',
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
  '/careers': byline(AUTHORS.hr, POLICIES_LIVE, SITE_CHECK, '998d9a7f5371'),
  // The about and factory pages: first shipped in 092a086; their words last changed in the site
  // check. The fingerprint is `bylines.test.ts`'s of the words at that moment.
  '/about': byline(
    AUTHORS.contentTeam,
    ABOUT_FACTORY_WORDS,
    WAVE_ONE,
    ABOUT_FACTORY_FINGERPRINTS['/about'],
  ),
  '/inside-the-factory': byline(
    AUTHORS.contentTeam,
    ABOUT_FACTORY_WORDS,
    LIBRARY,
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
