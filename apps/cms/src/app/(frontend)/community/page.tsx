import type { Metadata } from 'next'
import { CompanyPage } from '../../../components/site/CompanyPage'
import { COMMUNITY_PAGE } from '../../../lib/companyPages'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `careers/page.tsx` for the folder-name rule. */
const PATH = '/community'

export const metadata: Metadata = buildMetadata({
  title: COMMUNITY_PAGE.title,
  description: COMMUNITY_PAGE.description,
  path: PATH,
})

export default function CommunityPage() {
  return <CompanyPage page={COMMUNITY_PAGE} />
}
