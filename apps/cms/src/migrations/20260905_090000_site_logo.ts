import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `site_settings.logo_id` — the owner's own logo, used as the browser tab icon.
 *
 * HAND-WRITTEN, NOT GENERATED, for the reason 20260817_120000 and
 * 20260811_163415 both give at length: `payload migrate:create` diffs against the
 * newest `.json` snapshot in this directory, and the hand-written migrations since
 * then produced none, so the chain is stale by several generations. Run it today and
 * it stops on an interactive question about `products.short_description` — a column
 * from an already-live migration — offering to RENAME `presentation_mode` into it.
 * Measured 2026-09-05. Answering that wrong would rename a live column; there is no
 * reason to be near that question to add one nullable field.
 *
 * ONE STATEMENT, AND IT IS AN ADD COLUMN — no table rebuild, so none of the
 * implicit-DELETE cascade hazard that makes rebuilds the most dangerous operation in
 * this repo applies. Nothing references `site_settings` (verified against
 * sqlite_master: zero tables carry a foreign key into it), so there are no children
 * to stage first either.
 *
 * SQLite permits a REFERENCES clause on ADD COLUMN precisely because the default is
 * NULL; the shape matches `products.glb_asset_id` and `products.poster_fallback_id`
 * column for column, including `ON DELETE set null` — deleting a Media row must blank
 * the reference, never delete the settings.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`site_settings\` ADD COLUMN \`logo_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
  )
}

export async function down(_args: MigrateDownArgs): Promise<void> {
  /**
   * ⚠️ DELIBERATELY EMPTY, and a down migration that leaves a column behind is the
   * correct trade here rather than a lazy one — the same call 20260817_120000 made for
   * `products.short_description` and the same one made for `presentation_mode` on
   * 2026-08-09.
   *
   * SQLite's DROP COLUMN cannot remove a column that is referenced, and the general
   * escape — rebuild the table — is the operation this repo treats as most hazardous
   * on D1: `PRAGMA foreign_keys=OFF` is a no-op there, `defer_foreign_keys` defers
   * checks but not CASCADES, and a DROP runs an implicit DELETE that cascades. A
   * nullable, unused column with no default costs nothing and breaks no insert; a
   * rebuild to remove it could empty a table nobody was watching, which is exactly
   * what happened on 2026-07-29.
   */
}
