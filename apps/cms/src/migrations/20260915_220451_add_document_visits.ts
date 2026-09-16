import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The three visit-records tables (`document-visits`, `document-visit-salts`,
 * `document-visit-emails` — see the collection files this migration accompanies).
 *
 * HAND-WRITTEN, NOT GENERATED — for the reason `20260811_163415_catalogue_defaults`
 * and every hand-written migration since gives: `payload migrate:create` diffs against
 * the newest `.json` snapshot in this directory, still `20260729_120855`, so it opens an
 * interactive rename-ambiguity prompt instead of a clean additive diff. This task's
 * controller instruction was to skip attempting `migrate:create` altogether rather than
 * run it into that same prompt in a non-interactive shell that cannot answer it — every
 * column name and type below was read out of `payload generate:db-schema`
 * (`src/payload-generated-schema.ts`, deleted after reading, 2026-09-16) instead.
 *
 * ⚠️ `first_at`, `last_at` and `sent_at` (all `type: 'date'`) are PLAIN `text`, WITH NO
 * DEFAULT — do not add one, even though `generate:db-schema` prints
 * `DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))` for every `date` column including
 * these three. That command reconstructs an idealised schema from the current config,
 * which is not what any committed migration here actually builds: `users`
 * (`20260720_185735_initial.ts` lines 23 and 27) gives its own two `date` fields,
 * `reset_password_expiration` and `lock_until`, plain `text` with no default, and
 * `grep -n strftime src/migrations/*.ts` shows that default on no column anywhere but
 * `updated_at`/`created_at`, in every migration in this tree. Matching the generator
 * instead of the committed precedent here would matter in production, not just in
 * style: `document_visit_emails.sent_at` is set only on a successful send (Task 8), and
 * a default would give a FAILED attempt's row a timestamp that reads as a send that
 * never happened. Pinned by `documentVisits.test.ts`'s
 * `'… have no column default'` case.
 *
 * ⚠️ PURELY ADDITIVE — three new tables, and three new nullable columns on
 * `payload_locked_documents_rels` for Payload's own document-locking. No existing
 * table is rebuilt in `up`, so none of the implicit-DELETE cascade hazard the root
 * CLAUDE.md describes applies to this half. `down` DOES rebuild
 * `payload_locked_documents_rels` — see its own comment below.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`document_visits\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`day\` text NOT NULL,
  	\`document\` text NOT NULL,
  	\`kind\` text NOT NULL,
  	\`visitor\` text,
  	\`first_at\` text,
  	\`last_at\` text,
  	\`minutes_active\` numeric DEFAULT 0,
  	\`opens\` numeric DEFAULT 0,
  	\`furthest_page\` numeric DEFAULT 0,
  	\`pages_total\` numeric DEFAULT 0,
  	\`downloads\` numeric DEFAULT 0,
  	\`country\` text,
  	\`region\` text,
  	\`city\` text,
  	\`timezone\` text,
  	\`network\` text,
  	\`device\` text,
  	\`system\` text,
  	\`browser\` text,
  	\`language\` text,
  	\`came_from\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`document_visits_day_idx\` ON \`document_visits\` (\`day\`);`)
  await db.run(
    sql`CREATE UNIQUE INDEX \`day_document_visitor_kind_idx\` ON \`document_visits\` (\`day\`,\`document\`,\`visitor\`,\`kind\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visits_updated_at_idx\` ON \`document_visits\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visits_created_at_idx\` ON \`document_visits\` (\`created_at\`);`,
  )

  await db.run(sql`CREATE TABLE \`document_visit_salts\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`day\` text NOT NULL,
  	\`salt\` text NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`document_visit_salts_day_idx\` ON \`document_visit_salts\` (\`day\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visit_salts_updated_at_idx\` ON \`document_visit_salts\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visit_salts_created_at_idx\` ON \`document_visit_salts\` (\`created_at\`);`,
  )

  await db.run(sql`CREATE TABLE \`document_visit_emails\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`week\` text NOT NULL,
  	\`status\` text NOT NULL,
  	\`sent_at\` text,
  	\`error\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(
    sql`CREATE UNIQUE INDEX \`document_visit_emails_week_idx\` ON \`document_visit_emails\` (\`week\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visit_emails_updated_at_idx\` ON \`document_visit_emails\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`document_visit_emails_created_at_idx\` ON \`document_visit_emails\` (\`created_at\`);`,
  )

  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`document_visits_id\` integer REFERENCES document_visits(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_document_visits_id_idx\` ON \`payload_locked_documents_rels\` (\`document_visits_id\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`document_visit_salts_id\` integer REFERENCES document_visit_salts(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_document_visit_salts_id_idx\` ON \`payload_locked_documents_rels\` (\`document_visit_salts_id\`);`,
  )
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`document_visit_emails_id\` integer REFERENCES document_visit_emails(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_document_visit_emails_id_idx\` ON \`payload_locked_documents_rels\` (\`document_visit_emails_id\`);`,
  )
}

/**
 * ⚠️ THE REFERENCING TABLE IS REBUILT FIRST, AND THE ORDER IS THE WHOLE SAFETY
 * ARGUMENT — the same one `20260907_120000_add_inquiries.down` and
 * `20260721_084024_add_events.down` record. `DROP TABLE` runs an implicit DELETE, and
 * that cascades; removing the three new columns from `payload_locked_documents_rels`
 * first means nothing refers to the three new tables by the time they go.
 *
 * The rebuild target is the table exactly as `20260907_120000_add_inquiries` left it —
 * this migration's own `payload_folders_id` and `inquiries_id` columns are two more
 * examples of the same thing this comment already describes: added later by a bare
 * `ALTER TABLE … ADD … REFERENCES …(id)` with no `ON DELETE`, because SQLite cannot
 * attach a table-level foreign key to an already-existing table. Both are preserved
 * here exactly that way; only the three columns THIS migration added are dropped.
 *
 * ⚠️ THIS `down` DESTROYS EVERY STORED VISIT, SALT AND WEEKLY-EMAIL STATUS. Take a D1
 * backup first — docs/BACKUP-RESTORE.md.
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
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`(\`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\`) SELECT \`id\`, \`order\`, \`parent_id\`, \`path\`, \`users_id\`, \`media_id\`, \`raw_uploads_id\`, \`products_id\`, \`events_id\`, \`payload_folders_id\`, \`inquiries_id\` FROM \`payload_locked_documents_rels\`;`,
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
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_inquiries_id_idx\` ON \`payload_locked_documents_rels\` (\`inquiries_id\`);`,
  )

  // Only now, with nothing referencing them, can the three new tables go.
  await db.run(sql`DROP TABLE \`document_visits\`;`)
  await db.run(sql`DROP TABLE \`document_visit_salts\`;`)
  await db.run(sql`DROP TABLE \`document_visit_emails\`;`)
}
