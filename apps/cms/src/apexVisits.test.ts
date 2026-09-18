import { createHash } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import {
  VISIT_SQL,
  type Visit,
  createVisitRecorder,
  requestDetails,
  visitorCode,
} from '../../../infra/apex-404/visits.js'
import { migratedDatabase } from './migrationReplay/migrated'
import { d1From } from './migrationReplay/sqliteD1'

/**
 * The documents Worker's visit recorder (infra/apex-404/visits.js), against the tables the
 * real CMS migrations create.
 *
 * WHAT MUST NEVER BREAK, in order of cost if it did:
 *   1. No code, no IP address and no raw User-Agent is stored in any column. The scan at the
 *      end plants a code to prove it can see one.
 *   2. The Worker's SQL runs against the migrated schema. In production a mismatch shows only
 *      as a log line, so a renamed column has to fail HERE, and a negative control renames one.
 *   3. Nothing is written without a VISITS binding and a ctx, and a failed write never rejects.
 *   4. A browser sending `Sec-GPC: 1` leaves one detail-free row per day and document.
 *
 * The code is a non-word and the address comes from the documentation range (RFC 5737): the
 * real links' words must never appear in this public repository.
 */

const NOW = '2026-09-15T10:00:00.000Z' // 15:00 in Pakistan
const CODE = 'zzzz-yyyy'
const IP = '203.0.113.7'
const SALT = 'ab'.repeat(32)
// MDN, "User-Agent" header reference: the Safari example.
const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 13_5_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/13.1.1 Mobile/15E148 Safari/604.1'
// curl's own documentation: the default User-Agent is curl/<version>.
const CURL = 'curl/8.7.1'

/**
 * What a browser sends when it opens a page (Fetch Metadata, plus the classic navigation
 * headers). Since 2026-09-18 a visit counts as a person only with this signal, so a fixture
 * without it is a script — which is what these fixtures were until then, and why they could
 * not have caught a checker being counted as a person.
 */
const NAVIGATION = {
  'sec-fetch-mode': 'navigate',
  'sec-fetch-dest': 'document',
  'upgrade-insecure-requests': '1',
  accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
}

interface VisitColumns {
  day: string
  document: string
  kind: string
  visitor: string
  first_at: string
  last_at: string
  minutes_active: number
  opens: number
  furthest_page: number
  pages_total: number
  downloads: number
  country: string
  region: string
  city: string
  timezone: string
  network: string
  device: string
  system: string
  browser: string
  language: string
  came_from: string
}

const COLUMNS =
  'day, document, kind, visitor, first_at, last_at, minutes_active, opens, furthest_page, pages_total, downloads, country, region, city, timezone, network, device, system, browser, language, came_from'

const visitRows = (database: DatabaseSync) =>
  database
    .prepare(`SELECT ${COLUMNS} FROM document_visits ORDER BY id`)
    .all()
    .map((row) => ({ ...row })) as unknown as VisitColumns[]

const saltRows = (database: DatabaseSync) =>
  database
    .prepare('SELECT day, salt FROM document_visit_salts ORDER BY day')
    .all()
    .map((row) => ({ ...row })) as unknown as { day: string; salt: string }[]

interface UpsertInput {
  day: string
  document: string
  kind: string
  visitor: string
  at: string
  opens: number
  furthestPage: number
  pagesTotal: number
  downloads: number
  country: string
  region: string
  city: string
  timezone: string
  network: string
  device: string
  system: string
  browser: string
  language: string
  cameFrom: string
}

/** VISIT_SQL.upsertVisit's 19 values, in its order, from a readable object. */
function upsertValues(over: Partial<UpsertInput> = {}): unknown[] {
  const v: UpsertInput = {
    day: '2026-09-15',
    document: 'catalogue',
    kind: 'person',
    visitor: '0123456789abcdef',
    at: NOW,
    opens: 1,
    furthestPage: 1,
    pagesTotal: 12,
    downloads: 0,
    country: 'PK',
    region: 'Punjab',
    city: 'Lahore',
    timezone: 'Asia/Karachi',
    network: 'Example Networks',
    device: 'phone',
    system: 'iOS',
    browser: 'Safari',
    language: 'en-GB',
    cameFrom: '',
    ...over,
  }
  return [
    v.day,
    v.document,
    v.kind,
    v.visitor,
    v.at,
    v.opens,
    v.furthestPage,
    v.pagesTotal,
    v.downloads,
    v.country,
    v.region,
    v.city,
    v.timezone,
    v.network,
    v.device,
    v.system,
    v.browser,
    v.language,
    v.cameFrom,
  ]
}

describe('the Worker SQL against the migrated schema', () => {
  it('a first open inserts one row', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    const result = await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(...upsertValues())
      .run()
    expect(result.meta.changes).toBe(1)
    expect(visitRows(database)).toEqual([
      expect.objectContaining({
        kind: 'person',
        first_at: NOW,
        last_at: NOW,
        minutes_active: 0,
        opens: 1,
        furthest_page: 1,
        pages_total: 12,
        downloads: 0,
      }),
    ])
  })

  it('a second open 30 minutes later is the same row, with opens 2 and minutes_active 30', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(...upsertValues())
      .run()
    const later = upsertValues({ at: '2026-09-15T10:30:00.000Z' })
    await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(...later)
      .run()
    const rows = visitRows(database)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      opens: 2,
      minutes_active: 30,
      first_at: NOW,
      last_at: '2026-09-15T10:30:00.000Z',
    })
  })

  it('markers keep the furthest page, and pages_total keeps its maximum', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    const upsert = (over: Partial<UpsertInput>) =>
      db
        .prepare(VISIT_SQL.upsertVisit)
        .bind(...upsertValues(over))
        .run()
    await upsert({}) // the open: page 1 of 12
    await upsert({ opens: 0, furthestPage: 7, pagesTotal: 0 }) // marker 7
    await upsert({ opens: 0, furthestPage: 3, pagesTotal: 0 }) // marker 3: scrolled back up
    expect(visitRows(database)[0]).toMatchObject({ opens: 1, furthest_page: 7, pages_total: 12 })
  })

  it('downloads add up', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    const download = upsertValues({ opens: 0, furthestPage: 0, pagesTotal: 0, downloads: 1 })
    await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(...download)
      .run()
    await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(...download)
      .run()
    expect(visitRows(database)[0]).toMatchObject({ opens: 0, downloads: 2 })
  })

  it("insertSalt keeps a day's first salt, and deleteSaltsBefore removes only earlier days", async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    const insert = (day: string, salt: string) =>
      db.prepare(VISIT_SQL.insertSalt).bind(day, salt).run()
    await insert('2026-09-14', 'aa'.repeat(32))
    await insert('2026-09-15', 'bb'.repeat(32))
    expect((await insert('2026-09-15', 'cc'.repeat(32))).meta.changes).toBe(0)
    const read = await db.prepare(VISIT_SQL.selectSalt).bind('2026-09-15').first<{ salt: string }>()
    expect(read?.salt).toBe('bb'.repeat(32))
    const deleted = await db.prepare(VISIT_SQL.deleteSaltsBefore).bind('2026-09-15').run()
    expect(deleted.meta.changes).toBe(1)
    expect(saltRows(database)).toEqual([{ day: '2026-09-15', salt: 'bb'.repeat(32) }])
  })

  it('NEGATIVE CONTROL: the same upsert throws once came_from is renamed', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    // The real schema takes it…
    await expect(
      db
        .prepare(VISIT_SQL.upsertVisit)
        .bind(...upsertValues())
        .run(),
    ).resolves.toMatchObject({ success: true })
    // …and a schema whose column name drifted does not.
    database.exec('ALTER TABLE document_visits RENAME COLUMN came_from TO referrer_host')
    const another = upsertValues({ visitor: 'fedcba9876543210' })
    await expect(
      db
        .prepare(VISIT_SQL.upsertVisit)
        .bind(...another)
        .run(),
    ).rejects.toThrow(/came_from/)
  })
})

describe('the D1 stand-in behaves like D1 where it matters', () => {
  it('refuses an undefined binding instead of storing NULL', async () => {
    const db = d1From(await migratedDatabase())
    await expect(db.prepare(VISIT_SQL.selectSalt).bind(undefined).first()).rejects.toThrow(
      'D1_TYPE_ERROR',
    )
  })

  it('first() is null when nothing matches, and all() returns the rows', async () => {
    const db = d1From(await migratedDatabase())
    expect(await db.prepare(VISIT_SQL.selectSalt).bind('2026-09-15').first()).toBeNull()
    await db.prepare(VISIT_SQL.insertSalt).bind('2026-09-15', SALT).run()
    const { results } = await db
      .prepare('SELECT day FROM document_visit_salts')
      .all<{ day: string }>()
    expect(results.map((row) => row.day)).toEqual(['2026-09-15'])
  })

  it('batch() commits together, and rolls every statement back when one fails', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    await db.batch([
      db.prepare(VISIT_SQL.insertSalt).bind('2026-09-14', 'aa'.repeat(32)),
      db.prepare(VISIT_SQL.insertSalt).bind('2026-09-15', 'bb'.repeat(32)),
    ])
    expect(saltRows(database)).toHaveLength(2)
    await expect(
      db.batch([
        db.prepare(VISIT_SQL.deleteSaltsBefore).bind('2026-09-16'),
        db.prepare('DELETE FROM no_such_table'),
      ]),
    ).rejects.toThrow('no_such_table')
    expect(saltRows(database)).toHaveLength(2)
    // Only statements this stand-in prepared can join its transaction.
    await expect(db.batch([{} as never])).rejects.toThrow('batch() takes only statements')
  })
})

describe('visitorCode', () => {
  it('is the first 16 hex characters of SHA-256 over salt|address|User-Agent', async () => {
    const code = await visitorCode(SALT, IP, IPHONE_SAFARI)
    expect(code).toMatch(/^[0-9a-f]{16}$/)
    const expected = createHash('sha256').update(`${SALT}|${IP}|${IPHONE_SAFARI}`).digest('hex')
    expect(code).toBe(expected.slice(0, 16))
    // Precomputed with Node's createHash on 2026-09-16, so the line above cannot drift with
    // the code under test.
    expect(code).toBe('f17f6ccc1a935b2f')
  })

  it('is stable, and changes with the salt or the address', async () => {
    const code = await visitorCode(SALT, IP, IPHONE_SAFARI)
    expect(await visitorCode(SALT, IP, IPHONE_SAFARI)).toBe(code)
    expect(await visitorCode('cd'.repeat(32), IP, IPHONE_SAFARI)).not.toBe(code)
    expect(await visitorCode(SALT, '203.0.113.8', IPHONE_SAFARI)).not.toBe(code)
  })
})

/** A request as the Worker receives it: only Cloudflare's runtime adds `request.cf`. */
function incoming(url: string, headers: Record<string, string>, cf?: Record<string, unknown>) {
  const request = new Request(url, { headers })
  return cf ? Object.assign(request, { cf }) : request
}

const LAHORE = {
  country: 'PK',
  region: 'Punjab',
  city: 'Lahore',
  timezone: 'Asia/Karachi',
  asOrganization: 'Example Networks',
}

describe('requestDetails', () => {
  it("maps Cloudflare's fields, the first language tag and the Referer's host", () => {
    const request = incoming(
      `https://catalogue.wear-run.help/${CODE}`,
      { 'accept-language': 'en-GB,en;q=0.9', referer: 'https://mail.google.com/mail/u/0/' },
      { ...LAHORE, colo: 'KHI' },
    )
    expect(requestDetails(request)).toEqual({
      country: 'PK',
      region: 'Punjab',
      city: 'Lahore',
      timezone: 'Asia/Karachi',
      network: 'Example Networks',
      language: 'en-GB',
      cameFrom: 'mail.google.com',
    })
  })

  it('is all empty strings without request.cf, and when the Referer is not an address', () => {
    const request = incoming(`https://catalogue.wear-run.help/${CODE}`, { referer: 'not a url' })
    expect(requestDetails(request)).toEqual({
      country: '',
      region: '',
      city: '',
      timezone: '',
      network: '',
      language: '',
      cameFrom: '',
    })
  })

  it('is empty when the Referer is an IP-address literal, not a hostname', () => {
    // A referring page served from an IP literal (an intranet host, or one with no DNS name)
    // must never put that address in came_from — the Global Constraints forbid storing an IP
    // address outright, and do not distinguish the referring server's from the visitor's own
    // (Task 5 review, 2026-09-16).
    const cameFromReferer = (referer: string) =>
      requestDetails(incoming(`https://catalogue.wear-run.help/${CODE}`, { referer })).cameFrom
    expect(cameFromReferer('http://192.168.1.50/intranet/page')).toBe('')
    expect(cameFromReferer('https://203.0.113.9:8443/x')).toBe('')
    expect(cameFromReferer('http://[2001:db8::1]/')).toBe('')
  })

  it('cuts a value to 100 characters', () => {
    const request = incoming(
      `https://catalogue.wear-run.help/${CODE}`,
      {},
      { city: 'x'.repeat(150) },
    )
    expect(requestDetails(request).city).toHaveLength(100)
  })
})

/** A ctx that keeps what it is handed, so a test can wait for the writes to finish. */
function collectingCtx() {
  const promises: Promise<unknown>[] = []
  return {
    ctx: {
      waitUntil: (promise: Promise<unknown>) => {
        promises.push(promise)
      },
    },
    promises,
    settled: () => Promise.all(promises),
  }
}

const pageRequest = (headers: Record<string, string> = {}) =>
  incoming(
    `https://catalogue.wear-run.help/${CODE}`,
    { 'user-agent': IPHONE_SAFARI, 'cf-connecting-ip': IP, ...NAVIGATION, ...headers },
    LAHORE,
  )

const open = (request = pageRequest()): Visit => ({
  event: 'open',
  document: 'catalogue',
  request,
  pagesTotal: 3,
})

describe('the recorder', () => {
  it('does nothing at all without a ctx, or without a VISITS binding', async () => {
    const database = await migratedDatabase()
    const db = d1From(database)
    const prepare = vi.spyOn(db, 'prepare')
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
    const { ctx, promises, settled } = collectingCtx()

    recordVisit({ VISITS: db as never }, undefined, open())
    recordVisit({}, ctx, open())
    expect(promises).toHaveLength(0)
    expect(prepare).not.toHaveBeenCalled()

    // Positive control: with both present, the same spy sees the writes.
    recordVisit({ VISITS: db as never }, ctx, open())
    await settled()
    expect(prepare).toHaveBeenCalled()
  })

  it('an open from iPhone Safari writes a person row on a phone, dated in Pakistan', async () => {
    const database = await migratedDatabase()
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
    const { ctx, settled } = collectingCtx()
    recordVisit({ VISITS: d1From(database) as never }, ctx, open())
    await settled()
    expect(visitRows(database)).toEqual([
      {
        day: '2026-09-15',
        document: 'catalogue',
        kind: 'person',
        visitor: 'f17f6ccc1a935b2f', // visitorCode(SALT, IP, IPHONE_SAFARI)
        first_at: NOW,
        last_at: NOW,
        minutes_active: 0,
        opens: 1,
        furthest_page: 1,
        pages_total: 3,
        downloads: 0,
        country: 'PK',
        region: 'Punjab',
        city: 'Lahore',
        timezone: 'Asia/Karachi',
        network: 'Example Networks',
        device: 'phone',
        system: 'iOS',
        browser: 'Safari',
        language: '',
        came_from: '',
      },
    ])
  })

  it("creates the day's salt once for two visits on the same day", async () => {
    const database = await migratedDatabase()
    const randomHex = vi.fn((bytes: number) => 'ab'.repeat(bytes))
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex })
    const { ctx, settled } = collectingCtx()
    const env = { VISITS: d1From(database) as never }
    recordVisit(env, ctx, open())
    await settled()
    recordVisit(env, ctx, {
      event: 'marker',
      document: 'catalogue',
      request: pageRequest(),
      page: 2,
    })
    await settled()
    expect(randomHex).toHaveBeenCalledTimes(1)
    expect(randomHex).toHaveBeenCalledWith(32)
    expect(saltRows(database)).toEqual([{ day: '2026-09-15', salt: SALT }])
    expect(visitRows(database)).toEqual([expect.objectContaining({ opens: 1, furthest_page: 2 })])
  })

  it("two visits racing on a day's first write both hash with the salt that landed first", async () => {
    const database = await migratedDatabase()
    const salts = ['aa'.repeat(32), 'bb'.repeat(32)]
    const recordVisit = createVisitRecorder({
      now: () => new Date(NOW),
      randomHex: () => salts.shift() ?? '',
    })
    const { ctx, settled } = collectingCtx()
    const env = { VISITS: d1From(database) as never }
    recordVisit(env, ctx, open())
    recordVisit(env, ctx, open(pageRequest({ 'cf-connecting-ip': '203.0.113.8' })))
    await settled()
    expect(saltRows(database)).toEqual([{ day: '2026-09-15', salt: 'aa'.repeat(32) }])
    const expected = [
      await visitorCode('aa'.repeat(32), IP, IPHONE_SAFARI),
      await visitorCode('aa'.repeat(32), '203.0.113.8', IPHONE_SAFARI),
    ]
    expect(visitRows(database).map((row) => row.visitor)).toEqual(expected)
  })

  it('a visit on the next day creates a new salt and deletes the one before', async () => {
    const database = await migratedDatabase()
    let clock = new Date(NOW)
    const salts = ['aa'.repeat(32), 'bb'.repeat(32)]
    const recordVisit = createVisitRecorder({
      now: () => clock,
      randomHex: () => salts.shift() ?? '',
    })
    const { ctx, settled } = collectingCtx()
    const env = { VISITS: d1From(database) as never }
    recordVisit(env, ctx, open())
    await settled()
    clock = new Date('2026-09-15T19:00:00.000Z') // midnight in Pakistan: the 16th has begun
    recordVisit(env, ctx, open())
    await settled()
    expect(saltRows(database)).toEqual([{ day: '2026-09-16', salt: 'bb'.repeat(32) }])
    const [first, second] = visitRows(database)
    expect([first?.day, second?.day]).toEqual(['2026-09-15', '2026-09-16'])
    expect(first?.visitor).not.toBe(second?.visitor)
  })

  it('Sec-GPC: 1 counts the open on a detail-free private row, and records nothing else', async () => {
    const database = await migratedDatabase()
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
    const { ctx, settled } = collectingCtx()
    const env = { VISITS: d1From(database) as never }
    const request = pageRequest({
      'sec-gpc': '1',
      'accept-language': 'en-GB',
      referer: 'https://mail.google.com/',
    })
    recordVisit(env, ctx, { event: 'open', document: 'profile', request, pagesTotal: 3 })
    recordVisit(env, ctx, { event: 'marker', document: 'profile', request, page: 3 })
    recordVisit(env, ctx, { event: 'download', document: 'profile', request })
    recordVisit(env, ctx, { event: 'old-link', document: 'profile', request })
    await settled()
    expect(visitRows(database)).toEqual([
      {
        day: '2026-09-15',
        document: 'profile',
        kind: 'private',
        visitor: '',
        first_at: NOW,
        last_at: NOW,
        minutes_active: 0,
        opens: 1,
        furthest_page: 1,
        pages_total: 3,
        downloads: 0,
        country: '',
        region: '',
        city: '',
        timezone: '',
        network: '',
        device: '',
        system: '',
        browser: '',
        language: '',
        came_from: '',
      },
    ])
    // No visitor code is made for a private visit, so no salt is created for one either.
    expect(saltRows(database)).toEqual([])
  })

  it('an old-link try is recorded for a person, and not for a robot', async () => {
    const database = await migratedDatabase()
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
    const { ctx, settled } = collectingCtx()
    const env = { VISITS: d1From(database) as never }
    const retired = (userAgent: string) =>
      incoming('https://wear-run.help/catalogue', {
        'user-agent': userAgent,
        'cf-connecting-ip': IP,
        ...NAVIGATION,
      })
    recordVisit(env, ctx, {
      event: 'old-link',
      document: 'catalogue',
      request: retired(IPHONE_SAFARI),
    })
    recordVisit(env, ctx, { event: 'old-link', document: 'catalogue', request: retired(CURL) })
    await settled()
    expect(visitRows(database)).toEqual([
      expect.objectContaining({
        kind: 'old-link',
        opens: 1,
        furthest_page: 0,
        pages_total: 0,
        downloads: 0,
        device: 'phone',
        browser: 'Safari',
      }),
    ])
  })

  /**
   * A PERSON IS A BROWSER NAVIGATING (decided 2026-09-18, live from the merge that deploys
   * it). Measured that day in the Worker's logs: Cloudflare hands the FIRST HEAD for an
   * address to the Worker as a GET, and a script may borrow any browser's name — both had
   * put checkers into the owner's people figures (7 rows on 17–18 September).
   */
  describe('a person must be a browser navigating', () => {
    async function recordOne(visit: Visit) {
      const database = await migratedDatabase()
      const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
      const { ctx, settled } = collectingCtx()
      recordVisit({ VISITS: d1From(database) as never }, ctx, visit)
      await settled()
      return visitRows(database)
    }
    const scriptWith = (headers: Record<string, string>) =>
      incoming(
        `https://catalogue.wear-run.help/${CODE}`,
        { 'user-agent': IPHONE_SAFARI, 'cf-connecting-ip': IP, ...headers },
        LAHORE,
      )

    it.each<[string, Record<string, string>]>([
      [
        "a script borrowing a browser's name (Node fetch sends sec-fetch-mode: cors)",
        { 'sec-fetch-mode': 'cors', accept: '*/*' },
      ],
      ['a HEAD that a cache turned into a GET — no browser headers at all', {}],
    ])('%s is a robot, whatever name it gives', async (_label, headers) => {
      expect(await recordOne(open(scriptWith(headers)))).toEqual([
        expect.objectContaining({ kind: 'robot', browser: 'no browser signals', opens: 1 }),
      ])
    })

    it('Safari before 16.4 sends no Fetch Metadata but still navigates, so it stays a person', async () => {
      const oldSafari = scriptWith({
        'upgrade-insecure-requests': '1',
        accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      })
      expect(await recordOne(open(oldSafari))).toEqual([
        expect.objectContaining({ kind: 'person', browser: 'Safari' }),
      ])
    })

    it('the Download stop pressed by a script is a robot download', async () => {
      const rows = await recordOne({
        event: 'download',
        document: 'catalogue',
        request: scriptWith({}),
      })
      expect(rows).toEqual([expect.objectContaining({ kind: 'robot', downloads: 1 })])
    })

    it('a reading marker is an image request, never a navigation — it keeps its person', async () => {
      const marker = scriptWith({ 'sec-fetch-mode': 'no-cors', 'sec-fetch-dest': 'image' })
      const rows = await recordOne({
        event: 'marker',
        document: 'catalogue',
        request: marker,
        page: 2,
      })
      expect(rows).toEqual([expect.objectContaining({ kind: 'person', furthest_page: 2 })])
    })

    it('a privacy request (Sec-GPC) that is not a browser navigation records nothing at all', async () => {
      expect(await recordOne(open(scriptWith({ 'sec-gpc': '1' })))).toEqual([])
    })

    it('an old-link try by a script with a browser name is not kept', async () => {
      const old = incoming('https://wear-run.help/catalogue', {
        'user-agent': IPHONE_SAFARI,
        'cf-connecting-ip': IP,
      })
      expect(await recordOne({ event: 'old-link', document: 'catalogue', request: old })).toEqual(
        [],
      )
    })
  })

  it('a database that throws leaves the promise resolved and logs only the error name', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const recordVisit = createVisitRecorder({ now: () => new Date(NOW) })
      const { ctx, promises } = collectingCtx()
      const broken = {
        prepare: () => {
          // The message quotes the code, to prove the message itself is never logged.
          throw new Error(`no such table: document_visits (${CODE})`)
        },
      }
      recordVisit({ VISITS: broken as never }, ctx, open())
      expect(promises).toHaveLength(1)
      await expect(promises[0]).resolves.toBeUndefined()
      expect(log).toHaveBeenCalledTimes(1)
      expect(log).toHaveBeenCalledWith('[visits] could not record:', 'Error')
      expect(log.mock.calls.flat().join(' ')).not.toContain(CODE)
    } finally {
      log.mockRestore()
    }
  })
})

/** Every column of every row the recorder writes, checked for text that must never be kept. */
function leaks(database: DatabaseSync, forbidden: readonly string[]): string[] {
  const found: string[] = []
  for (const table of ['document_visits', 'document_visit_salts']) {
    for (const row of database.prepare(`SELECT * FROM ${table}`).all()) {
      for (const [column, value] of Object.entries(row)) {
        for (const text of forbidden) {
          if (String(value).includes(text)) found.push(`${table}.${column} contains ${text}`)
        }
      }
    }
  }
  return found
}

describe('nothing a visitor could be traced by is stored', () => {
  it('no column holds the code, the address or the User-Agent, and the scan can see one', async () => {
    const database = await migratedDatabase()
    const recordVisit = createVisitRecorder({ now: () => new Date(NOW), randomHex: () => SALT })
    const { ctx, settled } = collectingCtx()
    // The code arrives in the address AND in a Referer: the two places a careless change
    // would copy it from.
    const request = pageRequest({
      'accept-language': 'en-GB,en;q=0.9',
      referer: `https://catalogue.wear-run.help/${CODE}/`,
    })
    recordVisit({ VISITS: d1From(database) as never }, ctx, open(request))
    await settled()
    expect(visitRows(database)).toEqual([
      expect.objectContaining({ came_from: 'catalogue.wear-run.help', language: 'en-GB' }),
    ])
    const forbidden = [CODE, IP, IPHONE_SAFARI]
    expect(leaks(database, forbidden)).toEqual([])

    // NEGATIVE CONTROL: the same scan finds a code planted where a careless change would put it.
    database.exec(`UPDATE document_visits SET came_from = '${CODE}'`)
    expect(leaks(database, forbidden)).toEqual([`document_visits.came_from contains ${CODE}`])
  })
})
