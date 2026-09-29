import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The contact form's new optional details and the files buyers attach (owner, 2026-09-29).
 *
 * HAND-WRITTEN, for the reason 20260907_120000_add_inquiries records (`migrate:create` diffs
 * against a months-old snapshot and would re-do everything since). Every column, type,
 * default, index and foreign key below was read out of `payload generate:db-schema`
 * (`src/payload-generated-schema.ts`) on 2026-09-29, not typed from memory — including
 * `_objectkey`, which `@payloadcms/plugin-cloud-storage` adds to every upload collection
 * (20260923_170000_add_reset_password_requested_at explains how its absence broke both
 * existing upload tables).
 *
 * ⚠️ ADDITIVE ONLY: five nullable columns on `inquiries`, one new table, one new column on
 * `payload_locked_documents_rels`. Nothing is rebuilt in `up`, so there is nothing for an
 * implicit DELETE to cascade through.
 *
 * `inquiries.files` is a JOIN field and has no column: each `inquiry_files` row names its
 * inquiry, `ON DELETE set null` (Payload's default for a relationship). The column is
 * nullable on purpose — see the comment on `InquiryFiles.inquiry`.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`inquiries\` ADD \`job_title\` text;`)
  await db.run(sql`ALTER TABLE \`inquiries\` ADD \`country\` text;`)
  await db.run(sql`ALTER TABLE \`inquiries\` ADD \`phone\` text;`)
  await db.run(sql`ALTER TABLE \`inquiries\` ADD \`subject\` text;`)
  await db.run(sql`ALTER TABLE \`inquiries\` ADD \`files_error\` text;`)

  await db.run(sql`CREATE TABLE \`inquiry_files\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`inquiry_id\` integer,
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
  	FOREIGN KEY (\`inquiry_id\`) REFERENCES \`inquiries\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE INDEX \`inquiry_files_inquiry_idx\` ON \`inquiry_files\` (\`inquiry_id\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`inquiry_files_updated_at_idx\` ON \`inquiry_files\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`inquiry_files_created_at_idx\` ON \`inquiry_files\` (\`created_at\`);`,
  )
  await db.run(
    sql`CREATE UNIQUE INDEX \`inquiry_files_filename_idx\` ON \`inquiry_files\` (\`filename\`);`,
  )

  // Document locking needs a column per collection, or the admin screen breaks rather than
  // degrades (20260907_120000_add_inquiries). Bare inline REFERENCES: SQLite's ALTER TABLE
  // cannot attach a table-level foreign key.
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`inquiry_files_id\` integer REFERENCES inquiry_files(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_inquiry_files_id_idx\` ON \`payload_locked_documents_rels\` (\`inquiry_files_id\`);`,
  )
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST — the ordering argument of
 * 20260907_120000_add_inquiries.down and 20260915_220451_add_document_visits.down. The rebuild
 * target is `payload_locked_documents_rels` exactly as 20260915_220451_add_document_visits
 * left it (nothing since has changed it); only `inquiry_files_id` is dropped. SQLite cannot
 * DROP COLUMN a column that is indexed and carries a foreign key, hence the rebuild.
 *
 * ⚠️ THIS `down` DESTROYS THE RECORD OF EVERY ATTACHED FILE AND THE NEW DETAILS ON EVERY
 * INQUIRY. The objects stay in R2 with nothing pointing at them. Take a D1 backup first —
 * docs/BACKUP-RESTORE.md.
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`(\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\` FROM \`payload_locked_documents_rels\`;`,
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

  // Only now, with nothing referencing it, can the table go; then the plain text columns.
  await db.run(sql`DROP TABLE \`inquiry_files\`;`)
  await db.run(sql`ALTER TABLE \`inquiries\` DROP COLUMN \`files_error\`;`)
  await db.run(sql`ALTER TABLE \`inquiries\` DROP COLUMN \`subject\`;`)
  await db.run(sql`ALTER TABLE \`inquiries\` DROP COLUMN \`phone\`;`)
  await db.run(sql`ALTER TABLE \`inquiries\` DROP COLUMN \`country\`;`)
  await db.run(sql`ALTER TABLE \`inquiries\` DROP COLUMN \`job_title\`;`)
}
