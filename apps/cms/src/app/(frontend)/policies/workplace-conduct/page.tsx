import type { Metadata } from 'next'
import { PolicyPage } from '../../../../components/site/PolicyPage'
import { policyAt } from '../../../../lib/policies'
import { buildMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/**
 * A policy page. The words are in `lib/policies.ts` (approved by the owner 2026-10-07) and
 * the layout in `components/site/PolicyPage.tsx`; this file is only the address.
 *
 * ⚠️ THE FOLDER NAME IS THE ADDRESS: it must equal this policy's `path` in `policies.ts` and
 * its entry in `POLICY_PAGE_SOURCES`. `policies.test.ts` checks all three.
 */
const PATH = '/policies/workplace-conduct'

export const metadata: Metadata = buildMetadata({
  title: policyAt(PATH).title,
  description: policyAt(PATH).description,
  path: PATH,
})

export default function WorkplaceConductPolicyPage() {
  return <PolicyPage policy={policyAt(PATH)} />
}
