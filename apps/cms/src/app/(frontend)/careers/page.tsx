import type { Metadata } from 'next'
import { CareersForm } from '../../../components/site/CareersForm'
import { CareersPage as CareersLayout } from '../../../components/site/CareersPage'
import { CAREERS_PAGE } from '../../../lib/companyPages'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The careers page. The words are in `lib/companyPages.ts` (approved by the owner
 * 2026-10-07) and the layout in `components/site/CareersPage.tsx` (its own since the owner
 * turned the guides' layout down, 2026-10-07); this file is only the address, the application
 * form (Phase 2, `CareersForm`) and its result.
 *
 * ⚠️ "WRITE TO US AT" IS THE APPLICATIONS INBOX, NOT THE SITE EMAIL (owner, 2026-10-07: "show
 * hr@ there"), and it is the SAME constant the form sends to (`APPLICATIONS_TO`), so the two
 * can never disagree. It is still never typed in `companyPages.ts` (its test refuses an `@`).
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS: it must equal `CAREERS_PAGE.path` and the entry in
 * `COMPANY_PAGE_SOURCES`. `companyPages.test.ts` checks all three.
 */
const PATH = '/careers'

export const metadata: Metadata = buildMetadata({
  title: CAREERS_PAGE.title,
  description: CAREERS_PAGE.description,
  path: PATH,
})

export default async function CareersPage({
  searchParams,
}: {
  searchParams: Promise<{ sent?: string; error?: string; reason?: string }>
}) {
  // Only these three codes are read; the page never shows a value from the address
  // (`careersNotice` picks every sentence from its own table).
  const { sent, error, reason } = await searchParams
  return <CareersLayout applyForm={<CareersForm query={{ sent, error, reason }} />} />
}
