import { WEIGHT_BANDS } from '@run-apparel/shared'
import { ABOUT } from './aboutCopy'
import { FACTORY_PAGE } from './aboutPages'
import { CERTIFICATION_LINES, FACTS, LEAD_TIME } from './companyFacts'
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
 * The deposit and balance terms (owner, 2026-10-26, site check), stated by the two guides that
 * speak of payment. Kept here, once, so the two cannot differ.
 */
const PAYMENT_TERMS = 'Production starts on a 50% deposit; the balance is due before shipment.'

/** What the inquiry form takes, in the form's own words and limits (`inquiryForm.ts`). */
const FORM_TAKES = `The inquiry form takes ${ACCEPTED_KINDS}, up to ${MAX_FILES} files and ${LIMIT} in total.`
const LARGER_FILES = 'For larger files, paste a WeTransfer or Drive link in your message.'

/** An FAQ answer, word for word (`faqs.ts`): the guide and the FAQ say it the same way. */
const faqAnswer = (id: string): string => faqEntryById(id).entry.answer

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
            text: 'Take the Apex Flex Pullover. It is 88% polyester and 12% spandex, 160 to 210 GSM, in a sleek athletic cut. Its features are a waffle knit, an invisible zip, a convertible stand collar, eco-poly stretch and a DTF print.',
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
            text: 'Our reference garments cover teamwear and uniforms, sportswear, outerwear and casual wear. Sports accessories are made too, and their 3D pages are still to come.',
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
      {
        heading: 'Splitting the minimum',
        blocks: [
          {
            kind: 'text',
            text: `Within the ${MINIMUM} you can typically split across sizes, for example ${OWNER_FIGURES.sizeSplit}. Color splits depend on the fabric and the printing method. Your quote confirms the exact split.`,
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
        heading: 'Reorders and payment',
        blocks: [
          {
            kind: 'text',
            text: `We keep your patterns and samples for your next order. A reorder has the same minimum: ${MINIMUM} pieces per style.`,
          },
          {
            kind: 'text',
            text: `Payment terms are agreed with each buyer. ${PAYMENT_TERMS}`,
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
            columns: ['Garment', 'Composition', 'Weight'],
            rows: [
              ['Men’s training pullover', '88% polyester, 12% spandex', '160 to 210 GSM'],
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
            ],
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
            text: `Payment terms are agreed with each buyer, so ask for them in the same conversation as the quote. ${PAYMENT_TERMS}`,
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
