/**
 * The guides' three small tools (C6, owner approved every word on 6 Nov 2026): the sums and the
 * words, kept apart from the components so the draft's known answers are tested here, one by one.
 *
 * ⚠️ EXACT ARITHMETIC, ROUNDED ONCE, 5 UP. Every number is a fraction of two whole numbers (BigInt),
 * built from the digits typed and NIST's exact factors (Special Publication 811: 1 inch = 2.54 cm and
 * 1 foot = 0.3048 m exactly; 1 oz/yd² = 33.90575 g/m², NIST's rounded factor). Only the shown figure
 * is rounded, half up, as each tool says. Binary floating point cannot keep that promise:
 * `(0.0525).toFixed(3)` is "0.052" (re-measured for the draft, 6 Nov 2026), and the 50 × 30 × 35 cm
 * carton must show 0.053. `guideTools.test.ts` holds every row of the draft's tables.
 */

type Fraction = { n: bigint; d: bigint }

/** "5,3" and "5.3" both read as 5.3; spaces at the ends are ignored. Null when not a number. */
export function readDecimal(raw: string): Fraction | null {
  const text = raw.trim()
  const match = /^(\d+)(?:[.,](\d+))?$/.exec(text)
  if (!match) return null
  const whole = match[1] as string
  const part = match[2] ?? ''
  return { n: BigInt(whole + part), d: 10n ** BigInt(part.length) }
}

const isZero = (f: Fraction) => f.n === 0n

/** The fraction rounded to `places` decimals, half up (for positive values), as a whole number. */
function roundedScaled(f: Fraction, places: number): bigint {
  const scale = 10n ** BigInt(places)
  return (2n * f.n * scale + f.d) / (2n * f.d)
}

/** 1234567 at 2 places → "12,345.67": a point for decimals and a comma for thousands. */
function formatScaled(value: bigint, places: number): string {
  const digits = value.toString().padStart(places + 1, '0')
  const whole = digits.slice(0, digits.length - places)
  const part = places > 0 ? `.${digits.slice(digits.length - places)}` : ''
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${part}`
}

/** The number as typed, shown back with a point and thousands commas ("5,3" → "5.3"). */
function echo(f: Fraction): string {
  const places = f.d.toString().length - 1
  return formatScaled((f.n * 10n ** BigInt(places)) / f.d, places)
}

const times = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.n, d: a.d * b.d })
const over = (a: Fraction, b: Fraction): Fraction => ({ n: a.n * b.d, d: a.d * b.n })

// ------------------------------------------------------------------ GSM to ounces converter

/** NIST SP 811, Appendix B.9: 1 oz/yd² = 33.90575 g/m². */
const GRAMS_PER_OUNCE_YARD: Fraction = { n: 3390575n, d: 100000n }

export type GsmUnit = 'gsm' | 'oz'

export const GSM_WORDS = {
  heading: 'GSM to ounces converter',
  lead: 'Type a fabric weight in either unit to see it in the other.',
  legend: 'Convert from',
  units: {
    gsm: {
      choice: 'Grams per square meter (GSM)',
      label: 'Fabric weight (grams per square meter)',
      hint: 'For example, 180',
    },
    oz: {
      choice: 'Ounces per square yard (oz/yd²)',
      label: 'Fabric weight (ounces per square yard)',
      hint: 'For example, 5.3',
    },
  },
  notANumber: 'Type the fabric weight in digits, like 180 or 5.3.',
  notPositive: 'The fabric weight must be more than 0.',
  rounding:
    'Ounces are rounded to two decimal places and grams to one (5 rounds up), so a result can differ slightly from the table above.',
  credit:
    'Converter by the RUN APPAREL Content Team, using NIST’s rounded factor: 1 ounce per square yard = 33.90575 grams per square meter (Special Publication 811, Appendix B.9).',
} as const

export type ToolAnswer =
  | { result: string; error?: undefined }
  | { result?: undefined; error: string }
  | null

/** The converter's answer for what is typed: a sentence, an error, or nothing (an empty box). */
export function convertWeight(raw: string, from: GsmUnit): ToolAnswer {
  if (raw.trim() === '') return null
  if (/^\s*-/.test(raw)) return { error: GSM_WORDS.notPositive }
  const value = readDecimal(raw)
  if (!value) return { error: GSM_WORDS.notANumber }
  if (isZero(value)) return { error: GSM_WORDS.notPositive }
  if (from === 'gsm') {
    const ounces = formatScaled(roundedScaled(over(value, GRAMS_PER_OUNCE_YARD), 2), 2)
    return { result: `${echo(value)} GSM is ${ounces} ounces per square yard.` }
  }
  const grams = formatScaled(roundedScaled(times(value, GRAMS_PER_OUNCE_YARD), 1), 1)
  return { result: `${echo(value)} ounces per square yard is ${grams} GSM.` }
}

// ------------------------------------------------------------------ carton volume (CBM) calculator

export type CartonUnit = 'cm' | 'in'
export type Measure = 'length' | 'width' | 'height'
export const MEASURES: readonly Measure[] = ['length', 'width', 'height']

export const CBM_WORDS = {
  heading: 'Carton volume (CBM) calculator',
  lead: 'Measure the outside of one packed carton, then enter its size and how many cartons there are.',
  legend: 'Measured in',
  units: { cm: 'Centimeters', in: 'Inches' },
  measureLabel: (measure: Measure, unit: CartonUnit) =>
    `${measure[0]?.toUpperCase()}${measure.slice(1)}, in ${unit === 'cm' ? 'centimeters' : 'inches'}`,
  countLabel: 'Number of cartons',
  countHint: 'A whole number, such as 10',
  countError: 'The number of cartons must be a whole number, 1 or more.',
  rounding:
    'Cubic meters are rounded to three decimal places and cubic feet to two (5 rounds up). The total is worked out before rounding.',
  closing: 'Your packing list states each carton’s size and the total CBM.',
  credit:
    'Calculator: RUN APPAREL Content Team. It takes an inch as exactly 2.54 centimeters and a foot as exactly 0.3048 meters, as NIST’s Special Publication 811 states.',
} as const

/** "the length", "the length and width", "the length, width and height". */
function named(measures: readonly Measure[]): string {
  if (measures.length === 1) return `the ${measures[0]}`
  const last = measures[measures.length - 1]
  return `the ${measures.slice(0, -1).join(', ')} and ${last}`
}

export function measureError(wrong: readonly Measure[]): string {
  return `Check ${named(wrong)}. Measurements are numbers above 0, like 60 or 40.5.`
}

const CM3_PER_M3: Fraction = { n: 1000000n, d: 1n }
/** 1 in³ = 16.387064 cm³, exact (1 in = 2.54 cm). */
const CM3_PER_IN3: Fraction = { n: 16387064n, d: 1000000n }
/** 1 ft³ = 0.028316846592 m³, exact (1 ft = 0.3048 m). */
const M3_PER_FT3: Fraction = { n: 28316846592n, d: 1000000000000n }

function volumeLine(m3: Fraction): { meters: string; feet: string } {
  const meters = roundedScaled(m3, 3)
  const feet = roundedScaled(over(m3, M3_PER_FT3), 2)
  return {
    meters: meters === 0n ? 'less than 0.001' : formatScaled(meters, 3),
    feet: feet === 0n ? 'less than 0.01' : formatScaled(feet, 2),
  }
}

export type CartonAnswer = {
  /** One message for the measurements, naming every one in error. */
  measureError?: string
  /** The measurements in error, each marked on its own box. */
  wrong?: readonly Measure[]
  countError?: string
  lines: string[]
}

/**
 * The calculator's answer. A box left empty is neither a result nor an error ("no error until a
 * value is typed"); a result shows only when all four boxes are filled and right.
 */
export function cartonVolume(
  values: Record<Measure, string>,
  count: string,
  unit: CartonUnit,
): CartonAnswer {
  const wrong: Measure[] = []
  const read: Partial<Record<Measure, Fraction>> = {}
  for (const measure of MEASURES) {
    const raw = values[measure]
    if (raw.trim() === '') continue
    const value = /^\s*-/.test(raw) ? null : readDecimal(raw)
    if (!value || isZero(value)) wrong.push(measure)
    else read[measure] = value
  }
  const countText = count.trim()
  const countOk = /^\d+$/.test(countText) && BigInt(countText) >= 1n
  const answer: CartonAnswer = { lines: [] }
  if (wrong.length > 0) {
    answer.measureError = measureError(wrong)
    answer.wrong = wrong
  }
  if (countText !== '' && !countOk) answer.countError = CBM_WORDS.countError
  const { length, width, height } = read
  if (!length || !width || !height || !countOk || wrong.length > 0) return answer

  const product = times(times(length, width), height)
  const perCarton =
    unit === 'cm' ? over(product, CM3_PER_M3) : over(times(product, CM3_PER_IN3), CM3_PER_M3)
  const one = volumeLine(perCarton)
  answer.lines.push(`One carton: ${one.meters} cubic meters (CBM), or ${one.feet} cubic feet.`)
  const cartons = BigInt(countText)
  if (cartons >= 2n) {
    // The total from the exact volume, rounded once (NIST: round only the final quantity).
    const all = volumeLine(times(perCarton, { n: cartons, d: 1n }))
    answer.lines.push(
      `All ${formatScaled(cartons, 0)} cartons: ${all.meters} cubic meters, or ${all.feet} cubic feet.`,
    )
  }
  return answer
}

// ------------------------------------------------------------------ ball size for an age group

export type BallCountry = 'england' | 'us'

/**
 * ONE list for the ball guide's table AND the lookup, so the two can never disagree (the draft's
 * drift guard). England: The FA's FutureFit table, Under 7 to Under 16. United States: US Youth
 * Soccer's Rule 303, 6 and under to 19 and under (the owner approved the US rows, 6 Nov 2026).
 */
export const BALL_SIZES: Readonly<
  Record<BallCountry, readonly { group: string; size: 3 | 4 | 5 }[]>
> = {
  england: [
    { group: 'Under 7 (Year 2)', size: 3 },
    { group: 'Under 8 (Year 3)', size: 3 },
    { group: 'Under 9 (Year 4)', size: 3 },
    { group: 'Under 10 (Year 5)', size: 3 },
    { group: 'Under 11 (Year 6)', size: 3 },
    { group: 'Under 12 (Year 7)', size: 4 },
    { group: 'Under 13 (Year 8)', size: 4 },
    { group: 'Under 14 (Year 9)', size: 5 },
    { group: 'Under 15 (Year 10)', size: 5 },
    { group: 'Under 16 (Year 11)', size: 5 },
  ],
  us: [
    { group: '6 and under', size: 3 },
    { group: '8 and under', size: 3 },
    { group: '10 and under', size: 4 },
    { group: '11 and under', size: 4 },
    { group: '12 and under', size: 4 },
    { group: '13 and under', size: 5 },
    { group: '14 and under', size: 5 },
    { group: '15 and under', size: 5 },
    { group: '16 and under', size: 5 },
    { group: '17 and under', size: 5 },
    { group: '18 and under', size: 5 },
    { group: '19 and under', size: 5 },
  ],
}

export const BALL_WORDS = {
  heading: 'Ball size for an age group',
  lead: 'Choose where you play, then the age group your league uses.',
  legend: 'Where you play',
  countries: { england: 'England', us: 'United States' },
  listLabel: {
    england: 'Age group, as The FA names it',
    us: 'Age group, as US Youth Soccer names it',
  },
  firstLine: 'Choose an age group',
  source: { england: 'The FA’s FutureFit table', us: 'US Youth Soccer, Rule 303' },
  range:
    'The FA’s table runs from Under 7 to Under 16. US Youth Soccer’s rule starts at 6 and under and ends at 19 and under, except where US Youth Soccer or a state association provides otherwise.',
  credit:
    'Lookup: RUN APPAREL Content Team. Sources: The FA’s FutureFit table; US Youth Soccer’s Rule 303.',
} as const

/**
 * Every fixed word a tool shows (not its results), for the guides' word checks: `guides.test.ts`
 * holds them to the site's refused words and to "nothing said twice on one page".
 */
export function toolWords(tool: 'gsm-converter' | 'cbm-calculator' | 'ball-size-lookup'): string[] {
  if (tool === 'gsm-converter') {
    const { units, ...rest } = GSM_WORDS
    return [...Object.values(rest), ...Object.values(units).flatMap((u) => Object.values(u))]
  }
  if (tool === 'cbm-calculator') {
    return [
      CBM_WORDS.heading,
      CBM_WORDS.lead,
      CBM_WORDS.legend,
      ...Object.values(CBM_WORDS.units),
      ...MEASURES.flatMap((m) => [
        CBM_WORDS.measureLabel(m, 'cm'),
        CBM_WORDS.measureLabel(m, 'in'),
      ]),
      CBM_WORDS.countLabel,
      CBM_WORDS.countHint,
      CBM_WORDS.countError,
      measureError(['length']),
      CBM_WORDS.rounding,
      CBM_WORDS.closing,
      CBM_WORDS.credit,
    ]
  }
  return [
    BALL_WORDS.heading,
    BALL_WORDS.lead,
    BALL_WORDS.legend,
    ...Object.values(BALL_WORDS.countries),
    ...Object.values(BALL_WORDS.listLabel),
    BALL_WORDS.firstLine,
    BALL_WORDS.range,
    BALL_WORDS.credit,
  ]
}

/** "Under 9 (Year 4): size 3 (The FA’s FutureFit table)." — or null for no choice yet. */
export function ballSize(country: BallCountry, group: string): string | null {
  const row = BALL_SIZES[country].find((entry) => entry.group === group)
  return row ? `${row.group}: size ${row.size} (${BALL_WORDS.source[country]}).` : null
}

/**
 * The ball guide's table cell for one size and one country, from the same list: "Under 7 to Under
 * 11", "6 and under and 8 and under", "13 and under to 19 and under". `guides.test.ts` holds the
 * live table to these.
 */
export function ballSizeRange(country: BallCountry, size: 3 | 4 | 5): string {
  const groups = BALL_SIZES[country].filter((entry) => entry.size === size).map((e) => e.group)
  if (groups.length === 0) return ''
  const first = groups[0] as string
  const last = groups[groups.length - 1] as string
  const short = (group: string) => group.replace(/\s*\(Year \d+\)$/, '')
  if (groups.length === 1) return short(first)
  if (groups.length === 2) return `${short(first)} and ${short(last)}`
  return `${short(first)} to ${short(last)}`
}
