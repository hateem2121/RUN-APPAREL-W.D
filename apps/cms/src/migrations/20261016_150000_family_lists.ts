import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The home page's family lists (D44, owner, 2026-10-15): five arrays in the Site Settings group
 * `familyLists`, one per family, each a list of names (`globals/SiteSettings.ts`).
 *
 * HAND-WRITTEN, as 20260905_150000_footer_facts was, for the reason 20260905_090000_site_logo gives:
 * `migrate:create` diffs a stale snapshot chain and stops on an interactive question. Every name
 * below was copied from `payload generate:db-schema` on 2026-10-16, not typed from memory, and each
 * table is the exact shape of `site_settings_certifications`.
 *
 * FIVE LEAF TABLES AND NOTHING ELSE: no column is added, no table is rebuilt, and nothing references
 * these, so none of the implicit-DELETE cascade hazard in .claude/rules/d1-migrations.md applies.
 * Each references `site_settings` with ON DELETE cascade, Payload's own shape for an array, which is
 * harmless: the global's row is never deleted. The tables start EMPTY; the approved lists are written
 * through the API after the deploy, after a D1 backup (the owner's instruction, 2026-10-16).
 */
const TABLES = [
  'site_settings_family_lists_sportswear',
  'site_settings_family_lists_teamwear_uniforms',
  'site_settings_family_lists_casual_wear',
  'site_settings_family_lists_outerwear',
  'site_settings_family_lists_sports_accessories',
] as const

export async function up({ db }: MigrateUpArgs): Promise<void> {
  for (const table of TABLES) {
    await db.run(
      sql.raw(`CREATE TABLE \`${table}\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `),
    )
    await db.run(sql.raw(`CREATE INDEX \`${table}_order_idx\` ON \`${table}\` (\`_order\`);`))
    await db.run(
      sql.raw(`CREATE INDEX \`${table}_parent_id_idx\` ON \`${table}\` (\`_parent_id\`);`),
    )
  }
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Leaf tables, newest first: nothing references them, so a DROP cascades into nothing else.
  for (const table of [...TABLES].reverse()) {
    await db.run(sql.raw(`DROP TABLE \`${table}\`;`))
  }
}
