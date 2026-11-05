import { WEIGHT_BANDS } from '@run-apparel/shared'
import { ABOUT } from './aboutCopy'
import { FACTORY_PAGE } from './aboutPages'
import {
  CERTIFICATION_LINES,
  FACTS,
  LEAD_TIME,
  LEGAL_NAME,
  PAYMENT_TERMS,
  SAMPLE_TIME,
} from './companyFacts'
import { faqEntryById, OWNER_FIGURES } from './faqs'
import { MAX_FILES } from './inquiryFiles'
import { ACCEPTED_KINDS, LIMIT } from './inquiryForm'

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
   *
   * The fabrics guide's table of reference garments (owner, 2026-10-26, site check) is the other
   * kind: its rows are garments' own published specs, not points of the guide. The printing guide's
   * check does not apply to it; `guides.test.ts` holds it to its own.
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
  /**
   * One of the owner's WHOLE photos (a slug in `WHOLE_PHOTOS`), drawn as this section's whole
   * background with its words on the ink panel over it (`PhotoStage.tsx`), as the buyer pages draw
   * their order block. The owner's rule of 2026-11-05: a new picture is never cut and is the whole
   * background of its screen. `guides.test.ts` lists each one with the words that name it.
   */
  stage?: string
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
  /** The `<title>`; the layout adds " | RUN APPAREL". */
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
const PEOPLE = fact('People')
const FLOOR = fact('Sq m')

/**
 * ⚠️ THE ADDITIONS OF 2026-10-26 (owner, site check: "longer buyer guides") TYPE NO COUNT. Every
 * figure they state comes from a constant the site already reads (`FACTS`, `LEAD_TIME`,
 * `OWNER_FIGURES`, `WEIGHT_BANDS`, the inquiry form's own limits) or from an FAQ answer or a
 * factory-page line used word for word, so a guide cannot go stale against the page it came from.
 * The catalogue's counts (how many garments, how many in a family, how many colorways, how many use
 * a method) are NOT here: they live in the database, a guide is static, and a typed count is
 * wrong the day a garment is added. `guides.test.ts` holds every guide to it.
 */

/** "six", from the figure the home page's №01 and the about page show for the works. */
const BUILDINGS = (
  ABOUT.points.find((point) => point.label.startsWith('Buildings'))?.value ?? ''
).toLowerCase()

/**
 * Some garments' own published fabric and weight (owner, 2026-10-26, site check), read from the
 * public garment data that day and typed, because a guide is static: a garment whose fabric is
 * edited in the CMS needs its row edited here (owner's choice, same day).
 *
 * ⚠️ TWO COLUMNS ON THE PAGE, NOT THREE: the weight joins the fabric's cell. Three columns ran 38px
 * past a 320px phone (measured 2026-10-26), and the two ways a wider table fits, a sideways scroll
 * or a stacked layout that changes each part's `display`, are both refused at `GuideTable`.
 */
export const GARMENT_FABRICS: readonly (readonly [
  garment: string,
  composition: string,
  weight: string,
])[] = [
  ['Men’s training pullover', '88% recycled polyester, 12% spandex', '160 to 210 GSM'],
  ['High-support sports bra', '95% nylon, 5% spandex', '200 to 240 GSM'],
  ['Quarter-zip running shirt', '100% recycled polyester', '180 to 220 GSM'],
  ['V-neck soccer jersey', '100% polyester', '140 to 180 GSM'],
  ['Polo-collar soccer jersey', '50% polyester, 50% cotton', '160 to 220 GSM'],
  ['Training bib', '100% polyester', '80 to 100 GSM'],
  ['Women’s crop hoodie', '98% recycled polyester, 2% spandex', '340 to 380 GSM'],
  ['Men’s tracksuit', '100% organic cotton', '280 to 350 GSM'],
  ['Men’s sherpa fleece jacket', '80% cotton, 20% polyester', '320 to 440 GSM'],
  ['Windbreaker', '100% nylon', '40 to 70 GSM'],
  ['Neoprene wetsuit', '88% polychloroprene, 12% nylon', '3 mm, about 700 g/m²'],
  ['Leather utility jacket', '100% genuine leather (cowhide)', '1.2 mm'],
]

/** What the inquiry form takes, in the form's own words and limits (`inquiryForm.ts`). */
const FORM_TAKES = `The inquiry form takes ${ACCEPTED_KINDS}, up to ${MAX_FILES} files and ${LIMIT} in total.`
const LARGER_FILES = 'For larger files, paste a WeTransfer or Drive link in your message.'

/** An FAQ answer, word for word (`faqs.ts`): the guide and the FAQ say it the same way. */
const faqAnswer = (id: string): string => faqEntryById(id).entry.answer

/** An FAQ answer's longer detail, word for word; throws on an entry that has none. */
function faqDetail(id: string): string {
  const detail = faqEntryById(id).entry.detail
  if (!detail) throw new Error(`guides.ts: the FAQ entry "${id}" has no detail`)
  return detail
}

/** An FAQ answer's first sentence, word for word (`how-we-ship` goes on to the quote, said elsewhere). */
const faqFirstSentence = (id: string): string => `${faqAnswer(id).split('. ')[0] ?? ''}.`

/** A factory-page stage's line, word for word (`aboutPages.ts`), found by its title's start. */
function factoryStage(titleStart: string): string {
  const stage = FACTORY_PAGE.walkthrough.stages.find((entry) => entry.title.startsWith(titleStart))
  if (!stage) throw new Error(`guides.ts: the factory page has no stage "${titleStart}"`)
  return stage.body
}

/**
 * How the garment pages put a weight into words (`WEIGHT_BANDS`, packages/shared): "Under 120 GSM
 * is very light and thin. From 120 to 170 is light, an easy layer." and so on to the heaviest.
 */
const WEIGHT_BAND_TEXT = WEIGHT_BANDS.map((entry, index) => {
  const from = WEIGHT_BANDS[index - 1]?.below
  if (from === undefined) return `Under ${entry.below} GSM is ${entry.band}.`
  if (!Number.isFinite(entry.below)) return `From ${from} up is ${entry.band}.`
  return `From ${from} to ${entry.below} is ${entry.band}.`
}).join(' ')

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
      /*
       * Wave 1 of the buyer library (owner approved the words on 2026-11-05, "Approve as written",
       * and gave the facts the same day by question tool). Buyers' own inquiry emails asked these:
       * what is checked, how to pay safely, what happens if something is wrong, who owns what. The
       * checks and the problem window are the FAQ's and the factory page's words, reused exactly.
       */
      {
        heading: 'What is checked before your order ships',
        blocks: [
          { kind: 'text', text: faqDetail('checks') },
          { kind: 'text', text: factoryStage('Material') },
          {
            kind: 'text',
            // Owner, 2026-11-05: a buyer's own inspector may check the order at the works.
            text: 'Your own inspector, for example from SGS, Intertek or QIMA, can check the order at our works before it ships.',
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
        heading: 'Paying for your order',
        blocks: [
          { kind: 'text', text: PAYMENT_TERMS },
          {
            kind: 'text',
            // Owner, 2026-11-05 (question tool): all three ways are true.
            text: 'You can pay by bank transfer (T/T), by letter of credit (L/C), or by card or online.',
          },
          {
            kind: 'text',
            // Owner, 2026-11-05: the account is in the registered name ("Yes, publish it").
            text: `Pay only into an account in our registered name, ${LEGAL_NAME}. If an email ever gives you new bank details, call us before you pay.`,
          },
        ],
      },
      {
        heading: 'If something is wrong',
        blocks: [{ kind: 'text', text: faqAnswer('order-problem') }],
      },
      {
        heading: 'Shipping and the papers that travel with it',
        blocks: [
          { kind: 'text', text: faqFirstSentence('how-we-ship') },
          { kind: 'text', text: faqAnswer('shipping-documents') },
        ],
      },
      {
        heading: 'Your artwork stays yours',
        blocks: [
          {
            kind: 'text',
            text: 'Tech packs, artwork and samples you send us remain your property. We use them only to quote and to manufacture for you.',
          },
          {
            kind: 'text',
            // Owner, 2026-11-05: "Depends on the quote".
            text: 'Who owns a pattern we make for you is agreed in your quote.',
          },
        ],
      },
      {
        heading: 'Blank garments and single orders',
        blocks: [
          {
            kind: 'text',
            /*
             * Owner, 2026-11-05: blank garments yes, dropshipping yes, ready stock no, stock abroad no.
             * "decorate" where the approved draft said "print or embroider": a printing method is named
             * only in the printing guide (`guides.test.ts`, the owner's facts of 2026-09-30).
             */
            text: 'We make every order to your spec, including blank garments for buyers who decorate them elsewhere. We can also ship single orders straight to your customers, at a cost we quote. We do not hold ready stock, here or abroad.',
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
      /*
       * Owner, 2026-10-26, site check: the guides were short. The example is the Apex Flex Pullover's
       * own page, read the same day (fabric, weight, fit, features); the note on a waffle knit is
       * the garment pages' own (`specNotes.ts`).
       */
      {
        heading: 'What each garment page states',
        blocks: [
          {
            kind: 'text',
            text: 'Most terms on a garment page open a one-line note that says what the term means. A waffle knit, for example, is a grid-textured knit that feels soft and holds warmth.',
          },
          {
            kind: 'text',
            // "Eco-poly" replaced with the owner's fact, 2026-11-05: all the polyester is recycled (EU law
            // has banned generic environmental words such as "eco" since 27 Sep 2026). The CMS says the same.
            text: 'Take the Apex Flex Pullover. It is 88% recycled polyester and 12% spandex, 160 to 210 GSM, in a sleek athletic cut. Its features are a waffle knit, an invisible zip, a convertible stand collar, recycled-polyester stretch and a DTF print.',
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
      /*
       * No counts (owner, 2026-10-26): "41 reference garments", "19 teamwear", "five colorways" were
       * in the draft and are database figures. The "own garment" block of the draft is left out
       * (owner: gap 1 left out).
       */
      {
        heading: 'Which garments have one',
        blocks: [
          {
            kind: 'text',
            text: 'Our reference garments cover teamwear and uniforms, sportswear, outerwear and casual wear. Sports accessories are made too, and the first with its own 3D page is the Kaizen soccer ball.',
          },
        ],
      },
      {
        heading: 'Ask from the garment page',
        blocks: [
          {
            kind: 'text',
            text: 'Every garment page ends with Ask about this garment. It opens the contact form with that garment and its color already filled in.',
          },
        ],
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
    // "usually" since 2026-11-05 (owner: sample time varies product to product; `SAMPLE_TIME`).
    description: `The minimum order is ${MINIMUM} pieces per style. A sample usually takes ${SAMPLE_DAYS} working days and its fee is credited back against your bulk order. Here is how both work.`,
    heading: 'Minimum order and samples,',
    headingAccent: 'in plain numbers.',
    lede: `The minimum order at RUN APPAREL is ${MINIMUM} pieces per style. A sample usually takes ${SAMPLE_DAYS} working days, and the sample fee is credited back against your bulk order. Nothing goes into bulk until you sign off the sample.`,
    sections: [
      {
        heading: 'The minimum order',
        // "The same team": the stitching floor (polish X22).
        photo: 'stitching',
        blocks: [
          {
            kind: 'text',
            text: `${MINIMUM} pieces per style. The same site, the same team and the same standard make the order whether it is a hundred pieces or a hundred thousand. Capacity is ${CAPACITY} pieces per month.`,
          },
        ],
      },
      /*
       * The additions of 2026-10-26 (owner, site check), each from the FAQ's own answer (`faqs.ts`:
       * fewer than the minimum, splitting it, the sample fee, a Pantone match, own fabric) or the
       * order process. The sample fee's amount is not stated: it "depends on the style and its
       * print, and we quote it with the sample" (owner's words). A reorder keeps the minimum and
       * the deposit and balance are the owner's too (same date).
       */
      {
        heading: 'Below the minimum',
        blocks: [
          {
            kind: 'text',
            text: `You can order fewer than ${MINIMUM} pieces of a style. The price per piece is higher.`,
          },
        ],
      },
      /*
       * Wave 1 of the buyer library (owner approved the words on 2026-11-05, "Approve as written"; the
       * pricing sentence confirmed the same day: "Yes, publish it"). Buyers ask most about the minimum,
       * the price at small quantities and the samples.
       */
      {
        heading: 'Why fewer pieces cost more each',
        blocks: [
          {
            kind: 'text',
            text: `Some work is done once per style, whatever the quantity: the pattern, the cutting plan, the sample and, for screen printing, one screen for each ink color. Over ${MINIMUM} pieces, each piece carries a larger share of that work than it would over 500.`,
          },
        ],
      },
      {
        heading: 'Prices at more than one quantity',
        blocks: [
          {
            kind: 'text',
            // Owner, 2026-11-05: several quantities in one quote is true.
            text: `Ask for two or three quantities in one quote, for example ${MINIMUM}, 100 and 250 pieces. You see what each piece costs at each quantity before you decide.`,
          },
        ],
      },
      {
        heading: 'Splitting the minimum',
        blocks: [
          {
            kind: 'text',
            text: `Within the ${MINIMUM} you can typically split across sizes, for example ${OWNER_FIGURES.sizeSplit}. Color splits depend on the fabric and the printing method. Your quote confirms the exact split.`,
          },
          {
            kind: 'text',
            // Owner, 2026-11-05: any size is made, quoted per order.
            text: 'For a team, the team list sets the sizes, one per player. For a new brand, your customers’ past orders are the best guide to how many of each size to make. We make any size; your quote states any extra cost for the largest ones.',
          },
        ],
      },
      {
        heading: 'The sample',
        blocks: [
          {
            kind: 'list',
            items: [
              // The owner's sentence of 2026-11-05 (`SAMPLE_TIME`): sample time varies by product.
              SAMPLE_TIME,
              'The fee is credited back against your bulk order.',
              'Bulk production starts only after you approve it.',
            ],
          },
        ],
      },
      {
        heading: 'The samples you will see',
        blocks: [
          // Owner, 2026-11-05: a typical order has all four.
          { kind: 'text', text: 'A typical order has four samples:' },
          {
            kind: 'list',
            items: [
              'A first sample shows the style, fabric and print in one size.',
              'A size set is the style in every size, so you can check the fit across the range.',
              'A pre-production sample is made from the bulk fabric and trims.',
              'A top-of-production sample is taken from the bulk run itself.',
            ],
          },
        ],
      },
      {
        heading: 'Feeling the fabric first',
        blocks: [
          {
            kind: 'text',
            // Owner, 2026-11-05: swatches before the sample is true.
            text: 'We can send swatches of the fabric before the sample, so you can feel its weight and see its color.',
          },
        ],
      },
      {
        heading: 'Samples of several products at once',
        blocks: [
          {
            kind: 'text',
            // Owner, 2026-11-05: a mixed sample batch is true.
            text: 'You can order samples of several styles in one batch, each in the size you choose.',
          },
        ],
      },
      {
        heading: 'If you do not order bulk',
        blocks: [
          {
            kind: 'text',
            text: 'If no bulk order follows the sample, we keep the sample fee. The sample fee depends on the style and its print, and we quote it with the sample.',
          },
        ],
      },
      {
        heading: 'Matching a color before bulk',
        blocks: [
          {
            kind: 'text',
            text: 'If you need a Pantone color matched, you approve a lab dip, which is dyed fabric, or a strike-off, which is a print sample, before bulk production starts.',
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
      {
        // `LEAD_TIME` word for word: the draft's "usually takes 2 to 4 weeks" typed the figure again.
        heading: 'How long bulk production takes',
        blocks: [{ kind: 'text', text: LEAD_TIME }],
      },
      {
        heading: 'Fabric you send us',
        blocks: [
          {
            kind: 'text',
            text: 'You can send your own fabric. We cut, make and trim garments from it.',
          },
        ],
      },
      {
        heading: 'Who owns the pattern',
        // Owner, 2026-11-05: "Depends on the quote".
        blocks: [{ kind: 'text', text: 'Your quote states who owns a pattern we make for you.' }],
      },
      {
        heading: 'Reorders and payment',
        blocks: [
          {
            kind: 'text',
            text: `We keep your patterns and samples for your next order. A reorder has the same minimum: ${MINIMUM} pieces per style.`,
          },
          {
            kind: 'text',
            text: PAYMENT_TERMS,
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
      'Seven ways to put a design on a garment, all done on site: screen print, sublimation, DTF, DTG, heat transfer, embroidery and special inks.',
    heading: 'Garment printing methods,',
    headingAccent: 'explained.',
    lede: 'There are seven common ways to put a design on a garment. We do all seven on the same site. This guide says what each one is and what it suits.',
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
      /*
       * The additions of 2026-10-26 (owner, site check). Each garment's words are its own page's
       * (the customization steps and the fact lines, read the same day), and the counts of the
       * draft ("sublimation on nine of them") are left out: they are database figures.
       */
      {
        heading: 'Which methods our reference garments use',
        blocks: [
          {
            kind: 'text',
            text: 'The feature lines of our reference garments name the method each one uses. Sublimation, DTF, screen printing, silicone printing, digital printing and embroidery all appear there.',
          },
        ],
      },
      {
        heading: 'Why the fabric decides',
        blocks: [
          {
            kind: 'text',
            text: 'The Aero-Tech Windbreaker is a nylon shell at 40 to 70 GSM. Full sublimation carries the artwork across every panel, including the yoke, with no added weight and no stiffening. We use it there in place of an applied transfer, which would work against a shell that exists to be light.',
          },
          {
            kind: 'text',
            text: 'The Armor-Tech Jacket is 1.2 mm cowhide. Its mark is screen-printed onto the hide, which holds a crisp edge on leather where a heat transfer would not survive the surface.',
          },
          {
            kind: 'text',
            text: 'The Aggressor football jersey uses two methods together. Digital sublimation carries the full-body graphic and the distressed brushstroke work. Silicone printing adds raised numbers and marks with grip and depth that a flat print cannot produce.',
          },
          {
            kind: 'text',
            text: 'The Terra Active Zip polo is made ready for custom sublimation or embroidery. Sublimation suits an all-over or tonal design. Embroidery suits a crest that should look stitched rather than printed.',
          },
        ],
      },
      {
        heading: 'A placement print',
        blocks: [
          {
            kind: 'text',
            text: 'A placement print sits in one fixed position, such as a chest logo or a back number, rather than across the whole fabric.',
          },
        ],
      },
      {
        heading: 'Check the print before bulk',
        blocks: [
          {
            kind: 'text',
            text: 'Before bulk production starts, you approve a strike-off, which is a print sample.',
          },
        ],
      },
      {
        heading: 'Sending your artwork',
        blocks: [{ kind: 'text', text: `${FORM_TAKES} ${LARGER_FILES}` }],
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
        // The bands are the garment pages' own (`WEIGHT_BANDS`), never retyped (owner, 2026-10-26).
        heading: 'Reading a weight',
        blocks: [
          {
            kind: 'text',
            text: `The garment pages put a weight into words, using the middle of its range. ${WEIGHT_BAND_TEXT} Neoprene and leather are sold by thickness in millimeters instead.`,
          },
        ],
      },
      {
        heading: 'The fibers',
        blocks: [
          {
            kind: 'list',
            /*
             * Two lines fixed after the wave-2 fact check (owner, 2026-11-05). "Bamboo" is gone: the FTC
             * says most "bamboo" textiles are really rayon and must be labeled as rayon ("How to Avoid
             * Bamboozling Your Customers", ftc.gov, read 2026-11-05). Nylon is "hard-wearing": New Mexico
             * State University's extension guide G-401 says nylon "resists abrasion" (pubs.nmsu.edu,
             * revised March 2003, read 2026-11-05).
             */
            items: [
              'Polyester and recycled polyester: light and quick to dry.',
              'Nylon: strong and hard-wearing.',
              'Spandex, also called elastane: adds stretch, blended in small amounts.',
              'Cotton: soft and breathable.',
              'Merino wool and recycled wool: warm.',
              'Lyocell and modal: soft fibers made from plant or wood pulp.',
              'Hemp: a hard-wearing plant fiber.',
            ],
          },
        ],
      },
      {
        // The garment pages' own notes on these materials (`specNotes.ts`), as the owner approved them.
        heading: 'Five more materials we use',
        blocks: [
          {
            kind: 'list',
            items: [
              'Organic cotton is grown without synthetic pesticides or fertilizers.',
              'Neoprene, whose chemical name is polychloroprene, is a rubbery foam that keeps you warm when wet.',
              'Taslon is a textured woven polyester for an outer shell: light, tough and wind-resistant.',
              'Taffeta is a smooth, light woven lining that slides easily over other clothes.',
              'Cowhide is hard-wearing, keeps the wind out and softens with wear.',
            ],
          },
        ],
      },
      {
        // The FAQ's answers word for word: the owner's F10 and F11 (2026-10-07).
        heading: 'Recycled and organic fabric',
        blocks: [
          {
            kind: 'text',
            text: `${faqAnswer('recycled-organic').replace(/^Yes\. /, '')} You can also send your own fabric, and we cut, make and trim garments from it.`,
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
      /*
       * Some garments' own published fabric and weight (owner, 2026-10-26, site check), read from the
       * public garment data the same day. Typed, because a guide is static: `guides.test.ts` pins the
       * rows, and a garment whose fabric is edited in the CMS needs its row edited here.
       */
      {
        heading: 'Fabric and weight, garment by garment',
        blocks: [
          {
            kind: 'table',
            caption: 'What each garment is made of',
            columns: ['Garment', 'Made of'],
            rows: GARMENT_FABRICS.map(([garment, composition, weight]) => [
              garment,
              `${composition}, ${weight}`,
            ]),
          },
        ],
      },
      {
        // The factory page's lines word for word (`aboutPages.ts`, stages 2 and 3), and the policies
        // page's "dyeing and finishing at our fabric suppliers".
        heading: 'What happens when fabric arrives',
        blocks: [
          {
            kind: 'text',
            text: `Our fabric suppliers do the dyeing and finishing. ${factoryStage('Material Preparation')} ${factoryStage('Cutting')}`,
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
      /*
       * The additions of 2026-10-26 (owner, site check). Labels: "Labels, barcodes and carton
       * markings are agreed with each customer" is the owner's whole answer; the other label facts
       * (types, makers, lead time, barcode stickers) were not given and are not stated. The draft's
       * "Attach your artwork or a photo of a sample" is left out: "How it works" says it above.
       */
      {
        heading: 'What the form takes',
        blocks: [
          {
            kind: 'text',
            text: `${FORM_TAKES} ${LARGER_FILES} Packaging artwork stays yours, like all artwork you send us.`,
          },
        ],
      },
      {
        heading: 'Barcodes and markings',
        blocks: [
          {
            kind: 'text',
            text: 'Labels, barcodes and carton markings are agreed with each customer.',
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
            text: 'Tagging, the final check and packing happen on the same site as the rest of your order.',
          },
        ],
      },
      {
        heading: 'Where packing sits in the order',
        blocks: [
          {
            kind: 'text',
            text: 'Packing comes last. Every batch is inspected in line and again at AQL final inspection. Rework, labels and traceability records follow. The QC manager and the merchandiser sign off together before anything is packed. You choose the AQL level, and you get photos before the order ships.',
          },
        ],
      },
      {
        heading: 'What arrives with the order',
        blocks: [
          {
            kind: 'text',
            text: 'Each shipment comes with a commercial invoice, a packing list, a certificate of origin, and the air waybill or bill of lading.',
          },
        ],
      },
      {
        heading: 'Who you talk to',
        blocks: [
          {
            kind: 'text',
            text: 'You have one point of contact, a merchandiser, from tech pack to shipment. Questions about packaging go to the same person.',
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
      /*
       * The additions of 2026-10-26 (owner, site check). The ports and "the buyer pays a sample's
       * courier" are the owner's words of that day. The draft's customs tariff code is left out (not
       * given). The bulk lead time is `LEAD_TIME` itself; the problem window is the FAQ's own answer.
       */
      {
        heading: 'Where shipments leave from',
        blocks: [
          {
            kind: 'text',
            text: 'Air shipments leave from Sialkot International Airport and sea freight from Karachi.',
          },
        ],
      },
      {
        heading: 'Who pays for a sample',
        blocks: [{ kind: 'text', text: 'The buyer pays a sample’s courier.' }],
      },
      {
        heading: 'The price terms we quote',
        // EXW: "You collect the goods from our buildings." One of them, in the photo (polish X22).
        photo: 'exterior',
        blocks: [
          {
            kind: 'point',
            title: 'EXW (Ex Works)',
            text: 'You collect the goods from our buildings. You pay the freight, the insurance, and the import duty and tax.',
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
        heading: 'Choosing a term',
        blocks: [
          {
            kind: 'text',
            text: 'If you want nothing to arrange on arrival, ask for DDP. If you have your own forwarder, ask for EXW. If you arrange the sea freight yourself, ask for FOB. If you want us to handle the sea leg to your port, ask for CFR or CIF.',
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
        heading: 'How long shipping takes',
        blocks: [
          {
            kind: 'text',
            text: `It depends on the route your order takes: air courier, air freight or sea. We confirm the transit time in your quote. Bulk production comes first. ${LEAD_TIME}`,
          },
        ],
      },
      {
        heading: 'What comes with the shipment',
        blocks: [
          {
            kind: 'text',
            text: 'A commercial invoice, a packing list, a certificate of origin, and the air waybill or bill of lading.',
          },
        ],
      },
      {
        heading: 'If something is wrong on arrival',
        blocks: [{ kind: 'text', text: faqAnswer('order-problem') }],
      },
      {
        heading: 'Which rules the terms follow',
        blocks: [
          {
            kind: 'text',
            text: 'The terms follow the Incoterms 2020 edition. This page gives no duty rates. For what official sources say about the EU and the UK, read the guide on Pakistan, China and Türkiye.',
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
            text: `${MINIMUM} pieces per style. The same site, the same team and the same standard make the order whether it is a hundred pieces or a hundred thousand.`,
          },
        ],
      },
      /*
       * The additions of 2026-10-26 (owner, site check), each from an FAQ answer or the order process;
       * the split and the 14-day window are `OWNER_FIGURES`, the deposit is the owner's of that day.
       */
      {
        heading: 'A first order, in pieces',
        blocks: [
          {
            kind: 'text',
            text: `Take one style at the minimum, split ${OWNER_FIGURES.sizeSplit}. You can also order fewer than ${MINIMUM} pieces of a style, at a higher price per piece.`,
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
              // `SAMPLE_TIME` since 2026-11-05 (owner: sample time varies product to product).
              SAMPLE_TIME,
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
        heading: 'Why there are no prices on this site',
        blocks: [
          {
            kind: 'text',
            text: 'Every garment is made to order, so every price is quoted for that order.',
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
        heading: 'Order of events',
        blocks: [
          {
            kind: 'text',
            text: 'The order runs in this sequence: sample, your sign-off, bulk production, shipping. Transit time depends on how the order travels, and your quote confirms it.',
          },
        ],
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
        heading: 'Payment',
        blocks: [
          {
            kind: 'text',
            text: PAYMENT_TERMS,
          },
        ],
      },
      {
        heading: 'See the factory before you order',
        blocks: [
          {
            kind: 'text',
            text: 'You can visit. Email us to arrange it. If you cannot travel, we can show you the factory on a video call.',
          },
        ],
      },
      {
        heading: 'Protecting your idea',
        blocks: [
          {
            kind: 'text',
            text: 'Only the team working on your order sees your files. Your patterns and artwork are never made for anyone else. We sign a buyer’s NDA, and we have our own if you need one.',
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
      'Making sportswear in Pakistan, China or Türkiye: the duty in six markets, from official sources, and the questions to ask any factory.',
    heading: 'Pakistan, China or Türkiye,',
    headingAccent: 'side by side.',
    lede: "We make sportswear in Sialkot, Pakistan, so read this knowing that. What it says about each country's trade terms comes from official sources, named with the date we read them. What it says about us is what our own pages say. Each rate is for the sportswear tariff codes we checked.",
    sections: [
      {
        heading: 'Bringing it into the European Union',
        blocks: [
          {
            kind: 'point',
            title: 'From Pakistan',
            // Sources 1, 7 and 8 (TARIC and Access2Markets, 2026-10-26).
            text: "More than 85% of Pakistan's exports, including textiles and clothing, enter the EU duty and quota free under the EU's GSP+ scheme. That is 0%, with a statement of origin from the exporter.",
          },
          {
            kind: 'text',
            // Source 2.
            text: "The EU's renewed scheme applies from 1 January 2027. Countries in GSP+ today must reapply, and keep their preferences until the end of 2028 while they do.",
          },
          {
            kind: 'point',
            title: 'From Türkiye',
            // Sources 3 and 7.
            text: 'Türkiye and the EU are in a customs union that removed tariffs on all industrial goods between them, so the rate is 0%.',
          },
          {
            kind: 'point',
            title: 'From China',
            // Source 4: Delegated Regulation 1421/2013, recital 7 and Article 2; source 7 for the rate.
            text: "China has been outside the EU's GSP preferences since 1 January 2015, when the EU removed it from the list of beneficiary countries. Its garments pay the EU's standard duty of 12%.",
          },
        ],
      },
      {
        heading: 'Bringing it into the United Kingdom',
        blocks: [
          {
            kind: 'point',
            title: 'From Pakistan',
            // Source 5; sources 9 and 10 for the rate and the proof.
            text: "Pakistan is in the Enhanced Preferences tier of the UK's Developing Countries Trading Scheme, which gives 0% import tariffs on 92% of product lines. Its garments pay 0%; the exporter gives an origin declaration or a Form A.",
          },
          {
            kind: 'point',
            title: 'From Türkiye',
            // Sources 6 and 9.
            text: "Goods that meet the UK–Turkey trade agreement's rules of origin trade at its preferential tariff rates: 0%, with the exporter's declaration on origin.",
          },
          {
            kind: 'point',
            title: 'From China',
            // Source 9: the UK tariff shows China no preference on these codes (2026-10-26).
            text: "Garments from China pay the UK's standard duty: 12%.",
          },
        ],
      },
      /*
       * Four more markets (owner, 2026-10-26, site check: "research all the rates; for those you
       * find nothing, do not mention"). Every rate is one an official page prints for the codes read
       * that day; nothing adds them up, because no official page prints a total.
       */
      {
        heading: 'Bringing it into the US',
        blocks: [
          {
            kind: 'text',
            // Source 11.
            text: 'Garments pay the general rate in the US tariff schedule: about 7% to 32%, set by the fiber and the garment.',
          },
          {
            kind: 'text',
            // Sources 11 and 12.
            text: 'Since July 24, 2026, a Section 301 duty is added on top: 10% on goods from Pakistan, 12.5% from Türkiye and 12.5% from China. Most Chinese garment codes pay a further 7.5% under an older Section 301 action.',
          },
          {
            kind: 'text',
            // Sources 13 and 14.
            text: 'The US GSP program lists Pakistan, but it expired on December 31, 2020, and has not been renewed. The "reciprocal" tariffs stopped on February 24, 2026.',
          },
        ],
      },
      {
        heading: 'Bringing it into Canada',
        blocks: [
          {
            kind: 'text',
            // Sources 15 and 16.
            text: "Pakistan is on Canada's General Preferential Tariff list; China and Türkiye are not. On T-shirts, sweatshirts, track suits, trousers and jackets the preference sets no rate, so all three pay the general rate, mostly 16% to 18%.",
          },
        ],
      },
      {
        heading: 'Bringing it into Australia',
        blocks: [
          {
            kind: 'text',
            // Sources 17, 18, 19 and 20.
            text: 'Australia has no free trade agreement with Pakistan or Türkiye, so the general rate applies: 5% or free, by code. Garments that qualify as Chinese under the China–Australia agreement enter free, with a certificate or declaration of origin.',
          },
        ],
      },
      {
        heading: 'Bringing it into New Zealand',
        blocks: [
          {
            kind: 'text',
            // Sources 21 and 22.
            text: "New Zealand's list of free trade agreements does not include Pakistan or Türkiye. Their garments pay the normal rate, 10% on almost every garment code. Chinese-origin garments enter free under the New Zealand–China agreement.",
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
            text: `Ours usually takes ${SAMPLE_DAYS} working days, and the fee is credited back against your bulk order.`,
          },
          {
            kind: 'point',
            title: 'Is the printing done on the same site?',
            text: 'We do all seven common methods on the same site.',
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
            // The company's three lines, word for word (owner, 2026-10-26, site check); they name
            // each holder, and SMETA stays an audit (`CERTIFICATION_LINES`, `companyFacts.ts`).
            text: CERTIFICATION_LINES.join(' '),
          },
          /*
           * Six more (owner, 2026-10-26): the works from the figures the site states, the rest the
           * FAQ's own answers word for word. Nothing here says anything about another country.
           */
          {
            kind: 'point',
            title: 'How big is the works?',
            text: `The works has ${PEOPLE} people and ${FLOOR} square meters under roof, in ${BUILDINGS} buildings on one site.`,
          },
          {
            kind: 'point',
            title: 'Are cutting, printing, stitching, checking and packing in one place?',
            text: 'Yes. They all happen in one place, with one team answerable for your order.',
          },
          {
            kind: 'point',
            title: 'Can I visit, or see it on video?',
            text: faqAnswer('factory-visit'),
          },
          { kind: 'point', title: 'Will you sign an NDA?', text: faqAnswer('nda') },
          {
            kind: 'point',
            title: 'Can I get certificates and test reports?',
            text: faqAnswer('order-certificates'),
          },
          {
            kind: 'point',
            title: 'What if something is wrong when it arrives?',
            text: faqAnswer('order-problem'),
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
      // 7 to 22: read on 2026-10-26 for the rates (owner, site check), each with the page's own date.
      {
        name: 'European Commission, TARIC: duties on garment codes from China, Pakistan and Türkiye',
        url: 'https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp?Lang=en&SimDate=20261026&Taric=6109100010&Area=PK&LangDescr=en',
        date: '2026-10-23',
        kind: 'updated',
      },
      {
        name: 'European Commission, Access2Markets: origin documentation for GSP',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/results?product=6109100010&origin=PK&destination=DE',
        date: '2026-10-24',
        kind: 'updated',
      },
      {
        name: 'UK Integrated Online Tariff: duties on garment codes by country of origin',
        url: 'https://www.trade-tariff.service.gov.uk/commodities/6109100010?country=PK&day=26&month=10&year=2026',
        date: '2026-10-26',
        kind: 'read',
      },
      {
        name: 'GOV.UK: How to claim preferences under the Developing Countries Trading Scheme',
        url: 'https://www.gov.uk/guidance/how-to-claim-preferences-under-the-developing-countries-trading-scheme-dcts',
        date: '2023-08-17',
        kind: 'updated',
      },
      {
        name: 'USITC: Harmonized Tariff Schedule of the United States, 2026 Revision 21, Chapters 61, 62 and 99',
        url: 'https://hts.usitc.gov/',
        date: '2026-10-09',
        kind: 'published',
      },
      {
        name: 'U.S. Customs and Border Protection, CSMS 69326983: Section 301 Forced Labor Import Duties',
        url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/421d887',
        date: '2026-07-23',
        kind: 'published',
      },
      {
        name: 'U.S. Customs and Border Protection: Generalized System of Preferences (GSP)',
        url: 'https://www.cbp.gov/trade/priority-issues/trade-agreements/special-trade-legislation/generalized-system-preferences',
        date: '2026-08-06',
        kind: 'updated',
      },
      {
        name: 'U.S. Customs and Border Protection, CSMS 67834313: Ending Collection of IEEPA Duties',
        url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/40b11c9',
        date: '2026-02-22',
        kind: 'published',
      },
      {
        name: 'Canada Border Services Agency: Customs Tariff 2026-2, countries and tariff treatments',
        url: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/countries-pays-2-eng.html',
        date: '2026-09-01',
        kind: 'updated',
      },
      {
        name: 'Canada Border Services Agency: Customs Tariff 2026-2, Chapters 61 and 62',
        url: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/tblmod-2-eng.html',
        date: '2026-09-01',
        kind: 'published',
      },
      {
        name: 'Australian Border Force: Free Trade Agreements',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/fta/free-trade-agreements',
        date: '2026-10-01',
        kind: 'updated',
      },
      {
        name: 'Australian Border Force: Customs Tariff, Schedule 3, Chapter 61',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xi/chapter-61',
        date: '2026-07-01',
        kind: 'updated',
      },
      {
        name: 'Australian Border Force: Customs Tariff, Schedule 12, Chinese originating goods',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-12',
        date: '2026-10-20',
        kind: 'updated',
      },
      {
        name: 'Australian Border Force: China-Australia FTA Rules of Origin, Instruction and Guideline',
        url: 'https://www.abf.gov.au/free-trade-agreements/files/instructions-guidelines-australia-china-fta.pdf',
        date: '2015-12-14',
        kind: 'published',
      },
      {
        name: 'New Zealand Customs Service: Working Tariff Document, Section XI, effective 20 October 2026',
        url: 'https://www.customs.govt.nz/media/rxuexxcm/section-xi-effective-20-october-2026.pdf',
        date: '2026-10-26',
        kind: 'read',
      },
      {
        name: 'New Zealand Customs Service: New Zealand–China Free Trade Agreement',
        url: 'https://www.customs.govt.nz/information-releases-and-legislation/legislation/international-agreements/free-trade-agreements/new-zealand-china-free-trade-agreement',
        date: '2026-10-26',
        kind: 'read',
      },
    ],
  },
  /*
   * ⚠️ WAVE 1 OF THE BUYER LIBRARY: THE OWNER APPROVED THESE WORDS ON 2026-11-05 ("Approve as
   * written") and gave its facts by question tool the same day: RUN makes all four builds; covers PU,
   * PVC and TPU; bladders latex, butyl and wound; thermobonded is "heat and glue"; the Sialkot section
   * goes in; the stitching photo is RUN's and its people agreed. Every outside fact was read on its
   * primary page on 2026-11-05 (listed under `sources`); nothing is from a ball maker or a seller (the
   * owner's rule: never research from other manufacturers). A comparison of builds, covers or
   * bladders is NOT here: no neutral source makes one, and sellers' claims are excluded.
   */
  {
    path: '/guides/how-soccer-balls-are-made',
    title: 'How Soccer Balls Are Made: Builds and Sizes',
    description:
      'Hand-stitched, machine-stitched, thermobonded and hybrid soccer balls: what each is made of, the ball size for each age, and what FIFA’s quality marks test.',
    heading: 'How a soccer ball is made,',
    headingAccent: 'panel by panel.',
    lede: 'A soccer ball is built in one of four ways: stitched by hand, stitched by machine, thermobonded, or a hybrid of these. We make all four in Sialkot. This guide explains each build, the materials inside a ball, the size for each age, and what FIFA’s quality marks test.',
    sections: [
      {
        heading: 'Four ways to build a ball',
        blocks: [
          {
            kind: 'point',
            title: 'Hand-stitched',
            text: 'The panels are stitched together by hand.',
          },
          {
            kind: 'point',
            title: 'Machine-stitched',
            text: 'A machine stitches the panels together.',
          },
          {
            kind: 'point',
            title: 'Thermobonded',
            text: 'The panels are joined with heat and glue, with no stitches.',
          },
          {
            kind: 'point',
            title: 'Hybrid',
            // The Kaizen page's own "Trinity Technology" answer (`familyPages.ts`), another page.
            text: 'Two or more builds in one ball. Our Kaizen is one: its panels are thermobonded, then machine stitched; the last panel is closed by hand, and the seams are sealed.',
          },
        ],
      },
      {
        heading: 'What a ball is made of',
        blocks: [
          {
            kind: 'text',
            text: 'From the outside in: the cover you kick, the backing layers under it that give the ball its shape and feel, and the bladder that holds the air.',
          },
          {
            kind: 'text',
            text: 'We make balls with three kinds of cover, PU (polyurethane), PVC and TPU (thermoplastic polyurethane), and three kinds of bladder: latex, butyl, and wound bladders, which are wrapped in thread before the cover goes on.',
          },
        ],
      },
      {
        heading: 'Why the panels matter',
        blocks: [
          {
            kind: 'text',
            // Hong and Asai, Scientific Reports 2014 and Heliyon 2017 (both under `sources`).
            text: 'Researchers at the University of Tsukuba in Japan tested balls in a wind tunnel. They found that the shape of a ball’s panels affects how it flies, and that dimples on the surface change the air force acting on it.',
          },
        ],
      },
      {
        heading: 'Match balls and futsal balls',
        blocks: [
          {
            kind: 'text',
            // "Bounces less" was cut after the fact check (owner, 2026-11-05): only the futsal law
            // sets a bounce, so no rule compares the two.
            // FIFA's marks test a match ball's bounce too (Testing Manual 2026, page 26).
            text: 'The Laws of the Game set these limits. A futsal ball is smaller, and only the futsal law sets how high it must bounce. FIFA’s quality marks also test a match ball’s bounce.',
          },
          {
            kind: 'table',
            // IFAB Law 2 and the Futsal Laws' Law 2, as published (read 2026-11-05).
            caption: 'Match ball and futsal ball limits',
            columns: ['Measure', 'Match ball', 'Futsal ball'],
            rows: [
              ['Around the ball', '68 to 70 cm', '62 to 64 cm'],
              ['Weight at kick-off', '410 to 450 g', '400 to 440 g'],
              ['Air pressure at sea level', '0.6 to 1.1 atmosphere', '0.6 to 0.9 atmosphere'],
              ['Bounce when dropped from 2 m', 'Not set', '50 to 65 cm'],
            ],
          },
        ],
      },
      {
        heading: 'Ball size by age',
        blocks: [
          {
            kind: 'text',
            text: 'England and the United States set different ages for each ball size:',
          },
          {
            kind: 'table',
            // The FA's FutureFit table and US Youth Soccer's Rule 303 (as of June 23, 2026).
            caption: 'Ball size by age',
            columns: ['Ball size', 'England (The FA)', 'United States (US Youth Soccer)'],
            rows: [
              ['Size 3', 'Under 7 to Under 11', '8 and under'],
              ['Size 4', 'Under 12 and Under 13', '10 and under to 12 and under'],
              // The FA's table stops at Under 16 (fact check, owner, 2026-11-05).
              ['Size 5', 'Under 14 to Under 16', '13 and under, and older'],
            ],
          },
          {
            kind: 'text',
            text: 'Other countries and leagues set their own ages, so check your league’s rules.',
          },
        ],
      },
      {
        heading: 'What FIFA’s quality marks mean',
        blocks: [
          {
            kind: 'text',
            // FIFA's Testing Manual, 2026 edition (March 2026), page 5: "official matches", the three
            // marks; page 26: Quality Pro and Quality run seven tests (the eighth, balance, is for
            // instrumented balls), Basic six, and Pro's limits are tighter. Owner approved, 2026-11-05.
            text: 'FIFA’s quality program has three marks: FIFA Quality Pro, FIFA Quality and FIFA Basic. Every ball used in an official match organized by FIFA or a confederation must carry one.',
          },
          {
            kind: 'text',
            text: 'To earn FIFA Quality or FIFA Quality Pro, a ball passes seven tests: weight, circumference, roundness, bounce, water absorption, loss of pressure, and shape and size retention. FIFA Basic leaves out shape and size retention. A Quality Pro ball passes the same tests with tighter limits.',
          },
          {
            kind: 'text',
            // The Kaizen page's answer (`familyPages.ts`), "It" made "Our Kaizen" (owner approved). The
            // manual's page 5: Basic needs only a passed test; Quality and Quality Pro need an agreement.
            text: 'Our Kaizen is lab tested according to FIFA Quality Pro limits, and it does not carry a FIFA mark. Competitions that require a mark need a ball that carries one. The FIFA Quality and Quality Pro marks also need an agreement with FIFA.',
          },
        ],
      },
      {
        heading: 'Soccer balls and Sialkot',
        blocks: [
          {
            kind: 'text',
            // The agreement's text (signed 14 February 1997) and the ILO's news of 5 January 2021.
            // RUN's own IMAC fact is in "On our floor" (owner, 2026-11-05).
            // The IMAC line says only what IMAC's own page says (fact check, owner, 2026-11-05): it
            // took over the ILO's monitoring system in March 2003. No page read says it still monitors.
            // The owner approved "Since 2003 … has run"; the order changed because the test above
            // refuses "since" + a year on any guide (it keeps founding-year claims off the site).
            text: 'In 1997 the International Labour Organization, UNICEF and the Sialkot Chamber of Commerce and Industry signed the Atlanta Agreement, a program to remove child labor from soccer ball making in Sialkot. In 2003 the Independent Monitoring Association for Child Labor (IMAC) took over the monitoring system that the ILO set up, and has run it since.',
          },
        ],
      },
      {
        heading: 'On our floor',
        // The owner's photo of the ball stitching hall, whole, two marks that are not RUN's blurred
        // (owner, 2026-11-05: "Whole, blur the two marks"; `WHOLE_SOURCES`).
        stage: 'whole-ball-stitching',
        blocks: [
          {
            kind: 'text',
            // The owner's words, 2026-11-05: all ball stitching is in RUN's own hall, monitored by IMAC.
            text: 'We make hand-stitched, machine-stitched, thermobonded and hybrid balls. Our balls are stitched in our own hall, which IMAC monitors.',
          },
        ],
      },
      {
        heading: 'Ordering custom balls',
        blocks: [
          {
            kind: 'text',
            // Owner, 2026-11-05: ball sample time varies product to product, so no figure here.
            text: `Orders start at ${MINIMUM} pieces. Your quote states how long your ball sample takes. Your logo, colors, full artwork, covers, bladders and sizes can change.`,
          },
        ],
      },
    ],
    // The one ball with its own 3D page (2026-10-31): the only accessory there is to link.
    garments: {
      heading: 'Turn the Kaizen in 3D',
      after: 'On our floor',
      picks: [{ slug: 'kaizen' }],
    },
    sources: [
      {
        name: 'IFAB, Laws of the Game, Law 2: The Ball',
        url: 'https://www.theifab.com/laws/chapter/22/section/32/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'The FA, Futsal Laws of the Game, Law 2: The Ball',
        url: 'https://www.thefa.com/football-rules-governance/lawsandrules/laws/futsal/law-2---the-ball',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'The FA, FutureFit: Has the ball size changed for different age groups?',
        url: 'https://futurefit.englandfootball.com/futurefit/faqs/has-the-ball-size-changed-for-different-age-groups/index.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Youth Soccer, Policy on Players and Playing Rules, Rule 303',
        url: 'https://usyouthsoccer.org/wp-content/uploads/sites/160/2026/06/Policy-on-Players-and-Playing-Rules_APP-06.23.2026.pdf',
        date: '2026-06-23',
        kind: 'updated',
      },
      {
        name: 'FIFA, Quality Programme for Footballs',
        url: 'https://inside.fifa.com/innovation/standards/footballs/fifa-quality-programme-for-footballs',
        date: '2026-02-10',
        kind: 'updated',
      },
      {
        // Opened with the owner's okay, 2026-11-05: the only file downloaded for this guide.
        name: 'FIFA, Quality Programme for Footballs, Testing Manual (2026 edition)',
        url: 'https://digitalhub.fifa.com/m/5d88f22cfef8c799/original/FIFA-Quality-Programme-for-Football-Testing-Manual.pdf',
        date: '2026-03-13',
        kind: 'published',
      },
      {
        name: 'Hong and Asai, Effect of panel shape of soccer ball on its flight characteristics, Scientific Reports',
        url: 'https://doi.org/10.1038/srep05068',
        date: '2014-05-29',
        kind: 'published',
      },
      {
        name: 'Hong and Asai, Aerodynamic effects of dimples on soccer ball surfaces, Heliyon',
        url: 'https://doi.org/10.1016/j.heliyon.2017.e00432',
        date: '2017-10-31',
        kind: 'published',
      },
      {
        name: 'IMAC, the Atlanta Agreement',
        url: 'https://imacpak.org/atlanta.htm',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'IMAC, about IMAC',
        url: 'https://imacpak.org/main.htm',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'International Labour Organization, continued efforts to end child labour in sports goods',
        url: 'https://www.ilo.org/resource/news/highlighting-continued-efforts-elimination-child-labour-sports-goods',
        date: '2021-01-05',
        kind: 'published',
      },
    ],
  },
  /*
   * How the guides are made (owner approved 2026-11-05; written by the Content Team, his choice).
   * Two sentences are corrected from the approved draft to match the site: the guides are signed by
   * four writers (`bylines.ts`), not one, and only a guide that uses outside facts lists sources.
   * "How AI helps" says who really checks (owner, 2026-11-05): AI checks every outside fact against its
   * source, RUN's own facts come from the team, and the owner approves every word. There is no
   * "Reviewed by" line, because no person at RUN reads each guide, and the page must not say one does.
   */
  {
    path: '/guides/how-we-write-our-guides',
    title: 'How We Write Our Buyer Guides',
    description:
      'Who writes our buyer guides, where each fact comes from, what we show from our own floor, how AI helps, and how to tell us about a mistake.',
    heading: 'How we write our guides,',
    headingAccent: 'and check them.',
    lede: 'Each guide answers one question buyers ask us. Here is who writes it, who checks it, and where its facts come from.',
    sections: [
      {
        heading: 'Who writes them',
        blocks: [
          {
            kind: 'text',
            text: 'Each guide names who wrote it: our merchandiser, our production in-charge, our content team, or M. Hateem Jamshaid, Business Development Director.',
          },
        ],
      },
      {
        heading: 'Where the facts come from',
        blocks: [
          {
            kind: 'text',
            text: 'Laws come from the body that wrote them, standards from the standards body, research from the published paper, and figures from the organization that measured them. A guide that uses outside facts lists its sources and the date we read them. We never use another manufacturer’s page as a source.',
          },
        ],
      },
      {
        heading: 'What we show from our own floor',
        blocks: [
          {
            kind: 'text',
            text: 'When a guide describes our own work, it is work done on our floor in Sialkot, shown in our own photos and 3D pages.',
          },
        ],
      },
      {
        heading: 'Numbers',
        blocks: [
          {
            kind: 'text',
            text: 'A range in a guide is a published or usual range for that kind of product. The numbers for your order are in your quote.',
          },
        ],
      },
      {
        heading: 'How AI helps',
        blocks: [
          {
            kind: 'text',
            text: 'We use AI tools to research, draft and check every outside fact against its source. RUN’s own facts come from our team, and M. Hateem Jamshaid approves every word before it is published.',
          },
        ],
      },
      {
        heading: 'Dates and reviews',
        blocks: [
          {
            kind: 'text',
            text: 'Each guide shows the date its words last changed. Guides on laws and rules are reviewed every three months; the others at least once a year.',
          },
        ],
      },
      {
        heading: 'Found a mistake?',
        blocks: [
          {
            kind: 'text',
            text: 'Tell us through the contact page. We correct it and the guide’s date changes.',
          },
        ],
      },
    ],
    sources: [
      {
        name: 'Google Search Central, Guidance on using generative AI content',
        url: 'https://developers.google.com/search/docs/fundamentals/using-gen-ai-content',
        date: '2026-10-01',
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
  // Wave 1 (2026-11-05): a ball buyer's next questions are the minimum, the order and the 3D page.
  '/guides/how-soccer-balls-are-made': [
    '/guides/minimum-order-and-samples',
    '/guides/how-a-private-label-order-works',
    '/guides/3d-garment-reference',
  ],
  '/guides/how-we-write-our-guides': [
    '/guides/how-a-private-label-order-works',
    '/guides/pakistan-vs-china-vs-turkey',
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
