import type { Metadata } from 'next'
import { CompanyPage } from '../../../components/site/CompanyPage'
import { CAREERS_PAGE } from '../../../lib/companyPages'
import { getSiteSettings } from '../../../lib/content'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The careers page. The words are in `lib/companyPages.ts` (approved by the owner
 * 2026-10-07) and the layout in `components/site/CompanyPage.tsx`; this file is only the
 * address. The application form arrives in Phase 2 above the "How to apply" section.
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

export default async function CareersPage() {
  // The apply email is the live settings' email, never a typed address. The second read
  // after the layout's is the same 60-second memory cache (`lib/content.ts`).
  const settings = await getSiteSettings()
  return <CompanyPage page={CAREERS_PAGE} applyEmail={settings.email} />
}
