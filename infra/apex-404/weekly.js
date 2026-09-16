/**
 * The documents Worker's scheduled jobs: a daily clean-up, and a Monday summary email.
 *
 * WHY HERE (owner decisions D27, D29 and D33–D36, 2026-09-15). This Worker already writes
 * the visit rows, into the database the CMS reads. The jobs that tidy and summarise those
 * rows therefore sit beside the writes, and no new service is added. wrangler.jsonc holds
 * the two cron triggers; index.js hands each run to `ctx.waitUntil`.
 *
 * ⚠️ AT MOST ONE EMAIL A WEEK, AND A FAILED WEEK IS TRIED AGAIN. `document_visit_emails`
 * keeps one row per week, named by its Monday:
 *   - a `sent` week is skipped;
 *   - a `failed` week is sent the next time a weekly trigger fires for it.
 * That is how a temporary `* * * * *` trigger sends the owner-approved test email (D38), and
 * then stops sending.
 *
 * ⚠️ NOTHING HERE THROWS, AND NOTHING SECRET IS LOGGED. A missing RESEND_API_KEY or
 * VISITS_EMAIL_TO is stored as `failed: not configured`, and no deploy step requires either
 * one. The only log line names an error's type: never the key, the recipient, a code or an
 * address.
 *
 * ⚠️ AGGREGATES ONLY. The email names no person and no visitor code: only counts,
 * countries, and each country's top city. apps/cms/src/apexWeekly.test.ts scans the sent
 * text for every seeded visitor code.
 */

import {
  monthsBefore,
  pakistanDay,
  previousWeek,
  summariseVisits,
} from '../../packages/shared/src/documentVisits.ts'
import { VISIT_SQL } from './visits.js'

/** 00:05 UTC every day: 05:05 in Pakistan (UTC+05:00 all year). */
export const CLEANUP_CRON = '5 0 * * *'
/** 04:00 UTC every Monday: 09:00 in Pakistan. */
export const WEEKLY_CRON = '0 4 * * 1'
export const RESEND_ENDPOINT = 'https://api.resend.com/emails'
export const EMAIL_FROM = 'RUN APPAREL <noreply@wear-run.help>'
export const ADMIN_VISITS_URL = 'https://cms.wear-run.help/admin/collections/document-visits'

export const SCHEDULE_SQL = Object.freeze({
  deleteVisitsBefore: 'DELETE FROM document_visits WHERE day < ?1',
  deleteEmailsBefore: 'DELETE FROM document_visit_emails WHERE week < ?1',
  selectWeekStatus: 'SELECT status FROM document_visit_emails WHERE week = ?1',
  // Aliased to the shared VisitRow's field names, so summariseVisits reads the rows as they come.
  selectVisitRows: [
    'SELECT day, document, kind, visitor, opens, furthest_page AS furthestPage,',
    'pages_total AS pagesTotal, downloads, country, city, device',
    'FROM document_visits WHERE day >= ?1 AND day <= ?2',
  ].join(' '),
  // ?1 week, ?2 status, ?3 sent_at (an ISO time, or NULL when not sent), ?4 error ('' when sent)
  upsertWeekStatus: [
    'INSERT INTO document_visit_emails (week, status, sent_at, error) VALUES (?1, ?2, ?3, ?4)',
    'ON CONFLICT (week) DO UPDATE SET status = excluded.status, sent_at = excluded.sent_at,',
    "error = excluded.error, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
  ].join(' '),
})

const MONTHS = Object.freeze([
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
])

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region' })

/**
 * A country's English name, or its code when there is no name to give.
 *
 * Cloudflare sends codes that are not countries. One is `T1` for Tor, which the ECMA-402
 * standard makes `Intl.DisplayNames` REFUSE with a RangeError (measured on Node 26.8). One
 * such visitor must not stop the whole week's email.
 *
 * @param {string} code
 * @returns {string}
 */
function countryName(code) {
  try {
    return REGION_NAMES.of(code) ?? code
  } catch {
    return code
  }
}

/**
 * @param {number} n
 * @param {string} one
 * @param {string} many
 */
const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

/**
 * One document's lines, each indented by two spaces.
 *
 * @param {import('../../packages/shared/src/documentVisits.ts').DocumentSummary} summary
 * @returns {string[]}
 */
function sectionLines(summary) {
  const lines = []
  if (summary.people + summary.privateVisits === 0) {
    lines.push('  No visits this week.')
  } else {
    lines.push(
      `  People: ${count(summary.people, 'different person', 'different people')}, ${count(summary.opens, 'open', 'opens')}`,
    )
    if (summary.privateVisits > 0) lines.push(`  Private visits: ${summary.privateVisits}`)
    lines.push(`  Downloads: ${summary.downloads}`)
    lines.push(
      `  Reading: ${summary.readPastHalf} read past halfway, ${summary.reachedEnd} reached the last page`,
    )
    if (summary.topCountries.length > 0) {
      const places = summary.topCountries.map(
        (place) =>
          `${countryName(place.country)} ${place.people}` +
          (place.topCity ? ` (${place.topCity} ${place.topCityPeople})` : ''),
      )
      lines.push(`  Where: ${places.join(', ')}`)
    }
    const { phone, tablet, computer, unknown } = summary.devices
    const devices = [
      phone > 0 ? count(phone, 'phone', 'phones') : '',
      tablet > 0 ? count(tablet, 'tablet', 'tablets') : '',
      computer > 0 ? count(computer, 'computer', 'computers') : '',
      unknown > 0 ? count(unknown, 'other device', 'other devices') : '',
    ].filter(Boolean)
    if (devices.length > 0) lines.push(`  Devices: ${devices.join(', ')}`)
  }
  const also = [
    summary.linkPreviews > 0 ? count(summary.linkPreviews, 'link preview', 'link previews') : '',
    summary.oldLinkTries > 0
      ? count(summary.oldLinkTries, 'try of the old link', 'tries of the old link')
      : '',
  ].filter(Boolean)
  if (also.length > 0) lines.push(`  Also: ${also.join(', ')}`)
  return lines
}

/**
 * "Document visits: 14 to 20 September 2026". The month and the year are named only where
 * they change inside the week.
 *
 * @param {import('../../packages/shared/src/documentVisits.ts').WeekRange} range
 * @returns {string}
 */
export function weeklySubject(range) {
  const [fromYear, fromMonth, fromDay] = range.monday.split('-').map(Number)
  const [toYear, toMonth, toDay] = range.sunday.split('-').map(Number)
  const month = (/** @type {number | undefined} */ number) => MONTHS[(number ?? 1) - 1]
  const end = `${toDay} ${month(toMonth)} ${toYear}`
  if (fromYear !== toYear) {
    return `Document visits: ${fromDay} ${month(fromMonth)} ${fromYear} to ${end}`
  }
  if (fromMonth !== toMonth) return `Document visits: ${fromDay} ${month(fromMonth)} to ${end}`
  return `Document visits: ${fromDay} to ${end}`
}

/**
 * The email's plain text: the catalogue, then the company profile, then the admin address.
 *
 * @param {Record<'catalogue' | 'profile', import('../../packages/shared/src/documentVisits.ts').DocumentSummary>} summaries
 * @returns {string}
 */
export function weeklyText(summaries) {
  return [
    'CATALOGUE',
    ...sectionLines(summaries.catalogue),
    '',
    'COMPANY PROFILE',
    ...sectionLines(summaries.profile),
    '',
    `Every visit: ${ADMIN_VISITS_URL}`,
    '',
  ].join('\n')
}

/**
 * The weekly email for the Monday–Sunday before `now()`.
 *
 * @param {D1Database} db
 * @param {{ RESEND_API_KEY?: string, VISITS_EMAIL_TO?: string }} env
 * @param {() => Date} now
 * @param {typeof fetch} send
 * @returns {Promise<'sent' | 'skipped' | 'failed'>}
 */
async function weeklyEmail(db, env, now, send) {
  const range = previousWeek(now())
  /**
   * @param {'sent' | 'failed'} status
   * @param {string | null} sentAt
   * @param {string} error
   */
  const record = (status, sentAt, error) =>
    db
      .prepare(SCHEDULE_SQL.upsertWeekStatus)
      .bind(range.monday, status, sentAt, error.slice(0, 200))
      .run()

  const existing = await db.prepare(SCHEDULE_SQL.selectWeekStatus).bind(range.monday).first()
  if (existing?.status === 'sent') return 'skipped'

  const { results } = await db
    .prepare(SCHEDULE_SQL.selectVisitRows)
    .bind(range.monday, range.sunday)
    .all()
  const summaries = summariseVisits(
    /** @type {import('../../packages/shared/src/documentVisits.ts').VisitRow[]} */ (
      /** @type {unknown} */ (results)
    ),
    3,
  )

  // Trimmed: a secret pasted with a trailing newline would otherwise make an invalid
  // Authorization header, and the error could repeat the header's value.
  const key = env.RESEND_API_KEY?.trim() ?? ''
  const recipient = env.VISITS_EMAIL_TO?.trim() ?? ''
  if (key === '' || recipient === '') {
    await record('failed', null, 'not configured')
    return 'failed'
  }

  let response
  try {
    response = await send(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${key}`,
        'content-type': 'application/json',
        // One email a week, even when this runs twice for the same week: a Cloudflare
        // retry after a send whose D1 write was lost, or the temporary every-minute
        // trigger used for the owner's one test email. Resend keeps a key for 24 hours
        // and returns the first response instead of sending again (measured 2026-09-16,
        // resend.com/blog/engineering-idempotency-keys). The retry's payload is
        // identical — `range` is a closed Monday–Sunday span and neither the subject nor
        // the body carries a timestamp — so the cached response comes back `ok` and the
        // retry writes the `sent` row the first attempt lost. Beyond 24 hours the key
        // has expired, but by then the Monday cron computes a different week.
        'idempotency-key': `weekly-${range.monday}`,
      },
      body: JSON.stringify({
        from: EMAIL_FROM,
        to: [recipient],
        subject: weeklySubject(range),
        text: weeklyText(summaries),
      }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (error) {
    await record('failed', null, String(error))
    return 'failed'
  }

  if (response.ok) {
    await record('sent', now().toISOString(), '')
    return 'sent'
  }
  const detail = await response.text().catch(() => '')
  await record('failed', null, `Resend answered ${response.status}: ${detail.slice(0, 150)}`)
  return 'failed'
}

/**
 * The entry point for both cron triggers. It never throws: every outcome is one of the five
 * results, and a failure is stored or logged by name.
 *
 * @param {string} cron
 * @param {{ VISITS?: D1Database, RESEND_API_KEY?: string, VISITS_EMAIL_TO?: string }} env
 * @param {{ now?: () => Date, fetch?: typeof fetch }} [deps]
 * @returns {Promise<'cleaned' | 'sent' | 'skipped' | 'failed' | 'no-database'>}
 */
export async function runScheduled(cron, env, deps = {}) {
  const now = deps.now ?? (() => new Date())
  // Wrapped, not stored bare: a Worker's global fetch throws "Illegal invocation" when it
  // runs with any `this` but the global one.
  const send = deps.fetch ?? ((input, init) => fetch(input, init))
  try {
    const db = env.VISITS
    if (!db) return 'no-database'
    if (cron === CLEANUP_CRON) {
      const today = pakistanDay(now())
      const cutoff = monthsBefore(today, 12)
      await db.batch([
        db.prepare(SCHEDULE_SQL.deleteVisitsBefore).bind(cutoff),
        db.prepare(SCHEDULE_SQL.deleteEmailsBefore).bind(cutoff),
        db.prepare(VISIT_SQL.deleteSaltsBefore).bind(today),
      ])
      return 'cleaned'
    }
    return await weeklyEmail(db, env, now, send)
  } catch (error) {
    console.error('[visits] scheduled job failed:', /** @type {Error} */ (error)?.name)
    return 'failed'
  }
}
