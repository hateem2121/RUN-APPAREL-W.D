import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`users_sessions\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`created_at\` text,
  	\`expires_at\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`users_sessions_order_idx\` ON \`users_sessions\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`users_sessions_parent_id_idx\` ON \`users_sessions\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`users\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text NOT NULL,
  	\`role\` text DEFAULT 'editor' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`email\` text NOT NULL,
  	\`reset_password_token\` text,
  	\`reset_password_expiration\` text,
  	\`salt\` text,
  	\`hash\` text,
  	\`login_attempts\` numeric DEFAULT 0,
  	\`lock_until\` text
  );
  `)
  await db.run(sql`CREATE INDEX \`users_updated_at_idx\` ON \`users\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`users_created_at_idx\` ON \`users\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`users_email_idx\` ON \`users\` (\`email\`);`)
  await db.run(sql`CREATE TABLE \`media\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`alt\` text NOT NULL,
  	\`source_reference\` text,
  	\`size_warning\` integer,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`url\` text,
  	\`thumbnail_u_r_l\` text,
  	\`filename\` text,
  	\`mime_type\` text,
  	\`filesize\` numeric,
  	\`width\` numeric,
  	\`height\` numeric,
  	\`focal_x\` numeric,
  	\`focal_y\` numeric
  );
  `)
  await db.run(sql`CREATE INDEX \`media_updated_at_idx\` ON \`media\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`media_created_at_idx\` ON \`media\` (\`created_at\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`media_filename_idx\` ON \`media\` (\`filename\`);`)
  await db.run(sql`CREATE TABLE \`products_performance_features\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`feature\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_performance_features_order_idx\` ON \`products_performance_features\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_performance_features_parent_id_idx\` ON \`products_performance_features\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`products_customisation_steps\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`number\` numeric NOT NULL,
  	\`title\` text NOT NULL,
  	\`body\` text NOT NULL,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_customisation_steps_order_idx\` ON \`products_customisation_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_customisation_steps_parent_id_idx\` ON \`products_customisation_steps\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`products\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`product_code\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`product_name\` text NOT NULL,
  	\`category\` text NOT NULL,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`variant_mode\` text DEFAULT 'single-glb-variants' NOT NULL,
  	\`variants_verified\` integer DEFAULT false,
  	\`default_colourway_id\` integer,
  	\`presentation_mode\` text DEFAULT 'floatingGarment' NOT NULL,
  	\`glb_asset_id\` integer,
  	\`poster_fallback_id\` integer,
  	\`fabric_composition\` text,
  	\`gsm\` text,
  	\`garment_fit\` text,
  	\`customisation_intro\` text,
  	\`front_camera_orbit\` text DEFAULT '0deg 82deg 105%' NOT NULL,
  	\`back_camera_orbit\` text DEFAULT '180deg 82deg 105%' NOT NULL,
  	\`side_camera_orbit\` text DEFAULT '90deg 82deg 105%' NOT NULL,
  	\`camera_target\` text DEFAULT 'auto auto auto' NOT NULL,
  	\`default_field_of_view\` text DEFAULT '30deg' NOT NULL,
  	\`catalogue_url\` text DEFAULT 'https://wear-run.help/catalogue' NOT NULL,
  	\`sort_order\` numeric DEFAULT 0,
  	\`retired_message\` text DEFAULT 'The colourway linked by this QR is no longer active. You are viewing the current available reference.' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`default_colourway_id\`) REFERENCES \`colourways\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`poster_fallback_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`products_product_code_idx\` ON \`products\` (\`product_code\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`products_slug_idx\` ON \`products\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`products_default_colourway_idx\` ON \`products\` (\`default_colourway_id\`);`)
  await db.run(sql`CREATE INDEX \`products_glb_asset_idx\` ON \`products\` (\`glb_asset_id\`);`)
  await db.run(sql`CREATE INDEX \`products_poster_fallback_idx\` ON \`products\` (\`poster_fallback_id\`);`)
  await db.run(sql`CREATE INDEX \`products_updated_at_idx\` ON \`products\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`products_created_at_idx\` ON \`products\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`colourways\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`product_id\` integer NOT NULL,
  	\`variant_id\` text NOT NULL,
  	\`display_name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`sequence\` numeric DEFAULT 1 NOT NULL,
  	\`poster_preview_id\` integer NOT NULL,
  	\`glb_asset_id\` integer,
  	\`active\` integer DEFAULT true,
  	\`is_default\` integer DEFAULT false,
  	\`alt_text\` text NOT NULL,
  	\`hex_swatch\` text,
  	\`note\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`poster_preview_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  await db.run(sql`CREATE INDEX \`colourways_product_idx\` ON \`colourways\` (\`product_id\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`colourways_variant_id_idx\` ON \`colourways\` (\`variant_id\`);`)
  await db.run(sql`CREATE INDEX \`colourways_slug_idx\` ON \`colourways\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`colourways_poster_preview_idx\` ON \`colourways\` (\`poster_preview_id\`);`)
  await db.run(sql`CREATE INDEX \`colourways_glb_asset_idx\` ON \`colourways\` (\`glb_asset_id\`);`)
  await db.run(sql`CREATE INDEX \`colourways_updated_at_idx\` ON \`colourways\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`colourways_created_at_idx\` ON \`colourways\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_kv\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text NOT NULL,
  	\`data\` text NOT NULL
  );
  `)
  await db.run(sql`CREATE UNIQUE INDEX \`payload_kv_key_idx\` ON \`payload_kv\` (\`key\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`global_slug\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_global_slug_idx\` ON \`payload_locked_documents\` (\`global_slug\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_updated_at_idx\` ON \`payload_locked_documents\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_created_at_idx\` ON \`payload_locked_documents\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_locked_documents_rels\` (
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
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_products_id_idx\` ON \`payload_locked_documents_rels\` (\`products_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_colourways_id_idx\` ON \`payload_locked_documents_rels\` (\`colourways_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`key\` text,
  	\`value\` text,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_key_idx\` ON \`payload_preferences\` (\`key\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_updated_at_idx\` ON \`payload_preferences\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_created_at_idx\` ON \`payload_preferences\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`payload_preferences_rels\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`order\` integer,
  	\`parent_id\` integer NOT NULL,
  	\`path\` text NOT NULL,
  	\`users_id\` integer,
  	FOREIGN KEY (\`parent_id\`) REFERENCES \`payload_preferences\`(\`id\`) ON UPDATE no action ON DELETE cascade,
  	FOREIGN KEY (\`users_id\`) REFERENCES \`users\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_order_idx\` ON \`payload_preferences_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_parent_idx\` ON \`payload_preferences_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_path_idx\` ON \`payload_preferences_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_preferences_rels_users_id_idx\` ON \`payload_preferences_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE TABLE \`payload_migrations\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`name\` text,
  	\`batch\` numeric,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
  );
  `)
  await db.run(sql`CREATE INDEX \`payload_migrations_updated_at_idx\` ON \`payload_migrations\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`payload_migrations_created_at_idx\` ON \`payload_migrations\` (\`created_at\`);`)
  await db.run(sql`CREATE TABLE \`site_settings\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`company_name\` text DEFAULT 'RUN APPAREL (PVT) LTD' NOT NULL,
  	\`email\` text DEFAULT 'partner@wear-run.com' NOT NULL,
  	\`whatsapp_number\` text DEFAULT '+923361777313' NOT NULL,
  	\`catalogue_url\` text DEFAULT 'https://wear-run.help/catalogue' NOT NULL,
  	\`temporary_wordmark\` text DEFAULT 'RUN APPAREL' NOT NULL,
  	\`footer_line\` text DEFAULT 'RUN THE EXTRA MILE.' NOT NULL,
  	\`legal_line\` text DEFAULT '© RUN APPAREL (PVT) LTD' NOT NULL,
  	\`inquiry_template_subject\` text DEFAULT 'Product Enquiry — [Product Name] / [Colour]',
  	\`inquiry_template_body_intro\` text DEFAULT 'Hello RUN Team,
  
  I am interested in [Product Name] ([Product Code]) in [Colour].',
  	\`inquiry_template_microcopy\` text DEFAULT 'Share your company, target market, estimated quantity and product requirements so our team can advise accurately.',
  	\`analytics_cf_beacon_token\` text,
  	\`viewer_api_cache_seconds\` numeric DEFAULT 60,
  	\`updated_at\` text,
  	\`created_at\` text
  );
  `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // CHILDREN FIRST. As generated this dropped `users`, `media` and `products`
  // before the `_rels` tables that reference them. With foreign keys live —
  // which is how D1 runs — dropping a parent leaves the child holding a FK to a
  // table that no longer exists, and the next DROP fails with
  // "no such table: main.users" as SQLite tries to resolve it.
  //
  // Latent rather than live: nothing has ever rolled back to zero. It would have
  // failed the first time anyone tried, which is the worst moment to find out.
  // Caught by replay.test.ts, which runs the down path with foreign keys on.
  await db.run(sql`PRAGMA defer_foreign_keys = true;`)

  // Referencing tables.
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences_rels\`;`)
  await db.run(sql`DROP TABLE \`users_sessions\`;`)
  await db.run(sql`DROP TABLE \`products_performance_features\`;`)
  await db.run(sql`DROP TABLE \`products_customisation_steps\`;`)
  await db.run(sql`DROP TABLE \`colourways\`;`)

  // Now nothing refers to these.
  await db.run(sql`DROP TABLE \`payload_locked_documents\`;`)
  await db.run(sql`DROP TABLE \`payload_preferences\`;`)
  await db.run(sql`DROP TABLE \`users\`;`)
  await db.run(sql`DROP TABLE \`media\`;`)
  await db.run(sql`DROP TABLE \`products\`;`)
  await db.run(sql`DROP TABLE \`payload_kv\`;`)
  await db.run(sql`DROP TABLE \`payload_migrations\`;`)
  await db.run(sql`DROP TABLE \`site_settings\`;`)
}
