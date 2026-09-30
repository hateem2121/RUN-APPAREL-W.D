import { FACTS } from './companyFacts'

/**
 * The buyer guides: short pages that answer one question a buyer asks before writing in.
 *
 * WHY THEY EXIST (2026-09-30). The buyer pages (`familyPages.ts`) say what is made; these say
 * how buying it works. Each answers a question people type into a search engine in its own
 * words ("how does a private label order work", "minimum order custom apparel").
 *
 * ⚠️ THE OWNER APPROVED THESE WORDS ON 2026-09-30, AND EVERY FACT IS ALREADY ON THE SITE:
 * the order steps are the home page's (`orderProcess.ts`), the colour paragraph and "quoted
 * in writing" are the terms page's, "on request" is the owner's correction of 2026-09-29.
 * A guide on a topic the site states nothing about (printing methods, fabrics, packaging,
 * shipping and duties) waits for the owner's facts; do not write one from general knowledge.
 *
 * ⚠️ THE NUMBERS ARE READ FROM `FACTS`, NEVER RETYPED (`orderProcess.ts` says why).
 *
 * ⚠️ A NEW GUIDE MUST ALSO JOIN `GUIDE_PAGE_SOURCES` in `publicViewerHeaders.mjs` and get a
 * route folder under `(frontend)/guides/`. `guides.test.ts` fails when the three differ.
 */

export type GuideBlock =
  | { kind: 'text'; text: string }
  /** A small mono label over the blocks that follow (a stage of the order). */
  | { kind: 'label'; text: string }
  /** A titled point: a step, or a term and what it means. */
  | { kind: 'point'; title: string; text: string }
  | { kind: 'list'; ordered?: boolean; items: readonly string[] }

export type GuideSection = { heading: string; blocks: readonly GuideBlock[] }

export type Guide = {
  /** Root-relative, under `/guides/`. Public: a sent link must keep working. */
  readonly path: string
  /** The `<title>`; the layout adds " — RUN APPAREL". */
  readonly title: string
  readonly description: string
  /** The one `<h1>`, in two parts: plain, then the single serif accent. */
  readonly heading: string
  readonly headingAccent: string
  readonly lede: string
  readonly sections: readonly GuideSection[]
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')
const CAPACITY = fact('Pieces per month')

/** The guides' own index page. */
export const GUIDES_INDEX = {
  path: '/guides',
  title: 'Buyer Guides',
  description:
    'Short guides for buyers: how a private label order works, what a 3D garment reference shows, and how the minimum order and samples work.',
  heading: 'Buyer guides,',
  headingAccent: 'in plain words.',
  lede: 'Three short guides to read before you write to us. Each one answers one question.',
} as const

export const GUIDES: readonly Guide[] = [
  {
    path: '/guides/how-a-private-label-order-works',
    title: 'How a Private Label Clothing Order Works',
    description:
      'From a sketch to your door in eight steps: quote, sample, sign-off, bulk, checks and shipping. Who does what, and what you need to send to start.',
    heading: 'How a private label order works,',
    headingAccent: 'step by step.',
    lede: 'A private label order at RUN APPAREL has four stages and eight steps. At every step you know whose move it is: yours or ours. Nothing goes into bulk production until you sign off a sample.',
    sections: [
      {
        heading: 'The eight steps',
        blocks: [
          { kind: 'label', text: 'Talk' },
          {
            kind: 'point',
            title: '1. You send what you have',
            text: 'A sketch, a reference garment or a full tech pack. We reply within 24 hours.',
          },
          {
            kind: 'point',
            title: '2. We send your quote',
            text: `Fabric, trims, sizes and price. The quote is free and commits you to nothing. The minimum is ${MINIMUM} pieces per style.`,
          },
          { kind: 'label', text: 'Develop' },
          {
            kind: 'point',
            title: '3. We make your sample',
            text: `It takes ${SAMPLE_DAYS} working days. The sample fee is credited back against your bulk order.`,
          },
          {
            kind: 'point',
            title: '4. You approve',
            text: 'Nothing goes into bulk until you sign off the sample.',
          },
          { kind: 'label', text: 'Make' },
          {
            kind: 'point',
            title: '5. Bulk production',
            text: 'Cut, stitched and finished in one building in Pakistan.',
          },
          {
            kind: 'point',
            title: '6. Checked',
            text: 'Testing, inspection under light and a final check before packing.',
          },
          { kind: 'label', text: 'Deliver' },
          {
            kind: 'point',
            title: '7. Packed and shipped',
            text: 'Sent to you, wherever you are.',
          },
          {
            kind: 'point',
            title: '8. Your order arrives',
            text: 'Ready for your team, your store or your event.',
          },
        ],
      },
      {
        heading: 'What helps us quote faster',
        blocks: [
          {
            kind: 'text',
            text: 'Styles and quantities, your target fabric or a reference garment, any artwork, and the date you need it by. None of it is required to start the conversation.',
          },
        ],
      },
      {
        heading: 'What is quoted per order',
        blocks: [
          {
            kind: 'text',
            text: 'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
          },
        ],
      },
      {
        heading: 'Your artwork stays yours',
        blocks: [
          {
            kind: 'text',
            text: 'Tech packs, artwork and samples you send us remain your property. We use them only to quote and to manufacture for you.',
          },
        ],
      },
    ],
  },
  {
    path: '/guides/3d-garment-reference',
    title: 'The 3D Garment Reference, Explained',
    description:
      'What a 3D garment reference shows, what it cannot settle, and how to use one to check construction, fit and artwork before a sample is cut.',
    heading: 'The 3D garment reference,',
    headingAccent: 'explained.',
    lede: 'A 3D reference is a garment you can turn and zoom on your screen. It lets you and your team check the construction, the fit and where the artwork sits before a sample is cut. We can build one of your garment on request.',
    sections: [
      {
        heading: 'What it shows',
        blocks: [
          {
            kind: 'list',
            items: [
              'The garment from every side, turned by hand.',
              'Where each print and logo sits.',
              'The fabric composition, the weight, the fit and the performance features, stated on the page.',
              'Every colorway of the garment, each on its own page.',
            ],
          },
        ],
      },
      {
        heading: 'What it cannot settle',
        blocks: [
          {
            kind: 'text',
            text: 'Color. Color appears differently on different screens and under different lighting, and a rendered garment is not a color match to finished cloth. Color, fabric weight and finish are confirmed against a physical sample before production.',
          },
        ],
      },
      {
        heading: 'How to use one',
        blocks: [
          {
            kind: 'list',
            ordered: true,
            items: [
              'Open the garment’s page and turn it.',
              'Zoom in on the print and the seams.',
              'Share the link with your team.',
              'Tell us what to change, before the sample is made.',
            ],
          },
        ],
      },
      {
        heading: 'Is a 3D reference part of every order?',
        blocks: [{ kind: 'text', text: 'No. It is available on request.' }],
      },
    ],
  },
  {
    path: '/guides/minimum-order-and-samples',
    title: 'Minimum Order & Samples for Custom Apparel',
    description: `The minimum order is ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days and its fee is credited back against your bulk order. Here is how both work.`,
    heading: 'Minimum order and samples,',
    headingAccent: 'in plain numbers.',
    lede: `The minimum order at RUN APPAREL is ${MINIMUM} pieces per style. A sample takes ${SAMPLE_DAYS} working days, and the sample fee is credited back against your bulk order. Nothing goes into bulk until you sign off the sample.`,
    sections: [
      {
        heading: 'The minimum order',
        blocks: [
          {
            kind: 'text',
            text: `${MINIMUM} pieces per style. The same building, the same team and the same standard make the order whether it is a hundred pieces or a hundred thousand. Capacity is ${CAPACITY} pieces per month.`,
          },
        ],
      },
      {
        heading: 'The sample',
        blocks: [
          {
            kind: 'list',
            items: [
              `Made in ${SAMPLE_DAYS} working days.`,
              'The fee is credited back against your bulk order.',
              'Bulk production starts only after you approve it.',
            ],
          },
        ],
      },
      {
        heading: 'The quote',
        blocks: [
          {
            kind: 'text',
            text: 'Free, and it commits you to nothing. It states the fabric, the trims, the sizes and the price.',
          },
        ],
      },
      {
        heading: 'What is quoted per order',
        blocks: [
          {
            kind: 'text',
            // The terms page's sentence, word for word (owner, 2026-09-30: "keep the terms wording").
            text: 'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
          },
        ],
      },
    ],
  },
]

/** Every address the guides answer on: the index, then each guide. */
export const GUIDE_PATHS: readonly string[] = [
  GUIDES_INDEX.path,
  ...GUIDES.map((guide) => guide.path),
]

/** The guide at an address. Throws on one `GUIDES` does not hold: a typo, caught at build. */
export function guideAt(path: string): Guide {
  const guide = GUIDES.find((entry) => entry.path === path)
  if (!guide) throw new Error(`guides.ts has no guide at ${path}`)
  return guide
}
