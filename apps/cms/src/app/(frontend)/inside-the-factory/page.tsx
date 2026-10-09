import type { Metadata } from 'next'
import { FactoryPage as FactoryLayout } from '../../../components/site/FactoryPage'
import { FACTORY_PAGE } from '../../../lib/aboutPages'
import { buildMetadata } from '../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `careers/page.tsx` for the folder-name rule. */
const PATH = '/inside-the-factory'

export const metadata: Metadata = buildMetadata({
  title: FACTORY_PAGE.title,
  description: FACTORY_PAGE.description,
  path: PATH,
})

export default function FactoryPage() {
  return <FactoryLayout />
}
