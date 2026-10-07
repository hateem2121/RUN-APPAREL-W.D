import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The careers form's storage (owner, F23, 2026-10-07): job applications and their CVs.
 *
 * HAND-WRITTEN, for the reason 20260907_120000_add_inquiries records: `migrate:create` diffs
 * against the last JSON snapshot (20260729) and, run on 2026-10-07, stopped on an interactive
 * question about `raw_uploads` — a table this change does not touch. Every column, type,
 * default, index and foreign key below was read out of `payload generate:db-schema` on
 * 2026-10-07, not typed from memory — including `_objectkey` (every upload collection, see
 * 20260929_120000_inquiry_details_and_files) and `prefix`, which the R2 storage adapter adds
 * to `application-files` because its instance has `prefix: 'careers'` (`inquiry_files` has
 * no such column: its instance has no prefix).
 *
 * ⚠️ ADDITIVE ONLY: two new tables, two new nullable columns on
 * `payload_locked_documents_rels`. Nothing is rebuilt in `up`, so there is nothing for an
 * implicit DELETE to cascade through.
 *
 * `job_applications.files` is a JOIN field and has no column: each `application_files` row
 * names its application, `ON DELETE set null` (nullable on purpose — see
 * `ApplicationFiles.application`).
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`job_applications\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`phone\` text NOT NULL,
  	\`email\` text,
  	\`role\` text NOT NULL,
  	\`years\` numeric,
  	\`note\` text,
  	\`files_error\` text,
  	\`status\` text DEFAULT 'new' NOT NULL,
  	\`delete_after\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`notified\` integer DEFAULT false,
  	\`notify_error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`job_applications_updated_at_idx\` ON \`job_applications\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`job_applications_created_at_idx\` ON \`job_applications\` (\`created_at\`);`,
  )

  await db.run(sql`CREATE TABLE \`application_files\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`application_id\` integer,
  	\`prefix\` text DEFAULT 'careers',
  	\`_objectkey\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	FOREIGN KEY (\`application_id\`) REFERENCES \`job_applications\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX \`application_files_application_idx\` ON \`application_files\` (\`application_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`application_files_updated_at_idx\` ON \`application_files\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`application_files_created_at_idx\` ON \`application_files\` (\`created_at\`);`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX \`application_files_filename_idx\` ON \`application_files\` (\`filename\`);`,
  )

  // Document locking needs a column per collection, or the admin screen breaks rather than
  // degrades (20260907_120000_add_inquiries). Bare inline REFERENCES: SQLite's ALTER TABLE
  // cannot attach a table-level foreign key.
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`job_applications_id\` integer REFERENCES job_applications(id);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`application_files_id\` integer REFERENCES application_files(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_job_applications_id_idx\` ON \`payload_locked_documents_rels\` (\`job_applications_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_application_files_id_idx\` ON \`payload_locked_documents_rels\` (\`application_files_id\`);`,
  )
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST — the ordering argument of
 * 20260907_120000_add_inquiries.down and 20260929_120000_inquiry_details_and_files.down. The
 * rebuild target is `payload_locked_documents_rels` exactly as 20260929 left it (no migration
 * since has changed it): that file's `down` target plus its `inquiry_files_id`. Only the two
 * columns added above are dropped. SQLite cannot DROP COLUMN a column that is indexed and
 * carries a foreign key, hence the rebuild.
 *
 * ⚠️ THIS `down` DESTROYS EVERY JOB APPLICATION AND THE RECORD OF EVERY CV. The objects stay in
 * R2 under careers/ with nothing pointing at them. Take a D1 backup first — docs/BACKUP-RESTORE.md.
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
  	\`inquiries_id\` integer REFERENCES inquiries(id),
  	\`document_visits_id\` integer REFERENCES document_visits(id),
  	\`document_visit_salts_id\` integer REFERENCES document_visit_salts(id),
  	\`document_visit_emails_id\` integer REFERENCES document_visit_emails(id),
  	\`inquiry_files_id\` integer REFERENCES inquiry_files(id),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`(\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\`, \`inquiry_files_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\`, \`inquiry_files_id\` FROM \`payload_locked_documents_rels\`;`,
  )
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  )
  for (const column of [
    'users_id',
    'media_id',
    'raw_uploads_id',
    'products_id',
    'events_id',
    'payload_folders_id',
    'inquiries_id',
    'document_visits_id',
    'document_visit_salts_id',
    'document_visit_emails_id',
    'inquiry_files_id',
  ]) {
    await db.run(
      sql.raw(
        `CREATE INDEX \`payload_locked_documents_rels_${column}_idx\` ON \`payload_locked_documents_rels\` (\`${column}\`);`,
      ),
    )
  }
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`,
  )

  // Only now, with nothing referencing them, can the tables go: the files first, they point at
  // the applications.
  await db.run(sql`DROP TABLE \`application_files\`;`)
  await db.run(sql`DROP TABLE \`job_applications\`;`)
}
