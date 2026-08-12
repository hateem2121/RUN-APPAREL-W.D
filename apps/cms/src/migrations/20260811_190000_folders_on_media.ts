import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Enables Payload's Folders feature (see Media.ts's `folders: true` for the
 * beta-acceptance note) by building the schema it needs: a new `payload-folders`
 * collection, its hasMany `folderType` child table, a bookkeeping column on
 * `payload_locked_documents_rels` for the new collection (every collection gets
 * one — see 20260721_084024_add_events.ts), and the hidden `folder` relationship
 * Folders adds to every folder-enabled collection — here, just `media`.
 *
 * VERIFIED, NOT ASSUMED. `payload migrate:create` was tried first, per the
 * brief, and still blocks on the exact prompt task 9 already hit and documented
 * in 20260811_163415_catalogue_defaults.ts (the newest `.json` snapshot on disk
 * is two hand-written migrations stale) — confirmed it is not specific to that
 * migration by re-running it with `folders: true` already applied to Media.ts;
 * same interactive rename-vs-create prompt about `file_colour_details`, before
 * the folders diff is ever reached. So every column name, type, nullability,
 * index and foreign key below was instead read out of `payload.db.rawTables` on
 * a real local `payload run` — the exact schema `@payloadcms/drizzle` computes
 * from the live config, i.e. what a working `migrate:create` would diff from —
 * via a throwaway inspection script (not committed; see task-11-report.md for
 * the full dump). Column order was cross-checked against a known-correct case
 * (`products_customisation_steps`) using the same technique, which is how the
 * one genuine surprise below was caught rather than guessed past.
 *
 * ── ONE DELIBERATE DEVIATION from that verified schema, and why ──────────────
 *
 * The real, config-derived schema gives `media.folder_id` a foreign key
 * (`REFERENCES payload_folders(id) ON DELETE set null`, same shape as every
 * other relationship field). This migration does NOT add that constraint.
 *
 * Reason: SQLite's `ALTER TABLE ... DROP COLUMN` refuses a column that is
 * indexed OR carries a foreign key (sqlite.org/lang_altertable.html — the DROP
 * COLUMN restrictions list). The `folder` field is both (Payload sets
 * `index: true` on every folder field — buildFolderField.js). So reversing this
 * migration faithfully would require rebuilding `media` itself — the thing this
 * task's brief says to stop and report before writing, not do. Unlike the
 * `payload_locked_documents_rels` rebuild below (safe: confirmed with
 * `PRAGMA foreign_key_list` on every other table that nothing references it, so
 * dropping the old copy cannot cascade anywhere), `media` is the FK *target* of
 * `products.glb_asset_id`, `products.poster_fallback_id`,
 * `products_colourways.poster_preview_id`, `products_colourways.glb_asset_id`
 * (all ON DELETE set null) and `payload_locked_documents_rels.media_id` (ON
 * DELETE cascade) — confirmed against the real local schema with `.schema
 * products products_colourways payload_locked_documents_rels`. D1 wraps a
 * migration in one transaction with foreign keys enforced, and `DROP TABLE`
 * performs an implicit DELETE under enforcement, so rebuilding `media` would
 * fire every one of those actions AT ONCE: every product and colourway in the
 * catalogue would lose its 3D file and photo in a single rollback — a
 * catalogue-wide version of the exact incident `Media.ts`'s own `beforeDelete`
 * hook exists to prevent for one file at a time.
 *
 * Dropping the constraint instead of the column removes exactly one thing: the
 * DATABASE refusing to store a `folder_id` that points at a folder that does
 * not exist. Application-level protection is unchanged, and was verified from
 * source rather than assumed: `buildFolderField`'s own `validate` function
 * (payload/dist/folders/buildFolderField.js) rejects an unknown folder id
 * before the write reaches the database, and `dissasociateAfterDelete`
 * (payload/dist/folders/hooks/dissasociateAfterDelete.js) already runs a
 * `payload.update` that clears `folder` on every document in every
 * folder-enabled collection whenever a folder is deleted — and going through
 * Payload is the only way a folder is ever deleted; nothing in this codebase
 * issues raw SQL against `payload-folders`. The column keeps its index (a plain
 * `CREATE INDEX`, reversible on its own with `DROP INDEX`, so it adds no
 * rebuild risk) — only the foreign key is gone. This narrows a real but small
 * integrity guarantee; it does not remove one anything here currently relies
 * on. Flagged in task-11-report.md as a decision the owner may want to revisit.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`payload_folders\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`folder_id\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`folder_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_folders_name_idx\` ON \`payload_folders\` (\`name\`);`)
  await db.run(sql`CREATE INDEX \`payload_folders_folder_idx\` ON \`payload_folders\` (\`folder_id\`);`)
  await db.run(
    sql`CREATE INDEX \`payload_folders_updated_at_idx\` ON \`payload_folders\` (\`updated_at\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_folders_created_at_idx\` ON \`payload_folders\` (\`created_at\`);`,
  )

  // `collectionSpecific` defaults to true (payload/dist/config/defaults.js), so
  // Folders always builds this table, letting a folder be restricted to holding
  // only certain collections' documents. With only `media` enabled the option
  // set is just ['media'] today, but this is Payload's own default shape, not
  // something added for this task — reproduced as-is rather than special-cased
  // away. `order`/`parent_id` here are NOT underscore-prefixed (`_order` on an
  // array-field child table is; this hasMany-select child table's are not) —
  // the one genuine surprise the cross-check against products_customisation_steps
  // caught; `id` here is a plain auto-incrementing integer for the same reason
  // (a select option row is never addressed by its own id through the API, so
  // it does not need the text/uuid id array rows get).
  await db.run(sql`CREATE TABLE \`payload_folders_folder_type\` (
  	\`order\` integer NOT NULL,
  	\`parent_id\` integer NOT NULL,
  	\`value\` text,
  	\`id\` integer PRIMARY KEY NOT NULL,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_folders\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`CREATE INDEX \`payload_folders_folder_type_order_idx\` ON \`payload_folders_folder_type\` (\`order\`);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_folders_folder_type_parent_idx\` ON \`payload_folders_folder_type\` (\`parent_id\`);`,
  )

  // The hidden field Folders adds to every folder-enabled collection. No
  // REFERENCES clause — see the file comment above.
  await db.run(sql`ALTER TABLE \`media\` ADD \`folder_id\` integer;`)
  await db.run(sql`CREATE INDEX \`media_folder_idx\` ON \`media\` (\`folder_id\`);`)

  // Every collection gets a column here — payload-folders is a real collection
  // (createFolderCollection.js sets no `lockDocuments: false`), so it is no
  // exception. Bare REFERENCES, no ON DELETE: SQLite's ALTER TABLE ADD COLUMN
  // cannot add a table-level constraint, only an inline one, and this matches
  // the same repo's own precedent for adding a column to THIS table (see the
  // equivalent line in 20260721_084024_add_events.ts and
  // 20260724_100420_add_raw_uploads.ts — neither specifies ON DELETE inline
  // either). The `ON DELETE cascade` every other column here now carries
  // arrived the same way theirs did: via the next full rebuild of this table,
  // which is exactly what this migration's own down() performs, for the same
  // "cannot DROP a column that is indexed or has a foreign key" reason theirs
  // did.
  await db.run(
    sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`payload_folders_id\` integer REFERENCES payload_folders(id);`,
  )
  await db.run(
    sql`CREATE INDEX \`payload_locked_documents_rels_payload_folders_id_idx\` ON \`payload_locked_documents_rels\` (\`payload_folders_id\`);`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Same rebuild this table has needed twice before (20260721_084024_add_events,
  // 20260724_100420_add_raw_uploads) and got a third time as a side effect of
  // 20260729_070548_inline_colourways: SQLite cannot DROP COLUMN a column that
  // is indexed or carries a foreign key, and `payload_folders_id` is both.
  // Rebuilding THIS table (rather than `media` — see the file comment) is safe:
  // `PRAGMA foreign_key_list` on every other table in this database returns
  // nothing that targets `payload_locked_documents_rels`, so dropping the old
  // copy cannot cascade into anything else.
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
  	\`events_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`raw_uploads_id\`) REFERENCES \`raw_uploads\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`events_id\`) REFERENCES \`events\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(
    sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "raw_uploads_id", "products_id", "events_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "raw_uploads_id", "products_id", "events_id" FROM \`payload_locked_documents_rels\`;`,
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

  await db.run(sql`DROP INDEX \`media_folder_idx\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`folder_id\`;`)

  // Children first, same rule as every other down() in this directory.
  // payload_folders_folder_type is the only thing with a foreign key into
  // payload_folders; payload_locked_documents_rels lost its column above and
  // media never had a database-level one (see the file comment) — so by this
  // point nothing references payload_folders at all.
  await db.run(sql`DROP TABLE \`payload_folders_folder_type\`;`)
  await db.run(sql`DROP TABLE \`payload_folders\`;`)
}
