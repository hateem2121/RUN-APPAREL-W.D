import { FACTS } from './companyFacts'
import { FAMILIES, type Family } from './families'

/**
 * The buyer pages, one per product family: a real page with its own address, written for
 * the words a buyer types into a search engine.
 *
 * WHY THEY EXIST (2026-09-30). The five families were only filters (`/products?family=…`),
 * and a filter's canonical is `/products` on purpose, so a search engine could never list
 * "custom teamwear manufacturer" as a page of this site. Measured that day: all ten pages
 * ranking for the sister phrase "custom sportswear manufacturer" lead their title with those
 * words, and this site had no page that did.
 *
 * ⚠️ THE OWNER APPROVES EVERY PAGE'S WORDS BEFORE IT IS BUILT. Teamwear, Sportswear,
 * Outerwear and Casual Wear were approved on 2026-09-30. Sports Accessories has no garments,
 * so it has no page. A family with no entry here simply has no page yet: its home-page card keeps
 * opening the filtered gallery. Do not add an entry from a draft.
 *
 * ⚠️ EVERY CLAIM BELOW IS ALREADY ON THE SITE. Nothing here may state a fact the home page
 * does not: no printing method beyond what is pictured, no customer names, no lead time
 * (`companyFacts.ts` records the owner removing one). The numbers are read from `FACTS`,
 * never retyped, for the reason `orderProcess.ts` gives.
 *
 * ⚠️ THE ADDRESS CANNOT LIVE UNDER `/products/`. `worker.mjs` hands every `/products/<x>`
 * to the viewer Worker before Next sees it (`viewerForward.mjs`), so a page there would be
 * answered as a garment that does not exist.
 *
 * ⚠️ A NEW PAGE MUST ALSO JOIN `FAMILY_PAGE_SOURCES` in `publicViewerHeaders.mjs`, which is
 * what gives it its Content-Security-Policy and its redirect from the admin host.
 * `familyPages.test.ts` fails when the two lists differ.
 */

export type FamilyPageStep = { title: string; body: string }
export type FamilyPageQuestion = { question: string; answer: string }

export type FamilyPage = {
  /** Root-relative, never under `/products/`. Public: a sent link must keep working. */
  readonly path: string
  /** The family whose garments the page shows: a `slug` in `FAMILIES`. */
  readonly familySlug: string
  /** The `<title>`; the layout adds " — RUN APPAREL". */
  readonly title: string
  readonly description: string
  /** The mono label above the heading. */
  readonly eyebrow: string
  /** The one `<h1>`, in two parts: plain, then the single serif accent. */
  readonly heading: string
  readonly headingAccent: string
  readonly lede: string
  /** The heading over `makes`. */
  readonly makesHeading: string
  /** What is made, in the groups a buyer asks by. */
  readonly makes: ReadonlyArray<{ group: string; garments: string }>
  /** The heading over `steps`. */
  readonly stepsHeading: string
  readonly steps: readonly FamilyPageStep[]
  readonly questions: readonly FamilyPageQuestion[]
  /** The heading over the last call to action. */
  readonly closingHeading: string
  /** Slugs in `FACTORY_PHOTOS`, `wide` ones: they stack in one column beside the copy. */
  readonly photos: readonly string[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

/** The one action every buyer page asks for. `e2e/copy.spec.ts` knows it as a primary label. */
export const FAMILY_PAGE_ACTION = 'Get a free quote'

/**
 * How an order works, the same on every buyer page because it IS the same for every order
 * (`orderProcess.ts` holds what the owner confirmed). Five steps here against the home
 * page's eight: a buyer page is read quickly, and the two pairs it folds say the same thing.
 */
const STEPS: readonly FamilyPageStep[] = [
  {
    title: 'Send what you have',
    body: 'A sketch, a reference garment or a full tech pack. We reply within 24 hours.',
  },
  {
    title: 'Your quote',
    body: 'Fabric, trims, sizes and price. It is free and commits you to nothing.',
  },
  {
    title: 'Your sample',
    body: `Made in ${SAMPLE_DAYS} working days. The sample fee is credited back against your bulk order.`,
  },
  {
    title: 'You approve',
    body: 'Nothing goes into bulk until you sign off the sample.',
  },
  {
    title: 'Made, checked, shipped',
    body: 'Cut, printed, stitched, tested and packed in one building, then sent to you.',
  },
]

/** The questions every buyer asks, after the one about the minimum, which names the family. */
const questionsFor = (minimumFor: string, ownBrand: string): readonly FamilyPageQuestion[] => [
  {
    question: `What is the minimum order for ${minimumFor}?`,
    answer: `${MINIMUM} pieces per style.`,
  },
  {
    question: 'How long does a sample take?',
    answer: `${SAMPLE_DAYS} working days. The sample fee is credited back against your bulk order.`,
  },
  {
    question: ownBrand,
    answer:
      'Yes. Everything is private label: made to your specification and sent out under your own label.',
  },
  {
    question: 'What do you need from us to quote?',
    answer: 'A sketch is enough. A reference garment or a tech pack is better. The quote is free.',
  },
  {
    question: 'Do you keep stock designs we can pick from?',
    answer:
      'No. Every order is made to order. The 3D garments on this page are references that show what we can make.',
  },
  { question: 'Where do you ship?', answer: 'Worldwide.' },
]

const PHOTOS = ['stitching', 'lab'] as const

export const FAMILY_PAGES: readonly FamilyPage[] = [
  {
    path: '/custom-teamwear-manufacturer',
    familySlug: 'teamwear-uniforms',
    title: 'Custom Teamwear & Team Uniform Manufacturer',
    description: `Custom teamwear and team uniforms made to order under your own label, from ${MINIMUM} pieces per style. Sample in ${SAMPLE_DAYS} working days. Inspect every garment in 3D first.`,
    eyebrow: `[ TEAMWEAR & UNIFORMS · FROM ${MINIMUM} PIECES PER STYLE ]`,
    heading: 'Custom teamwear and team uniforms,',
    headingAccent: 'made to your spec.',
    lede: `RUN APPAREL is a private label teamwear manufacturer in Sialkot, Pakistan. You send a style, a quantity and a specification. We make team kit to that specification, under your own label, from ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days.`,
    makesHeading: 'What we make for teams',
    makes: [
      {
        group: 'Soccer',
        garments: 'Jerseys (V-neck and polo collar), raglan tees and training bibs.',
      },
      { group: 'American football', garments: 'Men’s and women’s jerseys, and full uniforms.' },
      {
        group: 'Tennis and pickleball',
        garments: 'Dresses, bra and skirt sets, and court shirts.',
      },
      { group: 'Cycling', garments: 'Skinsuits and bib shorts.' },
      { group: 'Training', garments: 'Full-zip tops and sleeveless vests.' },
      { group: 'Water sports', garments: 'Neoprene wetsuits.' },
    ],
    stepsHeading: 'How a team order works',
    steps: STEPS,
    questions: questionsFor('custom teamwear', 'Can the kit carry our own brand?'),
    closingHeading: 'Have a team that needs kit?',
    photos: PHOTOS,
  },
  /*
   * ⚠️ "ACTIVEWEAR" LEADS, NOT "SPORTSWEAR", AND THE ADDRESS SAYS SO (owner, 2026-09-30).
   * The home page's title already aims at "custom sportswear manufacturer"; a second page
   * aiming at the same words would compete with it in the same results.
   */
  {
    path: '/custom-activewear-manufacturer',
    familySlug: 'sportswear',
    title: 'Custom Activewear & Sportswear Manufacturer',
    description: `Custom activewear and sportswear made to order under your own label, from ${MINIMUM} pieces per style. Sample in ${SAMPLE_DAYS} working days. Inspect every garment in 3D first.`,
    eyebrow: `[ SPORTSWEAR · FROM ${MINIMUM} PIECES PER STYLE ]`,
    heading: 'Custom activewear and sportswear',
    headingAccent: 'made to your spec.',
    lede: `RUN APPAREL is a private label activewear manufacturer in Sialkot, Pakistan. You send a style, a quantity and a specification. We make sportswear to that specification, under your own label, from ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days.`,
    makesHeading: 'What we make for active brands',
    makes: [
      {
        group: 'Training',
        garments: 'Pullovers, long-sleeve jerseys, cropped tops and sweatshirts.',
      },
      { group: 'Running', garments: 'Quarter-zip shirts.' },
      {
        group: 'Yoga and studio',
        garments: 'Compression tights, yoga tights and high-support sports bras.',
      },
      {
        group: 'Sets and layers',
        garments: 'Crop top and shorts sets, and zip-up sports vests.',
      },
    ],
    stepsHeading: 'How an order works',
    steps: STEPS,
    questions: questionsFor('custom activewear', 'Can the garments carry our own brand?'),
    closingHeading: 'Have a range that needs making?',
    photos: PHOTOS,
  },
  {
    path: '/custom-outerwear-manufacturer',
    familySlug: 'outerwear',
    title: 'Custom Outerwear & Jacket Manufacturer',
    description: `Custom jackets and outerwear made to order under your own label, from ${MINIMUM} pieces per style. Sample in ${SAMPLE_DAYS} working days. Inspect every garment in 3D first.`,
    eyebrow: `[ OUTERWEAR · FROM ${MINIMUM} PIECES PER STYLE ]`,
    heading: 'Custom jackets and outerwear,',
    headingAccent: 'made to your spec.',
    lede: `RUN APPAREL is a private label outerwear manufacturer in Sialkot, Pakistan. You send a style, a quantity and a specification. We make jackets to that specification, under your own label, from ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days.`,
    makesHeading: 'What we make in outerwear',
    makes: [
      {
        group: 'Softshell',
        garments: 'Jackets, longline jackets, tech jackets and a commuter suit.',
      },
      { group: 'Windbreakers', garments: 'Printed windbreaker jackets.' },
      { group: 'Fleece', garments: 'Sherpa fleece jackets.' },
      { group: 'Leather', garments: 'Utility jackets.' },
    ],
    stepsHeading: 'How an order works',
    steps: STEPS,
    questions: questionsFor('custom jackets', 'Can the jackets carry our own brand?'),
    closingHeading: 'Have a jacket that needs making?',
    photos: PHOTOS,
  },
  {
    path: '/private-label-casual-wear-manufacturer',
    familySlug: 'casual-wear',
    title: 'Private Label Casual Wear Manufacturer',
    description: `Private label casual wear made to order, from ${MINIMUM} pieces per style: hoodies, tracksuits, polos and fleece. Sample in ${SAMPLE_DAYS} working days. See each garment in 3D.`,
    eyebrow: `[ CASUAL WEAR · FROM ${MINIMUM} PIECES PER STYLE ]`,
    heading: 'Private label casual wear,',
    headingAccent: 'made to your spec.',
    lede: `RUN APPAREL is a private label casual wear manufacturer in Sialkot, Pakistan. You send a style, a quantity and a specification. We make everyday clothing to that specification, under your own label, from ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days.`,
    makesHeading: 'What we make in casual wear',
    makes: [
      { group: 'Hoodies', garments: 'Women’s crop hoodies.' },
      { group: 'Tracksuits', garments: 'Men’s tracksuits.' },
      { group: 'Polos', garments: 'Half-zip polo shirts.' },
      { group: 'Fleece', garments: 'Half-zip fleece pullovers.' },
    ],
    stepsHeading: 'How an order works',
    steps: STEPS,
    questions: questionsFor('private label casual wear', 'Can the garments carry our own brand?'),
    closingHeading: 'Have a range that needs making?',
    photos: PHOTOS,
  },
]

/** The buyer page for a family, or null when the owner has not approved one yet. */
export function familyPageFor(family: Family): FamilyPage | null {
  return FAMILY_PAGES.find((page) => page.familySlug === family.slug) ?? null
}

/** The family a buyer page shows. Throws on a slug `FAMILIES` does not hold: a typo, caught at build. */
export function familyOf(page: FamilyPage): Family {
  const family = FAMILIES.find((entry) => entry.slug === page.familySlug)
  if (!family) throw new Error(`familyPages: no family "${page.familySlug}" in FAMILIES`)
  return family
}

/** Where a family's card or link should lead: its buyer page when it has one, else the filter. */
export function familyHref(family: Family): string {
  return familyPageFor(family)?.path ?? `/products?family=${family.slug}`
}
