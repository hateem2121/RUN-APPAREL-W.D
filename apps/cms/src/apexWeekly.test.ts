import type { DatabaseSync } from 'node:sqlite'
import type { DocumentSummary } from '@run-apparel/shared'
import { describe, expect, it, vi } from 'vitest'
import worker from '../../../infra/apex-404/index.js'
import {
  ADMIN_VISITS_URL,
  CLEANUP_CRON,
  EMAIL_FROM,
  RESEND_ENDPOINT,
  WEEKLY_CRON,
  runScheduled,
  weeklySubject,
  weeklyText,
} from '../../../infra/apex-404/weekly.js'
import { migratedDatabase } from './migrationReplay/migrated'
import { d1From } from './migrationReplay/sqliteD1'

/**
 * The documents Worker's scheduled jobs, against a real migrated database and a stub Resend.
 *
 * WHAT MUST NEVER BREAK (owner decisions D27, D29 and D33–D38, 2026-09-15):
 *   1. At most one email a week. A `sent` week is skipped; a `failed` week is tried again.
 *   2. Aggregates only. No visitor code and no single person ever reaches the email.
 *   3. Nothing throws, and nothing secret is stored or logged. A missing key or recipient
 *      is recorded as `failed: not configured`. No test here makes a network call.
 *   4. The clean-up keeps exactly 12 months of visits and emails, and no earlier day's salt.
 */

/**
 * The weekly cron's own moment: Monday 21 September 2026, 04:00 UTC, which is 09:00 in
 * Pakistan. It reports the week before: Monday 14 to Sunday 20 September.
 */
const MONDAY_MORNING = new Date('2026-09-21T04:00:00.000Z')
const WEEK_OF = '2026-09-14'
const RECIPIENT = 'owner@example.com'
const KEY = 'test-only-resend-key'

/** A made-up visitor code: sixteen of one hex digit. */
const visitor = (digit: string) => digit.repeat(16)

/** [day, document, kind, visitor, opens, furthest page, pages total, downloads, country, city, device] */
type Seed = [string, string, string, string, number, number, number, number, string, string, string]

/**
 * One week holding every kind of row for both documents, plus one row on each side of the
 * week (13 and 21 September) that must not be counted.
 *
 * The link preview, the robot and the old-link try come from the United States. Only a
 * person's row may put a country in the email, so "United States" must not appear.
 */
const WEEK: readonly Seed[] = [
  ['2026-09-14', 'catalogue', 'person', visitor('1'), 2, 12, 12, 1, 'PK', 'Lahore', 'phone'],
  ['2026-09-15', 'catalogue', 'person', visitor('2'), 1, 3, 12, 0, 'PK', 'Karachi', 'computer'],
  ['2026-09-16', 'catalogue', 'person', visitor('3'), 1, 7, 12, 0, 'PK', 'Lahore', 'phone'],
  ['2026-09-18', 'catalogue', 'person', visitor('4'), 1, 6, 12, 1, 'GB', 'London', 'tablet'],
  ['2026-09-19', 'catalogue', 'person', visitor('5'), 3, 1, 12, 0, 'AE', '', 'computer'],
  ['2026-09-17', 'catalogue', 'private', '', 2, 1, 12, 0, '', '', ''],
  ['2026-09-20', 'catalogue', 'link-preview', visitor('6'), 1, 1, 12, 0, 'US', '', 'unknown'],
  ['2026-09-20', 'catalogue', 'robot', visitor('7'), 5, 1, 12, 0, 'US', '', 'unknown'],
  ['2026-09-16', 'catalogue', 'old-link', visitor('8'), 1, 0, 0, 0, 'US', 'Ashburn', 'computer'],
  ['2026-09-15', 'profile', 'person', visitor('2'), 1, 4, 4, 1, 'PK', 'Karachi', 'computer'],
  ['2026-09-20', 'profile', 'old-link', visitor('9'), 2, 0, 0, 0, 'PK', 'Lahore', 'phone'],
  ['2026-09-13', 'catalogue', 'person', visitor('a'), 4, 12, 12, 1, 'DE', 'Berlin', 'computer'],
  ['2026-09-21', 'catalogue', 'person', visitor('b'), 9, 12, 12, 2, 'US', 'Boston', 'phone'],
]

/**
 * The email for WEEK, worked out by hand from the rows above.
 *
 * The catalogue:
 * - its 5 person rows open 2+1+1+1+3 = 8 times and download 2;
 * - pages read past halfway: 12, 7 and 6 of 12 (3); the last page: only 12 of 12 (1);
 * - Pakistan has 3 people, 2 of them in Lahore;
 * - the Emirates and the United Kingdom tie at 1, so the Emirates go first alphabetically.
 *
 * The profile: one person, who read all 4 pages and downloaded.
 */
const WEEK_TEXT = [
  'CATALOGUE',
  '  People: 5 different people, 8 opens',
  '  Private visits: 2',
  '  Downloads: 2',
  '  Reading: 3 read past halfway, 1 reached the last page',
  '  Where: Pakistan 3 (Lahore 2), United Arab Emirates 1, United Kingdom 1 (London 1)',
  '  Devices: 2 phones, 1 tablet, 2 computers',
  '  Also: 1 link preview, 1 try of the old link',
  '',
  'COMPANY PROFILE',
  '  People: 1 different person, 1 open',
  '  Downloads: 1',
  '  Reading: 1 read past halfway, 1 reached the last page',
  '  Where: Pakistan 1 (Karachi 1)',
  '  Devices: 1 computer',
  '  Also: 2 tries of the old link',
  '',
  'Every visit: https://cms.wear-run.help/admin/collections/document-visits',
  '',
].join('\n')

/** Every visitor code in WEEK, for the scan that proves none reaches the email. */
const VISITOR_CODES = WEEK.map((row) => row[3]).filter((code) => code !== '')
const codesIn = (text: string) => VISITOR_CODES.filter((code) => text.includes(code))

/** Rows as the recorder stores them: every text column '' rather than NULL. */
function seed(database: DatabaseSync, rows: readonly Seed[]) {
  const insert = database.prepare(
    `INSERT INTO document_visits (day, document, kind, visitor, first_at, last_at, opens,
       furthest_page, pages_total, downloads, country, region, city, timezone, network, device,
       system, browser, language, came_from)
     VALUES (?1, ?2, ?3, ?4, ?1 || 'T06:00:00.000Z', ?1 || 'T06:00:00.000Z', ?5, ?6, ?7, ?8,
       ?9, '', ?10, '', '', ?11, '', '', '', '')`,
  )
  for (const row of rows) insert.run(...row)
}

/**
 * d1From implements only the part of the D1 API the Worker calls, so here it is typed as the
 * binding weekly.js declares, D1Database. Without the cast, typecheck refuses D1Like, which
 * has no `exec`, `withSession` or `dump`.
 */
const asD1 = (database: DatabaseSync) => d1From(database) as unknown as D1Database

async function weekDatabase() {
  const database = await migratedDatabase()
  seed(database, WEEK)
  return { database, VISITS: asD1(database) }
}

const emailRow = (database: DatabaseSync, week: string) =>
  database
    .prepare('SELECT status, sent_at, error FROM document_visit_emails WHERE week = ?')
    .get(week)

const column = (database: DatabaseSync, sql: string) =>
  database
    .prepare(sql)
    .all()
    .map((row) => Object.values(row)[0])

/** A stand-in for Resend: answers `status` with `body`, and keeps every call. */
function resend(status: number, body = '{"id":"test-email"}') {
  return vi.fn(async (..._args: unknown[]) => new Response(body, { status }))
}

/** A summary with nothing in it, for building the text tests' cases. */
const none = (): DocumentSummary => ({
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

describe('the fixed values', () => {
  it('are pinned as literals, so a change is a decision rather than a drift', () => {
    expect([CLEANUP_CRON, WEEKLY_CRON]).toEqual(['5 0 * * *', '0 4 * * 1'])
    expect(RESEND_ENDPOINT).toBe('https://api.resend.com/emails')
    expect(EMAIL_FROM).toBe('RUN APPAREL <noreply@wear-run.help>')
    expect(ADMIN_VISITS_URL).toBe('https://cms.wear-run.help/admin/collections/document-visits')
  })
})

describe('the daily clean-up', () => {
  it('deletes visits and emails more than 12 months old, and every earlier salt, in one batch', async () => {
    const database = await migratedDatabase()
    seed(database, [
      ['2026-09-14', 'catalogue', 'person', visitor('1'), 1, 1, 12, 0, 'PK', 'Lahore', 'phone'],
      ['2026-09-15', 'catalogue', 'person', visitor('2'), 1, 1, 12, 0, 'PK', 'Lahore', 'phone'],
    ])
    database.exec(
      `INSERT INTO document_visit_emails (week, status, sent_at, error) VALUES
         ('2026-09-07', 'sent', '2026-09-14T04:00:00.000Z', ''),
         ('2026-09-21', 'sent', '2026-09-28T04:00:00.000Z', '')`,
    )
    database.exec(
      `INSERT INTO document_visit_salts (day, salt) VALUES
         ('2027-09-14', '${'a'.repeat(64)}'), ('2027-09-15', '${'b'.repeat(64)}')`,
    )
    const VISITS = asD1(database)
    const batch = vi.spyOn(VISITS, 'batch')

    const result = await runScheduled(
      CLEANUP_CRON,
      { VISITS },
      { now: () => new Date('2027-09-15T10:00:00.000Z') },
    )

    expect(result).toBe('cleaned')
    expect(batch).toHaveBeenCalledTimes(1)
    expect(batch.mock.calls[0]?.[0]).toHaveLength(3)
    // Twelve months before 15 September 2027 is 15 September 2026: kept, and the day before is gone.
    expect(column(database, 'SELECT day FROM document_visits ORDER BY day')).toEqual(['2026-09-15'])
    expect(column(database, 'SELECT week FROM document_visit_emails ORDER BY week')).toEqual([
      '2026-09-21',
    ])
    expect(column(database, 'SELECT day FROM document_visit_salts ORDER BY day')).toEqual([
      '2027-09-15',
    ])
  })
})

describe('the weekly email', () => {
  it('summarises last Monday to Sunday from aggregates only, and records the week as sent', async () => {
    const { database, VISITS } = await weekDatabase()
    const send = resend(200)

    const result = await runScheduled(
      WEEKLY_CRON,
      { VISITS, RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT },
      { now: () => MONDAY_MORNING, fetch: send },
    )

    expect(result).toBe('sent')
    expect(send).toHaveBeenCalledTimes(1)
    const [url, init] = send.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(RESEND_ENDPOINT)
    expect(init.method).toBe('POST')
    expect(init.headers).toEqual({
      authorization: 'Bearer test-only-resend-key',
      'content-type': 'application/json',
    })
    expect(init.signal).toBeInstanceOf(AbortSignal)
    expect(JSON.parse(String(init.body))).toEqual({
      from: 'RUN APPAREL <noreply@wear-run.help>',
      to: ['owner@example.com'],
      subject: 'Document visits: 14 to 20 September 2026',
      text: WEEK_TEXT,
    })
    expect(emailRow(database, WEEK_OF)).toEqual({
      status: 'sent',
      sent_at: '2026-09-21T04:00:00.000Z',
      error: '',
    })
  })

  it('never sends the same week twice, whichever trigger fires', async () => {
    const { VISITS } = await weekDatabase()
    const env = { VISITS, RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT }
    const first = resend(200)
    expect(await runScheduled(WEEKLY_CRON, env, { now: () => MONDAY_MORNING, fetch: first })).toBe(
      'sent',
    )

    // The temporary `* * * * *` trigger of the owner's test email keeps firing after the send.
    const again = resend(200)
    const aMinuteLater = () => new Date('2026-09-21T04:01:00.000Z')
    expect(await runScheduled('* * * * *', env, { now: aMinuteLater, fetch: again })).toBe(
      'skipped',
    )
    expect(again).not.toHaveBeenCalled()
  })

  it.each<[string, Record<string, string>]>([
    ['no key', { VISITS_EMAIL_TO: RECIPIENT }],
    ['a blank key', { RESEND_API_KEY: '  ', VISITS_EMAIL_TO: RECIPIENT }],
    ['no recipient', { RESEND_API_KEY: KEY }],
  ])('%s → failed, "not configured", and nothing is sent', async (_label, settings) => {
    const { database, VISITS } = await weekDatabase()
    const send = resend(200)

    const result = await runScheduled(
      WEEKLY_CRON,
      { VISITS, ...settings },
      { now: () => MONDAY_MORNING, fetch: send },
    )

    expect(result).toBe('failed')
    expect(send).not.toHaveBeenCalled()
    expect(emailRow(database, WEEK_OF)).toEqual({
      status: 'failed',
      sent_at: null,
      error: 'not configured',
    })
  })

  it("records a refusal in Resend's own words, and a later trigger tries the week again", async () => {
    const { database, VISITS } = await weekDatabase()
    const env = { VISITS, RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT }
    const refused = resend(422, '{"message":"domain not verified"}')

    expect(
      await runScheduled(WEEKLY_CRON, env, { now: () => MONDAY_MORNING, fetch: refused }),
    ).toBe('failed')
    expect(emailRow(database, WEEK_OF)).toEqual({
      status: 'failed',
      sent_at: null,
      error: 'Resend answered 422: {"message":"domain not verified"}',
    })

    const accepted = resend(200)
    const later = () => new Date('2026-09-21T04:05:00.000Z')
    expect(await runScheduled('* * * * *', env, { now: later, fetch: accepted })).toBe('sent')
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(emailRow(database, WEEK_OF)).toEqual({
      status: 'sent',
      sent_at: '2026-09-21T04:05:00.000Z',
      error: '',
    })
  })

  it.each([
    ['a network failure', new TypeError('fetch failed'), 'TypeError: fetch failed'],
    ['a 300-character reason, cut to 200', new Error('x'.repeat(300)), `Error: ${'x'.repeat(193)}`],
  ])(
    'a send that throws — %s — is recorded, and the job still resolves',
    async (_label, thrown, stored) => {
      const { database, VISITS } = await weekDatabase()
      const send = vi.fn(async (..._args: unknown[]): Promise<Response> => {
        throw thrown
      })

      const result = await runScheduled(
        WEEKLY_CRON,
        { VISITS, RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT },
        { now: () => MONDAY_MORNING, fetch: send },
      )

      expect(result).toBe('failed')
      expect(emailRow(database, WEEK_OF)).toEqual({
        status: 'failed',
        sent_at: null,
        error: stored,
      })
    },
  )

  it('without a database binding there is nothing to do', async () => {
    const send = resend(200)
    const env = { RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT }
    expect(await runScheduled(WEEKLY_CRON, env, { fetch: send })).toBe('no-database')
    expect(await runScheduled(CLEANUP_CRON, {})).toBe('no-database')
    expect(send).not.toHaveBeenCalled()
  })

  it('an unexpected failure logs only its name, and resolves to failed', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const VISITS = {
        prepare: () => {
          throw new Error('D1_ERROR: no such table: document_visit_emails')
        },
        batch: async () => [],
      }
      const result = await runScheduled(WEEKLY_CRON, { VISITS } as never, {
        now: () => MONDAY_MORNING,
      })
      expect(result).toBe('failed')
      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('[visits] scheduled job failed:', 'Error')
    } finally {
      log.mockRestore()
    }
  })
})

describe('no visitor code ever reaches the email', () => {
  it('the text sent for the seeded week carries none of its codes', async () => {
    const { VISITS } = await weekDatabase()
    const send = resend(200)
    await runScheduled(
      WEEKLY_CRON,
      { VISITS, RESEND_API_KEY: KEY, VISITS_EMAIL_TO: RECIPIENT },
      { now: () => MONDAY_MORNING, fetch: send },
    )
    const [, init] = send.mock.calls[0] as [string, RequestInit]
    const { text } = JSON.parse(String(init.body)) as { text: string }
    expect(VISITOR_CODES).toHaveLength(12)
    expect(codesIn(text)).toEqual([])
  })

  it('the scan can actually fail (negative control)', () => {
    const corrupted = (summaries: Parameters<typeof weeklyText>[0]) =>
      weeklyText(summaries).replace('CATALOGUE', `CATALOGUE ${VISITOR_CODES[0]}`)
    expect(codesIn(corrupted({ catalogue: none(), profile: none() }))).toEqual([VISITOR_CODES[0]])
  })
})

describe('weeklySubject', () => {
  it.each([
    [{ monday: '2026-09-14', sunday: '2026-09-20' }, 'Document visits: 14 to 20 September 2026'],
    [
      { monday: '2026-09-28', sunday: '2026-10-04' },
      'Document visits: 28 September to 4 October 2026',
    ],
    [
      { monday: '2026-12-28', sunday: '2027-01-03' },
      'Document visits: 28 December 2026 to 3 January 2027',
    ],
  ])('%j → %s', (range, subject) => {
    expect(weeklySubject(range)).toBe(subject)
  })
})

describe('weeklyText', () => {
  const ADMIN_LINE = 'Every visit: https://cms.wear-run.help/admin/collections/document-visits'

  it('says "No visits this week." for a quiet week, and still ends with the admin address', () => {
    expect(weeklyText({ catalogue: none(), profile: none() })).toBe(
      [
        'CATALOGUE',
        '  No visits this week.',
        '',
        'COMPANY PROFILE',
        '  No visits this week.',
        '',
        ADMIN_LINE,
        '',
      ].join('\n'),
    )
  })

  it('keeps the Also line on a week with no visits but some previews and old-link tries', () => {
    const catalogue = { ...none(), linkPreviews: 1, oldLinkTries: 3 }
    expect(weeklyText({ catalogue, profile: none() })).toBe(
      [
        'CATALOGUE',
        '  No visits this week.',
        '  Also: 1 link preview, 3 tries of the old link',
        '',
        'COMPANY PROFILE',
        '  No visits this week.',
        '',
        ADMIN_LINE,
        '',
      ].join('\n'),
    )
  })

  it('uses the singular for one of anything', () => {
    const catalogue: DocumentSummary = {
      ...none(),
      people: 1,
      opens: 1,
      privateVisits: 1,
      downloads: 1,
      readPastHalf: 1,
      reachedEnd: 1,
      topCountries: [{ country: 'GB', people: 1, topCity: 'London', topCityPeople: 1 }],
      devices: { phone: 1, tablet: 1, computer: 1, unknown: 1 },
      linkPreviews: 1,
      oldLinkTries: 1,
    }
    expect(weeklyText({ catalogue, profile: none() }).split('\n').slice(0, 9)).toEqual([
      'CATALOGUE',
      '  People: 1 different person, 1 open',
      '  Private visits: 1',
      '  Downloads: 1',
      '  Reading: 1 read past halfway, 1 reached the last page',
      '  Where: United Kingdom 1 (London 1)',
      '  Devices: 1 phone, 1 tablet, 1 computer, 1 other device',
      '  Also: 1 link preview, 1 try of the old link',
      '',
    ])
  })

  it('uses the plural for anything else, and leaves out lines with nothing to say', () => {
    const catalogue: DocumentSummary = {
      ...none(),
      people: 2,
      opens: 3,
      devices: { phone: 2, tablet: 2, computer: 2, unknown: 2 },
      linkPreviews: 2,
      oldLinkTries: 2,
    }
    expect(weeklyText({ catalogue, profile: none() }).split('\n').slice(0, 7)).toEqual([
      'CATALOGUE',
      '  People: 2 different people, 3 opens',
      '  Downloads: 0',
      '  Reading: 0 read past halfway, 0 reached the last page',
      '  Devices: 2 phones, 2 tablets, 2 computers, 2 other devices',
      '  Also: 2 link previews, 2 tries of the old link',
      '',
    ])
  })

  it('names a country with no city by itself, and shows a code Intl cannot name as the code', () => {
    // Cloudflare sends T1 for Tor. Intl.DisplayNames throws a RangeError for it, so without
    // the fallback one Tor visitor would stop the whole week's email.
    const catalogue: DocumentSummary = {
      ...none(),
      people: 3,
      opens: 3,
      topCountries: [
        { country: 'AE', people: 2, topCity: '', topCityPeople: 0 },
        { country: 'T1', people: 1, topCity: '', topCityPeople: 0 },
      ],
      devices: { phone: 3, tablet: 0, computer: 0, unknown: 0 },
    }
    expect(weeklyText({ catalogue, profile: none() })).toContain(
      '\n  Where: United Arab Emirates 2, T1 1\n  Devices: 3 phones\n',
    )
  })
})

describe("the Worker's scheduled handler", () => {
  it('hands the job to waitUntil, and the daily trigger cleans up', async () => {
    const pending: Promise<unknown>[] = []
    const ctx = {
      waitUntil: (promise: Promise<unknown>) => {
        pending.push(promise)
      },
    }
    const { VISITS } = await weekDatabase()
    worker.scheduled({ cron: CLEANUP_CRON } as never, { VISITS } as never, ctx as never)
    expect(pending).toHaveLength(1)
    expect(await Promise.all(pending)).toEqual(['cleaned'])
  })
})
