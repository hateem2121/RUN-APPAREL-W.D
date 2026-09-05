import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The footer's settings: four copy fields, seven claim fields, two arrays.
 *
 * HAND-WRITTEN, for the reason 20260905_090000_site_logo gives: `migrate:create` diffs
 * a stale snapshot chain and stops on an interactive question that would rename a live
 * column. Every name below was copied from `payload generate:db-schema` on 2026-09-05,
 * not typed from memory — and the generator corrected the plan on one point: the four
 * COPY columns are `NOT NULL DEFAULT`, the same shape `footer_line` and `legal_line`
 * took in the initial migration, so a global saved before this migration reads back
 * its defaults rather than NULL. The seven CLAIM columns are nullable with no default,
 * because a blank claim must stay blank (see SiteSettings.ts). The two selects are
 * plain `text`: drizzle's enum is type-level only and writes no CHECK.
 *
 * ELEVEN ADD COLUMNs AND TWO LEAF TABLES — no table rebuild anywhere, so none of the
 * implicit-DELETE cascade hazard applies. The two array tables reference
 * `site_settings` with ON DELETE cascade, which is Payload's own shape for an array
 * (compare `build_process_customisation_steps`) and is harmless: the global row is
 * never deleted.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // copy — defaults live here AND in the Payload config AND in projectPublic.ts,
  // because each layer reads a blank differently; the strings are identical by test
  await db.run(
    sql`ALTER TABLE \`site_settings\` ADD COLUMN \`cta_label\` text DEFAULT 'Start an enquiry' NOT NULL;`,
  )
  await db.run(
    sql`ALTER TABLE \`site_settings\` ADD COLUMN \`cta_question\` text DEFAULT 'Have a garment that needs making properly?' NOT NULL;`,
  )
  await db.run(
    sql`ALTER TABLE \`site_settings\` ADD COLUMN \`cta_subline\` text DEFAULT 'Send a tech pack, a sketch, or just the idea.' NOT NULL;`,
  )
  await db.run(
    sql`ALTER TABLE \`site_settings\` ADD COLUMN \`cta_promise\` text DEFAULT 'Reply within 2 business days' NOT NULL;`,
  )

  // claims — nullable, no default, on purpose
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_moq\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_lead_time\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_hours_first_day\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_hours_last_day\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_hours_open\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`capacity_hours_close\` text;`)
  await db.run(sql`ALTER TABLE \`site_settings\` ADD COLUMN \`works_coordinates\` text;`)

  await db.run(sql`CREATE TABLE \`site_settings_certifications\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`site_settings_certifications_order_idx\` ON \`site_settings_certifications\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`site_settings_certifications_parent_id_idx\` ON \`site_settings_certifications\` (\`_parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`site_settings_social_links\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`label\` text NOT NULL,
  	\`url\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`site_settings\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`site_settings_social_links_order_idx\` ON \`site_settings_social_links\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`site_settings_social_links_parent_id_idx\` ON \`site_settings_social_links\` (\`_parent_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // The two arrays are LEAF tables — nothing references them — so dropping them is
  // the ordinary parent/child rule, not a rebuild. The eleven columns stay, for the
  // reason 20260905_090000_site_logo records: SQLite cannot drop a column without a
  // rebuild, and a rebuild is the one operation this repo refuses on D1.
  await db.run(sql`DROP TABLE \`site_settings_social_links\`;`)
  await db.run(sql`DROP TABLE \`site_settings_certifications\`;`)
}
