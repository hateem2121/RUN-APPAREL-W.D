import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The Journal and the case studies (PLAN.md E7, E8; Phases 4 and 5): authors, Journal posts and
 * case studies, each post and case study with Payload's drafts (its `_v` version tables).
 *
 * HAND-WRITTEN, for the reason 20261007_140000_job_applications records: `migrate:create` diffs
 * against the last JSON snapshot (20260729) and stops on an interactive question about a table
 * this change does not touch. Every column, type, default, index and foreign key below was read
 * out of `payload generate:db-schema` on 2026-10-07, not typed from memory — including the
 * `strftime` default Payload gives every date column, the two hasMany tables
 * (`journal_posts_related_pages` for the "Read more" select, `case_studies_rels` for the photos
 * and garments) and their version twins.
 *
 * ⚠️ ADDITIVE ONLY: nine new tables and three new nullable columns on
 * `payload_locked_documents_rels`. Nothing is rebuilt in `up`, so there is nothing for an
 * implicit DELETE to cascade through. The select values (clusters, Read more paths) are NOT
 * database constraints: SQLite gets plain text, so a new guide joins the list with no migration.
 *
 * Tables are created parents first, so every REFERENCES names a table that already exists.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`authors\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`role\` text,
  	\`bio\` text,
  	\`photo_id\` integer,
  	\`linkedin_url\` text,
  	\`consent_recorded\` integer DEFAULT false,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`photo_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`authors_photo_idx\` ON \`authors\` (\`photo_id\`);`)
  await db.run(sql`CREATE INDEX \`authors_updated_at_idx\` ON \`authors\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`authors_created_at_idx\` ON \`authors\` (\`created_at\`);`)

  await db.run(sql`CREATE TABLE \`journal_posts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`slug\` text,
  	\`description\` text,
  	\`cluster\` text,
  	\`author_id\` integer,
  	\`published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`first_published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`hero_image_id\` integer,
  	\`share_image_id\` integer,
  	\`body\` text,
  	\`ai_assisted\` integer DEFAULT false,
  	\`checked_by_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`checked_by_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`hero_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`share_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`journal_posts_slug_idx\` ON \`journal_posts\` (\`slug\`);`,
  )
  for (const [index, column] of [
    ['journal_posts_author_idx', 'author_id'],
    ['journal_posts_checked_by_idx', 'checked_by_id'],
    ['journal_posts_hero_image_idx', 'hero_image_id'],
    ['journal_posts_share_image_idx', 'share_image_id'],
    ['journal_posts_updated_at_idx', 'updated_at'],
    ['journal_posts_created_at_idx', 'created_at'],
    ['journal_posts__status_idx', '_status'],
  ]) {
    await db.run(sql.raw(`CREATE INDEX \`${index}\` ON \`journal_posts\` (\`${column}\`);`))
  }

  await db.run(sql`CREATE TABLE \`journal_posts_related_pages\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`journal_posts\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`journal_posts_related_pages_order_idx\` ON \`journal_posts_related_pages\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`journal_posts_related_pages_parent_idx\` ON \`journal_posts_related_pages\` (\`parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`_journal_posts_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_slug\` text,
  	\`version_description\` text,
  	\`version_cluster\` text,
  	\`version_author_id\` integer,
  	\`version_published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version_first_published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version_hero_image_id\` integer,
  	\`version_share_image_id\` integer,
  	\`version_body\` text,
  	\`version_ai_assisted\` integer DEFAULT false,
  	\`version_checked_by_id\` integer,
  	\`version_updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version_created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`journal_posts\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_author_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_checked_by_id\`) REFERENCES \`authors\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_hero_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_share_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  for (const [index, column] of [
    ['_journal_posts_v_parent_idx', 'parent_id'],
    ['_journal_posts_v_version_version_slug_idx', 'version_slug'],
    ['_journal_posts_v_version_version_author_idx', 'version_author_id'],
    ['_journal_posts_v_version_version_checked_by_idx', 'version_checked_by_id'],
    ['_journal_posts_v_version_version_hero_image_idx', 'version_hero_image_id'],
    ['_journal_posts_v_version_version_share_image_idx', 'version_share_image_id'],
    ['_journal_posts_v_version_version_updated_at_idx', 'version_updated_at'],
    ['_journal_posts_v_version_version_created_at_idx', 'version_created_at'],
    ['_journal_posts_v_version_version__status_idx', 'version__status'],
    ['_journal_posts_v_created_at_idx', 'created_at'],
    ['_journal_posts_v_updated_at_idx', 'updated_at'],
    ['_journal_posts_v_latest_idx', 'latest'],
  ]) {
    await db.run(sql.raw(`CREATE INDEX \`${index}\` ON \`_journal_posts_v\` (\`${column}\`);`))
  }

  await db.run(sql`CREATE TABLE \`_journal_posts_v_version_related_pages\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_journal_posts_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`_journal_posts_v_version_related_pages_order_idx\` ON \`_journal_posts_v_version_related_pages\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`_journal_posts_v_version_related_pages_parent_idx\` ON \`_journal_posts_v_version_related_pages\` (\`parent_id\`);`,
  )

  await db.run(sql`CREATE TABLE \`case_studies\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`title\` text,
  	\`slug\` text,
  	\`description\` text,
  	\`first_published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`client_description\` text,
  	\`client_named\` integer DEFAULT false,
  	\`client_name\` text,
  	\`what_was_made\` text,
  	\`quantity\` text,
  	\`timeline\` text,
  	\`challenge\` text,
  	\`what_we_did\` text,
  	\`result\` text,
  	\`client_quote\` text,
  	\`quote_attribution\` text,
  	\`client_permission\` integer DEFAULT false,
  	\`share_image_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`_status\` text DEFAULT 'draft',
  	FOREIGN KEY (\`share_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`case_studies_slug_idx\` ON \`case_studies\` (\`slug\`);`)
  for (const [index, column] of [
    ['case_studies_share_image_idx', 'share_image_id'],
    ['case_studies_updated_at_idx', 'updated_at'],
    ['case_studies_created_at_idx', 'created_at'],
    ['case_studies__status_idx', '_status'],
  ]) {
    await db.run(sql.raw(`CREATE INDEX \`${index}\` ON \`case_studies\` (\`${column}\`);`))
  }

  await db.run(sql`CREATE TABLE \`case_studies_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`products_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`case_studies\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  for (const column of ['order', 'parent_id', 'path', 'media_id', 'products_id']) {
    const name = column === 'parent_id' ? 'parent' : column
    await db.run(
      sql.raw(`CREATE INDEX \`case_studies_rels_${name}_idx\` ON \`case_studies_rels\` (\`${column}\`);`),
    )
  }

  await db.run(sql`CREATE TABLE \`_case_studies_v\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`parent_id\` integer,
  	\`version_title\` text,
  	\`version_slug\` text,
  	\`version_description\` text,
  	\`version_first_published_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version_client_description\` text,
  	\`version_client_named\` integer DEFAULT false,
  	\`version_client_name\` text,
  	\`version_what_was_made\` text,
  	\`version_quantity\` text,
  	\`version_timeline\` text,
  	\`version_challenge\` text,
  	\`version_what_we_did\` text,
  	\`version_result\` text,
  	\`version_client_quote\` text,
  	\`version_quote_attribution\` text,
  	\`version_client_permission\` integer DEFAULT false,
  	\`version_share_image_id\` integer,
  	\`version_updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version_created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  	\`version__status\` text DEFAULT 'draft',
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`latest\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`case_studies\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`version_share_image_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  for (const [index, column] of [
    ['_case_studies_v_parent_idx', 'parent_id'],
    ['_case_studies_v_version_version_slug_idx', 'version_slug'],
    ['_case_studies_v_version_version_share_image_idx', 'version_share_image_id'],
    ['_case_studies_v_version_version_updated_at_idx', 'version_updated_at'],
    ['_case_studies_v_version_version_created_at_idx', 'version_created_at'],
    ['_case_studies_v_version_version__status_idx', 'version__status'],
    ['_case_studies_v_created_at_idx', 'created_at'],
    ['_case_studies_v_updated_at_idx', 'updated_at'],
    ['_case_studies_v_latest_idx', 'latest'],
  ]) {
    await db.run(sql.raw(`CREATE INDEX \`${index}\` ON \`_case_studies_v\` (\`${column}\`);`))
  }

  await db.run(sql`CREATE TABLE \`_case_studies_v_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`media_id\` integer,
  	\`products_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`_case_studies_v\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  for (const column of ['order', 'parent_id', 'path', 'media_id', 'products_id']) {
    const name = column === 'parent_id' ? 'parent' : column
    await db.run(
      sql.raw(
        `CREATE INDEX \`_case_studies_v_rels_${name}_idx\` ON \`_case_studies_v_rels\` (\`${column}\`);`,
      ),
    )
  }

  // Document locking needs a column per collection, or the admin screen breaks rather than
  // degrades (20260907_120000_add_inquiries). Bare inline REFERENCES: SQLite's ALTER TABLE
  // cannot attach a table-level foreign key.
  for (const [column, table] of [
    ['authors_id', 'authors'],
    ['journal_posts_id', 'journal_posts'],
    ['case_studies_id', 'case_studies'],
  ]) {
    await db.run(
      sql.raw(
        `ALTER TABLE \`payload_locked_documents_rels\` ADD \`${column}\` integer REFERENCES ${table}(id);`,
      ),
    )
    await db.run(
      sql.raw(
        `CREATE INDEX \`payload_locked_documents_rels_${column}_idx\` ON \`payload_locked_documents_rels\` (\`${column}\`);`,
      ),
    )
  }
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST — the ordering argument of
 * 20261007_140000_job_applications.down. The rebuild target is `payload_locked_documents_rels`
 * exactly as 20261007_140000 left it: that file's `down` target plus its `job_applications_id`
 * and `application_files_id`. Only the three columns added above are dropped. SQLite cannot
 * DROP COLUMN a column that is indexed and carries a foreign key, hence the rebuild.
 *
 * ⚠️ THIS `down` DESTROYS EVERY AUTHOR, JOURNAL POST AND CASE STUDY, with their drafts and
 * history. The pictures stay in Media. Take a D1 backup first — docs/BACKUP-RESTORE.md.
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`(\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\`, \`inquiry_files_id\`, \`job_applications_id\`, \`application_files_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`, \`document_visits_id\`, \`document_visit_salts_id\`, \`document_visit_emails_id\`, \`inquiry_files_id\`, \`job_applications_id\`, \`application_files_id\` FROM \`payload_locked_documents_rels\`;`,
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
    'job_applications_id',
    'application_files_id',
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

  // Only now, with nothing referencing them, can the tables go: each one's referrers first.
  for (const table of [
    '_case_studies_v_rels',
    '_case_studies_v',
    'case_studies_rels',
    'case_studies',
    '_journal_posts_v_version_related_pages',
    '_journal_posts_v',
    'journal_posts_related_pages',
    'journal_posts',
    'authors',
  ]) {
    await db.run(sql.raw(`DROP TABLE \`${table}\`;`))
  }
}
