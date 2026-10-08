import { FACTS, LEAD_TIME } from './companyFacts'

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

/**
 * Reference garments whose own published words show a guide's subject (the owner's picks,
 * 2026-10-08): each pick names the method or fabric its garment's page states, in `shows`. Drawn
 * after the section headed `after`, linked to the garment's default colour; a garment the
 * catalogue no longer holds is left out, never linked dead. They also give the garment pages
 * links from pages Google already reads (findability audit: 208 addresses not indexed).
 */
export type GuideGarments = {
  readonly heading: string
  /** The `heading` of the section this list follows. `guides.test.ts` checks it exists. */
  readonly after: string
  readonly picks: readonly { readonly slug: string; readonly shows?: string }[]
}

/**
 * An official page a guide quotes (2026-10-08, the country comparison): drawn as a link under
 * "Sources" so a reader and an AI tool can check each claim. `date` is ISO; `kind` says what it
 * is: the day we read an undated page, or the page's own published or updated date.
 */
export type GuideSource = {
  readonly name: string
  readonly url: string
  readonly date: string
  readonly kind: 'read' | 'published' | 'updated'
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
  readonly garments?: GuideGarments
  readonly sources?: readonly GuideSource[]
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
    // One garment from three ranges, under the first step's own words (owner, 2026-10-08).
    garments: {
      heading: 'Turn one now',
      after: 'How to use one',
      picks: [{ slug: 'rxps' }, { slug: 'r-ect' }, { slug: 'r-pps' }],
    },
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
    /*
     * Three methods, each named on its garment's own page (owner's picks, 2026-10-08): "a tonal
     * abstract geometric sublimation across the main body", "single jersey recycled polyester with
     * screen printing", "silicone printing, so the graphics keep sharp edges" (silicone is one of
     * the special inks above).
     */
    garments: {
      heading: 'Seen on our reference garments',
      after: 'Which method for your garment',
      picks: [
        { slug: 'r-vpj', shows: 'Sublimation' },
        { slug: 'r-mrp', shows: 'Screen printing' },
        { slug: 'r-au', shows: 'Special inks (silicone)' },
      ],
    },
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
        // "Confirmed against a physical sample": the testing lab's color-viewing cabinet (owner's
        // sign-off, 2026-10-05: "Add it").
        photo: 'lab',
        blocks: [
          {
            kind: 'text',
            // The terms page's sentence, word for word.
            text: 'Color, fabric weight and finish are confirmed against a physical sample before production.',
          },
        ],
      },
    ],
    /*
     * Three of the ten fabrics, each named on its garment's own page (owner's picks, 2026-10-08):
     * "a recycled interlock knit", "a brushed thermal fleece interior", "stretch waffle knit".
     */
    garments: {
      heading: 'Seen on our reference garments',
      after: 'Ten common fabrics',
      picks: [
        { slug: 'r-ttp', shows: 'Interlock' },
        { slug: 'r-csp', shows: 'Fleece' },
        { slug: 'r-afp', shows: 'Waffle' },
      ],
    },
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
  /*
   * ⚠️ THE NEXT TWO WERE APPROVED BY THE OWNER ON 2026-10-08, sentence by sentence, from a page
   * that tagged each one: their own words from the pages named in the comments, official sources
   * read that day, or new wording they approved. The cost guide states NO price (decision D10:
   * every price is quoted per order). The comparison states nothing about another country that an
   * official source does not, and each source is listed on the page with its date.
   */
  {
    path: '/guides/cost-to-start-an-activewear-brand',
    title: 'What It Costs to Start an Activewear Brand',
    description: `What a first private label order is made of: ${MINIMUM} pieces per style, a sample credited back, printing, packaging, shipping and import duty, each quoted.`,
    heading: 'What it costs to start',
    headingAccent: 'an activewear brand.',
    lede: 'A first order costs the sum of a few parts: the pieces, the sample, the printing, the packaging and the shipping. Each one is quoted in writing for your inquiry, and the quote is free. This guide says what each part depends on.',
    sections: [
      {
        heading: 'The smallest first order',
        blocks: [
          {
            kind: 'text',
            // The minimum order guide's words.
            text: `${MINIMUM} pieces per style. The same building, the same team and the same standard make the order whether it is a hundred pieces or a hundred thousand.`,
          },
        ],
      },
      {
        heading: 'The sample',
        blocks: [
          {
            kind: 'list',
            // The minimum order guide's list.
            items: [
              `Made in ${SAMPLE_DAYS} working days.`,
              'The fee is credited back against your bulk order.',
              'Bulk production starts only after you approve it.',
            ],
          },
        ],
      },
      {
        heading: 'What your quote is built from',
        blocks: [
          {
            kind: 'text',
            text: 'Your quote is free, and it commits you to nothing. It states the fabric, the trims, the sizes and the price.',
          },
          {
            kind: 'point',
            title: 'The fabric',
            // The fabrics guide's "Made to your spec", shortened.
            text: 'Its structure, weight, blend and properties. Tell us what you need, and the fabric is made to match.',
          },
          {
            kind: 'point',
            title: 'The printing',
            // The printing guide's words.
            text: 'It depends on the fabric, the design and the quantity. Send us your artwork with your inquiry, and the method is stated in your quote.',
          },
          {
            kind: 'point',
            title: 'The packaging',
            // The packaging guide's words, joined.
            text: 'Labels, tags, bags and cartons under your own brand, packed the way you want. There is no set minimum for custom packaging, and it is quoted with your order.',
          },
        ],
      },
      {
        heading: 'Shipping and import duty',
        blocks: [
          {
            kind: 'text',
            // The shipping guide's words.
            text: 'The shipping method, terms and cost are stated in your quote. Under EXW, FOB, CFR and CIF, you pay the import duty and tax when the goods arrive in your country. Under DDP, we do, and it is part of the price. The amount depends on your country and the garment, not on us.',
          },
        ],
      },
      {
        heading: 'When it arrives',
        blocks: [{ kind: 'text', text: LEAD_TIME }],
      },
      {
        heading: 'See it before a sample is cut',
        blocks: [
          {
            kind: 'text',
            // The 3D guide's words.
            text: 'A 3D reference lets you and your team check the construction, the fit and where the artwork sits before a sample is cut. We can build one of your garment on request.',
          },
        ],
      },
      {
        heading: 'What is quoted per order',
        blocks: [
          {
            kind: 'text',
            // The terms page's sentence, word for word.
            text: 'Prices, minimum quantities and lead times are quoted in writing for each inquiry.',
          },
        ],
      },
    ],
  },
  {
    path: '/guides/pakistan-vs-china-vs-turkey',
    title: 'Pakistan vs China vs Turkey for Sportswear',
    description:
      'Making sportswear in Pakistan, China or Türkiye: what you pay at the EU and UK border, from official sources, and the questions to ask any factory.',
    heading: 'Pakistan, China or Türkiye,',
    headingAccent: 'side by side.',
    lede: "We make sportswear in Sialkot, Pakistan, so read this knowing that. What it says about each country's trade terms comes from official sources, named with the date we read them. What it says about us is what our own pages say.",
    sections: [
      {
        heading: 'Bringing it into the European Union',
        blocks: [
          {
            kind: 'point',
            title: 'From Pakistan',
            // Source 1.
            text: "More than 85% of Pakistan's exports, including textiles and clothing, enter the EU duty and quota free under the EU's GSP+ scheme.",
          },
          {
            kind: 'text',
            // Source 2.
            text: "The EU's renewed scheme applies from 1 January 2027. Countries in GSP+ today must reapply, and keep their preferences until the end of 2028 while they do.",
          },
          {
            kind: 'point',
            title: 'From Türkiye',
            // Source 3.
            text: 'Türkiye and the EU are in a customs union that removed tariffs on all industrial goods between them.',
          },
          {
            kind: 'point',
            title: 'From China',
            // Source 4: Delegated Regulation 1421/2013, recital 7 and Article 2.
            text: "China has been outside the EU's GSP preferences since 1 January 2015, when the EU removed it from the list of beneficiary countries.",
          },
        ],
      },
      {
        heading: 'Bringing it into the United Kingdom',
        blocks: [
          {
            kind: 'point',
            title: 'From Pakistan',
            // Source 5.
            text: "Pakistan is in the Enhanced Preferences tier of the UK's Developing Countries Trading Scheme, which gives 0% import tariffs on 92% of product lines.",
          },
          {
            kind: 'point',
            title: 'From Türkiye',
            // Source 6. No line for China: no official UK page was found to quote (2026-10-08).
            text: "Goods that meet the UK–Turkey trade agreement's rules of origin trade at its preferential tariff rates.",
          },
        ],
      },
      {
        heading: 'Anywhere else',
        blocks: [
          {
            kind: 'text',
            text: "The duty depends on your country and the garment's tariff code. Ask your customs broker for the rate at your border before you order.",
          },
        ],
      },
      {
        heading: 'What to ask any factory',
        blocks: [
          // The questions are new wording; each answer is the site's own.
          {
            kind: 'point',
            title: 'What is the minimum per style?',
            text: `Ours is ${MINIMUM} pieces per style.`,
          },
          {
            kind: 'point',
            title: 'How long does a sample take, and is its fee credited back?',
            text: `Ours takes ${SAMPLE_DAYS} working days, and the fee is credited back against your bulk order.`,
          },
          {
            kind: 'point',
            title: 'Is the printing done in the same building?',
            text: 'We do all seven common methods inside our own building.',
          },
          {
            kind: 'point',
            title: 'Can I see the garment before a sample is cut?',
            text: 'We can build a 3D reference of your garment on request.',
          },
          { kind: 'point', title: 'When will the order arrive?', text: LEAD_TIME },
          {
            kind: 'point',
            title: 'Whose name is each certificate in?',
            text: 'Our pages name the holder of each one.',
          },
        ],
      },
    ],
    sources: [
      {
        name: 'European Commission: EU trade relations with Pakistan',
        url: 'https://policy.trade.ec.europa.eu/eu-trade-relationships-country-and-region/countries-and-regions/pakistan_en',
        date: '2026-10-08',
        kind: 'read',
      },
      {
        name: "European Commission, Access2Markets: The EU's renewed GSP scheme, key updates for 2027",
        url: 'https://trade.ec.europa.eu/access-to-markets/en/news/eus-renewed-gsp-scheme-key-updates-2027',
        date: '2026-08-11',
        kind: 'published',
      },
      {
        name: 'European Commission: EU trade relations with Türkiye',
        url: 'https://policy.trade.ec.europa.eu/eu-trade-relationships-country-and-region/countries-and-regions/turkiye_en',
        date: '2026-10-08',
        kind: 'read',
      },
      {
        name: 'EUR-Lex: Commission Delegated Regulation (EU) No 1421/2013, recital 7 and Article 2',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX%3A32013R1421',
        date: '2026-10-08',
        kind: 'read',
      },
      {
        name: 'GOV.UK: Preference tiers under the Developing Countries Trading Scheme',
        url: 'https://www.gov.uk/guidance/preference-tiers-under-the-developing-countries-trading-scheme',
        date: '2023-06-19',
        kind: 'published',
      },
      {
        name: 'GOV.UK: Trade with Turkey',
        url: 'https://www.gov.uk/guidance/summary-of-the-uk-turkey-trade-agreement',
        date: '2022-11-21',
        kind: 'updated',
      },
    ],
  },
]

/**
 * What to read after each guide (owner, 2026-10-08: "2–3 with reasons"), replacing the list of every
 * other guide with no reason. The reason drawn under each is that guide's own approved
 * `description`, so the links add no new claim. `guides.test.ts` checks each is a real guide.
 */
export const READ_NEXT: Readonly<Record<string, readonly string[]>> = {
  '/guides/how-a-private-label-order-works': [
    '/guides/minimum-order-and-samples',
    '/guides/shipping-and-import-duties',
    '/guides/3d-garment-reference',
  ],
  '/guides/3d-garment-reference': [
    '/guides/garment-printing-methods',
    '/guides/how-a-private-label-order-works',
  ],
  '/guides/minimum-order-and-samples': [
    '/guides/how-a-private-label-order-works',
    '/guides/private-label-packaging',
    '/guides/shipping-and-import-duties',
  ],
  '/guides/garment-printing-methods': [
    '/guides/sportswear-fabrics-and-weights',
    '/guides/3d-garment-reference',
    '/guides/minimum-order-and-samples',
  ],
  '/guides/sportswear-fabrics-and-weights': [
    '/guides/garment-printing-methods',
    '/guides/minimum-order-and-samples',
  ],
  '/guides/private-label-packaging': [
    '/guides/shipping-and-import-duties',
    '/guides/how-a-private-label-order-works',
  ],
  '/guides/shipping-and-import-duties': [
    '/guides/private-label-packaging',
    '/guides/how-a-private-label-order-works',
    '/guides/minimum-order-and-samples',
  ],
  '/guides/cost-to-start-an-activewear-brand': [
    '/guides/minimum-order-and-samples',
    '/guides/how-a-private-label-order-works',
    '/guides/shipping-and-import-duties',
  ],
  '/guides/pakistan-vs-china-vs-turkey': [
    '/guides/shipping-and-import-duties',
    '/guides/minimum-order-and-samples',
    '/guides/how-a-private-label-order-works',
  ],
}

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
