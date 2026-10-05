import { FACTS } from './companyFacts'
import { FAMILIES, type Family, familyBySlug } from './families'

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
 * so it has no page. A family with no entry here simply has no page yet: while it has no garments
 * either, its home-page card and its group on the products page say "[ soon ]" and lead to Contact
 * (`familyIsSoon`), and its links elsewhere open that group (`familyHref`). Do not add an entry
 * from a draft.
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
  /**
   * The heading over the link to the order guide. The page listed its own five steps under it until
   * polish S4 (2026-10-05); the guide tells how an order works, once, for every page.
   */
  readonly stepsHeading: string
  readonly questions: readonly FamilyPageQuestion[]
  /** The heading over the last call to action. */
  readonly closingHeading: string
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** The minimum order per style, as the home page's numbers state it (`FACTS`). */
export const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

/** The one action every buyer page asks for. `e2e/copy.spec.ts` knows it as a primary label. */
export const FAMILY_PAGE_ACTION = 'Get a free quote'

/*
 * ⚠️ NO STEPS OF THEIR OWN, NO NUMBERS, NO FACTORY PHOTOS (polish S4, the owner's answer Q26,
 * 2026-10-04). Each page carried five steps of its own, the home page's numbers and two factory
 * photos: the order process told a third way (the home page has eight steps, the order guide
 * eight with other names; audit X21) and the home page copied four times. A buyer page is the list
 * of its family's garments now, with what is made and the questions; how an order works is the
 * order guide's job, and the page links to it (`FamilyLanding.tsx`).
 */

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

export const FAMILY_PAGES: readonly FamilyPage[] = [
  {
    path: '/custom-teamwear-manufacturer',
    familySlug: 'teamwear-uniforms',
    title: 'Custom Teamwear & Team Uniform Manufacturer',
    description: `Custom teamwear and team uniforms made to order under your own label, from ${MINIMUM} pieces per style. Sample in ${SAMPLE_DAYS} working days. Inspect every garment in 3D first.`,
    eyebrow: `[ Teamwear & Uniforms · From ${MINIMUM} pieces per style ]`,
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
    questions: questionsFor('custom teamwear', 'Can the kit carry our own brand?'),
    closingHeading: 'Have a team that needs kit?',
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
    eyebrow: `[ Sportswear · From ${MINIMUM} pieces per style ]`,
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
    questions: questionsFor('custom activewear', 'Can the garments carry our own brand?'),
    closingHeading: 'Have a range that needs making?',
  },
  {
    path: '/custom-outerwear-manufacturer',
    familySlug: 'outerwear',
    title: 'Custom Outerwear & Jacket Manufacturer',
    description: `Custom jackets and outerwear made to order under your own label, from ${MINIMUM} pieces per style. Sample in ${SAMPLE_DAYS} working days. Inspect every garment in 3D first.`,
    eyebrow: `[ Outerwear · From ${MINIMUM} pieces per style ]`,
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
    questions: questionsFor('custom jackets', 'Can the jackets carry our own brand?'),
    closingHeading: 'Have a jacket that needs making?',
  },
  {
    path: '/private-label-casual-wear-manufacturer',
    familySlug: 'casual-wear',
    title: 'Private Label Casual Wear Manufacturer',
    description: `Private label casual wear made to order, from ${MINIMUM} pieces per style: hoodies, tracksuits, polos and fleece. Sample in ${SAMPLE_DAYS} working days. See each garment in 3D.`,
    eyebrow: `[ Casual Wear · From ${MINIMUM} pieces per style ]`,
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
    questions: questionsFor('private label casual wear', 'Can the garments carry our own brand?'),
    closingHeading: 'Have a range that needs making?',
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

/**
 * Where a family's card or link should lead: its buyer page, else its group on the products page.
 *
 * ⚠️ ONE PAGE PER JOB (polish S1, the owner's answer Q24, 2026-10-04). A family's garments were
 * listed twice, on its buyer page and on its filtered gallery (`/products?family=<slug>`), and the
 * two linked to each other (visual audit VA-33). The buyer page is the ONLY list of its family now;
 * the products page shows every family under its own heading, which links here; and the filter's
 * addresses forward (`familyFilterForward`). Sports Accessories has no page, so its link is its
 * group on the products page, where "[ soon ]" leads to Contact (Q21).
 */
export function familyHref(family: Family): string {
  return familyPageFor(family)?.path ?? `/products#${family.slug}`
}

/**
 * What a family with nothing to show says, in the owner's words (Q21, 2026-10-04): it is coming,
 * and a buyer can ask about it now. Its group on the products page and its card on the home page
 * both read these (polish F8), so the two cannot drift apart. The card goes straight to Contact:
 * its group holds no garments, and a buyer who clicked a picture of backpacks met an empty list.
 */
export const FAMILY_SOON = {
  label: '[ soon ]',
  ask: 'Ask what we make',
  href: '/contact',
} as const

/**
 * The kinds of garment a family's home-page card lists when it opens (polish D3): the first four
 * groups of its buyer page's "what we make", in the owner's approved words. A family with no page
 * lists none: nothing the site has not already said is claimed for it (the demo's "Backpacks / Bags
 * / Caps" for Sports Accessories was never confirmed).
 */
export function familyTypes(family: Family): readonly string[] {
  return (familyPageFor(family)?.makes ?? []).slice(0, 4).map((entry) => entry.group)
}

/**
 * Whether a family says "[ soon ]": no page AND no garment yet (today, Sports Accessories). Once a
 * garment of it is published, its group lists it and its card opens that group, page or not; a
 * "soon" over a garment on show would be wrong.
 */
export function familyIsSoon(family: Family, garments: number): boolean {
  return garments === 0 && !familyPageFor(family)
}

/**
 * Where an old family-filter address forwards (polish S3): `/products?family=outerwear` to the
 * outerwear page, a family with no page to its group, and an empty or unknown value to the whole
 * products page. Sent links and anything a search engine had kept keep working, and land where the
 * family is listed now (Google, "Consolidate duplicate URLs", 10 July 2026).
 */
export function familyFilterForward(slug: string | undefined): string {
  const family = familyBySlug(slug)
  return family ? familyHref(family) : '/products'
}
