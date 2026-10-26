import type { Metadata } from 'next'
import { PolicyPage } from '../../../../components/site/PolicyPage'
import { policyAt } from '../../../../lib/policies'
import { buildMetadata, metaTitleOf } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `workplace-conduct/page.tsx` for the folder-name rule. */
const PATH = '/policies/environmental'

export const metadata: Metadata = buildMetadata({
  title: metaTitleOf(policyAt(PATH)),
  description: policyAt(PATH).description,
  path: PATH,
})

export default function EnvironmentalPolicyPage() {
  return <PolicyPage policy={policyAt(PATH)} />
}
