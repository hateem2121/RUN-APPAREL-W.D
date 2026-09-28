import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `render_image_id` on each colour row — the HD studio render behind the product page's
 * "HD IMAGE" button (`renderImage` in `apps/cms/src/fields/colourways.ts`, 2026-09-27).
 *
 * TWO TABLES, because products keep their edit history since 20260926_200000: the live
 * rows (`products_colourways`) and the history rows (`_products_v_version_colourways`).
 * Payload writes both on every product save, so a column on one alone would fail the
 * first save after deploy.
 *
 * HAND-WRITTEN, NOT GENERATED, for the reason 20260905_090000_site_logo gives:
 * `payload migrate:create` diffs against a snapshot many generations stale and stops on
 * a rename question about an already-live column. The shape is copied from what Payload
 * already made for the sibling `posterPreview` upload field, read from production's
 * sqlite_master on 2026-09-27 (a SELECT, `changed_db: false`): an `<name>_id integer`
 * referencing media with `ON DELETE set null`, and an index `<table>_<name>_idx`.
 *
 * ADD COLUMN and CREATE INDEX only — no table rebuild, so none of the implicit-DELETE
 * cascade hazard in .claude/rules/d1-migrations.md applies. SQLite permits the REFERENCES
 * clause on ADD COLUMN because the default is NULL. Every existing row reads NULL, which
 * is "no render": the button stays hidden, exactly as before this migration.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`products_colourways\` ADD COLUMN \`render_image_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`products_colourways_render_image_idx\` ON \`products_colourways\` (\`render_image_id\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`_products_v_version_colourways\` ADD COLUMN \`render_image_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`_products_v_version_colourways_render_image_idx\` ON \`_products_v_version_colourways\` (\`render_image_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The indexes go; the COLUMNS DELIBERATELY STAY, for the reason 20260905_090000_site_logo
  // records at length: SQLite cannot DROP a referenced column, and the only other way is a
  // table rebuild — the operation that emptied two tables on 2026-07-29. A nullable column
  // nobody reads costs nothing.
  await db.run(sql`DROP INDEX IF EXISTS \`products_colourways_render_image_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_products_v_version_colourways_render_image_idx\`;`)
}
