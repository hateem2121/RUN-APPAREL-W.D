import { COUNTRY_NAME, formatAddress, POSTAL_ADDRESS } from '@run-apparel/shared'
import {
  CUTTING_LINES,
  FACTS,
  LEGAL_NAME,
  LEAD_TIME,
  PARENT_COMPANY,
  PRECISION_MACHINES,
  SHIPS_TO,
} from './companyFacts'
import { FAMILY_SINCE } from './press'
import { POLICIES } from './policies'

/**
 * The words of /about and /inside-the-factory (the about-factory build, 2026-10-09).
 *
 * ⚠️ THE OWNER APPROVED EVERY WORD ON 2026-10-09 (11:50), from drafts that showed each edit old
 * beside new, plain-English edits included. Nothing here may
 * state a fact the owner has not given. `siteFacts.test.ts` walks this file like the other copy
 * modules, and refuses the capacity and floor-area figures typed in the source: numbers come
 * from `companyFacts.ts` (`FACTS`, `PRECISION_MACHINES`, `CUTTING_LINES`), never retyped.
 *
 * ⚠️ 1889 IS THE FAMILY'S START, NEVER A FOUNDING DATE, and no year count is stated anywhere —
 * both are owner rulings the copy guard holds.
 *
 * The two pages' shapes are their own (a timeline, five stages, gallery sets): they do not fit
 * `CompanyPage`'s section blocks, which is why this module exists beside `companyPages.ts`. The
 * paths themselves are registered in `COMPANY_PATHS` there, so the route ↔ list ↔ sources checks
 * keep one source of truth.
 */

/** The value of a `FACTS` entry, by the first word of its label (`press.ts`'s `fact`). */
const factValue = (prefix: string): string =>
  FACTS.find((fact) => fact.label.startsWith(prefix))?.value ?? ''

const PEOPLE = factValue('People')
const CAPACITY = factValue('Pieces per month')
const FLOOR = factValue('Sq m')
const MINIMUM = factValue('Minimum')
const SAMPLE_DAYS = factValue('Working days')

export type TimelineEntry = {
  /** The card's range, as the deck writes it: "1889", "1904–1980". */
  readonly year: string
  readonly title: string
  readonly body: string
}

export type Stage = {
  readonly title: string
  readonly body: string
  /** The checkpoint badge, an approved sentence fragment. */
  readonly badge: string
  /** The room photos this stage shows (`factoryPhotos.ts`); stage 3 shows a drawn panel. */
  readonly photos: readonly string[]
}

export type GallerySet = {
  readonly label: string
  readonly photos: readonly string[]
}

/** The /about page's own words. The hero's two parts sit either side of its card (8.3). */
export const ABOUT_PAGE = {
  path: '/about',
  title: 'About us: family makers in Sialkot since 1889',
  description: `The OEM/ODM apparel division of ${PARENT_COMPANY} — private label sportswear from Sialkot, Pakistan, made by a family manufacturing and exporting since ${FAMILY_SINCE}.`,
  hero: {
    partLeft: 'SINCE 1889',
    partRight: 'STILL',
    /** The one serif-accent word, lowercase italic as the accent always is. */
    accent: 'running',
    subtitle: `Private label sportswear from Sialkot, Pakistan. The family behind it has made and exported from this city since ${FAMILY_SINCE}.`,
  },
  quickAnswer: `Since 1889, one family in Sialkot has made gear for the world's athletes — first leather footballs/soccer balls, today performance fabric. RUN APPAREL is that family's apparel division. We engineer and export private label sportswear for partners who go the extra mile.`,
  /** The mission, word for word (owner): rendered as a quote the readability test skips. */
  mission:
    'To empower global partners with sustainable, high-performance apparel that drives unity, endurance, and excellence — combining ethical craftsmanship with technological precision.',
  whatWeMake: {
    lead: 'We make more than athletic wear. Our core categories are',
    links: [
      { name: 'teamwear', href: '/custom-teamwear-manufacturer' },
      { name: 'activewear', href: '/custom-activewear-manufacturer' },
      { name: 'casual wear', href: '/private-label-casual-wear-manufacturer' },
      { name: 'outerwear', href: '/custom-outerwear-manufacturer' },
    ],
    close: 'and sports accessories — all made to the same standard.',
  },
  /** Decorative, aria-hidden; the same words appear in real text in `whatWeMake`. */
  marquee: ['TEAMWEAR', 'ACTIVEWEAR', 'CASUAL WEAR', 'OUTERWEAR', 'SPORTS ACCESSORIES'] as const,
  timeline: {
    label: '[ 1889 — TODAY ]',
    heading: 'The long run.',
    entries: [
      {
        year: '1889',
        title: 'The first ball.',
        body: "Allah Ditta Ghafuree, a Sialkot leather artisan, begins the family's craft. He shapes leather footballs by hand, in the city that would become the world's sports-goods hub.",
      },
      {
        year: '1904',
        title: 'A workshop becomes an industry.',
        body: 'The business takes the name Ghafuree Industries. Alum-chrome tanning, leather stretching frames and ball lamination set new standards for every ball that follows.',
      },
      {
        year: '1904–1980',
        title: 'The scale years.',
        // The owner's own words, 2026-10-09, verbatim: nothing added back (no "leads for 76
        // years", no worker count — both ruled out).
        body: "Allah Ditta Ghafuree helps scale Pakistan's daily football output to 200,000. His sons extend the reach: Sandal Trading Corporation in 1942, Loyal Sports in 1952 — exporting to Europe by 1958.",
      },
      {
        year: '1956–1992',
        title: 'Engineering the modern ball.',
        body: 'M. Iqbal Sandal joins Loyal Sports in 1956. PU-on-leather bonding, synthetic laminated footballs and fiber-texture lamination make balls that are perfectly round. These methods help bring the world’s leading football brands to Pakistani manufacturing.',
      },
      {
        year: '1992',
        title: 'Durus.',
        body: `The family brings its businesses together as one: ${PARENT_COMPANY}. In Arabic, "Durus" means strength, durability and endurance.`,
      },
      {
        year: 'Today',
        title: 'RUN.',
        body: 'Durus spins off RUN APPAREL as an apparel division of its own, separate from sports equipment. It is built for athletic brands, teams, corporate programs and fitness organizations. The fourth generation of the family leads the company today. The city is the same; the standard is too.',
      },
    ] as const satisfies readonly TimelineEntry[],
  },
  people: {
    label: '[ THE PEOPLE ]',
    heading: 'Four generations on.',
    /** The owner's card: a name card with no photo (owner, 2026-10-09). */
    name: {
      name: 'M. Hateem Jamshaid Iqbal',
      role: 'Leadership',
      line: 'Fourth generation of the founding family',
    },
    cards: [
      { title: 'Merchandising', body: 'One point of contact from tech pack to shipment.' },
      {
        title: 'Production',
        body: `Three cutting lines, ${PRECISION_MACHINES.value} precision machines, and a checkpoint at every stage.`,
      },
      {
        title: 'HR',
        body: `${PEOPLE} skilled people work here in one team: artisans, engineers, designers and production specialists.`,
      },
    ] as const,
  },
  /** The count-up band: every figure from a constant, label first on the year (VA-58). */
  factsBand: [
    { label: 'Manufacturing since', value: FAMILY_SINCE, labelFirst: true },
    { label: 'People at the works', value: PEOPLE },
    { label: PRECISION_MACHINES.label, value: PRECISION_MACHINES.value },
    { label: CUTTING_LINES.label, value: CUTTING_LINES.value },
    { label: 'Pieces per month', value: CAPACITY },
    { label: 'Sq m under roof', value: FLOOR },
  ] as const,
  /** The `<dl>` table's rows, every value from a constant or the shared address. */
  factsTable: [
    { term: 'Legal name', detail: LEGAL_NAME },
    { term: 'Parent company', detail: PARENT_COMPANY },
    { term: 'Headquarters', detail: formatAddress() },
    { term: 'Business model', detail: 'OEM/ODM private label manufacturing' },
    { term: 'Capacity', detail: `${CAPACITY} pieces per month` },
    {
      term: 'Minimum order',
      detail: `${MINIMUM} pieces per style is our standard minimum. Fewer is possible at a higher price per piece.`,
    },
    { term: 'Sampling', detail: `${SAMPLE_DAYS} working days to a sample` },
    { term: 'Ships to', detail: SHIPS_TO },
    { term: 'Lead time', detail: LEAD_TIME },
  ] as const,
  certificates: {
    heading: 'Our certification ecosystem',
    // The lines and the closing promise come from `companyFacts.ts` at render time, marked
    // `data-facts` as the policies hub marks them.
  },
  crossLink: { name: "See how it's made", href: '/inside-the-factory' },
} as const

/**
 * The environmental policy's four commitment lines, read from the policy's own list so the two
 * pages can never disagree (the words live once, in `policies.ts`, approved 2026-10-07).
 */
export const ENVIRONMENTAL_LINES: readonly string[] = (() => {
  const policy = POLICIES.find((entry) => entry.path === '/policies/environmental')
  const commit = policy?.sections.find((section) => section.id === 'commit')
  const list = commit?.blocks.find((block) => block.kind === 'list')
  return list?.kind === 'list' ? list.items : []
})()

/** The /inside-the-factory page's own words. */
export const FACTORY_PAGE = {
  path: '/inside-the-factory',
  title: 'Inside the factory: manufacturing in Sialkot',
  description: `Cutting, printing, stitching, QC and packing in a ${FLOOR} sq m Sialkot facility, with about 80% of its electricity from solar. Five stages, five checkpoints.`,
  /** The mono label over the hero, built from the shared address constant (never typed). */
  label:
    `[ ${POSTAL_ADDRESS.street} · ${POSTAL_ADDRESS.locality} · ${COUNTRY_NAME} ]`.toUpperCase(),
  hero: {
    /** The words before the accent; the page draws `heading` + `accent` as one headline. */
    heading: 'Inside the',
    accent: 'factory',
    subtitle:
      'Every order moves through five stages, and each stage has its own checkpoint. This is how private label sportswear gets made.',
  },
  walkthrough: {
    heading: 'Five stages. Five checkpoints.',
    stages: [
      {
        title: 'Pre-Production & Planning',
        body: 'We talk through your needs, prototype virtually, source certified materials, and approve the sample together.',
        badge: 'Tech pack approved.',
        photos: ['showroom'],
      },
      {
        title: 'Material Preparation & Sourcing',
        body: 'Incoming fabric is checked for colorfastness, shrinkage and tensile strength, and pre-treated before anything reaches the floor.',
        badge: 'Materials approved for the floor.',
        photos: ['lab'],
      },
      {
        title: 'Cutting & Initial Processing',
        body: 'Patterns are nested by algorithm to use 90–95% of the material, then cut automatically.',
        badge: 'Dimensional accuracy verified.',
        // No cutting photo yet (owner, 2026-10-09): the stage shows a drawn panel, and Cutting
        // returns to the gallery when the owner sends photos.
        photos: [],
      },
      {
        title: 'Assembly, Finishing & Customization',
        body: 'Garments are sewn with overlock, cover-stitch and flatlock seams, reinforced and finished. Sublimation printing and precision embroidery add the custom work.',
        badge: 'Assembly quality verified.',
        photos: ['stitching', 'screen-printing'],
      },
      {
        title: 'Quality Assurance, Packaging & Delivery',
        body: 'Every batch is inspected in line and again at AQL final inspection. Rework, labels and traceability records follow, and feedback keeps improving the process.',
        badge: 'Batch accepted, shipment authorized.',
        photos: ['inspection', 'final-check', 'tagging', 'packing'],
      },
    ] as const satisfies readonly Stage[],
    /** After the stages, the site keeps telling the order one way (D23, X21): the guide's steps. */
    close: {
      text: 'These five stages happen inside one building. The steps you take as a buyer, from first message to shipment, are in',
      linkName: 'How a private label order works',
      href: '/guides/how-a-private-label-order-works',
    },
  },
  /** Decorative, aria-hidden; the same words appear as the stage titles. */
  marquee: ['PRE-PRODUCTION', 'MATERIALS', 'CUTTING', 'ASSEMBLY', 'QC & PACKING'] as const,
  gallery: {
    heading: 'Walk the floor.',
    // No captions anywhere (owner, 2026-10-05, confirmed 2026-10-09): labels name each set.
    sets: [
      { label: 'Printing', photos: ['screen-printing'] },
      { label: 'Stitching', photos: ['stitching'] },
      { label: 'Quality Control', photos: ['inspection', 'final-check', 'lab'] },
      { label: 'Packing', photos: ['tagging', 'packing'] },
      { label: 'The Building', photos: ['exterior'] },
    ] as const satisfies readonly GallerySet[],
  },
  howWeRunIt: {
    label: '[ FOR A BETTER TOMORROW ]',
    heading: 'How we run it',
    stat: 'About 80%',
    statWords: "of the factory's electricity comes from the solar panels on our roof",
    lines: ENVIRONMENTAL_LINES,
    link: { name: 'Our environmental policy', href: '/policies/environmental' },
  },
  crossLink: { name: 'Our story since 1889', href: '/about' },
} as const

/** The pages' paths, for `COMPANY_PATHS` to register (one source of truth, `companyPages.ts`). */
export const ABOUT_FACTORY_PATHS: readonly string[] = [ABOUT_PAGE.path, FACTORY_PAGE.path]
