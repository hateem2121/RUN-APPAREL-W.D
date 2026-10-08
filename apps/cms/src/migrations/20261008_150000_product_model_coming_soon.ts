import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `model_coming_soon` on products: "3D coming soon (publish with pictures only)"
 * (`modelComingSoon` in `apps/cms/src/collections/Products.ts`, owner decision 2026-10-08,
 * for Structure Polo Set while its CLO export is redone).
 *
 * TWO TABLES, for the reason 20260930_160000_product_garment_type gives: the live row
 * (`products`) and the history row (`_products_v`, every field prefixed `version_`). Payload
 * writes both on every product save, so a column on one alone fails the first save after
 * deploy, the shrink robot's included.
 *
 * HAND-WRITTEN, NOT GENERATED, for the reason 20260905_090000_site_logo gives. The column
 * shape is the existing checkbox's, `variants_verified` in 20260729_070548_inline_colourways:
 * `integer DEFAULT false`.
 *
 * ADD COLUMN only: no table is rebuilt or dropped, so the implicit-DELETE cascade hazard in
 * .claude/rules/d1-migrations.md does not apply. Every existing row reads false, which is
 * exactly today's behaviour: the publish gate keeps demanding a 3D file from all of them.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`products\` ADD COLUMN \`model_coming_soon\` integer DEFAULT false;`)
  await db.run(
    sql`ALTER TABLE \`_products_v\` ADD COLUMN \`version_model_coming_soon\` integer DEFAULT false;`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // A plain column with no index and no reference: SQLite drops it in place, without a rebuild.
  await db.run(sql`ALTER TABLE \`_products_v\` DROP COLUMN \`version_model_coming_soon\`;`)
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`model_coming_soon\`;`)
}
