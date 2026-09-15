/**
 * Visit records for the two private document links (owner decisions D24 and D28–D32,
 * 2026-09-15): which document, which day in Pakistan, how far it was read and whether it was
 * downloaded. Never the code, never the IP address, never the browser's own string.
 *
 * ⚠️ NEVER IN THE VISITOR'S WAY. `recordVisit` returns at once and hands the write to
 * `ctx.waitUntil`, so the response is sent without waiting for the database. A write that
 * fails logs one fixed line and the error's NAME — never its message, which is text this
 * Worker does not control — and the visitor's response is the same as if nothing had been
 * recorded.
 *
 * ⚠️ ONE ROW PER DAY, DOCUMENT, VISITOR AND KIND. The table's unique index makes every write
 * an upsert, so a robot hammering the page raises a count and never adds rows. Empty text is
 * bound as '', never NULL: SQLite treats NULLs as distinct inside a UNIQUE index, so a NULL
 * visitor would split one day's private row into a row per open.
 *
 * ⚠️ A VISITOR CODE CANNOT OUTLIVE ITS DAY. It is a hash of the day's salt, the connecting
 * address and the User-Agent, computed in memory. The first write of a day creates that
 * day's salt and deletes every earlier one, so once a day has passed its codes cannot be
 * recomputed or linked to another day's.
 *
 * The CMS's migrations create the tables (apps/cms/src/collections/DocumentVisits.ts), and
 * apps/cms/src/apexVisits.test.ts runs every statement here against those real tables.
 */

import { pakistanDay } from '../../packages/shared/src/documentVisits.ts'
import { classifyAgent } from './visitorAgent.js'

/** Every statement this Worker runs against the visit tables. */
export const VISIT_SQL = Object.freeze({
  // ?1 day, ?2 document, ?3 kind, ?4 visitor, ?5 at, ?6 opens, ?7 furthest page, ?8 pages total,
  // ?9 downloads, ?10 country, ?11 region, ?12 city, ?13 timezone, ?14 network, ?15 device,
  // ?16 system, ?17 browser, ?18 language, ?19 came_from
  upsertVisit: `INSERT INTO document_visits (day, document, kind, visitor, first_at, last_at, minutes_active, opens, furthest_page, pages_total, downloads, country, region, city, timezone, network, device, system, browser, language, came_from)
VALUES (?1, ?2, ?3, ?4, ?5, ?5, 0, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17, ?18, ?19)
ON CONFLICT (day, document, visitor, kind) DO UPDATE SET
  last_at = excluded.last_at,
  minutes_active = CAST(ROUND((julianday(excluded.last_at) - julianday(document_visits.first_at)) * 1440) AS INTEGER),
  opens = document_visits.opens + excluded.opens,
  furthest_page = MAX(document_visits.furthest_page, excluded.furthest_page),
  pages_total = MAX(document_visits.pages_total, excluded.pages_total),
  downloads = document_visits.downloads + excluded.downloads,
  updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`,
  insertSalt: 'INSERT OR IGNORE INTO document_visit_salts (day, salt) VALUES (?1, ?2)',
  selectSalt: 'SELECT salt FROM document_visit_salts WHERE day = ?1',
  deleteSaltsBefore: 'DELETE FROM document_visit_salts WHERE day < ?1',
})

/** @typedef {'open' | 'marker' | 'download' | 'old-link'} VisitEvent */
/**
 * @typedef {{
 *   event: VisitEvent,
 *   document: 'catalogue' | 'profile',
 *   request: Request,
 *   page?: number,
 *   pagesTotal?: number,
 * }} Visit
 */
/** @typedef {{ waitUntil(promise: Promise<unknown>): void }} WaitUntil */

/** A stored detail is cut to this many characters: a header is text the visitor chose. */
const DETAIL_LIMIT = 100

/** @param {Uint8Array} bytes */
const hex = (bytes) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')

/**
 * The daily visitor code: the first 16 hex characters of SHA-256 over
 * `<salt>|<connecting address>|<User-Agent>`.
 *
 * @param {string} salt
 * @param {string} ip
 * @param {string} userAgent
 * @returns {Promise<string>}
 */
export async function visitorCode(salt, ip, userAgent) {
  const text = new TextEncoder().encode(`${salt}|${ip}|${userAgent}`)
  const digest = await crypto.subtle.digest('SHA-256', text)
  return hex(new Uint8Array(digest, 0, 8))
}

/**
 * @param {number} bytes
 * @returns {string}
 */
function secureRandomHex(bytes) {
  return hex(crypto.getRandomValues(new Uint8Array(bytes)))
}

/** @param {unknown} value */
const detail = (value) => (typeof value === 'string' ? value.slice(0, DETAIL_LIMIT) : '')

/**
 * The Referer's host and nothing else: a full address can carry a path, a query or a code.
 *
 * @param {string | null} referer
 */
function refererHost(referer) {
  if (!referer) return ''
  try {
    return new URL(referer).hostname
  } catch {
    return ''
  }
}

/**
 * What Cloudflare and the request's own headers say about where a visit came from.
 *
 * @param {Request} request
 * @returns {{ country: string, region: string, city: string, timezone: string, network: string, language: string, cameFrom: string }}
 */
export function requestDetails(request) {
  const cf = /** @type {Record<string, unknown>} */ (request.cf ?? {})
  const acceptLanguage = request.headers.get('accept-language') ?? ''
  const language = acceptLanguage.split(',')[0].split(';')[0].trim()
  return {
    country: detail(cf.country),
    region: detail(cf.region),
    city: detail(cf.city),
    timezone: detail(cf.timezone),
    network: detail(cf.asOrganization),
    language: detail(language),
    cameFrom: detail(refererHost(request.headers.get('referer'))),
  }
}

/**
 * What one event adds to its day's row: [opens, furthest page, pages total, downloads].
 * `?? 0` because D1 refuses to bind `undefined`.
 *
 * @param {Visit} visit
 * @returns {[number, number, number, number]}
 */
function increments(visit) {
  switch (visit.event) {
    case 'open':
      return [1, 1, visit.pagesTotal ?? 0, 0]
    case 'marker':
      return [0, visit.page ?? 0, 0, 0]
    case 'download':
      return [0, 0, 0, 1]
    case 'old-link':
      return [1, 0, 0, 0]
    default:
      throw new TypeError('unknown visit event')
  }
}

/**
 * @param {{ now?: () => Date, randomHex?: (bytes: number) => string }} [options]
 * @returns {(env: { VISITS?: D1Database }, ctx: WaitUntil | undefined, visit: Visit) => void}
 */
export function createVisitRecorder({ now = () => new Date(), randomHex = secureRandomHex } = {}) {
  /**
   * The day's salt, kept by this isolate for the rest of that day.
   *
   * @type {{ day: string, salt: string } | undefined}
   */
  let remembered

  /**
   * @param {D1Database} db
   * @param {string} day
   * @returns {Promise<string>}
   */
  async function saltFor(db, day) {
    if (remembered?.day === day) return remembered.salt
    // INSERT OR IGNORE, then read back: two requests racing on a day's first write keep
    // whichever salt landed first, and both hash with it.
    await db.prepare(VISIT_SQL.insertSalt).bind(day, randomHex(32)).run()
    const row = await db.prepare(VISIT_SQL.selectSalt).bind(day).first()
    await db.prepare(VISIT_SQL.deleteSaltsBefore).bind(day).run()
    const salt = row?.salt
    if (typeof salt !== 'string') throw new Error('no salt was stored for the day')
    remembered = { day, salt }
    return salt
  }

  /**
   * @param {D1Database} db
   * @param {Visit} visit
   */
  async function record(db, visit) {
    const instant = now()
    const day = pakistanDay(instant)
    const at = instant.toISOString()
    const { request } = visit
    const [opens, furthestPage, pagesTotal, downloads] = increments(visit)

    // Global Privacy Control (owner decision D24): the open is counted on one shared row per
    // day and document, and nothing else is kept. No code is made, so no salt is touched.
    if (request.headers.get('sec-gpc')?.trim() === '1') {
      if (visit.event !== 'open') return
      await db
        .prepare(VISIT_SQL.upsertVisit)
        .bind(
          day,
          visit.document,
          'private',
          '',
          at,
          opens,
          furthestPage,
          pagesTotal,
          downloads,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          '',
        )
        .run()
      return
    }

    const userAgent = request.headers.get('user-agent')
    const agent = classifyAgent(userAgent, {
      mobileHint: request.headers.get('sec-ch-ua-mobile'),
      platformHint: request.headers.get('sec-ch-ua-platform'),
    })
    // A robot trying an old address tells the owner nothing.
    if (visit.event === 'old-link' && agent.kind !== 'person') return
    const kind = visit.event === 'old-link' ? 'old-link' : agent.kind

    const salt = await saltFor(db, day)
    const address = request.headers.get('cf-connecting-ip') ?? ''
    const visitor = await visitorCode(salt, address, userAgent ?? '')
    const where = requestDetails(request)
    await db
      .prepare(VISIT_SQL.upsertVisit)
      .bind(
        day,
        visit.document,
        kind,
        visitor,
        at,
        opens,
        furthestPage,
        pagesTotal,
        downloads,
        where.country,
        where.region,
        where.city,
        where.timezone,
        where.network,
        agent.device,
        agent.system,
        agent.browser,
        where.language,
        where.cameFrom,
      )
      .run()
  }

  return function recordVisit(env, ctx, visit) {
    const db = env?.VISITS
    if (!db || typeof ctx?.waitUntil !== 'function') return
    ctx.waitUntil(
      record(db, visit).catch((error) => {
        console.error('[visits] could not record:', error?.name)
      }),
    )
  }
}
