import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `garment_type` on products: the plain kind of garment, for the page title search engines
 * show (`garmentType` in `apps/cms/src/collections/Products.ts`, owner decision 2026-09-30).
 *
 * TWO TABLES, because products keep their edit history since 20260926_200000: the live row
 * (`products`) and the history row (`_products_v`, where Payload prefixes every field
 * `version_`). Payload writes both on every product save, so a column on one alone would
 * fail the first save after deploy, the shrink robot's included.
 *
 * HAND-WRITTEN, NOT GENERATED, for the reason 20260905_090000_site_logo gives:
 * `payload migrate:create` diffs against a snapshot many generations stale. The shape is
 * the sibling `short_description` / `version_short_description` pair: nullable `text`, no
 * default, no index (20260926_200000_add_product_versions lists both).
 *
 * ADD COLUMN only. No table is rebuilt or dropped, so none of the implicit-DELETE cascade
 * hazard in .claude/rules/d1-migrations.md applies. Every existing row reads NULL, which
 * the API serves as '' and the title function reads as "no type yet": each garment keeps
 * the code-led title it had until the owner's list is written in.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`products\` ADD COLUMN \`garment_type\` text;`)
  await db.run(sql`ALTER TABLE \`_products_v\` ADD COLUMN \`version_garment_type\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // A plain column with no index and no reference: SQLite drops it in place, without the
  // table rebuild that makes other `down()`s in this folder keep their columns.
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_garment_type\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`garment_type\`;`)
}
