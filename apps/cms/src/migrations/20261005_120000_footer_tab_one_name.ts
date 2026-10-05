import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The footer's tab says "Start a conversation", the site's one name for that action (polish X20,
 * the owner's answer Q9 of 2026-10-03: "Start a conversation" everywhere; the tab said "Start an
 * inquiry", and the same action had five other names on the site).
 *
 * The same shape as the data change in 20260907_120000_add_inquiries, for the same reason: the
 * code default moves with this commit (`globals/SiteSettings.ts`, `EMPTY_FOOTER` in
 * packages/shared/src/siteFooter.ts), and the STORED value would not, so every page's footer
 * would keep the old name. Measured 2026-10-05: the local test database still drew "Start an
 * inquiry" after the code default had changed, because its row stores the label.
 *
 * ⚠️ GUARDED ON THE EXACT OLD DEFAULT, as that one was: a label the owner has typed in the admin
 * is left alone. Idempotent: a second run matches nothing. No table is rebuilt and no row is added
 * or removed, so none of the cascade hazards in .claude/rules/d1-migrations.md apply. The
 * column's own SQL default stays the 2026-09-05 text, as it did through the 2026-09-07 change:
 * changing a column's default in SQLite is a table rebuild.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`UPDATE \`site_settings\` SET \`cta_label\` = 'Start a conversation' WHERE \`cta_label\` = 'Start an inquiry';`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Back to the old name, guarded the same way: only the label this migration wrote.
  await db.run(
    sql`UPDATE \`site_settings\` SET \`cta_label\` = 'Start an inquiry' WHERE \`cta_label\` = 'Start a conversation';`,
  )
}
