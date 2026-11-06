import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The tech-pack template's downloads (C1; the owner said yes to this migration on 6 Nov 2026: "one
 * migration, adds a table only").
 *
 * HAND-WRITTEN, for the reason 20260907_120000_add_inquiries records (`migrate:create` diffs against
 * the 20260729 snapshot and stops on an interactive question). Every column, type, default and index
 * below was read out of `payload generate:db-schema` on 2026-11-06, not typed from memory, with ONE
 * deliberate difference:
 *
 * ⚠️ `updates_at` AND `delete_after` HAVE NO DEFAULT, though the generator prints
 * `DEFAULT (strftime(..., 'now'))` for every date column. The precedent is
 * 20260915_220451_add_document_visits (its header says why), and here it matters more: `updates_at`
 * IS the record of a person's yes to updates. A default would stamp every download, ticked or not,
 * with a consent time — a record of a yes that was never given. `templateDownloads.test.ts` pins it.
 *
 * ⚠️ ADDITIVE ONLY: one new table and one new nullable column on `payload_locked_documents_rels`
 * (document locking needs a column per collection, or the admin screen breaks rather than degrades).
 * Nothing is rebuilt in `up`, so there is nothing for an implicit DELETE to cascade through.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`template_downloads\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`template\` text DEFAULT 'tech-pack' NOT NULL,
  	\`name\` text NOT NULL,
  	\`email\` text NOT NULL,
  	\`company\` text NOT NULL,
  	\`country\` text NOT NULL,
  	\`job_title\` text,
  	\`whatsapp\` text,
  	\`updates\` integer DEFAULT false,
  	\`updates_at\` text,
  	\`delete_after\` text,
  	\`notified\` integer DEFAULT false,
  	\`notify_error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE INDEX \`template_downloads_updated_at_idx\` ON \`template_downloads\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`template_downloads_created_at_idx\` ON \`template_downloads\` (\`created_at\`);`,
  )

  // Bare inline REFERENCES: SQLite's ALTER TABLE cannot attach a table-level foreign key.
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`template_downloads_id\` integer REFERENCES template_downloads(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_template_downloads_id_idx\` ON \`payload_locked_documents_rels\` (\`template_downloads_id\`);`,
  )
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST — the ordering argument of
 * 20261007_140000_job_applications.down. The rebuild target is `payload_locked_documents_rels`
 * exactly as 20261007_160000_journal_case_studies left it (no migration since has changed it): that
 * file's `down` target plus its `authors_id`, `journal_posts_id` and `case_studies_id`. Only the
 * column added above is dropped. SQLite cannot DROP COLUMN a column that is indexed and carries a
 * foreign key, hence the rebuild.
 *
 * ⚠️ THIS `down` DESTROYS EVERY TEMPLATE DOWNLOAD RECORD, including each person's record of a yes to
 * updates. Take a D1 backup first — docs/BACKUP-RESTORE.md.
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
  	\`job_applications_id\` integer REFERENCES job_applications(id),
  	\`application_files_id\` integer REFERENCES application_files(id),
  	\`authors_id\` integer REFERENCES authors(id),
  	\`journal_posts_id\` integer REFERENCES journal_posts(id),
  	\`case_studies_id\` integer REFERENCES case_studies(id),
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  const kept = [
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
    'job_applications_id',
    'application_files_id',
    'authors_id',
    'journal_posts_id',
    'case_studies_id',
  ]
  const columns = ['id', 'order', 'parent_id', 'path', ...kept].map((c) => `\`${c}\``).join(', ')
  await db.run(
    sql.raw(
      `INSERT INTO \`__new_payload_locked_documents_rels\`(${columns}) SELECT ${columns} FROM \`payload_locked_documents_rels\`;`,
    ),
  )
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(
    sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`,
  )
  for (const column of kept) {
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

  // Only now, with nothing referencing it, can the table go.
  await db.run(sql`DROP TABLE \`template_downloads\`;`)
}
