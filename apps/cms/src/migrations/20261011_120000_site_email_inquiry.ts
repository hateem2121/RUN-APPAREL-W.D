import { type MigrateDownArgs, type MigrateUpArgs, sql } from '@payloadcms/db-d1-sqlite'

/**
 * The buyers' address is inquiry@wear-run.com since 2026-10-11 (owner; DECISIONS-BETA-WEBSITE D37):
 * every address the site shows is an alias of team@, so mail that came from the website is told
 * apart. The Site Settings email is what the footer, the contact page, the Email buttons, the
 * garment pages and Google's company data show, and where the contact form's notification goes.
 *
 * The same shape as 20261005_120000_footer_tab_one_name, for the same reason: the code default
 * moves with this commit (`globals/SiteSettings.ts`, `DEFAULT_SITE_SETTINGS`), and the STORED value
 * would not, so every page would keep partner@ until someone edited the admin. The owner chose this
 * over editing the admin after the deploy (2026-10-11), so the address changes with the deploy.
 *
 * ⚠️ GUARDED ON THE EXACT OLD ADDRESS: an address the owner has typed in the admin is left alone.
 * Idempotent: a second run matches nothing. No table is rebuilt and no row is added or removed,
 * so none of the cascade hazards in .claude/rules/d1-migrations.md apply. The column's own SQL
 * default stays partner@ (20260720_185735_initial): changing a column's default in SQLite is a
 * table rebuild, and Payload writes its own default whenever it creates the row.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.run(
    sql`UPDATE \`site_settings\` SET \`email\` = 'inquiry@wear-run.com' WHERE \`email\` = 'partner@wear-run.com';`,
  )
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Back to the old address, guarded the same way: only the address this migration wrote.
  await db.run(
    sql`UPDATE \`site_settings\` SET \`email\` = 'partner@wear-run.com' WHERE \`email\` = 'inquiry@wear-run.com';`,
  )
}
