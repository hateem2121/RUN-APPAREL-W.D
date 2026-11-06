import { buildXlsx, type Cell, type CellStyle, columnName, type Sheet } from './xlsxWriter'

/**
 * The free tech-pack template (C1, owner approved every word on 6 Nov 2026).
 *
 * A blank tech pack with a page for each part, to fill in and send with an inquiry. The twelve pages
 * and what each holds are the guide's own list (`/guides/tech-pack-template`, "The free template");
 * `techPackTemplate.test.ts` holds the two to the same names in the same order, so the page can never
 * promise a page the file lacks.
 *
 * ⚠️ NO TOLERANCE FIGURES AND NO SIZE CHART. No neutral source publishes tolerances, so the column
 * says "Agreed for your order" (editorial call, approved); the sizes are left for the buyer.
 * ⚠️ THE LICENCE IS THE OWNER'S WORDS (6 Nov 2026): "Free to use for your own products; all rights
 * reserved." It is on the cover and in every printed page's footer.
 * ⚠️ AMERICAN SPELLING, as on the website (owner, 2026-09-04): color, colorway, centimeters.
 */

export const TEMPLATE_FILE_NAME = 'RUN-APPAREL-tech-pack-template.xlsx'
export const TEMPLATE_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
export const TEMPLATE_LICENCE =
  '© RUN APPAREL. Free to use for your own products; all rights reserved.'
/** The day the template's words were approved: the file's date, fixed so its bytes never drift. */
const TEMPLATE_DATE = '2026-11-06T00:00:00Z'

/** The twelve pages, in the guide's order. Each name is the guide's list item before its colon. */
export const TEMPLATE_PAGES = [
  'Cover',
  'Flats',
  'Bill of materials',
  'Colorways',
  'Artwork and placement',
  'Measurements',
  'Construction',
  'Labels',
  'Packing',
  'Tests',
  'Sample comments',
  'Revision log',
] as const

const c = (text: string, style: CellStyle = 'plain'): Cell => ({ text, style })
const blank = (style: CellStyle): Cell => ({ text: '', style })

/** A label needs about this many characters of width to sit on one line. */
const LABEL_WIDTH = 24

/** The first column at or after `from` where the columns since `from` add up to `wide` characters. */
function spanEnd(widths: readonly number[], from: number, wide: number): number {
  let sum = 0
  for (let i = from; i < widths.length; i++) {
    sum += widths[i] as number
    if (sum >= wide) return i + 1
  }
  return widths.length
}

const range = (from: number, to: number, row: number) =>
  `${columnName(from)}${row}:${columnName(to - 1)}${row}`

/**
 * The band and the style line every page starts with, two rows kept on screen and on paper. The style
 * line names the garment, so a printed page never loses it. Each label spans as many columns as it
 * needs: on a page whose first column is a narrow "No.", one column cut "Style name and number" to
 * "Style name" (LibreOffice render, 6 Nov 2026).
 */
function top(
  number: number,
  name: string,
  widths: readonly number[],
): { rows: Cell[][]; merges: string[]; tall: boolean } {
  const width = widths.length
  const band: Cell[] = [c(`RUN APPAREL  ·  Tech pack template  ·  ${number}. ${name}`, 'band')]
  for (let i = 1; i < width; i++) band.push(blank('band'))
  // Two labels, each with a cell to write in, need four columns at the least.
  if (width < 4) throw new Error(`page ${number} needs 4 columns for its style line, has ${width}`)
  const total = widths.reduce((a, b) => a + b, 0)
  const labelEnd = Math.min(width - 3, spanEnd(widths, 0, LABEL_WIDTH))
  const middle = Math.min(width - 2, Math.max(labelEnd + 1, spanEnd(widths, 0, total / 2)))
  const revisionEnd = Math.min(
    width - 1,
    Math.max(middle + 1, spanEnd(widths, middle, LABEL_WIDTH)),
  )
  const style: Cell[] = []
  for (let i = 0; i < width; i++) {
    if (i === 0) style.push(c('Style name and number', 'label'))
    else if (i === middle) style.push(c('Revision number and date', 'label'))
    else if (i < labelEnd || (i > middle && i < revisionEnd)) style.push(blank('label'))
    else style.push(blank('input'))
  }
  const merges = [range(0, width, 1)]
  for (const [from, to] of [
    [0, labelEnd],
    [labelEnd, middle],
    [middle, revisionEnd],
    [revisionEnd, width],
  ] as const) {
    if (to - from > 1) merges.push(range(from, to, 2))
  }
  // Where a label's columns are still narrower than it, the row takes two lines rather than cut it.
  const sum = (from: number, to: number) => widths.slice(from, to).reduce((a, b) => a + b, 0)
  const tall = Math.min(sum(0, labelEnd), sum(middle, revisionEnd)) < LABEL_WIDTH
  return { rows: [band, style], merges, tall }
}

/** Lines a header needs in its column, at about one character per unit of width (bold Arial 10). */
const headerHeight = (text: string, width: number) =>
  Math.max(18, Math.ceil(text.length / Math.max(width - 1, 1)) * 12.5 + 5)

/** A table: one header row, then `count` empty rows (or the given first-column labels). */
function table(headers: readonly string[], count: number, labels: readonly string[] = []): Cell[][] {
  const rows: Cell[][] = [headers.map((h) => c(h, 'header'))]
  const n = Math.max(count, labels.length)
  for (let r = 0; r < n; r++) {
    const label = labels[r]
    rows.push(
      headers.map((_, i) =>
        i === 0 && label !== undefined ? c(label, 'label') : blank('input'),
      ),
    )
  }
  return rows
}

/** Two columns: a label and the buyer's answer, merged across the rest of the page. */
function fields(labels: readonly string[], width: number, startRow: number): {
  rows: Cell[][]
  merges: string[]
} {
  const last = columnName(width - 1)
  const rows: Cell[][] = []
  const merges: string[] = []
  labels.forEach((label, i) => {
    const row: Cell[] = [c(label, 'label')]
    for (let k = 1; k < width; k++) row.push(blank('input'))
    rows.push(row)
    merges.push(`B${startRow + i}:${last}${startRow + i}`)
  })
  return { rows, merges }
}

const spacer = (): Cell[] => []

function page(
  number: number,
  widths: number[],
  body: (start: number) => {
    rows: Cell[][]
    merges?: string[]
    heights?: Record<number, number>
    breaks?: number[]
  },
): Sheet {
  const name = TEMPLATE_PAGES[number - 1] as string
  const head = top(number, name, widths)
  // Body rows start on row 4 (row 3 is a spacer), numbered from 1 as a spreadsheet counts them.
  const made = body(4)
  const rows = [...head.rows, spacer(), ...made.rows]
  const heights: Record<number, number> = { 0: 26, 1: head.tall ? 30 : 20 }
  const merges = [...head.merges, ...(made.merges ?? [])]
  rows.forEach((row, r) => {
    // A header row is as tall as its longest heading needs: a set height never grows on its own,
    // and a wrapped heading in a 15pt row showed one line of three (LibreOffice render, 6 Nov).
    const header = row.flatMap((cell, i) =>
      cell?.style === 'header' && cell.text ? [headerHeight(cell.text, widths[i] ?? 10)] : [],
    )
    if (header.length > 0) heights[r] = Math.max(...header)
    // A note is one sentence across the page: on its own it wrapped inside the first column.
    if (row.length === 1 && row[0]?.style === 'note') merges.push(range(0, widths.length, r + 1))
  })
  for (const [r, h] of Object.entries(made.heights ?? {})) heights[Number(r)] = h
  return {
    name: `${number} ${name}`,
    widths,
    rows,
    heights,
    merges,
    frozenRows: 2,
    ...(made.breaks ? { breaks: made.breaks } : {}),
    footer: TEMPLATE_LICENCE,
  }
}

const SHEETS: readonly Sheet[] = [
  page(1, [30, 24, 24, 24], (start) => {
    const labels = [
      'Brand',
      'Style name and number',
      'Garment type',
      'Season',
      'Quantities',
      'Delivery date',
      'Size range',
      'Countries you sell in',
      'Revision number and date',
      'Contact name',
      'Company',
      'Email',
      'Phone or WhatsApp',
    ]
    const made = fields(labels, 4, start)
    return {
      rows: [
        ...made.rows,
        spacer(),
        [c('Send the filled-in template with your inquiry: wear-run.com/contact', 'note')],
        [c(TEMPLATE_LICENCE, 'note')],
      ],
      merges: made.merges,
    }
  }),
  // The first column is 14 wide, not a "No." column's 8: the style line's label wraps in two lines
  // there, and in 8 it took three and was cut (LibreOffice render, 6 Nov 2026).
  page(2, [14, 30, 32, 32], (start) => {
    // Three drawing boxes (front, back, side or inside), then one numbered callout per detail. The
    // callouts' "Note" spans the last two columns, so the table lines up under the three boxes.
    const callouts: Cell[][] = [
      [c('No.', 'header'), c('Detail', 'header'), c('Note', 'header'), blank('header')],
    ]
    // Ten callouts and a 200pt drawing row keep the page on one printed sheet (fourteen ran onto a
    // second, LibreOffice render, 6 Nov 2026); a buyer who needs more adds rows.
    for (let i = 1; i <= 10; i++) {
      callouts.push([c(String(i), 'label'), blank('input'), blank('input'), blank('input')])
    }
    const tableStart = start + 4
    return {
      rows: [
        [blank('plain'), c('Front', 'header'), c('Back', 'header'), c('Side or inside, where it helps', 'header')],
        [blank('plain'), c('Draw or paste the front here', 'drawing'), c('Draw or paste the back here', 'drawing'), c('Draw or paste it here', 'drawing')],
        spacer(),
        [c('Callouts', 'section')],
        ...callouts,
      ],
      merges: callouts.map((_, i) => `C${tableStart + i}:D${tableStart + i}`),
      // The drawing row, as a 0-based row of the whole sheet (two top rows and a spacer come first).
      heights: { [start]: 200 },
    }
  }),
  page(3, [22, 26, 22, 14, 18, 14, 18, 14, 18], () => ({
    rows: [
      ...table(
        [
          'Item',
          'Description',
          'Composition',
          'Weight (GSM)',
          'Yarn count or denier, if you set one',
          'Color',
          'Placement',
          'Quantity per garment',
          'Supplied by (you or us)',
        ],
        14,
        ['Main fabric', 'Contrast fabric', 'Lining', 'Thread', 'Zipper', 'Trims', 'Labels', 'Packaging'],
      ),
      spacer(),
      [c('We can sew in or apply labels and trims you send us.', 'note')],
    ],
  })),
  page(4, [24, 22, 22, 22, 22], () => ({
    rows: [
      [c('Give each color’s Pantone reference.', 'note')],
      ...table(
        ['Part', 'Colorway 1', 'Colorway 2', 'Colorway 3', 'Colorway 4'],
        12,
        ['Colorway name', 'Body', 'Sleeves', 'Collar or neck', 'Cuffs and hem', 'Trims', 'Thread', 'Print colors'],
      ),
    ],
  })),
  page(5, [8, 26, 34, 18, 22, 22, 26], () => ({
    rows: table(
      [
        'No.',
        'Artwork file name',
        'Position, measured from a fixed point on the garment',
        'Size (width × height)',
        'Colors',
        'Decoration method',
        'Note',
      ],
      14,
    ),
  })),
  page(6, [8, 26, 34, 18, 9, 9, 9, 9, 9, 9, 9], () => {
    // An example size range in the header row: the buyer types over it with their own sizes.
    const sizes = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL']
    const block = (unit: string) => {
      // Fourteen points a block keeps both blocks on one printed page (sixteen ran onto a second).
      const rows = table(['Code', 'Point of measure', 'How to measure', 'Tolerance', ...sizes], 14)
      // The tolerance column, said once per row: agreed for each order (approved editorial call).
      return [
        [c(unit, 'section')],
        ...rows.map((row, r) => (r === 0 ? row : row.map((cell, i) => (i === 3 ? c('Agreed for your order', 'given') : cell)))),
      ]
    }
    return { rows: [...block('In centimeters'), spacer(), ...block('In inches')] }
  }),
  page(7, [26, 18, 18, 18, 22, 14, 22, 24], () => ({
    rows: table(
      [
        'Seam',
        'Seam type',
        'Stitch type',
        'ISO number, if you use one',
        'Thread',
        'Stitches per inch',
        'Finish',
        'Note',
      ],
      18,
    ),
  })),
  page(8, [24, 30, 26, 16, 26], () => ({
    rows: table(
      ['Label', 'Where it goes', 'Artwork file name', 'Size', 'Note'],
      10,
      ['Neck label', 'Care label', 'Size label', 'Hang tag'],
    ),
  })),
  page(9, [30, 30, 30, 30], (start) =>
    fields(['How each piece is folded', 'Bag', 'Hang tag', 'Carton marks', 'Note'], 4, start),
  ),
  page(10, [34, 40, 24, 24], (start) => {
    // The "Note" spans the last two columns: the page needs four for its style line.
    const rows = table(['Test, by name', 'The result you need', 'Note', ''], 12)
    rows[0] = [c('Test, by name', 'header'), c('The result you need', 'header'), c('Note', 'header'), blank('header')]
    return { rows, merges: rows.map((_, i) => `C${start + i}:D${start + i}`) }
  }),
  page(11, [26, 30, 30, 30], (start) => {
    const rows: Cell[][] = []
    const merges: string[] = []
    const samples = [
      'First sample',
      'Size set',
      'Pre-production sample',
      'Top-of-production sample',
    ]
    const heights: Record<number, number> = {}
    const breaks: number[] = []
    let at = start
    for (const [index, sample] of samples.entries()) {
      rows.push([c(sample, 'section')])
      at += 1
      const made = fields(['Date', 'Fit notes', 'Photos'], 4, at)
      rows.push(...made.rows)
      merges.push(...made.merges)
      // "A page each" (the guide): room to write fit notes and paste photos, and a printed page per
      // sample. `at` is 1-based, the heights 0-based, so the fit notes' row is `at`, the photos' `at + 1`.
      heights[at] = 140
      heights[at + 1] = 190
      at += made.rows.length
      if (index < samples.length - 1) breaks.push(at - 1)
    }
    return { rows, merges, heights, breaks }
  }),
  page(12, [14, 16, 60, 24], () => ({
    rows: table(['Revision', 'Date', 'Change', 'Made by'], 20),
  })),
]

let built: Uint8Array | null = null

/** The template's bytes, built once per Worker copy (the same bytes every time). */
export function techPackTemplate(): Uint8Array {
  built ??= buildXlsx({
    title: 'Tech pack template',
    creator: 'RUN APPAREL',
    created: TEMPLATE_DATE,
    sheets: SHEETS,
  })
  return built
}

/** For the tests: the sheets as defined. */
export const TEMPLATE_SHEETS = SHEETS
