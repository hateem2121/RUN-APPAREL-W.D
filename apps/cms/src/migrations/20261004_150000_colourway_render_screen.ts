import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `render_screen_id` on each colour row — the screen-sized copy of the HD render that the
 * product page shows inside the 3D window (polish D9 and F16, 2026-10-04; `renderScreen` in
 * `apps/cms/src/fields/colourways.ts`).
 *
 * The same shape as 20260927_120000_colourway_render_image, for the same reasons, word for
 * word where they apply: TWO TABLES, because products keep their edit history and Payload
 * writes the live rows (`products_colourways`) and the history rows
 * (`_products_v_version_colourways`) on every save; HAND-WRITTEN, because `payload
 * migrate:create` diffs against a stale snapshot; and ADD COLUMN and CREATE INDEX only — no
 * table rebuild, so none of the implicit-DELETE cascade hazard in .claude/rules/d1-migrations.md
 * applies. SQLite permits the REFERENCES clause on ADD COLUMN because the default is NULL. Every
 * existing row reads NULL, which is "no copy": the page shows the full render, as before.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`ALTER TABLE \`products_colourways\` ADD COLUMN \`render_screen_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`products_colourways_render_screen_idx\` ON \`products_colourways\` (\`render_screen_id\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`_products_v_version_colourways\` ADD COLUMN \`render_screen_id\` integer REFERENCES media(id) ON UPDATE no action ON DELETE set null;`,
  )
  await db.run(
    sql`CREATE INDEX \`_products_v_version_colourways_render_screen_idx\` ON \`_products_v_version_colourways\` (\`render_screen_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The indexes go; the COLUMNS DELIBERATELY STAY, as in 20260927_120000_colourway_render_image:
  // SQLite cannot DROP a referenced column, and the only other way is a table rebuild — the
  // operation that emptied two tables on 2026-07-29. A nullable column nobody reads costs nothing.
  await db.run(sql`DROP INDEX IF EXISTS \`products_colourways_render_screen_idx\`;`)
  await db.run(sql`DROP INDEX IF EXISTS \`_products_v_version_colourways_render_screen_idx\`;`)
}
