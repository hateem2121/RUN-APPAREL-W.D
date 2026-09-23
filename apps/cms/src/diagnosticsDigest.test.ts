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
const VITALS = commandOf('Read the last 7 days of page speed')

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
  created_at text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  lcp_ms numeric,
  cls numeric
)`
// The last two arrive with migration 20260917_120000_add_web_vitals_values (audit PF-05b).
// ALTER TABLE ADD appends, which is why they sit after created_at here as they do in D1.

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
  /** The two page-speed numbers; `web_vitals` rows only in real data. */
  lcpMs?: number | null
  cls?: number | null
  /** An exact ISO timestamp; otherwise `ageMs` before now, default one hour. */
  createdAt?: string
  ageMs?: number
}

function query(sql: string, rows: Row[]): Record<string, unknown>[] {
  const db = new DatabaseSync(':memory:')
  db.exec(EVENTS_DDL)
  const insert = db.prepare(
    'INSERT INTO events (type, event, product, message, ua, lcp_ms, cls, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
  )
  for (const r of rows) {
    const at = r.createdAt ?? new Date(Date.now() - (r.ageMs ?? HOUR)).toISOString()
    insert.run(
      r.type ?? 'diagnostic',
      r.event,
      r.product ?? null,
      r.message ?? null,
      r.ua ?? null,
      r.lcpMs ?? null,
      r.cls ?? null,
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

/**
 * PAGE SPEED FROM REAL VISITS (audit PF-05b, 2026-09-17). The viewer has measured LCP
 * and CLS on every visit since 2026-09-04; until 2026-09-17 both numbers were dropped
 * before they were stored, and nothing read them. The weekly issue now reports the 75th
 * percentile of each: the percentile the metrics are judged at. It is a nearest-rank
 * ORDER BY with an OFFSET, because SQLite has no percentile function, and an off-by-one
 * there is invisible in production — so the ranks are pinned here.
 */
const vital = (
  lcpMs: number | null,
  cls: number | null,
  ua: string = PHONE,
  extra: Partial<Row> = {},
): Row => ({ type: 'analytics', event: 'web_vitals', lcpMs, cls, ua, ...extra })

describe('page speed query (PF-05b)', () => {
  it('reports the 75th percentile of each number, by nearest rank', () => {
    const [week] = query(VITALS, [
      vital(1000, 0.01),
      vital(2000, 0.3, OTHER_PHONE),
      vital(3000, 0.02),
      vital(4000, 0.05),
      vital(null, 0.03),
    ])
    // Four LCPs: rank ceil(0.75 × 4) = 3 → 3000. Five CLS: rank ceil(0.75 × 5) = 4 → 0.05.
    expect(week).toEqual({
      visits: 5,
      browsers: 2,
      lcp_n: 4,
      lcp_p75: 3000,
      cls_n: 5,
      cls_p75: 0.05,
    })
  })

  it('leaves out checks we ran ourselves', () => {
    const [week] = query(VITALS, [
      vital(2000, 0.02),
      ...Array.from({ length: 10 }, () => vital(9000, 0.9, OUR_AUDIT)),
    ])
    expect(week).toMatchObject({ visits: 1, browsers: 1, lcp_p75: 2000, cls_p75: 0.02 })
  })

  it('looks back exactly seven days', () => {
    const cutoff = new Date(Date.now() - 7 * DAY).toISOString()
    const startOfCutoffDay = `${cutoff.slice(0, 10)}T00:00:00.000Z`
    expect(startOfCutoffDay < cutoff).toBe(true)

    const [week] = query(VITALS, [
      vital(9000, 0.9, PHONE, { createdAt: startOfCutoffDay }),
      vital(2000, 0.02, PHONE, { ageMs: 6 * DAY }),
    ])
    expect(week).toMatchObject({ visits: 1, lcp_p75: 2000 })
  })

  it('counts only visits that carry a number, and each number on its own', () => {
    const [week] = query(VITALS, [vital(null, null), vital(null, null), vital(2000, null)])
    expect(week).toEqual({
      visits: 1,
      browsers: 1,
      lcp_n: 1,
      lcp_p75: 2000,
      cls_n: 0,
      cls_p75: null,
    })
  })

  it('ignores every other event, even one carrying numbers', () => {
    const [week] = query(VITALS, [
      { type: 'analytics', event: 'model_loaded', lcpMs: 9000, cls: 0.9, ua: PHONE },
      { type: 'diagnostic', event: 'web_vitals', lcpMs: 9000, cls: 0.9, ua: PHONE },
      vital(2000, 0.02),
    ])
    expect(week).toMatchObject({ visits: 1, lcp_p75: 2000, cls_p75: 0.02 })
  })

  it('answers a quiet week with zero, not with nothing', () => {
    expect(query(VITALS, [])).toEqual([
      { visits: 0, browsers: 0, lcp_n: 0, lcp_p75: null, cls_n: 0, cls_p75: null },
    ])
  })

  it('reaches the weekly issue, and a failed read says so rather than hiding', () => {
    const issueStep = WORKFLOW.slice(WORKFLOW.indexOf('- name: Open or update the digest issue'))
    expect(issueStep).toContain("steps.vitals.outcome == 'failure'")
    expect(issueStep).toContain("steps.vitals.outputs.visits != '0'")
    expect(issueStep).toContain('"$VITALS_SUMMARY"')
    expect(issueStep).toContain('Page speed could not be read this week')
  })
})
