import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * `updates_stopped_at` on template downloads: "Updates stopped on" (`updatesStoppedAt` in
 * `apps/cms/src/collections/TemplateDownloads.ts`; the owner said yes to this migration on 7 Nov
 * 2026: "one migration that adds this one nullable column and changes nothing else").
 *
 * Why it exists: the privacy page promises that when someone stops the updates "we keep just your
 * email address, so that no update reaches you again". `updates` and `updatesAt` are a locked record
 * of consent, so the stop needs its own field. The daily clean-up (`templateDownloadRetention.mjs`)
 * blanks every personal field but the email on a record that has this date, and never deletes it.
 *
 * HAND-WRITTEN, for the reason 20261106_190000_template_downloads records (`migrate:create` diffs
 * against the 20260729 snapshot and stops on an interactive question). The column shape is
 * `updates_at`'s in that migration: a Payload date field is `text`.
 *
 * ⚠️ NO DEFAULT, like `updates_at` and `delete_after`: a default would stamp every existing
 * download as "updates stopped", and the clean-up would then strip their names and companies.
 * `templateDownloads.test.ts` pins it.
 *
 * ADD COLUMN only: no table is rebuilt or dropped, so the implicit-DELETE cascade hazard in
 * .claude/rules/d1-migrations.md does not apply.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(sql`ALTER TABLE \`template_downloads\` ADD COLUMN \`updates_stopped_at\` text;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // A plain column with no index and no reference: SQLite drops it in place, without a rebuild.
  await db.run(sql`ALTER TABLE \`template_downloads\` DROP COLUMN \`updates_stopped_at\`;`)
}
