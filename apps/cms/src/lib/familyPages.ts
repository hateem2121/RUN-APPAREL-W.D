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
 * ⚠️ THE OWNER APPROVES EVERY PAGE'S WORDS BEFORE IT IS BUILT. Teamwear was approved on
 * 2026-09-30. A family with no entry here simply has no page yet: its home-page card keeps
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
  /** What is made, grouped the way a buyer asks: by sport. */
  readonly makes: ReadonlyArray<{ sport: string; garments: string }>
  readonly steps: readonly FamilyPageStep[]
  readonly questions: readonly FamilyPageQuestion[]
  /** Slugs in `FACTORY_PHOTOS`, `wide` ones: they stack in one column beside the copy. */
  readonly photos: readonly string[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

/** The one action every buyer page asks for. `e2e/copy.spec.ts` knows it as a primary label. */
export const FAMILY_PAGE_ACTION = 'Get a free quote'

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
    makes: [
      {
        sport: 'Soccer',
        garments: 'Jerseys (V-neck and polo collar), raglan tees and training bibs.',
      },
      {
        sport: 'American football',
        garments: 'Men’s and women’s jerseys, and full uniforms.',
      },
      {
        sport: 'Tennis and pickleball',
        garments: 'Dresses, bra and skirt sets, and court shirts.',
      },
      { sport: 'Cycling', garments: 'Skinsuits and bib shorts.' },
      { sport: 'Training', garments: 'Full-zip tops and sleeveless vests.' },
      { sport: 'Water sports', garments: 'Neoprene wetsuits.' },
    ],
    steps: [
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
    ],
    questions: [
      {
        question: 'What is the minimum order for custom teamwear?',
        answer: `${MINIMUM} pieces per style.`,
      },
      {
        question: 'How long does a sample take?',
        answer: `${SAMPLE_DAYS} working days. The sample fee is credited back against your bulk order.`,
      },
      {
        question: 'Can the kit carry our own brand?',
        answer:
          'Yes. Everything is private label: made to your specification and sent out under your own label.',
      },
      {
        question: 'What do you need from us to quote?',
        answer:
          'A sketch is enough. A reference garment or a tech pack is better. The quote is free.',
      },
      {
        question: 'Do you keep stock designs we can pick from?',
        answer:
          'No. Every order is made to order. The 3D garments on this page are references that show what we can make.',
      },
      { question: 'Where do you ship?', answer: 'Worldwide.' },
    ],
    photos: ['stitching', 'lab'],
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
