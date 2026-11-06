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
import { ballSizeRange } from './guideTools'
import { LIBRARY_GUIDES } from './guideLibrary'
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

/**
 * A link inside a guide's words (the buyer library, owner approved 2026-11-06): the first time
 * `phrase` appears in the block's words, it is drawn as a link to `href`. The words stay exactly as
 * approved; the link only marks some of them. Google's "Link best practices" (updated 2025-12-10)
 * asks for crawlable `<a href>` links with descriptive anchor text, which a phrase such as "our
 * fabrics guide" is.
 *
 * `href` is another guide, a glossary term (`/glossary#id`), an FAQ entry (`/faq/<topic>#id`), a
 * garment page (`/products/<slug>`), the contact page or another public page. `guides.test.ts`
 * checks every one points somewhere real and every phrase is in its block's words.
 *
 * A link in a sentence is the "inline" exception of WCAG 2.2's target-size rule (2.5.8): its height
 * is the line's. The 44px rows stay the rule for the links at a guide's end (`.see-also__list`).
 */
export type GuideLink = { readonly phrase: string; readonly href: string }

/**
 * The owner's line under every section that states a law, a duty or a tax (the buyer library,
 * 2026-11-05): the date it was checked, and that it is not advice. One sentence on every such
 * section by his rule, so the repeat check in `guides.test.ts` leaves it out.
 */
export const LEGAL_ADVICE = 'Not legal or tax advice; confirm with your customs broker or adviser.'
export const legalLine = (checked: string): string => `Checked on ${checked}. ${LEGAL_ADVICE}`

/** The guides' small calculators (C6), each named by its anchor on the page. */
export type GuideTool = 'gsm-converter' | 'cbm-calculator' | 'ball-size-lookup'

export type GuideBlock =
  | { kind: 'text'; text: string; links?: readonly GuideLink[] }
  /** A small mono label over the blocks that follow (a stage of the order). */
  | { kind: 'label'; text: string }
  /** A titled point: a step, or a term and what it means. */
  | { kind: 'point'; title: string; text: string }
  | { kind: 'list'; ordered?: boolean; items: readonly string[]; links?: readonly GuideLink[] }
  /** The owner's legal line (`legalLine`), with the day the section's law was checked. */
  | { kind: 'legal'; checked: string }
  /**
   * The home page's eight order steps, drawn as they are there (`OrderSteps`; polish D4, the
   * owner's answer Q41): one list for the steps wherever they are told, never a copy typed here.
   */
  | { kind: 'orderSteps' }
  /**
   * The free tech-pack template's download form (C1, owner approved 6 Nov 2026), drawn where the
   * guide's "The free template" section says "fill in the short form below" (`TemplateDownload.tsx`;
   * the route is `guides/tech-pack-template/download`). Its words live with the form, not here.
   */
  | { kind: 'download'; template: 'tech-pack' }
  /**
   * A small calculator in the section that owns its topic (C6, owner approved 6 Nov 2026: "one
   * topic, one URL"), with an anchor so it can be linked: the GSM converter in the fabrics guide,
   * the carton volume calculator in the shipping guide, the ball size lookup in the ball guide.
   * Their words and their sums live with each tool (`GuideTools.tsx`, `guideTools.ts`).
   */
  | { kind: 'tool'; tool: GuideTool }
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
  /**
   * The day the owner's team last reviewed a guide whose subject moves every quarter (ISO date), drawn
   * as "Last reviewed" beside the byline's date. Only the technology guide has one (owner's
   * instruction, 2026-11-06): its words say it "carries two dates", so the page must show both.
   */
  readonly reviewed?: string
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
        heading: 'Patches',
        blocks: [
          {
            kind: 'text',
            text: 'We make patches, embroidered or woven, including removable ones.',
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
        heading: 'DTF or DTG: what the studies found',
        blocks: [
          {
            kind: 'text',
            text: 'DTG prints straight onto the garment; DTF goes onto a film first, then is pressed on. On cotton washed ten times, a 2025 study in Thailand found DTG had lower print quality and color durability than DTF. On polyester and blends, a 2024 Clemson study without DTF found DTG held its color best after the first wash.',
          },
          {
            kind: 'list',
            items: [
              'The Thai study. Researchers at King Mongkut’s University of Technology Thonburi printed DTG, DTF and sublimation on cotton, then washed each print ten times following ISO 6330. DTG showed the lowest washing durability and the largest color difference.',
              'Longer wash results. The next section gives that study’s five-wash result for sublimation.',
              'Your fabric decides. Clemson’s researchers say some pairs of fabric and method give more accurate color, both at first and after multiple washes. Choose on a strike-off printed on your own fabric, and ask for a wash test if wash life matters to you.',
            ],
          },
        ],
      },

      {
        heading: 'Sublimation or screen printing: which lasts',
        blocks: [
          {
            kind: 'text',
            text: 'In a 2024 Clemson University study, sublimation on polyester or a polyester blend kept its color best over five laundering cycles; in 2025, after commercial laundering, the same team recommended it on 100% polyester. Screen printing reproduced color most accurately in 2024, and in 2025 it showed no noticeable change when washed only at home.',
          },
          {
            kind: 'list',
            items: [
              'Commercial laundry. For kit washed in a commercial laundry, the 2025 authors advised against screen printing on any of the fabrics they tested.',
              'What was tested. The 2024 study compared what it called the three most common printing processes for clothing, on three fabrics. The 2025 study printed on fabric blends common in team uniforms.',
              'DTF and sublimation. In 2026, Clemson studied 64 brand colors on several fabrics, with methods that included DTF and sublimation. DTF gave more accurate color overall, and sublimation did best on 100% polyester.',
              'Hard to generalize. The 2025 authors write that it is hard to say any one process, fabric type or color outperforms the rest.',
              'Small runs. For screen printing on a small order, see Why fewer pieces cost more each, in our minimum order guide.',
            ],
            links: [
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },

      {
        heading: 'How long a print lasts in the wash',
        blocks: [
          {
            kind: 'text',
            text: 'The standards we read define wash tests; none says how many washes a print lasts. AATCC TM61 roughly matches five hand or home launderings in one 45-minute test. Under ISO 105-C06, one single test closely matches one laundering, and one multiple test may, in some cases, match up to five. Ask which test, and the result.',
          },
          {
            kind: 'list',
            items: [
              'What TM61 is for. Textiles expected to stand up to frequent laundering.',
              'The washing itself. ISO 6330 sets the home washing and drying procedures used in textile testing, for fabrics, garments and other textile articles.',
            ],
          },
        ],
      },

      {
        heading: 'Rubbing, sweat and sunlight',
        blocks: [
          {
            kind: 'text',
            text: 'AATCC TM8 measures how much color rubs off a fabric onto white test cloth, dry and wet, and assesses it against a gray scale; it applies to printed textiles. ISO 105-X12 also tests with a dry cloth and a wet one. For sweat, AATCC TM15 tests color against acid perspiration, and covers printed fabric too.',
          },
          {
            kind: 'list',
            items: [
              'Small prints. AATCC does not recommend TM8 for prints where the area to test would be too small. For a small chest logo, ask the lab how it will test it.',
              'Sunlight. AATCC TM16.3 is a light test for colorants and finishes on textiles of all kinds. It says the two parties to the contract must agree how its result relates to real use.',
              'Lab reports. Ask for any colorfastness test named on this page, and we arrange a report on your print from a third-party lab, at your cost.',
            ],
          },
        ],
      },

      {
        heading: 'How each print feels',
        blocks: [
          {
            kind: 'text',
            text: 'We found no neutral study comparing how these methods feel, so we do not rank them. AATCC’s EP5 sets standard conditions for judging a fabric’s hand, meaning its feel. The seven methods above say how sublimation and special inks finish. For the other five, feel the strike-off before bulk.',
          },
          {
            kind: 'list',
            items: [
              'On our garments. Why the fabric decides, further down, shows what the method changed on four of our reference garments.',
            ],
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
        heading: 'Printing soccer ball panels',
        blocks: [
          {
            kind: 'text',
            text: 'A ball’s print goes on while its cover material is still flat. FIFA describes a ball’s cover layers being printed, then cut into panels, then stitched together. We screen print our ball panels on the cover material before the panels are cut. Send your ball artwork with your inquiry, as you would for a garment.',
          },
          {
            kind: 'list',
            items: [
              'The cover. FIFA wrote in 2018 that almost every football then made used synthetic leather, because its thickness varies far less than real leather.',
              'What goes on it. Whatever you ask for. We also offer to print its size, the words "Made in Pakistan", and how the ball was built.',
              'Colors and price. A ball’s price depends on four things: the build, the cover material, the bladder and the print colors.',
              'The rest of the ball. How soccer balls are made explains each build and what is inside, wound bladders included.',
              'In 3D. Our Kaizen ball has its own 3D page, where you can turn it.',
            ],
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
    sources: [
      {
        name: 'AATCC: TM61, colorfastness to laundering, accelerated',
        url: 'https://members.aatcc.org/store/tm61/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM8, colorfastness to rubbing (crocking)',
        url: 'https://members.aatcc.org/store/tm8/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM15, colorfastness to perspiration',
        url: 'https://members.aatcc.org/store/tm15/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: TM16.3, colorfastness to light',
        url: 'https://members.aatcc.org/store/tm16-3/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'AATCC: EP5, evaluating fabric hand',
        url: 'https://members.aatcc.org/store/ep5/462/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS EN ISO 105-C06:2010, identical to ISO 105-C06:2010, colour fastness to domestic and commercial laundering',
        url: 'https://knowledge.bsigroup.com/products/textiles-tests-for-colour-fastness-colour-fastness-to-domestic-and-commercial-laundering',
        date: '2010-04-30',
        kind: 'read',
      },
      {
        name: 'ISO: ISO 105-X12:2016, colour fastness to rubbing',
        url: 'https://www.iso.org/standard/65207.html',
        date: '2016-06-01',
        kind: 'read',
      },
      {
        name: 'BSI Knowledge: BS EN ISO 6330:2021, domestic washing and drying procedures for textile testing',
        url: 'https://knowledge.bsigroup.com/products/textiles-domestic-washing-and-drying-procedures-for-textile-testing-3',
        date: '2021-12-31',
        kind: 'read',
      },
      {
        name: 'Walker and Bridges (Clemson University), Color Accuracy and Durability for Printed, Branded Textiles, Color and Imaging Conference 32, pp 89 to 94, Society for Imaging Science and Technology',
        url: 'https://doi.org/10.2352/CIC.2024.32.1.18',
        date: '2024-10-28',
        kind: 'read',
      },
      {
        name: 'Walker and Bridges (Clemson University), The Impact of Commercial Laundering on Brand Color Durability on Printed Textiles, TAGA 2025 Proceedings',
        url: 'https://library.taga.org/2025-proceedings/T20250106',
        date: '2025-01-01',
        kind: 'read',
      },
      {
        name: 'Clemson University, Sports Insight: Clemson professors measure consistency of ACC brand team colors across athletic apparel',
        url: 'https://blogs.clemson.edu/brookssports/2026/06/19/clemson-professors-measure-consistency-of-acc-brand-team-colors-across-athletic-apparel/',
        date: '2026-06-19',
        kind: 'read',
      },
      {
        name: 'Clemson University, Sports Insight: Clemson branded textile research for athletic apparel receives international recognition',
        url: 'https://blogs.clemson.edu/brookssports/2025/03/03/clemson-branded-textile-research-for-athletic-apparel-receives-international-recognition/',
        date: '2026-02-02',
        kind: 'read',
      },
      {
        name: 'Liwsakpaiboon, Maungnoi and Kajondecha, King Mongkut’s University of Technology Thonburi, conference proceedings, pp P12-1 to P12-4',
        url: 'https://kirim.kmutt.ac.th/converis/portal/detail/Publication/1533897310?lang=en_GB',
        date: '2025-01-01',
        kind: 'read',
      },
      {
        name: 'FIFA: The making of a football',
        url: 'https://inside.fifa.com/innovation/news/the-making-of-a-football',
        date: '2018-08-06',
        kind: 'read',
      },
    ],
  },
  {
    path: '/guides/sportswear-fabrics-and-weights',
    title: 'Sportswear Fabrics & Weights (GSM) Guide',
    description:
      // The buyer library's description (owner approved 2026-11-06): the guide now converts, measures and matches.
      'Ten knit fabrics for sportswear in GSM and ounces, how fabric weight is measured, stretch and wicking explained, and which fabric suits which garment.',
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
        heading: 'GSM in ounces per square yard',
        blocks: [
          {
            kind: 'text',
            text: 'One ounce per square yard is 33.906 grams per square meter, from the conversion factor that the US National Institute of Standards and Technology publishes. To turn GSM into ounces per square yard, divide by 33.906. To turn ounces into GSM, multiply by 33.906. The table gives each fabric above in both units.',
          },
          {
            kind: 'table',
            caption: 'The ten fabrics in GSM and ounces per square yard',
            columns: ['Fabric', 'GSM', 'Ounces per square yard'],
            rows: [
              ['Single jersey', '120 to 200', '3.5 to 5.9'],
              ['Interlock', '155 to 220', '4.6 to 6.5'],
              ['Pique', '180 to 240', '5.3 to 7.1'],
              ['Mesh', '100 to 160', '2.9 to 4.7'],
              ['French terry', '200 to 280', '5.9 to 8.3'],
              ['Fleece', '200 to 350', '5.9 to 10.3'],
              ['Birdseye mesh', '135 to 180', '4.0 to 5.3'],
              ['Rib', '180 to 250', '5.3 to 7.4'],
              ['Waffle', '160 to 220', '4.7 to 6.5'],
              ['Jacquard', '200 to 280', '5.9 to 8.3'],
            ],
          },
          {
            kind: 'text',
            text: 'The ounces are rounded to one decimal place. Some weights are given per running yard or meter of fabric instead. For some fabrics the two are related simply through the width, so ask which one a quoted weight means.',
          },
          // C6 (owner approved, 6 Nov 2026): after the table and its paragraph, as the draft places it.
          { kind: 'tool', tool: 'gsm-converter' },
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
        heading: 'How fabric weight is measured',
        blocks: [
          {
            kind: 'text',
            text: 'Fabric weight is measured to a written test method. ASTM D3776 covers the mass per unit area of most fabrics, with four options, from a whole roll to a small swatch. A result from a small swatch speaks only for that swatch, not for the lot it was cut from. We check fabric weight on our own floor.',
          },
          {
            kind: 'text',
            text: 'The option matters. A full-width sample includes the selvages, the fabric’s side edges, unless otherwise specified, and results are for conditioned fabric. Conditioning uses the standard atmosphere that ISO 139 defines for testing textiles. Woven fabrics have their own method, ISO 3801.',
          },
          { kind: 'text', text: 'The GSM and its tolerance are stated in your quote.' },
          {
            kind: 'text',
            text: 'For a third-party lab report on your fabric, tell us the property and, if you have one, the test method. We arrange the report, and you pay for it.',
          },
          {
            kind: 'text',
            text: 'Swatches before the sample are covered in our minimum order guide.',
            links: [
              { phrase: 'our minimum order guide', href: '/guides/minimum-order-and-samples' },
            ],
          },
        ],
      },

      {
        heading: 'Which fabric for which garment',
        blocks: [
          {
            kind: 'text',
            text: 'Start from how the garment moves. Sportswear and other loose-fitting clothes need comfort stretch, so the body can move. In form-fitting garments, stretch that the fabric does not recover can build up over long wear. For swimwear, for example, the most popular fiber blend is polyamide (nylon) with elastane. The table matches garments to the ten fabrics above.',
          },
          {
            kind: 'table',
            caption: 'Which of the ten fabrics each garment uses',
            columns: ['Garment', 'Fabric'],
            rows: [
              ['T-shirts, tank tops and gym wear', 'Single jersey'],
              ['Running shirts', 'Single jersey or mesh'],
              ['Premium tees', 'Interlock'],
              ['Performance tees', 'Birdseye mesh'],
              ['Polo shirts', 'Interlock or pique'],
              ['Golf and tennis wear', 'Pique or birdseye mesh'],
              ['Team jerseys', 'Interlock'],
              ['Jerseys and ventilation panels', 'Mesh'],
              ['Hoodies', 'French terry or fleece'],
              ['Sweatshirts and sweatpants', 'French terry'],
              ['Jackets and pullovers', 'Fleece'],
              ['Necklines, cuffs, waistbands and fitted garments', 'Rib'],
              ['Base layers and thermal wear', 'Waffle'],
              ['Team uniforms and premium sportswear', 'Jacquard'],
            ],
          },
          {
            kind: 'text',
            text: 'For weight, read it with "Reading a weight" and the section on breathing below. For a garment the table leaves out, see our FAQ.',
            links: [{ phrase: 'our FAQ', href: '/faq/fabrics-and-printing#choose-fabric' }],
          },
        ],
      },

      {
        heading: 'Stretch and recovery',
        blocks: [
          {
            kind: 'text',
            text: 'Stretch is how far a fabric extends under a known load. Growth is measured after a known stretch is applied and then removed. Buyers need fabrics that stretch and also return to their original shape, and figures for stretch and growth help choose them.',
          },
          { kind: 'text', text: 'Which test suits which fabric:' },
          {
            kind: 'list',
            items: [
              'ASTM D2594 measures stretch under a known load and growth after release. Results from different labs agree poorly, so it is not recommended for accepting a shipment.',
              'ASTM D6614 measures the stretch and growth that a garment made from the fabric can be expected to show in use. It is a new method with little history of data, but labs agree well on it, so it may be considered for accepting shipments.',
              'ASTM D3107 covers fabrics woven from stretch yarns. Some of them have stretch yarns only in the filling, or weft, direction, across the width.',
              'ISO 20932-1 measures elasticity on straight strips or loops of fabric.',
            ],
          },
          {
            kind: 'text',
            text: 'For fabrics meant to give support, the scope of D2594 points to D3107, D4964 or D6614 instead.',
          },
        ],
      },

      {
        heading: 'What moisture-wicking means',
        blocks: [
          {
            kind: 'text',
            text: 'A moisture-wicking fabric draws liquid sweat along fine capillary channels, moving it away from the skin. How quickly it does so depends on the yarn, the structure of the fabric and its finish. Polyester absorbs little water, which can speed wicking; cotton fabrics wick poorly and take a long time to dry.',
          },
          {
            kind: 'text',
            text: 'Some fabrics have two faces: a water-repelling face against the skin and a water-attracting face outside, which pulls sweat out through the fabric. Some polyester fibers are made with a shaped cross-section that forms wicking channels along each fiber. Cotton is usually blended with wicking fibers to help the fabric wick, and hydrophilic, or water-attracting, finishes help too.',
          },
        ],
      },

      {
        heading: 'Does a heavier fabric breathe less?',
        blocks: [
          {
            kind: 'text',
            text: 'It can. When a fabric’s density stays the same, more weight means more thickness. Other things being equal, a thicker fabric lets less water vapor through and insulates more. Weight is only one factor: thread count, structure, porosity and finish affect comfort too.',
          },
          {
            kind: 'text',
            text: 'Air permeability tests measure how much air passes through a fabric: ASTM D737, which applies to knitted fabrics among others, and ISO 9237.',
          },
        ],
      },

      {
        heading: 'Knit or woven',
        blocks: [
          {
            kind: 'text',
            text: 'A knit is built from loops, each stitch one loop drawn through another. A woven interlaces two sets of yarns, the warp and the weft. Weft knits interlock horizontal loops; warp knits interlock loops made vertically. All ten fabrics above are knits. The wovens we use, textured woven polyester and taffeta, are described further down this page.',
          },
          {
            kind: 'text',
            text: 'Our shipping guide explains how knitted and woven garments are coded for customs.',
            links: [{ phrase: 'Our shipping guide', href: '/guides/shipping-and-import-duties' }],
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
              // Owner, 2026-11-06 (buyer library, wave 2): cellulose, as the fibers guide's sources say.
              'Lyocell and modal: fibers made from plant cellulose.',
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
              // Owner, 2026-11-06: "Taslon" is a trade name; a generic description, as the Metro-Shield
              // Suit's corrected fabric says it (`specNotes.ts`, "textured woven polyester").
              'Textured woven polyester: an outer-shell fabric, light, tough and wind-resistant.',
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
        heading: 'Under a soccer ball’s cover',
        blocks: [
          {
            kind: 'text',
            text: 'Under the cover of a soccer ball sit backing layers, which give the ball its shape and feel. They vary from ball to ball, and your quote states the backing layers for your ball. Covers, bladders and the four ways to build a ball are explained in our ball guide.',
            links: [{ phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' }],
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
    sources: [
      {
        name: 'NIST, Guide for the Use of the SI (SP 811), Appendix B.9, conversion factors',
        url: 'https://www.nist.gov/pml/special-publication-811/nist-guide-si-appendix-b-conversion-factors/nist-guide-si-appendix-b9',
        date: '2025-08-18',
        kind: 'updated',
      },
      {
        name: 'ASTM D3776/D3776M-20(2025), fabric mass per unit area',
        url: 'https://www.astm.org/d3776_d3776m-20r25.html',
        date: '2025-08-20',
        kind: 'updated',
      },
      {
        name: 'ISO 3801:1977, woven fabrics, mass per unit length and per unit area',
        url: 'https://www.iso.org/standard/9335.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ISO 139:2005, standard atmospheres for conditioning and testing textiles',
        url: 'https://www.iso.org/standard/35179.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ASTM D2594/D2594M-21, stretch properties of knitted fabrics',
        url: 'https://www.astm.org/Standards/D2594.htm',
        date: '2021-08-13',
        kind: 'updated',
      },
      {
        name: 'ASTM D6614/D6614M-20, stretch properties of textile fabrics, CRE method',
        url: 'https://www.astm.org/Standards/D6614.htm',
        date: '2020-08-06',
        kind: 'updated',
      },
      {
        name: 'ASTM D3107-26, stretch properties of fabrics woven from stretch yarns',
        url: 'https://www.astm.org/Standards/D3107.htm',
        date: '2026-05-20',
        kind: 'updated',
      },
      {
        name: 'ISO 20932-1:2018, elasticity of fabrics, strip tests',
        url: 'https://www.iso.org/standard/69489.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'NIST, OSAC Lexicon, Weft (filling)',
        url: 'https://www.nist.gov/glossary-term/41176',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Mishra, editorial on woven and knitted structures, Polymers 15(4):808',
        url: 'https://doi.org/10.3390/polym15040808',
        date: '2023-02-06',
        kind: 'published',
      },
      {
        name: 'Islam, Golovin and Dolez, review of clothing comfort, Textiles 3(4)',
        url: 'https://doi.org/10.3390/textiles3040024',
        date: '2023-09-30',
        kind: 'published',
      },
      {
        name: 'ASTM D737-18(2023), air permeability of textile fabrics',
        url: 'https://www.astm.org/d0737-18r23.html',
        date: '2023-06-28',
        kind: 'updated',
      },
      {
        name: 'ISO 9237:1995, air permeability of fabrics',
        url: 'https://www.iso.org/standard/16869.html',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Salopek Čubrić, Čubrić and Potočić Matković, swimwear fabrics, Polymers 13(15):2414',
        url: 'https://doi.org/10.3390/polym13152414',
        date: '2021-07-22',
        kind: 'published',
      },
      {
        name: 'US Federal Trade Commission, How to Avoid Bamboozling Your Customers (bamboo is rayon; rayon can be made from plants)',
        url: 'https://www.ftc.gov/business-guidance/resources/how-avoid-bamboozling-your-customers',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Federal Trade Commission, 16 CFR 303.7, generic names of manufactured fibers (rayon; lyocell)',
        url: 'https://www.ecfr.gov/current/title-16/section-303.7',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Regulation (EU) No 1007/2011 on textile fiber names, Annex I (lyocell, modal)',
        url: 'https://www.legislation.gov.uk/eur/2011/1007/annex/I',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'New Mexico State University, guide G-401, Selecting Fabrics for Home Furnishings (the live nylon line)',
        url: 'https://pubs.nmsu.edu/_g/G401/index.html',
        date: '2026-11-05',
        kind: 'read',
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
      // The buyer library's description (owner approved 2026-11-06).
      'How an order ships from Pakistan, the price terms we quote, HS codes, where to look up duty, small parcels, cartons and CBM, and duty on soccer balls.',
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
          // FCA and DAP join, in the order the Incoterms rules list them (owner, 2026-11-06: FCA on request; DAP offered).
          {
            kind: 'point',
            title: 'FCA (Free Carrier)',
            text: 'On request. We clear the goods for export and hand them to your carrier at the agreed place. You pay the freight from there, you handle import formalities in your country, and you pay the import duty and tax.',
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
            title: 'DAP (Delivered at Place)',
            text: 'We deliver to the place named in your quote. You clear the goods through customs in your country, and the import duty and tax are yours.',
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
        heading: 'EXW, FCA or FOB: where the goods change hands',
        blocks: [
          {
            kind: 'text',
            text: 'All three hand over the goods in Pakistan. Under the EXW rule, loading your vehicle at the seller’s door is at your cost and risk, and you handle export. Under FCA, the seller clears export and hands the goods to your carrier. FOB is only for sea or inland waterway transport; risk passes once the goods are on board.',
          },
          {
            kind: 'text',
            text: 'FCA suits any kind of transport, including shipments that use two or more, such as truck and ship. ICC Academy (International Chamber of Commerce) articles call FCA the right rule for goods in containers or on pallets that travel by more than one mode, and advise using FCA rather than EXW when goods cross a border. For sea freight under FCA, you can still have the carrier issue an on-board bill of lading to the seller once the goods are loaded, an option added in the 2020 rules.',
          },
          {
            kind: 'text',
            text: 'With us, who loads your vehicle under EXW and who clears the goods for export varies from order to order, and your quote states it.',
          },
        ],
      },

      {
        heading: 'DDP or DAP: who clears customs in your country',
        blocks: [
          {
            kind: 'text',
            text: 'Under DDP we handle and pay for export, transit and import clearance, and our broker or partner clears the goods in your country. Under DAP you clear the goods and pay for import yourself. Some countries require a local importer to clear goods, and there DAP is the term to use.',
          },
          {
            kind: 'text',
            text: 'If you are not sure whether your country lets a seller clear goods on your behalf, ask your customs broker before you choose DDP.',
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },
      {
        heading: 'Choosing a term',
        blocks: [
          {
            kind: 'text',
            text: 'If you want nothing to arrange on arrival, ask for DDP. If you have your own forwarder, ask for EXW. If you arrange the sea freight yourself, ask for FOB. If you want us to handle the sea leg to your port, ask for CFR or CIF. If your forwarder should collect goods already cleared for export, ask for FCA. If you would rather clear the goods at home yourself, ask for DAP.',
          },
        ],
      },
      {
        heading: 'Who pays import duty',
        blocks: [
          {
            kind: 'text',
            text: 'Under EXW, FCA, FOB, CFR, CIF and DAP, you do, when the goods arrive in your country. Under DDP, we do, and it is part of the price. The amount depends on your country and the garment, not on us.',
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },

      {
        heading: 'HS codes and national codes',
        blocks: [
          {
            kind: 'text',
            text: 'An HS code is the six-digit product code of the World Customs Organization’s Harmonized System, which more than 200 countries and economies use as the basis of their customs tariffs. Each country adds digits for its own rates: the US HTS has eight-digit rate lines and ten-digit statistical numbers. Only the first six digits are the same worldwide.',
          },
          {
            kind: 'text',
            text: 'Our commercial invoice gives the six-digit HS code, and your customs broker confirms the full code for your country.',
          },
          { kind: 'text', text: 'In the other tariffs we read on 5 November 2026:' },
          {
            kind: 'list',
            items: [
              'European Union: eight-digit Combined Nomenclature codes, and ten digits in TARIC.',
              'United Kingdom: ten digits for imports, eight for exports.',
              'Canada: an eight-digit tariff item and a two-digit statistical suffix.',
              'Australia: an eight-digit code and a statistical code.',
            ],
          },
          {
            kind: 'text',
            text: 'Knitted garments are in Chapter 61 and other garments in Chapter 62, so a knitted and a woven version of one garment take different codes. Our fabrics guide explains the difference.',
            links: [
              { phrase: 'Our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
            ],
          },
          {
            kind: 'text',
            text: 'UK guidance calls the national code a commodity code and tells anyone importing or exporting goods to find the right one. In the US, Customs and Border Protection interprets and enforces the HTS.',
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },

      {
        heading: 'Where to look up the duty',
        blocks: [
          {
            kind: 'text',
            text: 'In the official tariff of the country you import into. Search by the product’s code and choose Pakistan as the country of origin; the UK and EU tariffs show Pakistan’s preference beside the standard rate. The table names each market’s official tool, and the guide comparing Pakistan, China and Türkiye gives the garment rates we found.',
            links: [
              {
                phrase: 'the guide comparing Pakistan, China and Türkiye',
                href: '/guides/pakistan-vs-china-vs-turkey',
              },
            ],
          },
          {
            kind: 'table',
            caption: 'Where to look up duty, by market',
            columns: ['Market', 'Official tool'],
            rows: [
              [
                'United States',
                'The Harmonized Tariff Schedule, from the US International Trade Commission',
              ],
              ['European Union', 'TARIC, and My Trade Assistant on Access2Markets'],
              ['United Kingdom', 'The UK Trade Tariff'],
              ['Canada', 'The Customs Tariff, from the Canada Border Services Agency'],
              ['Australia', 'The Working Tariff, from the Australian Border Force'],
            ],
          },
          {
            kind: 'text',
            text: 'TARIC does not show national rates of VAT or excise. The UK tariff lists import VAT apart from duty, and VAT can still be due when the duty is zero.',
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },

      {
        heading: 'Do small parcels still enter duty-free?',
        blocks: [
          {
            kind: 'text',
            text: 'Fewer of them do. As of 5 November 2026, the US has suspended duty-free de minimis entry for goods worth $800 or less from every country, by every mode, post included. The EU charges €3 per item on parcels for consumers worth €150 or less. The UK has announced customs duty on goods worth £135 or less.',
          },
          {
            kind: 'list',
            items: [
              'United States: the suspension took effect on 29 August 2025, an executive order of 20 February 2026 continued it, and rules from Customs and Border Protection made it indefinite on 24 June 2026. Shipments worth $2,500 or less pay duty, except genuine gifts worth $100 or less, and can generally use the simpler informal entry.',
              'European Union: from 1 July 2026, the temporary €3 applies to parcels worth up to €150, in practice once per line of the customs declaration, until 1 July 2028. From 1 November 2026, a Union handling fee applies as well.',
              'United Kingdom: the change was announced at Budget 2025, and on 23 June 2026 the government brought it forward by six months, to October 2028.',
            ],
          },
          {
            kind: 'text',
            text: 'When we ship single orders to your customers, the duty and fees on each parcel are quoted per order, under DDP or DAP, as you choose.',
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },

      {
        heading: 'Cartons and CBM',
        blocks: [
          {
            kind: 'text',
            text: 'A carton’s volume in cubic meters (CBM) is its length, width and height in meters, multiplied together. By sea, goods travel as a full container for one consignee, or as less than a container load when a consignment does not fill one. By air, the charge is on the higher of the actual weight and the volume weight.',
          },
          {
            kind: 'text',
            text: 'An example carton, not one of ours, measures 60 × 40 × 40 cm: 0.6 × 0.4 × 0.4 = 0.096 cubic meters (CBM).',
          },
          // C6 (owner approved, 6 Nov 2026): after the example carton, before the closing line.
          { kind: 'tool', tool: 'cbm-calculator' },
          {
            kind: 'text',
            text: 'Your quote states the cartons for your order. Ask your forwarder for the chargeable weight. Carton markings are covered in our packaging guide.',
            links: [{ phrase: 'our packaging guide', href: '/guides/private-label-packaging' }],
          },
        ],
      },

      {
        heading: 'Shipping soccer balls',
        blocks: [
          {
            kind: 'text',
            text: 'Stitched balls ship deflated, and so do hybrid balls such as our Kaizen. Thermobonded balls ship inflated. In all five tariffs below, soccer balls fall under the six-digit code 9506.62, inflatable balls. On 5 November 2026 their standard duty was free in the US, Canada and Australia, 2.7% in the EU and 2% in the UK.',
          },
          {
            kind: 'table',
            caption: 'Soccer ball duty, read on 5 November 2026',
            columns: ['Market and code', 'Duty'],
            rows: [
              ['US, 9506.62.40', 'Free, plus 10% on goods from Pakistan, with listed exceptions'],
              ['EU, 9506 62 00', '2.7%; 0% for Pakistan under GSP+'],
              [
                'UK, 9506620000',
                '2%; 0% for Pakistan under the Developing Countries Trading Scheme',
              ],
              ['Canada, 9506.62.00', 'Free'],
              ['Australia, 9506.62.00', 'Free'],
            ],
          },
          {
            kind: 'text',
            text: 'The US 10% is a Section 301 duty, in force from 24 July 2026, with listed exceptions; check with your broker whether soccer balls are among them. TARIC lists Pakistan’s EU 0% until 31 December 2026, when the current scheme ends. Our country guide explains both.',
            links: [
              {
                phrase: 'Our country guide',
                href: '/guides/pakistan-vs-china-vs-turkey',
              },
            ],
          },
          {
            kind: 'text',
            text: 'An order of kits and balls is declared under two codes: the kits under Chapter 61 or 62, the balls under Chapter 95. A needle or a valve-care note can go in the box on request. The four builds are explained in our ball guide.',
            links: [{ phrase: 'our ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          { kind: 'legal', checked: '5 November 2026' },
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
            // The buyer library (owner approved 2026-11-06): the page now gives duty on soccer balls, so
            // "no duty rates" went; ICC's own page dates the edition.
            text: 'The terms follow the Incoterms 2020 edition. ICC’s own pages call it the most recent edition, in force from 1 January 2020.',
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
    sources: [
      {
        name: 'ICC, Incoterms 2020',
        url: 'https://iccwbo.org/business-solutions/incoterms-rules/incoterms-2020/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ICC, Incoterms rules',
        url: 'https://iccwbo.org/business-solutions/incoterms-rules/',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'ICC Academy, Incoterms 2020: FCA or FOB',
        url: 'https://academy.iccwbo.org/incoterms/article/incoterms-2020-fca-or-fob/',
        date: '2024-11-19',
        kind: 'published',
      },
      {
        name: 'ICC Academy, Incoterms 2020: EXW or FCA',
        url: 'https://academy.iccwbo.org/incoterms/article/incoterms-2020-exw-or-fca/',
        date: '2025-01-07',
        kind: 'published',
      },
      {
        name: 'ICC Academy, Incoterms 2020: DAP or DDP',
        url: 'https://academy.iccwbo.org/incoterms/article/incoterms-2020-dap-or-ddp/',
        date: '2025-02-25',
        kind: 'published',
      },
      {
        name: 'World Customs Organization, What is the Harmonized System (HS)?',
        url: 'https://www.wcoomd.org/en/topics/nomenclature/overview/what-is-the-harmonized-system.aspx',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US International Trade Commission, About the HTS',
        url: 'https://www.usitc.gov/tariff_affairs/about_hts.htm',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'European Commission, Combined Nomenclature',
        url: 'https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/combined-nomenclature_en',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'European Commission, EU customs tariff (TARIC)',
        url: 'https://taxation-customs.ec.europa.eu/customs/calculation-customs-duties/customs-tariff/eu-customs-tariff-taric_en',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'GOV.UK, Finding commodity codes for imports or exports',
        url: 'https://www.gov.uk/guidance/finding-commodity-codes-for-imports-or-exports',
        date: '2022-08-22',
        kind: 'updated',
      },
      {
        name: 'GOV.UK, Trade Tariff',
        url: 'https://www.gov.uk/trade-tariff',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'UK Integrated Online Tariff, commodity 9506620000 from Pakistan',
        url: 'https://www.trade-tariff.service.gov.uk/commodities/9506620000?country=PK&day=5&month=11&year=2026',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'UK Integrated Online Tariff, Chapters 61 and 62',
        url: 'https://www.trade-tariff.service.gov.uk/chapters/61',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'Canada Border Services Agency, Customs Tariff',
        url: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/menu-eng.html',
        date: '2026-01-05',
        kind: 'updated',
      },
      {
        name: 'Canada Border Services Agency, Customs Tariff 2026, Chapter 95',
        url: 'https://www.cbsa-asfc.gc.ca/trade-commerce/tariff-tarif/2026/html/00/ch95-eng.html',
        date: '2026-01-01',
        kind: 'updated',
      },
      {
        name: 'Australian Border Force, Current tariff',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff',
        date: '2025-10-01',
        kind: 'updated',
      },
      {
        name: 'Australian Border Force, Schedule 3, Chapter 95',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-classification/current-tariff/schedule-3/section-xx/chapter-95',
        date: '2026-07-01',
        kind: 'updated',
      },
      {
        name: 'European Commission, Access2Markets',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/home',
        date: '2026-10-14',
        kind: 'updated',
      },
      {
        name: 'European Commission, TARIC: 9506620000 from Pakistan',
        url: 'https://ec.europa.eu/taxation_customs/dds2/taric/measures.jsp?Lang=en&SimDate=20261105&Taric=9506620000&Area=PK&LangDescr=en',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: EU applies €3 customs duty per item on low-value e-commerce consignments',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/news/eu-applies-eu3-customs-duty-item-low-value-e-commerce-consignments',
        date: '2026-06-30',
        kind: 'published',
      },
      {
        name: 'European Commission, EU customs reform',
        url: 'https://taxation-customs.ec.europa.eu/customs/eu-customs-reform_en',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'HM Revenue & Customs, cheap import reforms brought forward',
        url: 'https://www.gov.uk/government/news/government-backs-high-street-with-acceleration-of-cheap-import-reforms-and-crackdown-on-dodgy-online-sellers',
        date: '2026-06-23',
        kind: 'published',
      },
      {
        name: 'USITC, Harmonized Tariff Schedule, 9506.62',
        url: 'https://hts.usitc.gov/reststop/search?keyword=9506.62',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'USITC, Harmonized Tariff Schedule, 9903.05.62',
        url: 'https://hts.usitc.gov/reststop/search?keyword=9903.05.62',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'US Customs and Border Protection, CSMS 69326983: Section 301 duties',
        url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/421d887',
        date: '2026-07-23',
        kind: 'published',
      },
      {
        name: 'The White House, Continuing the suspension of duty-free de minimis treatment for all countries',
        url: 'https://www.whitehouse.gov/presidential-actions/2026/02/continuing-the-suspension-of-duty-free-de-minimis-treatment-for-all-countries/',
        date: '2026-02-20',
        kind: 'published',
      },
      {
        name: 'US Customs and Border Protection, CBP modernizes low-value shipment processing',
        url: 'https://www.cbp.gov/newsroom/national-media-release/cbp-modernizes-low-value-shipment-processing',
        date: '2026-06-24',
        kind: 'published',
      },
      {
        name: 'US Customs and Border Protection, e-commerce FAQs',
        url: 'https://www.cbp.gov/trade/basic-import-export/e-commerce/faqs',
        date: '2026-09-02',
        kind: 'updated',
      },
      {
        name: 'European Commission, Access2Markets: The EU’s renewed GSP scheme, key updates for 2027',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/news/eus-renewed-gsp-scheme-key-updates-2027',
        date: '2026-08-11',
        kind: 'published',
      },
      {
        name: 'IATA, Air cargo tariffs and rules: what you need to know',
        url: 'https://www.iata.org/en/publications/newsletters/iata-knowledge-hub/air-cargo-tariffs-and-rules-what-you-need-to-know/',
        date: '2021-07-27',
        kind: 'published',
      },
      {
        name: 'Australian Border Force, Sea cargo types',
        url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/cargo-reporting-and-transhipped-goods/cargo-reports/sea-cargo-types',
        date: '2026-10-01',
        kind: 'updated',
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
          {
            kind: 'text',
            // The buyer library (owner approved 2026-11-06): one line pointing to where the fee is explained.
            text: 'The minimum-order guide says how the sample fee is set, and which four samples a typical order has.',
            links: [
              { phrase: 'The minimum-order guide', href: '/guides/minimum-order-and-samples' },
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
        heading: 'What changes the price of one piece',
        stage: 'whole-tagging',
        blocks: [
          {
            kind: 'text',
            text: 'Five things move the price of each piece: the fabric and its weight, including how much of it the pattern uses; the trims and labels; the decoration; the sewing time; and the quantity you order. Change one of them in your inquiry, and the price in your quote changes with it.',
          },
          {
            kind: 'list',
            items: [
              'Fabric and fabric use. The fabric’s type and weight, and the amount each piece needs. Our fabrics guide gives common fabrics and their usual weights.',
              'Trims and labels. Zippers, snaps, drawcords, labels and hang tags.',
              'Decoration. The method, the number of colors, and how many places on the garment it goes. The printing guide compares the methods.',
              'Sewing time. How long the garment takes to sew.',
              'Quantity. The minimum-order guide explains why fewer pieces cost more each, and how to ask for prices at several quantities in one quote.',
            ],
            links: [
              { phrase: 'Our fabrics guide', href: '/guides/sportswear-fabrics-and-weights' },
              { phrase: 'The printing guide', href: '/guides/garment-printing-methods' },
              { phrase: 'The minimum-order guide', href: '/guides/minimum-order-and-samples' },
            ],
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
            text: 'The shipping method, terms and cost are stated in your quote. Under EXW, FCA, FOB, CFR, CIF and DAP, you pay the import duty and tax when the goods arrive in your country. Under DDP, we do, and it is part of the price. The amount depends on your country and the garment, not on us.',
          },
        ],
      },

      {
        heading: 'What the order costs at your door',
        blocks: [
          {
            kind: 'text',
            text: 'Your landed cost is the whole cost of the order once it reaches you: our price, the freight and insurance, the import duty, any import VAT, and customs fees. Your price term decides which of these our quote includes. A customs broker can tell you what your own border will charge.',
          },
          {
            kind: 'list',
            items: [
              'Our price. Everything your quote states. Under some terms it also covers the freight leg and its insurance, or the duty and tax at your end; the shipping guide shows which term does what.',
              'Import duty. The rate your market’s tariff gives the garment, charged on the goods’ value. Which costs count in that value differs from market to market. Our guide to Pakistan, China and Türkiye lists the duty on garments in six markets, and the extra Section 301 duty the US adds on goods from Pakistan.',
              'Import VAT. In the UK and the EU, import VAT is charged on the customs value plus the duty, so the duty is taxed too. The UK also adds incidental expenses such as commission, packing, transport and insurance. The EU adds the costs of carrying the goods to their destination, and the importer usually pays. EU rules let a business reclaim the VAT on purchases used for its business; ask your adviser whether that covers your import VAT.',
              'Customs fees. In the US, the user fee table of U.S. Customs and Border Protection (CBP) lists a Merchandise Processing Fee on formal entries and a Harbor Maintenance Fee on imports. Each is a percentage of the goods’ value, and the processing fee also has a minimum and a maximum. Read the current figures on CBP’s table.',
              'Single orders. When we ship to your customers one parcel at a time, small-parcel rules apply, such as the EU’s temporary customs duty on low-value parcels sold to consumers. The shipping guide covers those rules and how we quote each parcel.',
            ],
            links: [
              { phrase: 'the shipping guide', href: '/guides/shipping-and-import-duties' },
              {
                phrase: 'Our guide to Pakistan, China and Türkiye',
                href: '/guides/pakistan-vs-china-vs-turkey',
              },
              { phrase: 'The shipping guide', href: '/guides/shipping-and-import-duties' },
            ],
          },
          { kind: 'legal', checked: '5 November 2026' },
        ],
      },

      {
        heading: 'What else to budget for',
        blocks: [
          {
            kind: 'text',
            text: 'Some costs of a new brand never appear in a factory quote. You pay the courier for your sample, any lab test reports and your own inspector. A new business also has costs of its own, from licenses and insurance to a website and marketing, and the U.S. Small Business Administration (SBA) lists them.',
          },
          { kind: 'label', text: 'Outside our quote, paid by you' },
          {
            kind: 'list',
            items: [
              'Lab test reports. We can arrange third-party lab tests for you, at your cost.',
              'Your own inspector. The inspection company’s fee is yours; entering our works costs you nothing.',
              'Photos for your online store. We do not offer them, so photography is a cost of your own.',
              'Freight and import charges. Shipping, insurance, duty and import VAT, unless your price term puts them in our price.',
            ],
          },
          { kind: 'label', text: 'In your quote' },
          {
            kind: 'list',
            items: ['Your quote states the bank charges on a transfer and on a letter of credit.'],
          },
          { kind: 'label', text: 'Your brand’s own costs' },
          {
            kind: 'list',
            items: [
              'The SBA’s list also names a lawyer and an accountant, inventory, advertising and market research.',
              'The SBA suggests keeping one-time costs apart from monthly costs, and planning for at least a year of monthly costs.',
            ],
          },
        ],
      },

      {
        heading: 'Who pays when online customers send pieces back',
        blocks: [
          {
            kind: 'text',
            text: 'If you sell online to consumers in the EU or the UK, plan for returns. An EU consumer can cancel a purchase within 14 days without a reason, and who pays to send it back depends on what you told them. In the UK you must tell customers they can cancel up to 14 days after delivery.',
          },
          {
            kind: 'list',
            items: [
              'An EU customer usually pays to send the goods back. If you did not tell them about that cost before they bought, it falls to you.',
              'So state your returns terms, and who pays the postage, before the customer pays.',
              'This covers consumer sales in the EU and the UK only. For other markets, ask your adviser.',
            ],
          },
          { kind: 'legal', checked: '5 November 2026' },
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
          {
            kind: 'text',
            // The buyer library (owner approved 2026-11-06): check the account before paying any factory.
            text: 'Before you pay any factory, check that its bank account is in the company’s own name; our vetting guide shows how.',
            links: [
              { phrase: 'our vetting guide', href: '/guides/how-to-vet-a-clothing-manufacturer' },
            ],
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
          {
            kind: 'text',
            text: 'The vetting guide lists the papers to ask for before you visit, and where to check each one.',
            links: [
              { phrase: 'The vetting guide', href: '/guides/how-to-vet-a-clothing-manufacturer' },
            ],
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
        heading: 'The price of a custom soccer ball',
        blocks: [
          {
            kind: 'text',
            text: 'Four choices set what a custom ball costs: its build, its cover material, its bladder and the number of print colors. The build can be hand-stitched, machine-stitched, thermobonded or a hybrid of these. The minimum order is the same as for garments. The soccer-ball guide explains each build, cover and bladder.',
            links: [{ phrase: 'The soccer-ball guide', href: '/guides/how-soccer-balls-are-made' }],
          },
          {
            kind: 'text',
            text: 'How balls are packed for shipping is in the shipping guide.',
            links: [{ phrase: 'the shipping guide', href: '/guides/shipping-and-import-duties' }],
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
    sources: [
      {
        name: 'Cornell Law School, Legal Information Institute: 19 U.S. Code § 1401a, Value (statute text)',
        url: 'https://www.law.cornell.edu/uscode/text/19/1401a',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection: User Fee Table',
        url: 'https://www.cbp.gov/trade/basic-import-export/user-fee-table',
        date: '2026-10-09',
        kind: 'read',
      },
      {
        name: 'U.S. Customs and Border Protection, CSMS 69326983: Section 301 Forced Labor Import Duties',
        url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/421d887',
        date: '2026-07-23',
        kind: 'read',
      },
      {
        name: 'GOV.UK (HMRC): Delivery costs to include in the customs value',
        url: 'https://www.gov.uk/guidance/delivery-costs-to-include-in-the-customs-value',
        date: '2026-04-15',
        kind: 'read',
      },
      {
        name: 'GOV.UK (HMRC): Working out the VAT value using the customs value of the imported goods',
        url: 'https://www.gov.uk/guidance/working-out-the-vat-value-using-the-customs-value-of-the-imported-goods',
        date: '2026-10-21',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: Value Added Tax',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/content/value-added-tax-1',
        date: '2026-10-14',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: Guide to import goods',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/content/guide-import-goods',
        date: '2026-10-14',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: EU applies €3 customs duty per item on low-value e-commerce consignments',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/news/eu-applies-eu3-customs-duty-item-low-value-e-commerce-consignments',
        date: '2026-06-30',
        kind: 'read',
      },
      {
        name: 'European Commission, Access2Markets: Tariffs',
        url: 'https://trade.ec.europa.eu/access-to-markets/en/content/tariffs-1',
        date: '2026-10-14',
        kind: 'read',
      },
      {
        name: 'European Union, Your Europe: Guarantees and returns',
        url: 'https://europa.eu/youreurope/citizens/consumers/shopping/returns/index_en.htm',
        date: '2026-04-28',
        kind: 'read',
      },
      {
        name: 'GOV.UK: Online and distance selling for businesses',
        url: 'https://www.gov.uk/online-and-distance-selling-for-businesses',
        date: '2026-11-05',
        kind: 'read',
      },
      {
        name: 'U.S. Small Business Administration: Calculate your startup costs',
        url: 'https://www.sba.gov/business-guide/plan-your-business/calculate-your-startup-costs',
        date: '2026-11-05',
        kind: 'read',
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
            /*
             * From the SAME list as the ball size lookup below (`BALL_SIZES`, guideTools.ts), so the
             * table and the tool can never disagree (C6's drift guard). The cells read as they did:
             * Size 3 "Under 7 to Under 11" and "6 and under and 8 and under" (the US rows re-read on
             * the PDF, owner approved the fix, 2026-11-06), Size 5 ending at Under 16 and at 19 and
             * under. `guideTools.test.ts` pins every cell.
             */
            rows: ([3, 4, 5] as const).map((size) => [
              `Size ${size}`,
              ballSizeRange('england', size),
              ballSizeRange('us', size),
            ]),
          },
          {
            kind: 'text',
            text: 'Other countries and leagues set their own ages, so check your league’s rules.',
          },
          // C6 (owner approved, 6 Nov 2026): after the closing line, as the draft places it.
          { kind: 'tool', tool: 'ball-size-lookup' },
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
  // The buyer library's new guides, waves 2 to 12 (owner approved every word, 2026-11-06).
  ...LIBRARY_GUIDES,
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
  // The buyer library (owner approved 2026-11-06): each draft's own proposal. The software guide's
  // third, the tech pack guide, joins when that guide is published with its download.
  '/guides/how-to-vet-a-clothing-manufacturer': [
    '/guides/how-a-private-label-order-works',
    '/guides/pakistan-vs-china-vs-turkey',
    '/guides/cost-to-start-an-activewear-brand',
  ],
  '/guides/clothing-labels': [
    '/guides/private-label-packaging',
    '/guides/apparel-trims',
    '/guides/how-a-private-label-order-works',
  ],
  '/guides/apparel-trims': [
    '/guides/clothing-labels',
    '/guides/sportswear-fabrics-and-weights',
    '/guides/minimum-order-and-samples',
  ],
  '/guides/sportswear-fibers': [
    '/guides/sportswear-fabrics-and-weights',
    '/guides/yarn-count-and-denier',
    '/guides/clothing-labels',
  ],
  '/guides/yarn-count-and-denier': [
    '/guides/sportswear-fibers',
    '/guides/sportswear-fabrics-and-weights',
    '/guides/how-a-private-label-order-works',
  ],
  '/guides/sportswear-pattern-making': [
    '/guides/minimum-order-and-samples',
    '/guides/sportswear-fabrics-and-weights',
    '/guides/3d-garment-reference',
  ],
  '/guides/stitch-and-seam-types': [
    '/guides/sportswear-pattern-making',
    '/guides/sportswear-fabrics-and-weights',
    '/guides/how-soccer-balls-are-made',
  ],
  '/guides/outerwear-and-waterproof-fabrics': [
    '/guides/sportswear-fabrics-and-weights',
    '/guides/shipping-and-import-duties',
    '/guides/apparel-trims',
  ],
  '/guides/dyeing-and-color-matching': [
    '/guides/garment-printing-methods',
    '/guides/sportswear-fabrics-and-weights',
    '/guides/minimum-order-and-samples',
  ],
  '/guides/garment-cutting': [
    '/guides/sportswear-pattern-making',
    '/guides/minimum-order-and-samples',
    '/guides/garment-printing-methods',
  ],
  '/guides/sportswear-compliance-by-market': [
    '/guides/clothing-labels',
    '/guides/how-to-vet-a-clothing-manufacturer',
    '/guides/apparel-trims',
  ],
  '/guides/apparel-manufacturing-machinery': [
    '/guides/stitch-and-seam-types',
    '/guides/garment-cutting',
    '/guides/how-to-vet-a-clothing-manufacturer',
  ],
  '/guides/apparel-design-software': [
    '/guides/sportswear-pattern-making',
    '/guides/3d-garment-reference',
    // The draft's third, back with the tech pack guide (C1, 2026-11-06).
    '/guides/tech-pack-template',
  ],
  '/guides/how-to-order-team-kits': [
    '/guides/minimum-order-and-samples',
    '/guides/garment-printing-methods',
    '/guides/how-soccer-balls-are-made',
  ],
  '/guides/apparel-manufacturing-technology': [
    '/guides/3d-garment-reference',
    '/guides/clothing-labels',
    '/guides/sportswear-compliance-by-market',
  ],
  // C1's read next, as its draft proposed and the owner approved (2026-11-06).
  '/guides/tech-pack-template': [
    '/guides/garment-printing-methods',
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
