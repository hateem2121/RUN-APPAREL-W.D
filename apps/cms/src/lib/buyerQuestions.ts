import type { GuideLink } from './guides'

/**
 * What sportswear buyers asked us in 2026 (the buyer library's C7, every word owner approved on
 * 6 Nov 2026). ONE LIST feeds everything the page draws from the counts, the way `BALL_SIZES`
 * (`guideTools.ts`) feeds the ball table and its lookup: the bar chart, the results table, the
 * rules table and the CSV file. Edit a count here and all four change together.
 *
 * ⚠️ EVERY COUNT IS THE OWNER'S APPROVED NUMBER (his rule, 6 Nov 2026: "the owner approves every
 * number before it goes live"; approved 8 Nov 2026, question tool, round 3). Counted by the main
 * session from the website form and the inquiry mailboxes, 1 January to 8 November 2026: 20
 * inquiries. WhatsApp is NOT counted (owner, 8 Nov 2026: "Email + form only"), and the page says
 * so. Change a count only with a recount and the owner's yes; `heldGuideGaps.test.ts` keeps every
 * gap marker off the page.
 *
 * ⚠️ NEVER PUT ANYTHING BUT A TOPIC COUNT HERE. The page publishes one thing from each inquiry,
 * the topics it asked about; names, companies, countries and words stay in the records.
 */

/** Below this a count is hidden and marked "fewer than 3" (UK Analysis Function guidance, B2). */
export const SMALL_COUNT = 3

/** The gap marker the page shows for a count nobody has sent yet. */
export const COUNT_GAP = '[COUNT]'

/** The end of the counting window, as the page words it ("1 January 2026 and 10 October 2026"). Owed. */
export const COUNT_DATE: string | null = '8 November 2026'
/**
 * The same day as COUNT_DATE, as an ISO date ("2026-10-10"), for the Dataset's `temporalCoverage`
 * (Google: an ISO 8601 interval). Owed with COUNT_DATE; `structuredData.test.ts` holds the two together.
 */
export const COUNT_DATE_ISO: string | null = '2026-11-08'
/** The counting window's first day (owner, 6 Nov 2026: "1 January 2026 to the count day"). */
export const WINDOW_START_ISO = '2026-01-01'

/** WhatsApp is not counted (owner, 8 Nov 2026: "Email + form only"); the page says so in words. */
export const WHATSAPP_TOPICS_COUNTED = false

/** The download's file name (the main session's call, 6 Nov 2026); the file is `buyer-questions.csv`. */
export const CSV_FILE_NAME = 'run-apparel-buyer-questions-2026.csv'
export const CSV_PATH = '/guides/what-sportswear-buyers-ask/buyer-questions.csv'

export type BuyerQuestion = {
  readonly topic: string
  /** Inquiries that asked about the topic, or null while the count is owed. */
  readonly count: number | null
  /** The rule from the draft's table: when an inquiry counts here. */
  readonly rule: string
  /** The guide that answers the topic ("one topic, one URL"), as the draft names it. */
  readonly guide: { readonly label: string; readonly path: string }
}

const GUIDE = {
  minimumOrder: {
    label: 'Minimum order and samples guide',
    path: '/guides/minimum-order-and-samples',
  },
  cost: { label: 'Cost guide', path: '/guides/cost-to-start-an-activewear-brand' },
  order: { label: 'Order process guide', path: '/guides/how-a-private-label-order-works' },
  shipping: { label: 'Shipping guide', path: '/guides/shipping-and-import-duties' },
  fabrics: { label: 'Fabrics guide', path: '/guides/sportswear-fabrics-and-weights' },
  printing: { label: 'Printing guide', path: '/guides/garment-printing-methods' },
  labels: { label: 'Labels guide', path: '/guides/clothing-labels' },
  patterns: { label: 'Pattern-making guide', path: '/guides/sportswear-pattern-making' },
  vetting: { label: 'Vetting guide', path: '/guides/how-to-vet-a-clothing-manufacturer' },
  inspection: { label: 'Inspection guide', path: '/guides/aql-inspection' },
  compliance: { label: 'Compliance guide', path: '/guides/sportswear-compliance-by-market' },
  balls: { label: 'Soccer-ball guide', path: '/guides/how-soccer-balls-are-made' },
  kits: { label: 'Team kits guide', path: '/guides/how-to-order-team-kits' },
} as const

/** The 15 topics, in the draft's order ("the order shown here is the plan, not a finding"). */
export const BUYER_QUESTIONS: readonly BuyerQuestion[] = [
  {
    topic: 'Minimum order',
    count: 20,
    rule: 'the smallest order, or how it splits across styles, colors and sizes',
    guide: GUIDE.minimumOrder,
  },
  {
    topic: 'Price per piece',
    count: 19,
    rule: 'a unit price, or how price changes with quantity',
    guide: GUIDE.cost,
  },
  {
    topic: 'Samples',
    count: 20,
    rule: 'a sample’s cost, time, or credit against the order',
    guide: GUIDE.minimumOrder,
  },
  {
    topic: 'Lead time',
    count: 18,
    rule: 'how long sampling or production takes',
    guide: GUIDE.order,
  },
  {
    topic: 'Shipping and import duty',
    count: 18,
    rule: 'freight, delivery terms, duty or who imports the goods',
    guide: GUIDE.shipping,
  },
  {
    topic: 'Fabrics and fibers',
    count: 19,
    rule: 'a fabric, its composition, weight, swatches or fabric tests',
    guide: GUIDE.fabrics,
  },
  {
    topic: 'Printing and decoration',
    count: 15,
    rule: 'a print method, patches or other decoration',
    guide: GUIDE.printing,
  },
  {
    topic: 'Labels, trims and packaging',
    count: 16,
    rule: 'labels, hang tags, zippers, cords, packaging or the buyer’s own trims',
    guide: GUIDE.labels,
  },
  {
    topic: 'Sizing, patterns and tech packs',
    count: 13,
    rule: 'size charts, grading, patterns or help with a tech pack',
    guide: GUIDE.patterns,
  },
  {
    topic: 'Checking the factory',
    count: 9,
    rule: 'the company’s registration, audits, ownership, address or payment safety',
    guide: GUIDE.vetting,
  },
  {
    topic: 'Quality, inspection and testing',
    count: 7,
    rule: 'inspection, defect limits, lab tests or remakes',
    guide: GUIDE.inspection,
  },
  {
    topic: 'Stock blanks and dropshipping',
    count: 4,
    rule: 'ready stock, blank garments or sending single orders',
    guide: GUIDE.order,
  },
  {
    topic: 'Rules by market',
    count: 2,
    rule: 'labeling laws, chemical rules or children’s products',
    guide: GUIDE.compliance,
  },
  {
    topic: 'Soccer balls',
    count: 0,
    rule: 'any question about balls',
    guide: GUIDE.balls,
  },
  {
    topic: 'Team kits',
    count: 0,
    rule: 'kit for a club, academy or school, or names and numbers',
    guide: GUIDE.kits,
  },
]

/** The last row's label, and its count: every inquiry counted, whatever its topics. */
export const ALL_INQUIRIES_TOPIC = 'All inquiries counted'
export const TOTAL_INQUIRIES: number | null = 20

/** A count as the table and the file show it: the gap marker, "fewer than 3", or the number. */
export function countCell(count: number | null): string {
  if (count === null) return COUNT_GAP
  return count < SMALL_COUNT ? `fewer than ${SMALL_COUNT}` : String(count)
}

/**
 * A share as the table shows it: a whole-tenth percent written with the word ("12.5 percent", as
 * the draft writes "100 percent"), the gap marker while a count is owed, and "fewer than 3" with
 * the count it belongs to.
 */
export function shareCell(count: number | null, total: number | null): string {
  if (count === null || total === null) return COUNT_GAP
  if (count < SMALL_COUNT) return `fewer than ${SMALL_COUNT}`
  const tenths = Math.round((count / total) * 1000) / 10
  return `${tenths} percent`
}

/** The results table's rows: topic, count, share, and the guide that answers it. */
export function buyerQuestionRows(
  questions: readonly BuyerQuestion[] = BUYER_QUESTIONS,
  total: number | null = TOTAL_INQUIRIES,
): string[][] {
  return [
    ...questions.map((row) => [
      row.topic,
      countCell(row.count),
      shareCell(row.count, total),
      row.guide.label,
    ]),
    [ALL_INQUIRIES_TOPIC, countCell(total), '100 percent', ''],
  ]
}

/** The guide names in the results table, each linked in every row that names it. */
export function buyerQuestionLinks(): GuideLink[] {
  const seen = new Map<string, GuideLink>()
  for (const row of BUYER_QUESTIONS) {
    seen.set(row.guide.label, { phrase: row.guide.label, href: row.guide.path })
  }
  return [...seen.values()]
}

/** The rules table's rows: topic, and when an inquiry counts there. */
export function buyerRuleRows(): string[][] {
  return BUYER_QUESTIONS.map((row) => [row.topic, row.rule])
}

/** One cell of a CSV file (RFC 4180): quoted when it holds a comma, a quote or a line break. */
function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value
}

/**
 * The CSV file the page offers, from the same list as the table. A count still owed is an EMPTY
 * cell, never the table's "[COUNT]" marker (a spreadsheet would read that as text), and a small
 * count says "fewer than 3" as the table does.
 */
export function buyerQuestionsCsv(
  questions: readonly BuyerQuestion[] = BUYER_QUESTIONS,
  total: number | null = TOTAL_INQUIRIES,
): string {
  const cell = (count: number | null, text: string) => (count === null ? '' : text)
  const rows: string[][] = [
    ['Topic', 'Inquiries that asked', 'Share of all inquiries'],
    ...questions.map((row) => [
      row.topic,
      cell(row.count, countCell(row.count)),
      row.count === null || total === null ? '' : shareCell(row.count, total),
    ]),
    [ALL_INQUIRIES_TOPIC, cell(total, countCell(total)), '100 percent'],
  ]
  return `${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
}

/**
 * The chart's bars: each topic's share of the largest count, 0 to 1, or null while a count is owed
 * or hidden. A bar is drawn from the table's own number; a hidden small count has no bar.
 */
export function chartBars(
  questions: readonly BuyerQuestion[] = BUYER_QUESTIONS,
): { topic: string; label: string; ratio: number | null }[] {
  const known = questions.flatMap((row) =>
    row.count !== null && row.count >= SMALL_COUNT ? [row.count] : [],
  )
  const largest = Math.max(0, ...known)
  return questions.map((row) => ({
    topic: row.topic,
    label: countCell(row.count),
    ratio:
      row.count !== null && row.count >= SMALL_COUNT && largest > 0 ? row.count / largest : null,
  }))
}
