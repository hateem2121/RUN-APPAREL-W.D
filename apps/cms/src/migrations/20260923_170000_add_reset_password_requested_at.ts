import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * Payload's 2026-09-18 security release (3.90.0, taken here as 3.90.1 — root
 * CLAUDE.md dependency traps) adds one new auth field and, separately, requires one
 * new upload-adapter bookkeeping field — three plain nullable columns in total, on
 * three tables, nothing else touched.
 *
 * HAND-WRITTEN, NOT GENERATED — for the reason 20260811_163415_catalogue_defaults and
 * 20260917_120000_add_web_vitals_values both give: `payload migrate:create` diffs
 * against the newest `.json` snapshot in this directory, which is still
 * `20260729_120855_add_raw_upload_retry.json` — every migration since has been
 * hand-written and none left a matching snapshot, so the baseline is many generations
 * stale. Running it here (`PAYLOAD_LOCAL_D1=1 payload migrate:create`) opened the SAME
 * class of prompt those two migrations describe: "Is `_objectkey` column in
 * `raw_uploads` table created or renamed from another column?" — asking whether a
 * brand-new field should instead be treated as a rename of `variant_mapping`, a column
 * two unrelated, already-live migrations away (20260724_100420_add_raw_uploads) and
 * deliberately still present (see that migration and RawUploads.ts). Answering it
 * either way through the generator risks it also re-emitting ALTER statements for
 * every column added since 2026-08-03, none of which its stale baseline knows already
 * exist. Stopped and hand-written instead, per that precedent.
 *
 * 1. `users.reset_password_requested_at` — Payload's own new field
 *    (`payload/dist/auth/baseFields/auth.js`, `resetPasswordRequestedAtField`,
 *    `type: 'date'`). It is added whenever `auth.forgotPassword.minRequestInterval` is
 *    greater than 0, which every auth collection gets BY DEFAULT
 *    (`addDefaultsToAuthConfig`, `payload/dist/collections/config/defaults.js:139`,
 *    defaults it to 15000ms) even though `Users.ts` never sets `forgotPassword` at all
 *    — confirmed against the installed 3.90.1 source, not assumed from the release
 *    notes alone. `users` is the only collection in this config with an `auth` block.
 *    `date` fields are already stored as nullable `text` here — see `updated_at`/
 *    `created_at` on every table, e.g. 20260811_163415_catalogue_defaults.
 *
 * 2. `media._objectkey` and `raw_uploads._objectkey` — NOT in the release notes' own
 *    breaking-change list, but load-bearing: `@payloadcms/plugin-cloud-storage`'s
 *    `getFields.js` now unconditionally pushes a `_objectKey` text field onto every
 *    collection using a storage adapter (both of this repo's `r2Storage()` calls in
 *    `payload.config.ts`), and `hooks/beforeChange.js` / `afterRead.js` /
 *    `afterDelete.js` all read it on every upload write, read and delete. Without this
 *    column the very first Media or RawUploads query after deploy fails outright —
 *    "no such column: _objectkey" — not just on some edge case; confirmed by reading
 *    the hooks, not inferred. The column name is Payload's own snake-casing of the
 *    field name `_objectKey`: `@payloadcms/drizzle`'s `schema/traverseFields.js:40`
 *    special-cases a leading underscore (`field.name[0] === '_' ? '_' : ''`) because
 *    the `to-snake-case` package it otherwise uses drops a leading separator entirely
 *    — confirmed against that package's own source AND against the exact string the
 *    interactive prompt above printed ("_objectkey"), which really is one
 *    lowercase run with no separator, not "_object_key".
 *
 * All three: `ALTER TABLE … ADD …` of one nullable column, on the table the field
 * actually belongs to. No table is rebuilt, renamed or copied, so nothing can cascade
 * — verified by apps/cms/src/migrationReplay/replay.test.ts, which replays this
 * against real SQLite with foreign keys ON and fails if any seeded table ends up
 * empty.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`users\` ADD \`reset_password_requested_at\` text;`)
  await db.run(sql`ALTER TABLE \`media\` ADD \`_objectkey\` text;`)
  await db.run(sql`ALTER TABLE \`raw_uploads\` ADD \`_objectkey\` text;`)
}

/**
 * Drops all three columns; no data loss beyond the columns themselves; the rows stay.
 */
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`raw_uploads\` DROP COLUMN \`_objectkey\`;`)
  await db.run(sql`ALTER TABLE \`media\` DROP COLUMN \`_objectkey\`;`)
  await db.run(sql`ALTER TABLE \`users\` DROP COLUMN \`reset_password_requested_at\`;`)
}
