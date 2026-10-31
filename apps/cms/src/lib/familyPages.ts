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
 * Outerwear and Casual Wear were approved on 2026-09-30, Sports Accessories and the soccer ball
 * page on 2026-10-31. A family with no entry here simply has no page yet: while it has no garments
 * either, its home-page card and its group on the products page say "[ ask us ]" and lead to Contact
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
  /** The `<title>`; the layout adds " | RUN APPAREL". */
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
  readonly makes: ReadonlyArray<{ group: string; garments: string; href?: string }>
  /**
   * The heading over the link to the order guide. The page listed its own five steps under it until
   * polish S4 (2026-10-05); the guide tells how an order works, once, for every page.
   */
  readonly stepsHeading: string
  readonly questions: readonly FamilyPageQuestion[]
  /** The heading over the last call to action. */
  readonly closingHeading: string
  /**
   * A page for one product line inside a family, not the family's own page (the soccer ball page,
   * owner 2026-10-31). The family's links and its garment pages' trail keep opening its own page.
   */
  readonly productLine?: { readonly words: RegExp }
  /** A headline word too wide for a 320px phone at the display size ("ACCESSORIES,"). */
  readonly headingWideWord?: boolean
  /** The paragraph over the 3D cards, where "fabric, weight and fit" would not describe them. */
  readonly garmentsLede?: string
}

const fact = (prefix: string): string =>
  FACTS.find((entry) => entry.label.startsWith(prefix))?.value ?? ''

/** The minimum order per style, as the home page's numbers state it (`FACTS`). */
export const MINIMUM = fact('Minimum')
const SAMPLE_DAYS = fact('Working days')

/**
 * The one action every buyer page asks for, in the site's one name for it (polish X20, the owner's
 * answer Q9, 2026-10-03: "Start a conversation" everywhere; it was "Get a free quote" here and on
 * the guides). `e2e/copy.spec.ts` knows it as a primary label.
 */
export const FAMILY_PAGE_ACTION = 'Start a conversation'

/*
 * ⚠️ NO STEPS OF THEIR OWN, NO NUMBERS, NO FACTORY PHOTOS (polish S4, the owner's answer Q26,
 * 2026-10-04). Each page carried five steps of its own, the home page's numbers and two factory
 * photos: the order process told a third way (the home page has eight steps, the order guide
 * eight with other names; audit X21) and the home page copied four times. A buyer page is the list
 * of its family's garments now, with what is made and the questions; how an order works is the
 * order guide's job, and the page links to it (`FamilyLanding.tsx`).
 */

/*
 * ⚠️ FOUR OF THE SIX QUESTIONS EVERY PAGE SHARED WERE SAID TWICE (owner, 2026-10-26, site check:
 * "nothing said twice on one page"). The minimum and the sample time are in the label and the
 * opening paragraph; "can the garments carry our own brand" is the opening paragraph's "under your
 * own label"; "what do you need to quote" is the closing band's "A sketch is enough to start". So
 * those four went, and each page asks its own questions instead. Two shared ones stay: they say
 * something the page does not.
 *
 * ⚠️ NO COUNT OF THE CATALOGUE IS TYPED HERE (the same date). An answer names the garments it
 * speaks of, and the fabric, weight or method that garment's own page states, all read from the
 * public garment data on 2026-10-26. A figure for a named garment goes stale only if that garment's
 * page is edited; "nine of the ten" or "four use DTF" would go stale when a garment is added, so the
 * drafts' counts are left out.
 */
const SHARED_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'Do you keep stock designs we can pick from?',
    answer:
      'No. Every order is made to order. The 3D garments on this page are references that show what we can make.',
  },
  { question: 'Where do you ship?', answer: 'Worldwide.' },
]

const TEAMWEAR_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'What should a football program send first?',
    answer:
      'A team sheet, a numbering font, sponsor artwork or a uniform you want matched. You do not need finished artwork. Most uniform programs begin with a color and a number font, and the panel layout is built around them. We develop the jersey and the padded trouser together.',
  },
  {
    // The owner's own answer of 2026-10-26 (fact 8a), word for word.
    question: 'Can each piece carry its own name and number?',
    answer:
      'Yes. Each piece can carry its own name and number, and they count toward the same minimum.',
  },
  {
    question: 'Which printing methods suit team kit?',
    answer:
      'Sublimation suits polyester and all-over designs, such as team jerseys. Heat transfer vinyl suits names and numbers. Embroidery suits logos and badges. On football jerseys, silicone printing adds raised numbers and marks with grip and depth.',
  },
  {
    question: 'What are the soccer jerseys made from?',
    answer:
      'The V-neck jersey is 100% polyester at 140 to 180 GSM. The Velocity Performance Jersey is 90% polyester and 10% spandex at 150 to 180 GSM. The polo-collar jersey is a 50/50 polyester and cotton blend at 160 to 220 GSM. The training bib is 100% polyester at 80 to 100 GSM.',
  },
  {
    question: 'Do we need a finished design to start a cycling order?',
    answer:
      'No. Most skinsuit programs start from a sponsor sheet, and our team builds the pattern and print layout around it. Bring a tech pack, race artwork, a competitor sample or a sketch.',
  },
  {
    question: 'Is a tennis design different for pickleball?',
    answer:
      'The cut stays the same. Only the place where teams want their marks changes. Tell us whether the shirt is for tennis, pickleball or both.',
  },
]

const ACTIVEWEAR_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'What do you need to know to make a sports bra?',
    answer:
      'Both the activity and the size range, before pattern work starts. Support comes from the two together, and a bra graded from one sample size is the commonest failure in this category.',
  },
  {
    question: 'Which fabrics do the activewear references use?',
    answer:
      'The cropped training top is 75% nylon and 25% spandex at 180 to 260 GSM. The sports bra is 95% nylon and 5% spandex at 200 to 240 GSM.',
  },
  {
    question: 'How are the activewear references printed?',
    answer:
      'DTF is on the pullover, the training jersey, the cropped training top and the zip-up vest. Screen printing is on the sports bra and the crop top. The sweatshirt uses digital printing. DTF is printed on film and heat-pressed on, and it works on most fabrics and colors.',
  },
  {
    question: 'What helps when you brief a training top?',
    answer:
      'Send a color story or a garment you want bettered, and say what session it is for: studio, lifting or running. For a jersey with two knits, decide which panels carry color and which carry texture, because the two knits read differently in the same shade.',
  },
  {
    question: 'Can you use recycled fabric?',
    answer:
      'Yes. The running shirt is 100% recycled polyester, and the zip-up vest is 85% recycled polyester with 15% spandex. We source recycled and organic fabrics from certified suppliers, and you get the certificates that prove it.',
  },
]

const OUTERWEAR_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'How heavy are the jackets?',
    answer:
      'The windbreaker and the longline jacket are nylon at 40 to 70 GSM and 40 to 90 GSM. The tech jacket is polyester at 220 to 260 GSM. The sherpa fleece jacket is 80% cotton and 20% polyester at 320 to 440 GSM. The leather jacket is measured by thickness, not by GSM.',
  },
  {
    question: 'How is a brand mark applied to a leather jacket?',
    answer:
      'It is screen-printed onto the hide, which holds a crisp edge on leather where a heat transfer would not survive the surface. Branding continues into the build itself: the panel splits, the stitching color and metal or embossed hardware all carry identity.',
  },
  {
    question: 'What do you need to start a leather jacket?',
    answer:
      'A tech pack, reference garments, hardware you want matched, or a written brief. A leather jacket is a hardware and construction program as much as a materials one.',
  },
  {
    question: 'What should a jacket brief say first?',
    answer:
      'How and where the jacket will be worn, such as training, commuting or outdoor use, and your colors. For a tech jacket the hood system and cuffs are discussed first.',
  },
]

const CASUAL_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'What are the casual pieces made from?',
    answer:
      'The crop hoodie is 98% recycled polyester and 2% spandex at 340 to 380 GSM. The tracksuit weighs 280 to 350 GSM. The half-zip fleece is 95% cotton and 5% spandex at 210 to 260 GSM. The lounge set is 65% cotton, 30% polyester and 5% spandex at 220 to 270 GSM. The half-zip polo is 90% nylon and 10% spandex at 140 to 180 GSM.',
  },
  {
    question: 'Can casual wear be made in organic cotton?',
    answer:
      'Yes. The tracksuit is 100% organic cotton, which is grown without synthetic pesticides or fertilizers. We source recycled and organic fabrics from certified suppliers, and you get the certificates that prove it.',
  },
  {
    question: 'What decides how a cropped hoodie fits?',
    answer:
      'Crop length and hood volume. Those two decisions define the garment, and a photograph of the look you want settles both faster than a spec sheet.',
  },
  {
    question: 'How do you develop a tracksuit or a lounge set?',
    answer:
      'We develop the hood and the pant as one set. Whether the top is a hood or a collar is the first decision, and it changes the pattern more than any other choice. For a lounge set, the polo collar and the width of the leg define the set.',
  },
  {
    question: 'Which decoration suits the polo?',
    answer:
      'Sublimation suits an all-over or tonal design. Embroidery suits a crest that should look stitched rather than printed.',
  },
]

/*
 * ⚠️ THE BALL'S NUMBERS LIVE ON ITS 3D PAGE, IN THE CMS (owner, 2026-10-31, "nothing said twice").
 * The owner confirmed the lab tests and ruled the wording "according to FIFA Quality Pro"; the ball
 * holds no FIFA licence, so no FIFA mark is drawn and the answer below says so, because a mark is
 * what a FIFA competition requires (IFAB Law 2; FIFA Quality Programme page, 10 February 2026).
 */
const BALL_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'What size is the Kaizen?',
    answer: 'Size 5, with a 69 cm circumference. The Laws of the Game allow 68 to 70 cm.',
  },
  {
    question: 'Is the Kaizen FIFA licensed?',
    answer:
      'No. It is lab tested according to FIFA Quality Pro limits, and it does not carry a FIFA mark. Competitions that require a mark need a licensed ball.',
  },
  {
    question: 'What is Trinity Technology?',
    answer:
      'Our name for building one ball in four stages. Panels are thermobonded, then machine stitched. The last panel is closed by hand, and the seams are then sealed.',
  },
]

const ACCESSORIES_QUESTIONS: readonly FamilyPageQuestion[] = [
  {
    question: 'Which accessories can we see in 3D?',
    answer:
      'The Kaizen soccer ball, in five colors. For bags, caps, socks and gloves, tell us what you need and we will talk you through it.',
  },
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
    questions: [...TEAMWEAR_QUESTIONS, ...SHARED_QUESTIONS],
    closingHeading: 'Have a team that needs kit?',
  },
  /*
   * ⚠️ "ACTIVEWEAR" LEADS, NOT "SPORTSWEAR", AND THE ADDRESS SAYS SO (owner, 2026-09-30).
   * The home page's title aims at "private label sportswear manufacturer" (since 2026-10-23); a
   * second page aiming at the same words would compete with it in the same results.
   *
   * "PRIVATE LABEL" LEADS THE TITLE (owner, 2026-10-23). Search Console, 90 days to 21 Oct: Google
   * sent "private label activewear" and "private label sportswear manufacturer pakistan" to the
   * casual-wear page (positions 60–90), the only page whose title said "private label". It was
   * "Custom Activewear & Sportswear Manufacturer"; "& Sportswear" went because the title has to
   * keep "Manufacturer" (the word buyers type) and fit 60 characters with the brand.
   */
  {
    path: '/custom-activewear-manufacturer',
    familySlug: 'sportswear',
    title: 'Private Label Activewear Manufacturer',
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
    questions: [...ACTIVEWEAR_QUESTIONS, ...SHARED_QUESTIONS],
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
    questions: [...OUTERWEAR_QUESTIONS, ...SHARED_QUESTIONS],
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
    questions: [...CASUAL_QUESTIONS, ...SHARED_QUESTIONS],
    closingHeading: 'Have a range that needs making?',
  },
  {
    path: '/custom-sports-accessories-manufacturer',
    familySlug: 'sports-accessories',
    title: 'Custom Sports Accessories Manufacturer',
    description: `Custom sports accessories under your own label: soccer balls, bags, caps, socks and gloves, from ${MINIMUM} pieces per style. Made in Sialkot, Pakistan.`,
    eyebrow: `[ Sports Accessories · From ${MINIMUM} pieces per style ]`,
    heading: 'Custom sports accessories,',
    headingWideWord: true,
    headingAccent: 'made under your label.',
    lede: `RUN APPAREL makes custom sports accessories in Sialkot, Pakistan, from ${MINIMUM} pieces per style: the supporting pieces that finish a program, under your own label.`,
    makesHeading: 'What we make',
    makes: [
      {
        group: 'Soccer balls',
        garments: 'The Kaizen, a 16-panel pro match ball in size 5.',
        href: '/custom-soccer-ball-manufacturer',
      },
      { group: 'Bags and backpacks', garments: 'Team and training bags.' },
      { group: 'Caps and headwear', garments: 'Caps and other headwear.' },
      { group: 'Socks and gloves', garments: 'Socks and gloves for your program.' },
    ],
    stepsHeading: 'How an accessories order works',
    questions: [...ACCESSORIES_QUESTIONS, ...SHARED_QUESTIONS],
    closingHeading: 'Have a program to finish?',
    garmentsLede:
      'Each product below has its own 3D page. Turn it, zoom in and check the print and the specification. Share the link with your team before anyone pays for a sample.',
  },
  {
    path: '/custom-soccer-ball-manufacturer',
    familySlug: 'sports-accessories',
    title: 'Custom Soccer Ball Manufacturer, Private Label',
    description: `Custom soccer balls made in Sialkot, Pakistan, under your own label from ${MINIMUM} pieces. Choose your logo, colors, artwork and materials. See the ball in 3D first.`,
    eyebrow: `[ Soccer Balls · From ${MINIMUM} pieces per style ]`,
    heading: 'Custom soccer balls,',
    headingAccent: 'made to your spec.',
    lede: `RUN APPAREL makes pro match soccer balls under your label in Sialkot, Pakistan, with orders from ${MINIMUM} pieces. Turn the Kaizen in 3D, check every panel, then tell us what to change: the logo, the colors, the full artwork, the materials or the size.`,
    makesHeading: 'What you can change',
    makes: [
      { group: 'Your logo', garments: 'Your team, club or brand logo on the panels.' },
      { group: 'Colors', garments: 'Colors beyond the five shown in 3D.' },
      { group: 'Full artwork', garments: 'A new design across all 16 panels.' },
      { group: 'Materials and size', garments: 'Other covers, foam, bladders or sizes.' },
    ],
    stepsHeading: 'How a ball order works',
    questions: [...BALL_QUESTIONS, ...SHARED_QUESTIONS],
    closingHeading: 'Have a ball to make?',
    productLine: { words: /\bball\b/i },
    garmentsLede:
      'Turn the Kaizen, zoom in and check the print on every panel. Its page lists the full specification. Share the link with your team before anyone pays for a sample.',
  },
]

/**
 * The guides a buyer page lists beside the order guide, by address (`guides.ts` holds their words).
 *
 * Printing and fabrics on every page (owner, 2026-10-08). The country comparison on every page and
 * the start-up cost guide on the activewear page joined on 2026-10-23 (owner's yes): a crawl that
 * day found 2 internal links to each, against 8–9 for the others, and a page few pages link to is
 * one Google reads rarely.
 */
const RANGE_GUIDE_PATHS = [
  '/guides/garment-printing-methods',
  '/guides/sportswear-fabrics-and-weights',
  '/guides/pakistan-vs-china-vs-turkey',
] as const

/** The printing and fabric guides speak of cloth, so the ball page keeps only the country guide. */
const BALL_GUIDE_PATHS = ['/guides/pakistan-vs-china-vs-turkey'] as const

const FAMILY_GUIDE_PATHS: Readonly<Record<string, readonly string[]>> = {
  sportswear: ['/guides/cost-to-start-an-activewear-brand'],
}

export function rangeGuidePaths(page: FamilyPage): readonly string[] {
  if (page.productLine) return BALL_GUIDE_PATHS
  return [...RANGE_GUIDE_PATHS, ...(FAMILY_GUIDE_PATHS[page.familySlug] ?? [])]
}

/** The buyer page for a family, or null when the owner has not approved one yet. */
export function familyPageFor(family: Family): FamilyPage | null {
  return FAMILY_PAGES.find((page) => page.familySlug === family.slug && !page.productLine) ?? null
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
 * addresses forward (`familyFilterForward`).
 */
export function familyHref(family: Family): string {
  return familyPageFor(family)?.path ?? `/products#${family.slug}`
}

/**
 * What a family with nothing to show says, in the owner's words: "[ ask us ]" since 2026-10-17
 * (home page audit, Q13: these are made today, only their 3D pages are missing), "[ soon ]" from
 * Q21 (2026-10-04) until then, which read as "not made yet" beside a real backpack photo. Its group on the products page and its card on the home page
 * both read these (polish F8), so the two cannot drift apart. The card goes straight to Contact:
 * its group holds no garments, and a buyer who clicked a picture of backpacks met an empty list.
 */
export const FAMILY_SOON = {
  label: '[ ask us ]',
  ask: 'Ask what we make',
  href: '/contact',
} as const

/**
 * Whether a family says "[ ask us ]": no page AND no garment yet (today, Sports Accessories). Once a
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
