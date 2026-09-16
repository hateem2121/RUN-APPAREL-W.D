/**
 * Pakistan-time days and weeks, and the one summary of visit rows, for the private
 * document links.
 *
 * WHY ONE MODULE (owner decisions D26 and D33, 2026-09-15). The documents Worker sends a
 * Monday email and the CMS shows a summary box above the admin list, and both report the
 * same numbers. Two copies of "read past halfway" would drift apart, and the owner would
 * read one figure in the email and another in the admin for the same week. So
 * `infra/apex-404` imports this file by relative path and `apps/cms` through
 * `@run-apparel/shared`.
 *
 * ⚠️ PAKISTAN TIME, NEVER UTC. A `day` is `YYYY-MM-DD` in Asia/Karachi (UTC+05:00, no
 * daylight saving) and a week runs Monday to Sunday there. Reading the UTC date instead
 * files every visit between 00:00 and 04:59 in Pakistan under the previous day.
 *
 * ⚠️ NOTHING RUNS AT IMPORT. The viewer imports this package's barrel too, so the date
 * formatter is built on first use, not when the module loads.
 */

export const DOCUMENT_IDS = ['catalogue', 'profile'] as const
export type DocumentId = (typeof DOCUMENT_IDS)[number]

export const VISIT_KINDS = ['person', 'private', 'link-preview', 'robot', 'old-link'] as const
export type VisitKind = (typeof VISIT_KINDS)[number]

export const VISIT_TIME_ZONE = 'Asia/Karachi'

let dayFormat: Intl.DateTimeFormat | undefined

/**
 * `YYYY-MM-DD` in Pakistan time.
 *
 * The parts are read by TYPE instead of trusting `en-CA` to keep printing year-month-day: a
 * locale's date pattern is CLDR data that ships with the runtime — Node's ICU in the tests,
 * workerd's in production — and this string decides which row a visit joins.
 */
export function pakistanDay(instant: Date): string {
  dayFormat ??= new Intl.DateTimeFormat('en-CA', {
    timeZone: VISIT_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  const parts = dayFormat.formatToParts(instant)
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value ?? ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

const DAY_SHAPE = /^(\d{4})-(\d{2})-(\d{2})$/

/** A `YYYY-MM-DD` as UTC calendar numbers. Local time never enters: this machine is not in Pakistan. */
function calendar(day: string): [year: number, monthIndex: number, date: number] {
  const match = DAY_SHAPE.exec(day)
  if (!match) throw new RangeError(`expected a YYYY-MM-DD day, got ${JSON.stringify(day)}`)
  return [Number(match[1]), Number(match[2]) - 1, Number(match[3])]
}

/** The `YYYY-MM-DD` of a `Date.UTC` value. */
function dayOf(utc: number): string {
  return new Date(utc).toISOString().slice(0, 10)
}

/** Calendar arithmetic on a `YYYY-MM-DD`; `days` may be negative. */
export function addDays(day: string, days: number): string {
  const [year, monthIndex, date] = calendar(day)
  return dayOf(Date.UTC(year, monthIndex, date + days))
}

/** The Monday of that day's Monday–Sunday week. */
export function mondayOf(day: string): string {
  const [year, monthIndex, date] = calendar(day)
  // getUTCDay counts from Sunday = 0; this counts days since Monday, Sunday being 6.
  const sinceMonday = (new Date(Date.UTC(year, monthIndex, date)).getUTCDay() + 6) % 7
  return addDays(day, -sinceMonday)
}

/**
 * The same day of the month `months` earlier, clamped to that month's length: 12 months
 * before 29 February 2028 is 28 February 2027, the retention cutoff the clean-up uses.
 */
export function monthsBefore(day: string, months: number): string {
  const [year, monthIndex, date] = calendar(day)
  // Day 0 of the following month is the last day of the target month.
  const lastDate = new Date(Date.UTC(year, monthIndex - months + 1, 0)).getUTCDate()
  return dayOf(Date.UTC(year, monthIndex - months, Math.min(date, lastDate)))
}

export interface WeekRange {
  monday: string
  sunday: string
}

/** The Monday–Sunday week before the one containing `pakistanDay(instant)`. */
export function previousWeek(instant: Date): WeekRange {
  const monday = addDays(mondayOf(pakistanDay(instant)), -7)
  return { monday, sunday: addDays(monday, 6) }
}

export interface VisitRow {
  day: string
  document: DocumentId
  kind: VisitKind
  visitor: string
  opens: number
  furthestPage: number
  pagesTotal: number
  downloads: number
  country: string
  city: string
  device: string
}

export interface PlaceCount {
  country: string
  people: number
  topCity: string
  topCityPeople: number
}

export interface DeviceCounts {
  phone: number
  tablet: number
  computer: number
  unknown: number
}

export interface DocumentSummary {
  people: number
  opens: number
  privateVisits: number
  downloads: number
  readPastHalf: number
  reachedEnd: number
  topCountries: PlaceCount[]
  devices: DeviceCounts
  linkPreviews: number
  oldLinkTries: number
  robots: number
}

/**
 * Code-unit order, not `localeCompare`: the Worker and the CMS must break a tie the same
 * way, and each runtime ships its own ICU collation data.
 */
const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** The most frequent non-empty value, ties to the first in `byText` order; `''` and 0 when none. */
function mostFrequent(values: readonly string[]): { value: string; count: number } {
  const counts = new Map<string, number>()
  for (const value of values) {
    if (value !== '') counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  let best = { value: '', count: 0 }
  for (const [value, count] of counts) {
    if (count > best.count || (count === best.count && byText(value, best.value) < 0)) {
      best = { value, count }
    }
  }
  return best
}

/** Person rows grouped by country, most people first, then alphabetically. */
function topCountries(people: readonly VisitRow[], limit: number): PlaceCount[] {
  const citiesByCountry = new Map<string, string[]>()
  for (const row of people) {
    if (row.country === '') continue
    const cities = citiesByCountry.get(row.country) ?? []
    cities.push(row.city)
    citiesByCountry.set(row.country, cities)
  }
  return [...citiesByCountry]
    .map(([country, cities]) => {
      const top = mostFrequent(cities)
      return { country, people: cities.length, topCity: top.value, topCityPeople: top.count }
    })
    .sort((a, b) => b.people - a.people || byText(a.country, b.country))
    .slice(0, Math.max(0, limit))
}

const noVisits = (): DocumentSummary => ({
  people: 0,
  opens: 0,
  privateVisits: 0,
  downloads: 0,
  readPastHalf: 0,
  reachedEnd: 0,
  topCountries: [],
  devices: { phone: 0, tablet: 0, computer: 0, unknown: 0 },
  linkPreviews: 0,
  oldLinkTries: 0,
  robots: 0,
})

/**
 * The numbers the weekly email and the admin summary box both show, per document.
 *
 * A "person" is one `person` row: one visitor code on one day. Codes change every day, so
 * `people` counts people-days, and the admin says "about".
 */
export function summariseVisits(
  rows: readonly VisitRow[],
  topCountryLimit: number,
): Record<DocumentId, DocumentSummary> {
  const result: Record<DocumentId, DocumentSummary> = { catalogue: noVisits(), profile: noVisits() }
  const people: Record<DocumentId, VisitRow[]> = { catalogue: [], profile: [] }
  for (const row of rows) {
    const summary = result[row.document]
    // Rows reach the Worker from D1 untyped: an unknown document is skipped, not a crash.
    if (!summary) continue
    switch (row.kind) {
      case 'person': {
        people[row.document].push(row)
        summary.people += 1
        summary.opens += row.opens
        summary.downloads += row.downloads
        if (row.pagesTotal > 0 && row.furthestPage * 2 >= row.pagesTotal) summary.readPastHalf += 1
        if (row.pagesTotal > 0 && row.furthestPage >= row.pagesTotal) summary.reachedEnd += 1
        const device =
          row.device === 'phone' || row.device === 'tablet' || row.device === 'computer'
            ? row.device
            : 'unknown'
        summary.devices[device] += 1
        break
      }
      case 'private':
        summary.privateVisits += row.opens
        break
      case 'link-preview':
        summary.linkPreviews += row.opens
        break
      case 'old-link':
        summary.oldLinkTries += row.opens
        break
      case 'robot':
        summary.robots += row.opens
        break
    }
  }
  for (const id of DOCUMENT_IDS) result[id].topCountries = topCountries(people[id], topCountryLimit)
  return result
}
