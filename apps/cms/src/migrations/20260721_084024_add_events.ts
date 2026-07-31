import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`events\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`type\` text NOT NULL,
  	\`event\` text NOT NULL,
  	\`product\` text,
  	\`variant\` text,
  	\`placement\` text,
  	\`message\` text,
  	\`ua\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`events_type_idx\` ON \`events\` (\`type\`);`)
  await db.run(sql`CREATE INDEX \`events_event_idx\` ON \`events\` (\`event\`);`)
  await db.run(sql`CREATE INDEX \`events_updated_at_idx\` ON \`events\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`events_created_at_idx\` ON \`events\` (\`created_at\`);`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`events_id\` integer REFERENCES events(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // ORDER MATTERS, and the generated version had it backwards.
  //
  // As generated this dropped `events` FIRST, relying on `PRAGMA
  // foreign_keys=OFF` to keep `payload_locked_documents_rels.events_id` from
  // objecting. That pragma DOES NOTHING on D1: SQLite ignores it inside a
  // transaction and D1 wraps every statement batch in one. So the rebuild ran
  // with foreign keys live, and `DROP TABLE events` fired an implicit DELETE
  // against a column still referencing it.
  //
  // Rebuilding the referencing table first — dropping the `events_id` column in
  // the process — means nothing refers to `events` by the time it goes, so the
  // drop is unconditionally safe. `defer_foreign_keys` is belt and braces on
  // top; note it defers CHECKS, not cascades, and resets at end of transaction,
  // so there is no matching "ON" to restore.
  //
  // Latent rather than live: this is a down-path, and nothing has rolled back in
  // production. It would have failed the first time anyone tried.
  await db.run(sql`PRAGMA defer_foreign_keys = true;`)
  await db.run(sql`CREATE TABLE \`__new_payload_locked_documents_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	\`media_id\` integer,
  	\`products_id\` integer,
  	\`colourways_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_locked_documents\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`media_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`products_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`colourways_id\`) REFERENCES \`colourways\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "products_id", "colourways_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "products_id", "colourways_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  // Nothing references `events` now, so this cannot cascade into anything.
  await db.run(sql`DROP TABLE \`events\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_products_id_idx\` ON \`payload_locked_documents_rels\` (\`products_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_colourways_id_idx\` ON \`payload_locked_documents_rels\` (\`colourways_id\`);`)
}
