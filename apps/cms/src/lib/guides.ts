import { FACTS } from './companyFacts'

/**
 * The buyer guides: short pages that answer one question a buyer asks before writing in.
 *
 * WHY THEY EXIST (2026-09-30). The buyer pages (`familyPages.ts`) say what is made; these say
 * how buying it works. Each answers a question people type into a search engine in its own
 * words ("how does a private label order work", "minimum order custom apparel").
 *
 * ⚠️ THE OWNER APPROVED THESE WORDS ON 2026-09-30, AND EVERY FACT IS ALREADY ON THE SITE:
 * the order steps are the home page's, drawn from `orderProcess.ts` itself since polish D4
 * (2026-10-05, the owner's answer Q41; the guide had typed its own eight with slightly different
 * names), the colour paragraph and "quoted in writing" are the terms page's, "on request" is the
 * owner's correction of 2026-09-29.
 * A guide on a topic the site states nothing about waits for the owner's facts; do not write one from general knowledge.
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
  /**
   * The home page's eight order steps, drawn as they are there (`OrderSteps`; polish D4, the
   * owner's answer Q41): one list for the steps wherever they are told, never a copy typed here.
   */
  | { kind: 'orderSteps' }
  /**
   * A small table (polish X22): each row is one of the guide's own `point`s, its first cell the
   * point's title and the others that point's own words, so the table says nothing the guide does
   * not (`guides.test.ts` checks every cell). Drawn with a caption, a header per column and a row
   * header per row (`GuidePage.tsx`).
   */
  | {
      kind: 'table'
      caption: string
      columns: readonly string[]
      rows: readonly (readonly string[])[]
    }

export type GuideSection = {
  heading: string
  /**
   * One of the owner's factory photos (a slug in `FACTORY_PHOTOS`), drawn under the heading
   * (polish X22). Only where the section's own words name what it shows, so the photo illustrates
   * a sentence and claims nothing new; `guides.test.ts` lists each one with those words.
   */
  photo?: string
  blocks: readonly GuideBlock[]
}

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
    'Short guides for buyers: how an order works, the 3D reference, minimum order and samples, printing, fabrics, packaging, and shipping and duties.',
  heading: 'Buyer guides,',
  headingAccent: 'in plain words.',
  lede: 'Short guides to read before you write to us. Each one answers one question.',
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
        blocks: [{ kind: 'orderSteps' }],
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
        // "The same team": the stitching floor (polish X22).
        photo: 'stitching',
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
  /*
   * ⚠️ THE NEXT THREE STATE FACTS THE OWNER GAVE ON 2026-09-30, NOT FACTS FROM THE OLDER PAGES.
   * Printing: the owner ticked these seven methods as done inside the building, one by one.
   * Fabrics: names, weights, blends and uses from the owner's own fabric and fiber sheets;
   * the sheets' test figures, star scores, certificate names and environmental percentages
   * were left out by the owner's choice (no test report, and the certificates are the
   * suppliers'). Packaging: "exactly how the customer wants it", with no set minimum.
   */
  {
    path: '/guides/garment-printing-methods',
    title: 'Garment Printing Methods, Explained',
    description:
      'Seven ways to put a design on a garment, all done in our own building: screen print, sublimation, DTF, DTG, heat transfer, embroidery and special inks.',
    heading: 'Garment printing methods,',
    headingAccent: 'explained.',
    lede: 'There are seven common ways to put a design on a garment. We do all seven inside our own building. This guide says what each one is and what it suits.',
    sections: [
      {
        heading: 'The seven methods',
        // The first of the seven, in the owner's building (polish X22).
        photo: 'screen-printing',
        blocks: [
          {
            kind: 'point',
            title: 'Screen printing',
            text: 'Ink is pushed through a mesh screen onto the garment. It suits bold designs in a few colors, and larger runs.',
          },
          {
            kind: 'point',
            title: 'Sublimation',
            text: 'Heat turns the dye into the fabric, so the print becomes part of the cloth. It suits polyester and all-over designs, such as team jerseys.',
          },
          {
            kind: 'point',
            title: 'DTF (direct to film)',
            text: 'The design is printed on a film and pressed on with heat. It works on most fabrics and colors.',
          },
          {
            kind: 'point',
            title: 'DTG (direct to garment)',
            text: 'The design is printed straight onto the garment, the way an inkjet printer prints on paper. It suits cotton and designs with many colors.',
          },
          {
            kind: 'point',
            title: 'Heat transfer vinyl',
            text: 'Cut vinyl is pressed on with heat. It suits names and numbers.',
          },
          {
            kind: 'point',
            title: 'Embroidery',
            text: 'The design is stitched with thread. It suits logos and badges.',
          },
          {
            kind: 'point',
            title: 'Special inks',
            text: 'Puff, silicone, high-density and reflective prints, for a raised or reflective finish.',
          },
        ],
      },
      {
        heading: 'Which method for your garment',
        blocks: [
          /*
           * Polish X22: the audit's "small table (method · best for · minimum · feel)", from the
           * points above and nothing else. No minimum column: the guide states one minimum for
           * all (the owner, 2026-10-04). No feel column: the points state a finish for two of the
           * seven only ("part of the cloth", "raised or reflective"), so it would need words the
           * owner has not given. The headings are the lede's own: "what each one is and what it
           * suits".
           */
          {
            kind: 'table',
            caption: 'What each method suits',
            columns: ['Method', 'What it suits'],
            rows: [
              ['Screen printing', 'Bold designs in a few colors, and larger runs'],
              ['Sublimation', 'Polyester and all-over designs, such as team jerseys'],
              ['DTF (direct to film)', 'Most fabrics and colors'],
              ['DTG (direct to garment)', 'Cotton and designs with many colors'],
              ['Heat transfer vinyl', 'Names and numbers'],
              ['Embroidery', 'Logos and badges'],
              ['Special inks', 'A raised or reflective finish'],
            ],
          },
          {
            kind: 'text',
            text: 'It depends on the fabric, the design and the quantity. Send us your artwork with your inquiry, and the method is stated in your quote.',
          },
        ],
      },
      {
        heading: 'See the print before a sample is cut',
        blocks: [
          {
            kind: 'text',
            text: 'A 3D reference shows where each print sits on the garment. It is available on request.',
          },
        ],
      },
    ],
  },
  {
    path: '/guides/sportswear-fabrics-and-weights',
    title: 'Sportswear Fabrics & Weights (GSM) Guide',
    description:
      'Ten knit fabrics for sportswear with their usual weights in GSM, common blends and uses. Any fabric, structure or weight can be made to your spec.',
    heading: 'Sportswear fabrics and weights,',
    headingAccent: 'side by side.',
    lede: 'GSM means grams per square meter: how heavy a fabric is. Below are ten knit fabrics used in sportswear, with their usual weights, blends and uses. We are not limited to these. We make fabric to your own structure, weight and properties.',
    sections: [
      {
        heading: 'Ten common fabrics',
        blocks: [
          {
            kind: 'point',
            title: 'Single jersey, 120 to 200 GSM',
            text: 'Cotton, polyester or a blend of the two, often with a little spandex. Used for T-shirts, tank tops, running shirts and gym wear.',
          },
          {
            kind: 'point',
            title: 'Interlock, 155 to 220 GSM',
            text: 'Cotton, polyester or recycled polyester, often with spandex. Smooth on both sides. Used for premium tees, polo shirts and team jerseys.',
          },
          {
            kind: 'point',
            title: 'Pique, 180 to 240 GSM',
            text: 'Cotton, polyester or a blend. A raised texture. Used for polo shirts, golf wear and tennis wear.',
          },
          {
            kind: 'point',
            title: 'Mesh, 100 to 160 GSM',
            text: 'Polyester, recycled polyester or nylon, often with spandex. An open knit. Used for jerseys, running shirts and ventilation panels.',
          },
          {
            kind: 'point',
            title: 'French terry, 200 to 280 GSM',
            text: 'Cotton or a cotton and polyester blend, sometimes with spandex. Loops on the inside. Used for hoodies, sweatshirts and sweatpants.',
          },
          {
            kind: 'point',
            title: 'Fleece, 200 to 350 GSM',
            text: 'Polyester, recycled polyester or a blend with cotton. A brushed, warm surface. Used for jackets, hoodies and pullovers.',
          },
          {
            kind: 'point',
            title: 'Birdseye mesh, 135 to 180 GSM',
            text: 'Polyester or recycled polyester, often with spandex. A fine dotted texture. Used for golf shirts, tennis wear and performance tees.',
          },
          {
            kind: 'point',
            title: 'Rib, 180 to 250 GSM',
            text: 'Cotton or polyester with spandex. Very stretchy. Used for necklines, cuffs, waistbands and fitted garments.',
          },
          {
            kind: 'point',
            title: 'Waffle, 160 to 220 GSM',
            text: 'Cotton, sometimes with spandex or polyester. A honeycomb texture. Used for base layers and thermal wear.',
          },
          {
            kind: 'point',
            title: 'Jacquard, 200 to 280 GSM',
            text: 'Polyester or a blend with cotton, often with spandex. The pattern is knitted into the fabric. Used for team uniforms and premium sportswear.',
          },
        ],
      },
      {
        heading: 'The fibers',
        blocks: [
          {
            kind: 'list',
            items: [
              'Polyester and recycled polyester: light and quick to dry.',
              'Nylon: strong and stretchy.',
              'Spandex, also called elastane: adds stretch, blended in small amounts.',
              'Cotton: soft and breathable.',
              'Merino wool and recycled wool: warm.',
              'Bamboo, lyocell and modal: soft fibers made from plant or wood pulp.',
              'Hemp: a hard-wearing plant fiber.',
            ],
          },
        ],
      },
      {
        heading: 'Made to your spec',
        blocks: [
          {
            kind: 'text',
            text: 'These are starting points, not limits. Tell us the structure, weight, blend and properties you need, and the fabric is made to match.',
          },
        ],
      },
      {
        heading: 'Confirmed on a sample',
        blocks: [
          {
            kind: 'text',
            // The terms page's sentence, word for word.
            text: 'Color, fabric weight and finish are confirmed against a physical sample before production.',
          },
        ],
      },
    ],
  },
  {
    path: '/guides/private-label-packaging',
    title: 'Private Label Packaging, Explained',
    description:
      'Labels, tags, bags and cartons under your own brand, packed the way you want them. There is no set minimum for custom packaging.',
    heading: 'Private label packaging,',
    headingAccent: 'the way you want it.',
    lede: 'Private label means the garment leaves under your brand, not ours. The packaging does too. We pack your order exactly the way you want it, and there is no set minimum for custom packaging.',
    sections: [
      {
        heading: 'What can carry your brand',
        blocks: [
          {
            kind: 'text',
            text: 'Whatever you ask for. Buyers usually ask for these:',
          },
          {
            kind: 'list',
            items: ['Neck labels and care labels.', 'Hang tags.', 'Bags.', 'Cartons.'],
          },
        ],
      },
      {
        heading: 'How it works',
        blocks: [
          {
            kind: 'text',
            text: 'Send your packaging artwork, or a sample of what you want, with your inquiry. It is quoted with your order.',
          },
        ],
      },
      {
        heading: 'Where it happens',
        // "Tagging, the final check and packing": the tagging table (polish X22).
        photo: 'tagging',
        blocks: [
          {
            kind: 'text',
            text: 'Tagging, the final check and packing happen in the same building as the rest of your order.',
          },
        ],
      },
    ],
  },
  /*
   * ⚠️ SHIPPING: THE OWNER'S ANSWERS OF 2026-09-30, ticked one by one: air courier, air
   * freight, sea freight and the buyer's own forwarder; EXW, FOB, CFR, CIF and DDP, with
   * terms and costs stated per quote. What each term means is the ICC's Incoterms 2020
   * rules: FOB, CFR and CIF are sea terms only, which is why the guide says so.
   * No transit times and no duty rates: neither was given, and duty depends on the buyer's
   * country and the garment.
   */
  {
    path: '/guides/shipping-and-import-duties',
    title: 'Shipping & Import Duties for Apparel Orders',
    description:
      'How an order ships from Pakistan: air courier, air freight, sea freight or your own forwarder. The terms we quote, and who pays import duty.',
    heading: 'Shipping and import duties,',
    headingAccent: 'made clear.',
    lede: 'We ship worldwide from Sialkot, Pakistan. You choose how your order travels and which price terms suit you. The shipping method, terms and cost are stated in your quote.',
    sections: [
      {
        heading: 'Four ways to ship',
        blocks: [
          {
            kind: 'point',
            title: 'Air courier',
            text: 'Door to door with a courier. It suits samples and smaller orders.',
          },
          {
            kind: 'point',
            title: 'Air freight',
            text: 'Airport to airport. It suits larger orders that need to move quickly.',
          },
          {
            kind: 'point',
            title: 'Sea freight',
            text: 'By ship from a port in Pakistan. It suits large orders when time allows.',
          },
          {
            kind: 'point',
            title: 'Your own forwarder',
            text: 'Your shipping agent collects the order from us.',
          },
        ],
      },
      {
        heading: 'The price terms we quote',
        // EXW: "You collect the goods from our building." The building (polish X22).
        photo: 'exterior',
        blocks: [
          {
            kind: 'point',
            title: 'EXW (Ex Works)',
            text: 'You collect the goods from our building. You pay the freight, the insurance, and the import duty and tax.',
          },
          {
            kind: 'point',
            title: 'FOB (Free On Board)',
            text: 'We load the goods onto the ship at the port in Pakistan. You pay the sea freight, and the import duty and tax.',
          },
          {
            kind: 'point',
            title: 'CFR and CIF',
            text: 'We pay the sea freight to your port, and under CIF the insurance too. You pay the import duty and tax.',
          },
          {
            kind: 'point',
            title: 'DDP (Delivered Duty Paid)',
            text: 'We deliver to your door with the import duty and tax already paid. They are included in the price.',
          },
          {
            kind: 'text',
            text: 'FOB, CFR and CIF are used for sea freight. These terms follow the International Chamber of Commerce rules, called Incoterms.',
          },
        ],
      },
      {
        heading: 'Who pays import duty',
        blocks: [
          {
            kind: 'text',
            text: 'Under EXW, FOB, CFR and CIF, you do, when the goods arrive in your country. Under DDP, we do, and it is part of the price. The amount depends on your country and the garment, not on us.',
          },
        ],
      },
      {
        heading: 'What is quoted per order',
        blocks: [
          {
            kind: 'text',
            // The terms page's sentence, word for word, then the shipping part of the quote.
            text: 'Prices, minimum quantities and lead times are quoted in writing for each inquiry. The shipping method, terms and cost are stated in the same quote.',
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
