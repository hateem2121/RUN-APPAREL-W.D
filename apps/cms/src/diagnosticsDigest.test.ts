import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'

/**
 * The weekly diagnostics digest's SQL, run against real SQLite.
 *
 * WHY. That query is the only reader of the Events table, and its first public issue
 * (#5, 2026-09-11) was wrong in three ways that no workflow rule can see:
 *
 * 1. 371 of its 385 rows came from ONE scripted browser audit we ran ourselves on
 *    2026-09-10, and nothing in the table said it was one browser.
 * 2. 17 of its 19 `client_error` rows were `ResizeObserver loop…`, a notice Sentry
 *    already ignores as harmless (apps/viewer/src/lib/sentry.ts).
 * 3. `created_at` is ISO (`2026-09-10T04:01:20.203Z`) and the cutoff was
 *    `datetime('now', …)`, which prints a SPACE where ISO has a `T`. `T` sorts after a
 *    space, so every row on the cutoff DATE passed whatever its time: the growth line
 *    said "491 rows in 24h" when the true count was 1.
 *
 * The SQL is read out of the workflow file rather than copied, so this cannot drift
 * from what CI runs. Line-based for the reason workflowHardening.test.ts gives: no
 * workspace here depends on a YAML library.
 */

const REPO_ROOT = join(import.meta.dirname, '..', '..', '..')
const WORKFLOW = readFileSync(
  join(REPO_ROOT, '.github', 'workflows', 'diagnostics-digest.yml'),
  'utf8',
)

/** The `--command "…"` of the named step. Throws, rather than skipping, if it moved. */
function commandOf(stepName: string): string {
  const start = WORKFLOW.indexOf(`- name: ${stepName}`)
  if (start === -1) throw new Error(`diagnostics-digest.yml has no step "${stepName}"`)
  const match = /--command "([^"]+)"/.exec(WORKFLOW.slice(start))
  if (!match?.[1]) throw new Error(`step "${stepName}" has no --command "…"`)
  return match[1]
}

const DIGEST = commandOf('Read the last 7 days of diagnostics')
const GROWTH = commandOf('Measure events growth')

// Production's DDL, as read from D1's sqlite_master on 2026-09-11.
const EVENTS_DDL = `CREATE TABLE events (
  id integer PRIMARY KEY NOT NULL,
  type text NOT NULL,
  event text NOT NULL,
  product text,
  variant text,
  placement text,
  message text,
  ua text,
  updated_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
)`

const HOUR = 3_600_000
const DAY = 24 * HOUR
const PHONE = 'Mozilla/5.0 (iPhone) Safari'
const OTHER_PHONE = 'Mozilla/5.0 (Linux; Android) Chrome'
const OUR_AUDIT = 'Mozilla/5.0 (compatible) run-apparel-audit/1.0'

interface Row {
  type?: string
  event: string
  product?: string
  message?: string
  ua?: string
  /** An exact ISO timestamp; otherwise `ageMs` before now, default one hour. */
  createdAt?: string
  ageMs?: number
}

function query(sql: string, rows: Row[]): Record<string, unknown>[] {
  const db = new DatabaseSync(':memory:')
  db.exec(EVENTS_DDL)
  const insert = db.prepare(
    'INSERT INTO events (type, event, product, message, ua, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
  for (const r of rows) {
    const at = r.createdAt ?? new Date(Date.now() - (r.ageMs ?? HOUR)).toISOString()
    insert.run(
      r.type ?? 'diagnostic',
      r.event,
      r.product ?? null,
      r.message ?? null,
      r.ua ?? null,
      at,
      at,
    )
  }
  const result = db.prepare(sql).all()
  db.close()
  return result
}

describe('diagnostics digest query', () => {
  it('reports a real visitor’s failure', () => {
    // The positive control for every test below: a filter that dropped EVERYTHING
    // would pass each "is left out" assertion on an empty result.
    const rows = query(DIGEST, [{ event: 'viewer-load-failed', product: 'r-xmp', ua: PHONE }])
    expect(rows).toEqual([
      expect.objectContaining({ event: 'viewer-load-failed', product: 'r-xmp', n: 1 }),
    ])
  })

  it('leaves out checks we ran ourselves', () => {
    const rows = query(DIGEST, [
      { event: 'viewer-load-failed', product: 'r-xmp', ua: PHONE },
      ...Array.from({ length: 30 }, () => ({
        event: 'render-scale-degraded',
        product: 'R-XPS',
        message: 'GPU throttling',
        ua: OUR_AUDIT,
      })),
    ])
    expect(rows.map((r) => r.event)).toEqual(['viewer-load-failed'])
  })

  it('leaves out the ResizeObserver notice Sentry ignores, and no other error', () => {
    const rows = query(DIGEST, [
      {
        type: 'error',
        event: 'client_error',
        message: 'ResizeObserver loop completed with undelivered notifications.',
        ua: PHONE,
      },
      { type: 'error', event: 'client_error', message: 'TypeError: model is undefined', ua: PHONE },
      // No message at all. `NOT (… AND message LIKE …)` is NULL for this row, and WHERE
      // drops NULL — so without coalesce() the filter would swallow it silently.
      { type: 'error', event: 'client_error', ua: PHONE },
    ])
    expect(rows).toEqual([expect.objectContaining({ event: 'client_error', n: 2 })])
  })

  it('counts how many different browsers stand behind each row', () => {
    const rows = query(DIGEST, [
      { event: 'render-scale-degraded', product: 'R-XPS', message: 'GPU throttling', ua: PHONE },
      { event: 'render-scale-degraded', product: 'R-XPS', message: 'GPU throttling', ua: PHONE },
      { event: 'render-scale-degraded', product: 'R-XPS', ua: OTHER_PHONE },
    ])
    expect(rows).toEqual([
      expect.objectContaining({ event: 'render-scale-degraded', n: 3, browsers: 2 }),
    ])
  })

  it('looks back exactly seven days, not to midnight on the seventh', () => {
    const cutoff = new Date(Date.now() - 7 * DAY).toISOString()
    const startOfCutoffDay = `${cutoff.slice(0, 10)}T00:00:00.000Z`
    // Precondition. False only in the first millisecond of a UTC day.
    expect(startOfCutoffDay < cutoff).toBe(true)

    const rows = query(DIGEST, [
      { event: 'model-load-error', product: 'OLDER', ua: PHONE, createdAt: startOfCutoffDay },
      { event: 'model-load-error', product: 'INSIDE', ua: PHONE, ageMs: 6 * DAY },
    ])
    expect(rows.map((r) => r.product)).toEqual(['INSIDE'])
  })
})

describe('events growth query', () => {
  it('counts the last 24 hours, not everything since midnight yesterday', () => {
    const dayAgo = new Date(Date.now() - DAY).toISOString()
    const startOfYesterday = `${dayAgo.slice(0, 10)}T00:00:00.000Z`
    expect(startOfYesterday < dayAgo).toBe(true)

    const [counts] = query(GROWTH, [
      { type: 'analytics', event: 'viewer_page_loaded', createdAt: startOfYesterday },
      { type: 'analytics', event: 'viewer_page_loaded', ageMs: HOUR },
    ])
    expect(counts).toEqual({ day: 1, week: 2, total: 2 })
  })
})
