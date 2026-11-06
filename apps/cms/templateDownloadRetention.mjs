/**
 * The daily deletion of tech-pack template download records (owner approved 7 Nov 2026, so the
 * privacy page's promise holds without a person remembering).
 *
 * The promise (wear-run.com/privacy#template-downloads, owner-approved words):
 *   - "Your details are kept for 2 years from our last contact with you."
 *   - "If you tick the updates box, we keep your email address and the record of your yes until you
 *     stop the updates."
 * So: a record whose updates box was NOT ticked is deleted once its `delete_after` date has come; a
 * record that ticked it is NEVER touched here (stopping updates is a separate, later step).
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
 * parameterised DELETE on this one table. Nothing else is read or changed. TemplateDownloads has no
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
 * The ids to delete: no yes to updates on record, and the due date has come (`now >= due`, so a
 * record exactly 2 years old IS deleted).
 *
 * ⚠️ FAIL SAFE ON THE UPDATES FLAG: only an explicit false/0 is deletable. A missing or null flag
 * could hide someone's yes, so that record is kept.
 */
export function idsDueForDeletion(rows, now) {
  const due = []
  for (const row of rows) {
    if (row.updates !== false && row.updates !== 0) continue
    const at = dueDate(row)
    if (at && now.getTime() >= at.getTime()) due.push(row.id)
  }
  return due
}

/** The only SQL this job runs. Positional parameters, one table. */
export const RETENTION_SQL = {
  // Candidates: no yes on record. No name, email or company is selected.
  selectCandidates:
    'SELECT id, created_at, delete_after, updates FROM template_downloads WHERE updates = 0 ORDER BY id LIMIT ?1',
  // Re-checks the flag at delete time (a yes cannot be recorded after the select, but this costs
  // nothing) and skips a record somebody has open in the admin.
  deleteOne:
    'DELETE FROM template_downloads WHERE id = ?1 AND updates = 0 AND id NOT IN (SELECT template_downloads_id FROM payload_locked_documents_rels WHERE template_downloads_id IS NOT NULL)',
}

/**
 * One run. Returns `{ due, deleted }`. Throws on a database failure (the caller reports it).
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
  }))
  const due = idsDueForDeletion(rows, now)
  if (due.length === 0) return { due: 0, deleted: 0 }
  const outcomes = await db.batch(due.map((id) => db.prepare(RETENTION_SQL.deleteOne).bind(id)))
  const deleted = outcomes.reduce((sum, o) => sum + (o?.meta?.changes ?? 0), 0)
  return { due: due.length, deleted }
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
    const { due, deleted } = await deleteExpiredTemplateDownloads(env.D1, now)
    // Counts only. `due > deleted` means a record was open in the admin; it goes tomorrow.
    console.log(
      `[template-retention] deleted ${deleted}${due > deleted ? ` (${due - deleted} skipped, open in the admin)` : ''}`,
    )
    return { due, deleted }
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
