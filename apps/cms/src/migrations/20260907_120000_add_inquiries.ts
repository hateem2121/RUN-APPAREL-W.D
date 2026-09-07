import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The `inquiries` collection — the contact form's storage.
 *
 * Owner decision 2026-09-07 (D3, FA-I-06): the form stores the inquiry BEFORE it attempts
 * the notification email, so a mail outage can only cost a notification. This table is
 * the half of that promise that has to exist.
 *
 * HAND-WRITTEN, for the reason 20260811_190000_folders_on_media and
 * 20260811_163415_catalogue_defaults already record: `payload migrate:create` was tried
 * first and stops on an interactive prompt asking whether `short_description` was RENAMED
 * from `presentation_mode`. It is not specific to this change — the newest `.json`
 * snapshot on disk is 20260729, seven hand-written migrations ago, so the generator diffs
 * against a six-week-old schema and would re-do everything since. Answering "create
 * column" would emit an ADD COLUMN for a column the database already has, and the
 * migration would fail on the first run against production.
 *
 * VERIFIED, NOT TYPED FROM MEMORY. Every column name, type, default and index below was
 * read out of `payload generate:db-schema` (`src/payload-generated-schema.ts`) on
 * 2026-09-07, and the shape of the `payload_locked_documents_rels` addition was copied
 * from 20260721_084024_add_events, which added `events_id` the same way.
 *
 * ⚠️ ADDITIVE ONLY — ONE NEW TABLE AND ONE NEW COLUMN. No table is rebuilt in `up`, so
 * none of the implicit-DELETE cascade hazard the root CLAUDE.md describes applies here.
 * `PRAGMA foreign_keys=OFF` is a no-op on D1 and `defer_foreign_keys` defers checks rather
 * than cascades; ordering is the only thing that makes a rebuild safe, and `up` needs no
 * rebuild at all.
 *
 * ⚠️ THE `inquiries_id` COLUMN IS NOT OPTIONAL BOOKKEEPING. Payload gives every collection
 * a column on `payload_locked_documents_rels` for document locking; without it the admin
 * screen for this collection breaks rather than degrades. `ALTER TABLE ... ADD` cannot
 * attach a table-level foreign key in SQLite, so it takes the bare inline `REFERENCES`
 * form with no `ON DELETE` — exactly as `payload_folders_id` did on 2026-08-11.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`inquiries\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`company\` text,
  	\`email\` text NOT NULL,
  	\`message\` text NOT NULL,
  	\`status\` text DEFAULT 'new' NOT NULL,
  	\`notified\` integer DEFAULT false,
  	\`notify_error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`inquiries_updated_at_idx\` ON \`inquiries\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`inquiries_created_at_idx\` ON \`inquiries\` (\`created_at\`);`)

  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`inquiries_id\` integer REFERENCES inquiries(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_inquiries_id_idx\` ON \`payload_locked_documents_rels\` (\`inquiries_id\`);`,
  )

  /*
   * ⚠️ THE ONLY DATA CHANGE HERE, AND IT IS GUARDED ON THE EXACT OLD DEFAULT.
   *
   * The footer's call to action reads "Start an enquiry" on every page — a visible string,
   * and the owner decided on AMERICAN spelling on 2026-09-04 ("colorway", "color",
   * "customization", "inquiry"), which the marketing site never followed (audit FA-Q-05).
   * The code default moves with this commit; the STORED value would not, so the page would
   * keep saying the British form.
   *
   * `WHERE cta_label = 'Start an enquiry'` is what makes this safe to run: if the owner has
   * ever typed their own label, it is left completely alone. Overwriting owner-edited copy
   * from a migration is precisely the failure the retired `build-process` global caused —
   * one save replaced bespoke text on eleven live garments — and this cannot do it.
   * Idempotent: a second run matches nothing.
   */
  await db.run(
    sql`UPDATE \`site_settings\` SET \`cta_label\` = 'Start an inquiry' WHERE \`cta_label\` = 'Start an enquiry';`,
  )
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST, AND THE ORDER IS THE WHOLE SAFETY ARGUMENT.
 *
 * `DROP TABLE inquiries` runs an implicit DELETE, and that cascades. If
 * `payload_locked_documents_rels` still carried `inquiries_id` at that moment, the delete
 * would reach its rows — which are the admin's document locks for EVERY collection, not
 * just this one. Removing the column first makes the drop reach nothing. This is the same
 * ordering 20260721_084024_add_events records, and the reason the root CLAUDE.md says
 * ordering is what makes a rebuild safe rather than a pragma.
 *
 * Rebuilding this table specifically is safe: `PRAGMA foreign_key_list` on every other
 * table returns nothing that targets `payload_locked_documents_rels`, so dropping the old
 * copy cannot cascade further. SQLite cannot DROP COLUMN a column that is indexed or
 * carries a foreign key, and `inquiries_id` is both, which is why this is a rebuild at all.
 *
 * ⚠️ THIS `down` DESTROYS EVERY STORED INQUIRY. That is what reverting the collection
 * means and it cannot be otherwise, but it is worth writing down: these rows are customer
 * names, employers, addresses and commercial intentions, and there is no other copy. Take
 * a D1 backup before running it — docs/BACKUP-RESTORE.md.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`PRAGMA defer_foreign_keys = true;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`raw_uploads_id\` integer,
  	\`products_id\` integer,
  	\`events_id\` integer, \`payload_folders_id\` integer REFERENCES payload_folders(id),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`(\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\` FROM \`payload_locked_documents_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_raw_uploads_id_idx\` ON \`payload_locked_documents_rels\` (\`raw_uploads_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_products_id_idx\` ON \`payload_locked_documents_rels\` (\`products_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_payload_folders_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_folders_id\`);`,
  )

  // Only now, with nothing referencing it, can the table go.
  await db.run(sql`DROP TABLE \`inquiries\`;`)
}
