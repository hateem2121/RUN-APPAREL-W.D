import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Adds `products.file_colour_details` — the suggested colour name, hex and
 * confidence the shrink robot reads out of each KHR_materials_variants variant.
 *
 * PURELY ADDITIVE, and deliberately so. `file_colours` (the plain list of CLO
 * variant names) is untouched and stays the field the colour dropdown reads, so:
 *   - no backfill is needed; every existing product keeps working,
 *   - a container rolled back to a build without variant colours simply stops
 *     writing this column rather than breaking the dropdown,
 *   - there is no table rebuild, so none of the cascade hazards that made
 *     20260729_070548_inline_colourways delicate apply here.
 *
 * ALTER TABLE ADD COLUMN on SQLite rewrites no rows and cannot cascade.
 * Verified by apps/cms/src/migrationReplay/replay.test.ts, which replays this
 * against real SQLite with foreign keys ON and fails if any seeded table is
 * emptied.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`products\` ADD \`file_colour_details\` text;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`file_colour_details\`;`)
}
