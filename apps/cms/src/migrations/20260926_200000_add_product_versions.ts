import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Edit history for products (`versions` on `Products.ts`, owner's decision 2026-09-26).
 *
 * GENERATED FROM PAYLOAD'S OWN SCHEMA, NOT TYPED BY HAND, and not by `migrate:create`,
 * whose baseline snapshot is stale (see 20260923_170000_add_reset_password_requested_at).
 * The config was loaded twice, before and after the one-line change, each schema passed
 * through drizzle-kit's `generateSQLiteDrizzleJson`, and the two diffed with
 * `generateSQLiteMigration` — the same calls `migrate:create` makes internally
 * (`@payloadcms/drizzle` → `getMigrationStatements`), minus the stale baseline.
 *
 * Purely additive: four NEW tables and their indexes. No existing table is altered,
 * rebuilt or dropped, so nothing can cascade (.claude/rules/d1-migrations.md).
 * `_products_v` is created first so each child's foreign key names an existing table.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`CREATE TABLE \`_products_v\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`parent_id\` integer,
	\`version_status\` text DEFAULT 'draft' NOT NULL,
	\`version_sort_order\` numeric DEFAULT 0,
	\`version_product_name\` text NOT NULL,
	\`version_short_description\` text,
	\`version_product_code\` text NOT NULL,
	\`version_slug\` text NOT NULL,
	\`version_category\` text NOT NULL,
	\`version_variant_mode\` text DEFAULT 'single-glb-variants' NOT NULL,
	\`version_glb_asset_id\` integer,
	\`version_poster_fallback_id\` integer,
	\`version_variants_verified\` integer DEFAULT false,
	\`version_file_colours\` text,
	\`version_file_colour_details\` text,
	\`version_fabric_composition\` text,
	\`version_gsm\` text,
	\`version_garment_fit\` text,
	\`version_customisation_intro\` text,
	\`version_front_camera_orbit\` text DEFAULT '0deg 82deg 105%' NOT NULL,
	\`version_back_camera_orbit\` text DEFAULT '180deg 82deg 105%' NOT NULL,
	\`version_side_camera_orbit\` text DEFAULT '90deg 82deg 105%' NOT NULL,
	\`version_camera_target\` text DEFAULT 'auto auto auto' NOT NULL,
	\`version_default_field_of_view\` text DEFAULT '30deg' NOT NULL,
	\`version_catalogue_url\` text NOT NULL,
	\`version_retired_message\` text NOT NULL,
	\`version_updated_at\` text,
	\`version_created_at\` text,
	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (\`parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`version_glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`version_poster_fallback_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
);`)
  await db.run(sql`CREATE INDEX \`_products_v_parent_idx\` ON \`_products_v\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_product_code_idx\` ON \`_products_v\` (\`version_product_code\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_slug_idx\` ON \`_products_v\` (\`version_slug\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_glb_asset_idx\` ON \`_products_v\` (\`version_glb_asset_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_poster_fallback_idx\` ON \`_products_v\` (\`version_poster_fallback_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_updated_at_idx\` ON \`_products_v\` (\`version_updated_at\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_version_created_at_idx\` ON \`_products_v\` (\`version_created_at\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_created_at_idx\` ON \`_products_v\` (\`created_at\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_updated_at_idx\` ON \`_products_v\` (\`updated_at\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_version_colourways\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`display_name\` text,
	\`slug\` text,
	\`variant_id\` text,
	\`poster_preview_id\` integer,
	\`alt_text\` text,
	\`hex_swatch\` text,
	\`glb_asset_id\` integer,
	\`active\` integer DEFAULT true,
	\`note\` text,
	\`_uuid\` text,
	FOREIGN KEY (\`poster_preview_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_colourways_order_idx\` ON \`_products_v_version_colourways\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_colourways_parent_id_idx\` ON \`_products_v_version_colourways\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_colourways_poster_preview_idx\` ON \`_products_v_version_colourways\` (\`poster_preview_id\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_colourways_glb_asset_idx\` ON \`_products_v_version_colourways\` (\`glb_asset_id\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_version_performance_features\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`feature\` text NOT NULL,
	\`_uuid\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_performance_features_order_idx\` ON \`_products_v_version_performance_features\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_performance_features_parent_id_idx\` ON \`_products_v_version_performance_features\` (\`_parent_id\`);`)
  await db.run(sql`CREATE TABLE \`_products_v_version_customisation_steps\` (
	\`_order\` integer NOT NULL,
	\`_parent_id\` integer NOT NULL,
	\`id\` integer PRIMARY KEY NOT NULL,
	\`number\` numeric NOT NULL,
	\`title\` text NOT NULL,
	\`body\` text NOT NULL,
	\`_uuid\` text,
	FOREIGN KEY (\`_parent_id\`) REFERENCES \`_products_v\`(\`id\`) ON UPDATE no action ON DELETE cascade
);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_customisation_steps_order_idx\` ON \`_products_v_version_customisation_steps\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`_products_v_version_customisation_steps_parent_id_idx\` ON \`_products_v_version_customisation_steps\` (\`_parent_id\`);`)
}

/** Drops the history tables, children first. Products themselves are untouched. */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`DROP TABLE \`_products_v_version_customisation_steps\`;`)
  await db.run(sql`DROP TABLE \`_products_v_version_performance_features\`;`)
  await db.run(sql`DROP TABLE \`_products_v_version_colourways\`;`)
  await db.run(sql`DROP TABLE \`_products_v\`;`)
}
