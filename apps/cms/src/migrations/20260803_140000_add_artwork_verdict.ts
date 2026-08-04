import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Record what the pipeline concluded about a model's printed artwork.
 *
 * Two plain nullable columns, added with ALTER TABLE. Deliberately NOT a table
 * rebuild: a rebuild runs an implicit DELETE on the old table and that cascades
 * to every child row, which is how `products_colourways` and
 * `products_performance_features` were emptied on 2026-07-29 while the migration
 * logs reported success. Nothing here needs a rebuild, so nothing here does one.
 *
 * NULL is the correct value for every existing row: nobody checked those files.
 * The publish gate treats NULL as "unknown" and lets it through — see
 * assertArtworkAcceptable in ../collections/publishGating.ts. Turning unknown
 * into a refusal would make the whole existing catalogue unpublishable the
 * moment this deploys.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` ADD \`artwork_verdict\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`artwork_override_reason\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`artwork_override_reason\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`artwork_verdict\`;`)
}
