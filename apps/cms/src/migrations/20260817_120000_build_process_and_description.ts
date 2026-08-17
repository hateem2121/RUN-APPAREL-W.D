import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Two additive changes, in one migration because they ship together.
 *
 *   1. The `build_process` global — ONE "How we build your product" text for the
 *      whole catalogue, read on every public request (globals/BuildProcess.ts).
 *      It replaces a per-product copy that `catalogue_defaults` merely SEEDED at
 *      create time.
 *   2. `products.short_description` — the per-garment paragraph the viewer shows
 *      under the product name.
 *
 * HAND-WRITTEN, NOT GENERATED — same reason 20260811_163415_catalogue_defaults
 * gives at length and it has only got worse since: `payload migrate:create`
 * diffs against the newest `.json` snapshot in this directory, and the
 * hand-written migrations after it never produced one, so the snapshot chain is
 * stale by several generations. Running it prompts about columns belonging to
 * unrelated, already-live migrations and emits ALTERs for columns that already
 * exist in the real database. Read that file's header before reaching for the
 * generator here.
 *
 * ⚠️ NOTHING IS DROPPED, AND THAT IS THE POINT. `products.customisation_intro`
 * and `products_customisation_steps` keep every value they hold, even though the
 * admin UI no longer shows them (Products.ts → the "Superseded" tab). Two
 * independent reasons, either sufficient:
 *
 *   - On D1 a table rebuild is the single most hazardous operation in this repo.
 *     `PRAGMA foreign_keys=OFF` is a no-op there, `defer_foreign_keys` defers
 *     CHECKS but not CASCADES, and a DROP runs an implicit DELETE that cascades.
 *     `presentation_mode` was retired in place on 2026-08-09 for exactly this
 *     reason and still sits in the schema, harmless.
 *   - `buildViewerResponse` still FALLS BACK to those columns for as long as
 *     `build_process` has no saved row — the window between this deploying and
 *     someone first opening the new screen. Payload's findOne returns `{}` rather
 *     than field defaults for an unsaved global, so that window is real and every
 *     live page would lose its build steps inside it.
 *
 * SHAPES COPIED, NOT INVENTED. `build_process` and its array table mirror
 * `catalogue_defaults` / `catalogue_defaults_customisation_steps` column for
 * column, because the fields are the same fields — including the plain NULLABLE
 * `updated_at`/`created_at` with no strftime DEFAULT, which is what
 * @payloadcms/drizzle's buildRawSchema.js emits for a GLOBAL (globals get
 * `timestamps: false`, unlike collections). `site_settings` and
 * `catalogue_defaults` both already look like this; matching them is deliberate,
 * not an omission to "fix".
 *
 * `payload_locked_documents_rels` is deliberately untouched. Adding a COLLECTION
 * adds a column there (see 20260721_084024_add_events.ts); a GLOBAL is tracked
 * through the plain `global_slug` text column on `payload_locked_documents`
 * instead, because Payload's locked-documents/config.js builds that polymorphic
 * `relationTo` from `config.collections` only.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`build_process_customisation_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`number\` numeric NOT NULL,
  	\`title\` text NOT NULL,
  	\`body\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`build_process\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`build_process_customisation_steps_order_idx\` ON \`build_process_customisation_steps\` (\`_order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`build_process_customisation_steps_parent_id_idx\` ON \`build_process_customisation_steps\` (\`_parent_id\`);`,
  )
  await db.run(sql`CREATE TABLE \`build_process\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`customisation_intro\` text,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)

  // Nullable with no default, because every existing product genuinely has no
  // description and an empty string would be a claim rather than an absence.
  // `projectViewer.ts` coerces null to '' on the way out, so the public API shape
  // is unchanged and the viewer's fallback paragraph is the only thing that
  // decides what an empty one looks like.
  await db.run(sql`ALTER TABLE \`products\` ADD \`short_description\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Children first: build_process_customisation_steps is the only thing with a
  // foreign key into build_process, so dropping it first leaves the second DROP
  // with nothing pointing at it. Neither statement is a table rebuild (no
  // CREATE __new_*/copy/rename), so there is no implicit-DELETE cascade to worry
  // about — this is the ordinary parent/child rule, not a workaround for one.
  await db.run(sql`DROP TABLE \`build_process_customisation_steps\`;`)
  await db.run(sql`DROP TABLE \`build_process\`;`)

  // ⚠️ `products.short_description` IS DELIBERATELY NOT DROPPED, and a down
  // migration that leaves a column behind is the correct trade here rather than
  // a lazy one. SQLite's DROP COLUMN cannot remove a column that is indexed or
  // referenced, and on D1 the general escape — rebuild the table — is the
  // operation CLAUDE.md names as the most hazardous in this repo: a DROP runs an
  // implicit DELETE and that CASCADES, with `PRAGMA foreign_keys=OFF` a no-op.
  // `products` is the parent of every colourway, media reference and raw upload.
  //
  // A leftover nullable text column costs nothing, breaks no INSERT, and matches
  // the `presentation_mode` precedent from 2026-08-09.
}
