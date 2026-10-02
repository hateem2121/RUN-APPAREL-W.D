import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Somewhere to keep a page-speed report's third number: `events.inp_ms` (the `inpMs` field in
 * collections/Events.ts).
 *
 * WHY. INP, how long the page takes to answer a tap, has been a Core Web Vital since March 2024.
 * The viewer measured Largest Contentful Paint and Cumulative Layout Shift and nothing about taps,
 * so the 181 page-speed readings of the last 30 days could say how fast a garment page APPEARED
 * and not how fast it ANSWERED (visual audit VA-14, 2026-10-02). The viewer now sends the number
 * (apps/viewer/src/lib/webVitals.ts) and the events endpoint bounds it (`MAX_INP_MS`).
 *
 * HAND-WRITTEN, NOT GENERATED — for the reason 20260811_163415_catalogue_defaults gives at length:
 * `payload migrate:create` diffs against a snapshot many generations stale. One plain nullable
 * column, added the way 20260917_120000_add_web_vitals_values adds `lcp_ms` and `cls`, so there is
 * no table rebuild and nothing can cascade. The name is Payload's snake_case of `inpMs`, and
 * `numeric` is what a `type: 'number'` field gets. src/migrationReplay/inpColumn.test.ts pins both
 * and src/migrationReplay/replay.test.ts replays this migration like every other.
 *
 * NULL is right for every existing row and for every event that is not a page-speed report: nobody
 * measured those. It is also right for a NEW report from a visit with no tap, or from a browser
 * that does not list the `event` entry type: the viewer sends no `inpMs` then, and the row stores
 * nothing, never a 0 that would read as a perfect score.
 *
 * ⚠️ ORDER ON DEPLOY. A Worker that knows this field names the column in every events insert, so
 * it must not serve before this has run. `ci.yml` migrates before it deploys, which is what makes
 * that safe. The reverse — an older Worker over the new column — never names it and is harmless.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`inp_ms\` numeric;`)
}

/**
 * ⚠️ Drops the INP every stored page-speed report since this migration carries; the rows
 * themselves stay. Take a D1 backup first — docs/BACKUP-RESTORE.md.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`inp_ms\`;`)
}
