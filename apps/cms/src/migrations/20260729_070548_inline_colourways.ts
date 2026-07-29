import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Colours move from a top-level `colourways` collection onto the product itself
 * as an inline array.
 *
 * The DDL below is generated; the two `-- BACKFILL` blocks are hand-written and
 * are the whole point — without them this migration would create an empty
 * `products_colourways` and drop every existing colour on the floor.
 *
 * Three columns are deliberately NOT carried across, because they are now
 * derived rather than stored (see endpoints/projectViewer.ts):
 *   `sequence`   → the row's `_order`
 *   `is_default` → the first switched-on row
 *   `products.default_colourway_id` → same, so there is nothing left to disagree
 *
 * Rows are therefore ordered `is_default DESC, sequence` rather than plain
 * `sequence`: the old schema *gated* on exactly one active default, so that flag
 * carried real meaning (it decides which colour a retired QR code falls back to)
 * whereas `sequence` was free-form. Putting the old default first preserves it.
 * On the live database the two already agree — Navy is both — so nothing moves;
 * the `up` logs a warning if that is ever not the case.
 */
export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // ── BACKFILL, part 1 of 2 (hand-written) ───────────────────────────────────
  // Park the colours in a table with NO foreign keys before touching anything.
  //
  // The obvious shape — create `products_colourways`, copy into it, then rebuild
  // `products` — silently loses everything: `products_colourways._parent_id`
  // cascades on delete, and rebuilding `products` drops the old table, so the
  // implicit DELETE takes every row just copied with it. The result is a
  // migration that "succeeds" and leaves an empty colours array on every
  // product. Staging outside the foreign-key graph is what makes the copy
  // survive the rebuild.
  // Warn first, while `colourways` still exists, if any product's default was
  // not also its first colour — the one case where collapsing "tab order" and
  // "default colour" into a single ordering is visible to a visitor.
  const reordered = await db.get<{ n: number }>(sql`
    SELECT COUNT(*) AS n FROM colourways d
    WHERE d.is_default = 1
      AND EXISTS (
        SELECT 1 FROM colourways o
        WHERE o.product_id = d.product_id AND o.is_default = 0 AND o.sequence < d.sequence
      );
  `)
  if ((reordered?.n ?? 0) > 0) {
    payload.logger.warn(
      `inline_colourways: ${reordered!.n} product(s) had a default colour that was not first in tab order. ` +
        'The default has been moved to the top, so its colour tab now appears first on the viewer. ' +
        'Drag the rows on the product page if you want the old tab order back.',
    )
  }

  // EVERY child table of `products` has to be staged, not just the new one.
  //
  // Learned the hard way on 2026-07-29: this migration was shipped staging only
  // the colours, and the `DROP TABLE products` in the rebuild below cascade-
  // deleted `products_performance_features` and `products_customisation_steps`
  // too. The migration reported success, the colours arrived intact, and the live
  // page quietly lost its "Performance" list and its "How we build your product"
  // steps. Restored from the pre-deploy backup; the real fix is here.
  //
  // If a future migration rebuilds `products` again, every table listed by
  //   SELECT name FROM sqlite_master WHERE sql LIKE '%REFERENCES `products`%'
  // needs the same treatment.
  await db.run(sql`
    CREATE TABLE \`__staging_performance_features\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`feature\` text NOT NULL
    );
  `)
  await db.run(
    sql`INSERT INTO \`__staging_performance_features\` SELECT "_order","_parent_id","id","feature" FROM \`products_performance_features\`;`,
  )

  await db.run(sql`
    CREATE TABLE \`__staging_customisation_steps\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`number\` numeric NOT NULL,
      \`title\` text NOT NULL,
      \`body\` text NOT NULL
    );
  `)
  await db.run(
    sql`INSERT INTO \`__staging_customisation_steps\` SELECT "_order","_parent_id","id","number","title","body" FROM \`products_customisation_steps\`;`,
  )

  await db.run(sql`
    CREATE TABLE \`__staging_colourways\` (
      \`_order\` integer NOT NULL,
      \`_parent_id\` integer NOT NULL,
      \`id\` text PRIMARY KEY NOT NULL,
      \`display_name\` text NOT NULL,
      \`slug\` text NOT NULL,
      \`variant_id\` text,
      \`poster_preview_id\` integer,
      \`alt_text\` text,
      \`hex_swatch\` text,
      \`glb_asset_id\` integer,
      \`active\` integer DEFAULT true,
      \`note\` text
    );
  `)

  // `_order` is 1-based (matches products_performance_features). `id` is a
  // 24-char hex string, the shape Payload generates for array rows. The rank is
  // a correlated count rather than ROW_NUMBER() so this does not depend on
  // window-function support in whatever SQLite build D1 is running.
  await db.run(sql`
    INSERT INTO \`__staging_colourways\`
      ("_order", "_parent_id", "id", "display_name", "slug", "variant_id",
       "poster_preview_id", "alt_text", "hex_swatch", "glb_asset_id", "active", "note")
    SELECT
      (SELECT COUNT(*) FROM \`colourways\` c2
        WHERE c2.product_id = c1.product_id
          AND ( c2.is_default > c1.is_default
             OR (c2.is_default = c1.is_default AND c2.sequence < c1.sequence)
             OR (c2.is_default = c1.is_default AND c2.sequence = c1.sequence AND c2.id <= c1.id) )),
      c1.product_id,
      lower(hex(randomblob(12))),
      c1.display_name, c1.slug, c1.variant_id,
      c1.poster_preview_id, c1.alt_text, c1.hex_swatch, c1.glb_asset_id, c1.active, c1.note
    FROM \`colourways\` c1;
  `)

  const moved = await db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM \`__staging_colourways\`;`)
  payload.logger.info(`inline_colourways: staged ${moved?.n ?? 0} colour(s) for the move.`)

  // Empty `colourways` but do NOT drop it yet. `products` and `colourways`
  // reference each other, so with foreign keys live neither can go first:
  //   - drop `colourways` first  → the later `DROP TABLE products` fails with
  //     "no such table: main.colourways", because SQLite still has to resolve
  //     that product's dangling foreign key to run the implicit DELETE
  //   - drop `products` first    → its implicit DELETE fires
  //     `colourways.product_id ON DELETE SET NULL` against a NOT NULL column
  // Emptying it first defuses both: the table stays resolvable while `products`
  // is rebuilt, and every implicit DELETE now touches zero rows. It is dropped
  // further down, once nothing refers to it.
  //
  // (The generator's own answer to this was `PRAGMA foreign_keys=OFF`, which
  // does nothing on D1 — SQLite ignores that pragma inside a transaction, and
  // D1 wraps statements in one. Cloudflare's migration docs say to use
  // `PRAGMA defer_foreign_keys` instead, so that is what is below. The ordering
  // above is what actually makes this safe; the pragma is belt and braces.)
  await db.run(sql`DELETE FROM \`colourways\`;`)
  // ── end BACKFILL ───────────────────────────────────────────────────────────

  await db.run(sql`PRAGMA defer_foreign_keys = true;`)
  await db.run(sql`CREATE TABLE \`__new_products\` (
  	\`id\` integer PRIMARY KEY NOT NULL,
  	\`status\` text DEFAULT 'draft' NOT NULL,
  	\`sort_order\` numeric DEFAULT 0,
  	\`product_name\` text NOT NULL,
  	\`product_code\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`category\` text NOT NULL,
  	\`presentation_mode\` text DEFAULT 'floatingGarment' NOT NULL,
  	\`variant_mode\` text DEFAULT 'single-glb-variants' NOT NULL,
  	\`glb_asset_id\` integer,
  	\`poster_fallback_id\` integer,
  	\`variants_verified\` integer DEFAULT false,
  	\`file_colours\` text,
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
  	\`retired_message\` text DEFAULT 'The colourway linked by this QR is no longer active. You are viewing the current available reference.' NOT NULL,
  	\`updated_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	\`created_at\` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
  	FOREIGN KEY (\`glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`poster_fallback_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null
  );
  `)
  // HAND-EDITED. The generator emitted "file_colours" in BOTH the insert list and
  // the SELECT — but this reads from the OLD `products` table, which is exactly
  // the table that does not have that column yet (adding it is the whole point of
  // this rebuild). As generated, the statement aborts with
  //   no such column: "file_colours"
  // and the migration fails halfway, after `colourways` has already been dropped.
  // Caught by replaying these statements against a copy of a database that
  // actually holds the old schema. The column is simply left out of the copy; it
  // is NULL on the new table and the backfill below fills it in.
  await db.run(sql`INSERT INTO \`__new_products\`("id", "status", "sort_order", "product_name", "product_code", "slug", "category", "presentation_mode", "variant_mode", "glb_asset_id", "poster_fallback_id", "variants_verified", "fabric_composition", "gsm", "garment_fit", "customisation_intro", "front_camera_orbit", "back_camera_orbit", "side_camera_orbit", "camera_target", "default_field_of_view", "catalogue_url", "retired_message", "updated_at", "created_at") SELECT "id", "status", "sort_order", "product_name", "product_code", "slug", "category", "presentation_mode", "variant_mode", "glb_asset_id", "poster_fallback_id", "variants_verified", "fabric_composition", "gsm", "garment_fit", "customisation_intro", "front_camera_orbit", "back_camera_orbit", "side_camera_orbit", "camera_target", "default_field_of_view", "catalogue_url", "retired_message", "updated_at", "created_at" FROM \`products\`;`)
  await db.run(sql`DROP TABLE \`products\`;`)
  await db.run(sql`ALTER TABLE \`__new_products\` RENAME TO \`products\`;`)
  await db.run(sql`CREATE UNIQUE INDEX \`products_product_code_idx\` ON \`products\` (\`product_code\`);`)
  await db.run(sql`CREATE UNIQUE INDEX \`products_slug_idx\` ON \`products\` (\`slug\`);`)
  await db.run(sql`CREATE INDEX \`products_glb_asset_idx\` ON \`products\` (\`glb_asset_id\`);`)
  await db.run(sql`CREATE INDEX \`products_poster_fallback_idx\` ON \`products\` (\`poster_fallback_id\`);`)
  await db.run(sql`CREATE INDEX \`products_updated_at_idx\` ON \`products\` (\`updated_at\`);`)
  await db.run(sql`CREATE INDEX \`products_created_at_idx\` ON \`products\` (\`created_at\`);`)

  // ── BACKFILL, part 2 of 2 (hand-written) ───────────────────────────────────
  // `products` has been rebuilt, so the real array table can be created now and
  // its `_parent_id` cascade has nothing left to cascade away.
  await db.run(sql`CREATE TABLE \`products_colourways\` (
  	\`_order\` integer NOT NULL,
  	\`_parent_id\` integer NOT NULL,
  	\`id\` text PRIMARY KEY NOT NULL,
  	\`display_name\` text NOT NULL,
  	\`slug\` text NOT NULL,
  	\`variant_id\` text,
  	\`poster_preview_id\` integer,
  	\`alt_text\` text,
  	\`hex_swatch\` text,
  	\`glb_asset_id\` integer,
  	\`active\` integer DEFAULT true,
  	\`note\` text,
  	FOREIGN KEY (\`poster_preview_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`glb_asset_id\`) REFERENCES \`media\`(\`id\`) ON UPDATE no action ON DELETE set null,
  	FOREIGN KEY (\`_parent_id\`) REFERENCES \`products\`(\`id\`) ON UPDATE no action ON DELETE cascade
  );
  `)
  await db.run(sql`CREATE INDEX \`products_colourways_order_idx\` ON \`products_colourways\` (\`_order\`);`)
  await db.run(sql`CREATE INDEX \`products_colourways_parent_id_idx\` ON \`products_colourways\` (\`_parent_id\`);`)
  await db.run(sql`CREATE INDEX \`products_colourways_poster_preview_idx\` ON \`products_colourways\` (\`poster_preview_id\`);`)
  await db.run(sql`CREATE INDEX \`products_colourways_glb_asset_idx\` ON \`products_colourways\` (\`glb_asset_id\`);`)

  await db.run(sql`
    INSERT INTO \`products_colourways\`
      ("_order", "_parent_id", "id", "display_name", "slug", "variant_id",
       "poster_preview_id", "alt_text", "hex_swatch", "glb_asset_id", "active", "note")
    SELECT
      "_order", "_parent_id", "id", "display_name", "slug", "variant_id",
      "poster_preview_id", "alt_text", "hex_swatch", "glb_asset_id", "active", "note"
    FROM \`__staging_colourways\`;
  `)
  await db.run(sql`DROP TABLE \`__staging_colourways\`;`)

  // Put the two pre-existing arrays back — the rebuild's cascade emptied them.
  await db.run(
    sql`INSERT INTO \`products_performance_features\` ("_order","_parent_id","id","feature") SELECT "_order","_parent_id","id","feature" FROM \`__staging_performance_features\`;`,
  )
  await db.run(sql`DROP TABLE \`__staging_performance_features\`;`)
  await db.run(
    sql`INSERT INTO \`products_customisation_steps\` ("_order","_parent_id","id","number","title","body") SELECT "_order","_parent_id","id","number","title","body" FROM \`__staging_customisation_steps\`;`,
  )
  await db.run(sql`DROP TABLE \`__staging_customisation_steps\`;`)

  const landed = await db.get<{ n: number }>(sql`SELECT COUNT(*) AS n FROM \`products_colourways\`;`)
  const perf = await db.get<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM \`products_performance_features\`;`,
  )
  const steps = await db.get<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM \`products_customisation_steps\`;`,
  )
  payload.logger.info(
    `inline_colourways: moved ${landed?.n ?? 0} colour(s) onto their products; ` +
      `kept ${perf?.n ?? 0} performance feature(s) and ${steps?.n ?? 0} customisation step(s) through the products rebuild.`,
  )

  // `file_colours` is the list of colour names the shrink robot found inside the
  // processed GLB; it feeds the "Which colour in your CLO file is this?" dropdown
  // and the derived "Colours checked" flag. Existing single-file products already
  // satisfy the old contract — their `variantId`s ARE the KHR_materials_variants
  // names in the merged GLB — so seeding it from them keeps those products
  // verified and their dropdowns populated instead of silently un-publishable.
  // Runs after the products rebuild because that is what adds the column;
  // `products_colourways` survives the rebuild, so the data is still here.
  await db.run(sql`
    UPDATE \`products\` SET \`file_colours\` = (
      SELECT json_group_array(variant_id) FROM (
        SELECT variant_id FROM \`products_colourways\`
        WHERE _parent_id = \`products\`.id AND variant_id IS NOT NULL AND variant_id <> ''
        ORDER BY _order
      )
    )
    WHERE \`variant_mode\` = 'single-glb-variants'
      AND EXISTS (
        SELECT 1 FROM \`products_colourways\`
        WHERE _parent_id = \`products\`.id AND variant_id IS NOT NULL AND variant_id <> ''
      );
  `)
  // ── end BACKFILL ───────────────────────────────────────────────────────────

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
  await db.run(sql`INSERT INTO \`__new_payload_locked_documents_rels\`("id", "order", "parent_id", "path", "users_id", "media_id", "raw_uploads_id", "products_id", "events_id") SELECT "id", "order", "parent_id", "path", "users_id", "media_id", "raw_uploads_id", "products_id", "events_id" FROM \`payload_locked_documents_rels\`;`)
  await db.run(sql`DROP TABLE \`payload_locked_documents_rels\`;`)
  await db.run(sql`ALTER TABLE \`__new_payload_locked_documents_rels\` RENAME TO \`payload_locked_documents_rels\`;`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_order_idx\` ON \`payload_locked_documents_rels\` (\`order\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_parent_idx\` ON \`payload_locked_documents_rels\` (\`parent_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_path_idx\` ON \`payload_locked_documents_rels\` (\`path\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_users_id_idx\` ON \`payload_locked_documents_rels\` (\`users_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_media_id_idx\` ON \`payload_locked_documents_rels\` (\`media_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_raw_uploads_id_idx\` ON \`payload_locked_documents_rels\` (\`raw_uploads_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_products_id_idx\` ON \`payload_locked_documents_rels\` (\`products_id\`);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_events_id_idx\` ON \`payload_locked_documents_rels\` (\`events_id\`);`)

  // Safe only here. `products` lost its `default_colourway_id` foreign key in the
  // rebuild above, and `payload_locked_documents_rels` lost its `colourways_id`
  // one just now, so this is the first point at which nothing refers to the
  // table. It has been empty since the backfill.
  await db.run(sql`DROP TABLE \`colourways\`;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
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

  // ── BACKFILL (hand-written) ────────────────────────────────────────────────
  // A rollback that silently emptied the colours would be worse than no rollback
  // at all, so the data goes back too. `sequence` comes from `_order` and the
  // first row becomes the default, inverting exactly what `up` collapsed.
  //
  // Two columns are NOT NULL in the old schema but optional in the new one, so
  // rows that cannot be represented are handled explicitly rather than aborting
  // the whole rollback:
  //   - variant_id is also UNIQUE → an unmapped colour gets a placeholder
  //   - poster_preview_id has no sane placeholder → those rows are skipped, loudly
  const skipped = await db.get<{ n: number }>(
    sql`SELECT COUNT(*) AS n FROM \`products_colourways\` WHERE poster_preview_id IS NULL;`,
  )
  if ((skipped?.n ?? 0) > 0) {
    payload.logger.warn(
      `inline_colourways (down): ${skipped!.n} colour(s) have no photo and cannot be represented in the old schema — they were NOT restored.`,
    )
  }

  await db.run(sql`
    INSERT INTO \`colourways\`
      ("product_id", "variant_id", "display_name", "slug", "sequence",
       "poster_preview_id", "glb_asset_id", "active", "is_default", "alt_text", "hex_swatch", "note")
    SELECT
      _parent_id,
      COALESCE(NULLIF(variant_id, ''), 'UNMAPPED-' || id),
      display_name, slug, _order,
      poster_preview_id, glb_asset_id, active,
      CASE WHEN _order = 1 THEN 1 ELSE 0 END,
      COALESCE(NULLIF(alt_text, ''), display_name),
      hex_swatch, note
    FROM \`products_colourways\`
    WHERE poster_preview_id IS NOT NULL;
  `)
  // ── end BACKFILL ───────────────────────────────────────────────────────────

  await db.run(sql`DROP TABLE \`products_colourways\`;`)
  await db.run(sql`ALTER TABLE \`products\` ADD \`default_colourway_id\` integer REFERENCES colourways(id);`)
  await db.run(sql`CREATE INDEX \`products_default_colourway_idx\` ON \`products\` (\`default_colourway_id\`);`)

  // Re-point each product at its restored default, or the old gate would reject
  // every published product on the next save.
  await db.run(sql`
    UPDATE \`products\` SET \`default_colourway_id\` = (
      SELECT id FROM \`colourways\`
      WHERE product_id = \`products\`.id AND is_default = 1
      ORDER BY sequence LIMIT 1
    );
  `)

  await db.run(sql`ALTER TABLE \`products\` DROP COLUMN \`file_colours\`;`)
  await db.run(sql`ALTER TABLE \`payload_locked_documents_rels\` ADD \`colourways_id\` integer REFERENCES colourways(id);`)
  await db.run(sql`CREATE INDEX \`payload_locked_documents_rels_colourways_id_idx\` ON \`payload_locked_documents_rels\` (\`colourways_id\`);`)
}
