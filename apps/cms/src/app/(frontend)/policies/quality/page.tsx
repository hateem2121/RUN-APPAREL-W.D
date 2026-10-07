import type { Metadata } from 'next'
import { PolicyPage } from '../../../../components/site/PolicyPage'
import { policyAt } from '../../../../lib/policies'
import { buildMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `workplace-conduct/page.tsx` for the folder-name rule. */
const PATH = '/policies/quality'

export const metadata: Metadata = buildMetadata({
  title: policyAt(PATH).title,
  description: policyAt(PATH).description,
  path: PATH,
})

export default function QualityPolicyPage() {
  return <PolicyPage policy={policyAt(PATH)} />
}
