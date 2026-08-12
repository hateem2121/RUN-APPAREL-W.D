import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Add the CatalogueDefaults global: one row holding the "how we build your
 * product" copy every garment starts with (see globals/CatalogueDefaults.ts).
 *
 * HAND-WRITTEN, NOT GENERATED — `payload migrate:create` was run first, per
 * the brief, and abandoned. It diffs the current schema against the newest
 * `.json` snapshot in this directory, and the newest one on disk is
 * `20260729_120855_add_raw_upload_retry.json`. The two migrations after it —
 * `20260803_090000_add_file_colour_details` and
 * `20260803_140000_add_artwork_verdict` — were themselves hand-written and
 * never got a matching snapshot, so the snapshot chain is stale by two
 * generations. Running migrate:create against that stale baseline opened an
 * interactive prompt asking whether `file_colour_details` is a new column or
 * a RENAME of `presentation_mode` — a question about a column two unrelated,
 * already-live migrations, nothing to do with this one. Answering it either
 * way would have produced ALTER statements against `products`/`media` for
 * columns that already exist in the real database (re-adding
 * `file_colour_details`/`artwork_verdict`/`artwork_override_reason`, which
 * would fail on apply with a duplicate-column error) — exactly the "stop and
 * hand-write it" case the task brief warns about. Full trace in
 * task-9-report.md.
 *
 * Two tables, both new, nothing else:
 *
 *   - `catalogue_defaults_customisation_steps` — the array rows, one per
 *     step, shaped identically to `products_customisation_steps`
 *     (see 20260720_185735_initial.ts).
 *   - `catalogue_defaults` — the single-row global itself, shaped identically
 *     to `site_settings` from that same migration: an `id`, the scalar
 *     fields, and plain NULLABLE `updated_at`/`created_at` with no strftime
 *     DEFAULT. That is not an oversight to "fix" — @payloadcms/drizzle's
 *     schema/buildRawSchema.js builds every global's table with
 *     `timestamps: false`, unlike collections (which pass
 *     `collection.timestamps`), which is why `site_settings`'s own timestamp
 *     columns already carry no DEFAULT either.
 *
 * Deliberately NOT touched: `payload_locked_documents_rels`. Adding a
 * COLLECTION adds a column there — see 20260721_084024_add_events.ts, which
 * ALTERs it to add `events_id` — because a document lock references a
 * collection row through a polymorphic relationship field. A GLOBAL is
 * tracked through the plain `global_slug` text column on
 * `payload_locked_documents` instead, since there is only ever one row of a
 * given global. Confirmed by reading Payload's own
 * locked-documents/config.js: the `document` relationship field's
 * `relationTo` is built from `config.collections` only — `config.globals`
 * never contributes to it. (`site_settings` carries no such column either:
 * the initial migration's CREATE TABLE for `payload_locked_documents_rels`
 * already excludes it, and that table has needed no migration since.)
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`catalogue_defaults_customisation_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`number\` numeric NOT NULL,
  	\`title\` text NOT NULL,
  	\`body\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`catalogue_defaults\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`catalogue_defaults_customisation_steps_order_idx\` ON \`catalogue_defaults_customisation_steps\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`catalogue_defaults_customisation_steps_parent_id_idx\` ON \`catalogue_defaults_customisation_steps\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`catalogue_defaults\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`customisation_intro\` text,
  	\`catalogue_url\` text DEFAULT 'https://wear-run.help/catalogue' NOT NULL,
  	\`retired_message\` text DEFAULT 'The colourway linked by this QR is no longer active. You are viewing the current available reference.' NOT NULL,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Children first. Nothing else in this migration references either table —
  // catalogue_defaults_customisation_steps is the only thing with a foreign
  // key into catalogue_defaults, so dropping it first means the second DROP
  // has nothing left pointing at it. Unlike the rebuilds documented in
  // CLAUDE.md, neither statement here is a table rebuild (no CREATE
  // __new_*/copy/rename), so there is no implicit-DELETE cascade risk to
  // begin with — this ordering is the ordinary parent/child rule, not a
  // workaround for one.
  await db.run(sql`DROP TABLE \`catalogue_defaults_customisation_steps\`;`)
  await db.run(sql`DROP TABLE \`catalogue_defaults\`;`)
}
