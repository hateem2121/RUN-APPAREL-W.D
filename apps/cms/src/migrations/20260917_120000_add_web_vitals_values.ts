import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Somewhere to keep a page-speed report's two numbers: `events.lcp_ms` and `events.cls`
 * (the `lcpMs` and `cls` fields in collections/Events.ts).
 *
 * WHY. Since 2026-09-04 the viewer has measured Largest Contentful Paint and Cumulative
 * Layout Shift on every visit and reported them as a `web_vitals` event
 * (apps/viewer/src/lib/webVitals.ts). Both numbers were thrown away on the way: the
 * telemetry client forwarded only the event's name and product, and this table had no
 * column to hold a number. Every such row said a visit happened and nothing about how
 * fast it was (audit PF-05b, 2026-09-17).
 *
 * HAND-WRITTEN, NOT GENERATED — for the reason 20260811_163415_catalogue_defaults gives
 * at length: `payload migrate:create` diffs against a snapshot many generations stale.
 * Two plain nullable columns, added the way 20260803_140000_add_artwork_verdict adds its
 * two, so there is no table rebuild and nothing can cascade. The names are Payload's
 * snake_case of the field names, and `numeric` is what a `type: 'number'` field gets
 * (`document_visits.minutes_active`). src/migrationReplay/replay.test.ts round-trips
 * both.
 *
 * NULL is right for every existing row and for every event that is not a page-speed
 * report: nobody measured those.
 *
 * ⚠️ ORDER ON DEPLOY. A Worker that knows these fields names both columns in every
 * events insert, so it must not serve before this has run. `ci.yml` migrates before it
 * deploys, which is what makes that safe. The reverse — an older Worker over the new
 * columns — never names them and is harmless.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` ADD \`lcp_ms\` numeric;`)
  await db.run(sql`ALTER TABLE \`events\` ADD \`cls\` numeric;`)
}

/**
 * ⚠️ Drops the two numbers every stored page-speed report carries; the rows themselves
 * stay. Take a D1 backup first — docs/BACKUP-RESTORE.md.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`cls\`;`)
  await db.run(sql`ALTER TABLE \`events\` DROP COLUMN \`lcp_ms\`;`)
}
