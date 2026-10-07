import type { Metadata } from 'next'
import { PolicyIndex } from '../../components/site/PolicyIndex'
import { POLICIES_INDEX } from '../../lib/policies'
import { buildMetadata } from '../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * The policies hub. The words are in `lib/policies.ts` (approved by the owner 2026-10-07)
 * and the layout in `components/site/PolicyIndex.tsx`; this file is only the address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS: it must equal `POLICIES_INDEX.path` and the hub's entry
 * in `POLICY_PAGE_SOURCES`. `policies.test.ts` checks all three.
 */
const PATH = '/policies'

export const metadata: Metadata = buildMetadata({
  title: POLICIES_INDEX.title,
  description: POLICIES_INDEX.description,
  path: PATH,
})

export default function PoliciesPage() {
  return <PolicyIndex />
}
