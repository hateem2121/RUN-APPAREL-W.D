/**
 * The daily deletion of tech-pack template download records (owner approved 7 Nov 2026, so the
 * privacy page's promise holds without a person remembering).
 *
 * The promise (wear-run.com/privacy#template-downloads, owner-approved words):
 *   - "Your details are kept for 2 years from our last contact with you."
 *   - "If you tick the updates box, we keep your email address and the record of your yes until you
 *     stop the updates."
 * So: a record whose updates box was NOT ticked is deleted once its `delete_after` date has come; a
 * record that ticked it is NEVER deleted here.
 *
 * And the third promise (7 Nov 2026): "If you stop the updates, we keep just your email address, so
 * that no update reaches you again." A person on the team sets `updates_stopped_at` ("Updates stopped
 * on") when someone asks to stop. This job then blanks every personal field but `email` on that record
 * and NEVER deletes it: the email is the do-not-send list, so deleting it would let an update reach
 * the person again. A stopped record is out of reach of the 2-year rule too.
 *
 * ⚠️ "LAST CONTACT" IS THE `delete_after` COLUMN, NOT `created_at`. TemplateDownloads.ts sets it at
 * receipt and the team MOVES IT ON each time they write to the person again. Counting from
 * `created_at` would delete a person we are still in touch with. Only a row with no usable
 * `delete_after` (the hook always sets one, so this is a safety net) falls back to `created_at`
 * plus 2 CALENDAR years.
 *
 * ⚠️ WHY RAW D1, NOT `payload.delete`. This Worker's Payload lives inside the OpenNext bundle and
 * finds D1 through `getCloudflareContext`, which only works inside an OpenNext request. A cron
 * trigger runs `scheduled`, outside any request, so Payload cannot start there. Instead: one
 * parameterised DELETE (and one UPDATE, for stopped records) on this one table. Nothing else is read
 * or changed. TemplateDownloads has no
 * delete hooks and nothing points at it except document locks (below), so no Payload behaviour is
 * skipped.
 *
 * ⚠️ A DOCUMENT LOCK WOULD MAKE THE DELETE FAIL. `payload_locked_documents_rels.template_downloads_id`
 * references this table with no ON DELETE action, and D1 enforces foreign keys. A person with the
 * record open in the admin holds such a row. The DELETE therefore skips a locked record (a read of
 * the lock table, no change to it); tomorrow's run takes it.
 *
 * ⚠️ PRIVACY OF THE RUN ITSELF. Only id, the two dates and the flag are read. The log line carries
 * counts, never a name, email, company or id.
 */

/** Calendar years kept after the last contact (privacy page: "2 years"). */
export const KEEP_YEARS = 2

/** At most this many records are removed per run; the rest wait for tomorrow. Bounds one batch. */
export const MAX_PER_RUN = 500

/**
 * `date` plus whole calendar years, in UTC. Same month and day, so 6 Nov 2026 -> 6 Nov 2028.
 * ⚠️ 29 Feb + 2 years has no same date in a non-leap year; the JS Date rolls it to 1 Mar, which
 * keeps the record a day LONGER (never shorter than the promised 2 years). Pinned by a test.
 */
export function addCalendarYears(date, years) {
  const result = new Date(date.getTime())
  result.setUTCFullYear(result.getUTCFullYear() + years)
  return result
}

function parsed(value) {
  if (typeof value !== 'string' || value.length === 0) return null
  const time = Date.parse(value)
  return Number.isNaN(time) ? null : new Date(time)
}

/**
 * When a record falls due: its own `deleteAfter` if it has a usable one, otherwise `createdAt`
 * plus KEEP_YEARS calendar years, otherwise null (never due: unknown dates keep the record).
 */
export function dueDate(row) {
  const moved = parsed(row.deleteAfter)
  if (moved) return moved
  const created = parsed(row.createdAt)
  return created ? addCalendarYears(created, KEEP_YEARS) : null
}

/**
 * Has this person asked to stop the updates? Any value but null, undefined or '' counts, so an
 * odd value keeps the record rather than deleting the do-not-send entry.
 */
export function isStopped(row) {
  return (
    row.updatesStoppedAt !== null &&
    row.updatesStoppedAt !== undefined &&
    row.updatesStoppedAt !== ''
  )
}

/**
 * The ids to delete: no yes to updates on record, no stop date, and the due date has come
 * (`now >= due`, so a record exactly 2 years old IS deleted).
 *
 * ⚠️ FAIL SAFE ON THE UPDATES FLAG: only an explicit false/0 is deletable. A missing or null flag
 * could hide someone's yes, so that record is kept.
 *
 * ⚠️ A STOPPED RECORD IS NEVER DELETED, even with updates = 0 and a long-past date: it is the
 * do-not-send list.
 */
export function idsDueForDeletion(rows, now) {
  const due = []
  for (const row of rows) {
    if (isStopped(row)) continue
    if (row.updates !== false && row.updates !== 0) continue
    const at = dueDate(row)
    if (at && now.getTime() >= at.getTime()) due.push(row.id)
  }
  return due
}

/** The only SQL this job runs. Positional parameters, one table. */
export const RETENTION_SQL = {
  // Candidates: no yes on record and no stop date. No name, email or company is selected.
  selectCandidates:
    "SELECT id, created_at, delete_after, updates, updates_stopped_at FROM template_downloads WHERE updates = 0 AND (updates_stopped_at IS NULL OR updates_stopped_at = '') ORDER BY id LIMIT ?1",
  // Re-checks the flag and the stop date at delete time (a stop could be set after the select) and
  // skips a record somebody has open in the admin.
  deleteOne:
    "DELETE FROM template_downloads WHERE id = ?1 AND updates = 0 AND (updates_stopped_at IS NULL OR updates_stopped_at = '') AND id NOT IN (SELECT template_downloads_id FROM payload_locked_documents_rels WHERE template_downloads_id IS NOT NULL)",
  // The stop: every personal field but `email` is blanked ('' where the column is NOT NULL, NULL
  // where it may be empty). Only a record that still holds something is touched, so the count is
  // the records minimised today and a second run changes nothing. A locked record waits a day: a
  // save from an open admin screen would otherwise write the old values back.
  minimiseStopped:
    "UPDATE template_downloads SET name = '', company = '', country = '', job_title = NULL, whatsapp = NULL WHERE id IN (SELECT id FROM template_downloads WHERE updates_stopped_at IS NOT NULL AND updates_stopped_at <> '' AND (name <> '' OR company <> '' OR country <> '' OR job_title IS NOT NULL OR whatsapp IS NOT NULL) AND id NOT IN (SELECT template_downloads_id FROM payload_locked_documents_rels WHERE template_downloads_id IS NOT NULL) ORDER BY id LIMIT ?1)",
}

/**
 * One run. Returns `{ due, deleted, minimised }`. Throws on a database failure (the caller reports
 * it). The DELETE comes first, then the one UPDATE.
 * @param {{ prepare: Function, batch: Function }} db  the D1 binding
 * @param {Date} now
 */
export async function deleteExpiredTemplateDownloads(db, now = new Date()) {
  const { results } = await db.prepare(RETENTION_SQL.selectCandidates).bind(MAX_PER_RUN).all()
  const rows = (results ?? []).map((r) => ({
    id: r.id,
    createdAt: r.created_at,
    deleteAfter: r.delete_after,
    updates: r.updates,
    updatesStoppedAt: r.updates_stopped_at,
  }))
  const due = idsDueForDeletion(rows, now)
  let deleted = 0
  if (due.length > 0) {
    const outcomes = await db.batch(due.map((id) => db.prepare(RETENTION_SQL.deleteOne).bind(id)))
    deleted = outcomes.reduce((sum, o) => sum + (o?.meta?.changes ?? 0), 0)
  }
  const minimisedOutcome = await db.prepare(RETENTION_SQL.minimiseStopped).bind(MAX_PER_RUN).run()
  return { due: due.length, deleted, minimised: minimisedOutcome?.meta?.changes ?? 0 }
}

/** The log line: counts only, never a name, email, company or id. */
export function logLine({ due, deleted, minimised }) {
  const skipped = due > deleted ? ` (${due - deleted} skipped, open in the admin)` : ''
  return `[template-retention] deleted ${deleted}, minimised ${minimised}${skipped}`
}

/**
 * What the Worker's `scheduled` handler awaits. NEVER THROWS: a failure goes to `report` (Sentry)
 * and to the log, and the other requests this Worker serves are untouched.
 * @param {{ D1?: unknown }} env
 * @param {(error: unknown) => Promise<unknown>} report
 */
export async function runTemplateRetention(env, report, now = new Date()) {
  try {
    if (!env.D1) throw new Error('template retention: no D1 binding')
    const result = await deleteExpiredTemplateDownloads(env.D1, now)
    // Counts only. `due > deleted` means a record was open in the admin; it goes tomorrow.
    console.log(logLine(result))
    return result
  } catch (error) {
    console.error('[template-retention] failed', error?.name)
    try {
      await report(error)
    } catch {
      // Reporting is best effort; it must not turn a handled failure into an unhandled one.
    }
    return null
  }
}
