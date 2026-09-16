import { describe, expect, it } from 'vitest'
import {
  DOCUMENT_IDS,
  type DocumentSummary,
  VISIT_KINDS,
  VISIT_TIME_ZONE,
  type VisitRow,
  type WeekRange,
  addDays,
  mondayOf,
  monthsBefore,
  pakistanDay,
  previousWeek,
  summariseVisits,
} from './documentVisits'

/**
 * The days, weeks and numbers that both the Monday email (infra/apex-404) and the admin
 * summary box (apps/cms) report. A wrong day files a visit under the wrong week in both at
 * once, so the boundaries are asserted around 19:00 UTC — midnight in Pakistan — and not
 * at a comfortable midday.
 */

describe('the names other packages build on', () => {
  it('lists the two documents, the five kinds and the time zone', () => {
    expect(DOCUMENT_IDS).toEqual(['catalogue', 'profile'])
    expect(VISIT_KINDS).toEqual(['person', 'private', 'link-preview', 'robot', 'old-link'])
    expect(VISIT_TIME_ZONE).toBe('Asia/Karachi')
  })
})

describe('pakistanDay', () => {
  it.each([
    ['2026-09-15T18:59:59.999Z', '2026-09-15'],
    ['2026-09-15T19:00:00.000Z', '2026-09-16'],
    ['2026-12-31T19:00:00Z', '2027-01-01'],
  ])('%s is %s in Pakistan', (instant, day) => {
    expect(pakistanDay(new Date(instant))).toBe(day)
  })
})

describe('calendar arithmetic on YYYY-MM-DD', () => {
  it.each<[string, number, string]>([
    ['2026-12-31', 1, '2027-01-01'],
    ['2028-03-01', -1, '2028-02-29'],
  ])('addDays(%s, %i) is %s', (day, days, expected) => {
    expect(addDays(day, days)).toBe(expected)
  })

  it.each([
    ['2026-09-20', '2026-09-14'], // a Sunday belongs to the week that began six days earlier
    ['2026-09-14', '2026-09-14'], // a Monday is its own
    ['2026-09-15', '2026-09-14'],
  ])('mondayOf(%s) is %s', (day, monday) => {
    expect(mondayOf(day)).toBe(monday)
  })

  it.each<[string, number, string]>([
    ['2027-09-15', 12, '2026-09-15'],
    ['2028-02-29', 12, '2027-02-28'], // 2027 has no 29 February
    ['2026-03-31', 1, '2026-02-28'],
    ['2026-01-31', 2, '2025-11-30'], // back across a year, into a 30-day month
  ])('monthsBefore(%s, %i) is %s', (day, months, expected) => {
    expect(monthsBefore(day, months)).toBe(expected)
  })

  it('refuses text that is not a YYYY-MM-DD day', () => {
    expect(() => addDays('2026-9-15', 1)).toThrow(RangeError)
  })
})

describe('previousWeek', () => {
  it.each<[string, WeekRange]>([
    // Monday 09:00 in Pakistan — the moment the weekly email's cron fires.
    ['2026-09-21T04:00:00Z', { monday: '2026-09-14', sunday: '2026-09-20' }],
    // Any later day of that week still reports the same finished week.
    ['2026-09-24T10:00:00Z', { monday: '2026-09-14', sunday: '2026-09-20' }],
    // A day INSIDE 14–20 September reports the week before it, never its own unfinished one.
    ['2026-09-17T10:00:00Z', { monday: '2026-09-07', sunday: '2026-09-13' }],
    // Sunday 23:59:59.999 in Pakistan is still that week; one millisecond later is not.
    ['2026-09-27T18:59:59.999Z', { monday: '2026-09-14', sunday: '2026-09-20' }],
    ['2026-09-27T19:00:00.000Z', { monday: '2026-09-21', sunday: '2026-09-27' }],
    ['2026-10-05T04:00:00Z', { monday: '2026-09-28', sunday: '2026-10-04' }],
  ])('%s reports %o', (instant, week) => {
    expect(previousWeek(new Date(instant))).toEqual(week)
  })
})

const row = (over: Partial<VisitRow>): VisitRow => ({
  day: '2026-09-15',
  document: 'catalogue',
  kind: 'person',
  visitor: '0000000000000000',
  opens: 1,
  furthestPage: 1,
  pagesTotal: 10,
  downloads: 0,
  country: 'PK',
  city: 'Lahore',
  device: 'phone',
  ...over,
})

/**
 * One week of both documents with every kind present. The catalogue has 10 pages and the
 * profile 12; the comments say what each row is there to prove.
 */
const WEEK: VisitRow[] = [
  // Catalogue people. The first read to the end, three times, and downloaded.
  row({ visitor: 'a000000000000001', opens: 3, furthestPage: 10, downloads: 1 }),
  // Exactly half counts as past halfway.
  row({ visitor: 'a000000000000002', city: 'Karachi', device: 'computer', furthestPage: 5 }),
  row({
    visitor: 'a000000000000003',
    city: 'Karachi',
    device: 'tablet',
    opens: 2,
    furthestPage: 4,
  }),
  // Lahore 2, Karachi 2: the tie goes to Karachi.
  row({ day: '2026-09-16', visitor: 'a000000000000004' }),
  // No page count: left out of both reading numbers. A device the admin does not name: unknown.
  row({
    visitor: 'a000000000000005',
    country: 'AE',
    city: 'Dubai',
    device: 'weird',
    furthestPage: 0,
    pagesTotal: 0,
    downloads: 1,
  }),
  // A country with no city.
  row({
    visitor: 'a000000000000006',
    country: 'GB',
    city: '',
    device: 'computer',
    furthestPage: 10,
  }),
  // No country: counted, but not placed.
  row({ visitor: 'a000000000000007', country: '', city: '', device: 'unknown', furthestPage: 2 }),
  // AE, GB and US tie at 1, so US is fourth: past a limit of 3.
  row({ visitor: 'a000000000000008', country: 'US', city: 'New York', furthestPage: 3 }),
  // Catalogue, not people.
  row({ kind: 'private', visitor: '', opens: 4, country: '', city: '', device: '' }),
  row({
    kind: 'link-preview',
    visitor: 'b000000000000001',
    opens: 2,
    country: 'US',
    city: 'Ashburn',
    device: 'unknown',
  }),
  row({
    kind: 'robot',
    visitor: 'c000000000000001',
    opens: 5,
    country: 'US',
    city: 'Ashburn',
    device: 'unknown',
  }),
  row({ kind: 'old-link', visitor: 'd000000000000001' }),
  // Profile.
  row({
    document: 'profile',
    visitor: 'e000000000000001',
    city: 'Islamabad',
    furthestPage: 12,
    pagesTotal: 12,
  }),
  row({
    document: 'profile',
    visitor: 'e000000000000002',
    city: 'Islamabad',
    device: 'computer',
    opens: 2,
    furthestPage: 6,
    pagesTotal: 12,
  }),
  row({ document: 'profile', visitor: 'e000000000000003', pagesTotal: 12, downloads: 1 }),
  row({ document: 'profile', kind: 'private', visitor: '', country: '', city: '', device: '' }),
  row({
    document: 'profile',
    kind: 'link-preview',
    visitor: 'b000000000000002',
    device: 'unknown',
  }),
  row({
    document: 'profile',
    kind: 'robot',
    visitor: 'c000000000000002',
    opens: 2,
    device: 'unknown',
  }),
  row({ document: 'profile', kind: 'old-link', visitor: 'd000000000000002', opens: 3 }),
]

const NO_VISITS: DocumentSummary = {
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
}

describe('summariseVisits', () => {
  it('counts people, reading, places and devices per document, breaking every tie alphabetically', () => {
    expect(summariseVisits(WEEK, 3)).toEqual({
      catalogue: {
        people: 8,
        opens: 11,
        privateVisits: 4,
        downloads: 2,
        readPastHalf: 3,
        reachedEnd: 2,
        topCountries: [
          { country: 'PK', people: 4, topCity: 'Karachi', topCityPeople: 2 },
          { country: 'AE', people: 1, topCity: 'Dubai', topCityPeople: 1 },
          { country: 'GB', people: 1, topCity: '', topCityPeople: 0 },
        ],
        devices: { phone: 3, tablet: 1, computer: 2, unknown: 2 },
        linkPreviews: 2,
        oldLinkTries: 1,
        robots: 5,
      },
      profile: {
        people: 3,
        opens: 4,
        privateVisits: 1,
        downloads: 1,
        readPastHalf: 2,
        reachedEnd: 1,
        topCountries: [{ country: 'PK', people: 3, topCity: 'Islamabad', topCityPeople: 2 }],
        devices: { phone: 2, tablet: 0, computer: 1, unknown: 0 },
        linkPreviews: 1,
        oldLinkTries: 3,
        robots: 2,
      },
    } satisfies Record<'catalogue' | 'profile', DocumentSummary>)
  })

  it('keeps only as many countries as asked for', () => {
    expect(summariseVisits(WEEK, 1).catalogue.topCountries.map((place) => place.country)).toEqual([
      'PK',
    ])
  })

  it('reports a document with no rows as all zeros, and still reports it', () => {
    const catalogueOnly = WEEK.filter((visit) => visit.document === 'catalogue')
    expect(summariseVisits(catalogueOnly, 3).profile).toEqual(NO_VISITS)
    expect(summariseVisits([], 3)).toEqual({ catalogue: NO_VISITS, profile: NO_VISITS })
  })

  it('skips a row for a document it does not know, instead of failing the whole summary', () => {
    const stray = row({ document: 'brochure' as never, opens: 99 })
    expect(summariseVisits([...WEEK, stray], 3)).toEqual(summariseVisits(WEEK, 3))
  })

  it('NEGATIVE CONTROL: the kind decides who is a person', () => {
    // Relabel the first catalogue person, who opened the catalogue 3 times, as a robot.
    const relabelled = WEEK.map((visit, index) =>
      index === 0 ? { ...visit, kind: 'robot' as const } : visit,
    )
    const before = summariseVisits(WEEK, 3).catalogue
    const after = summariseVisits(relabelled, 3).catalogue
    expect([before.people, before.opens, before.robots]).toEqual([8, 11, 5])
    expect([after.people, after.opens, after.robots]).toEqual([7, 8, 8])
  })
})
