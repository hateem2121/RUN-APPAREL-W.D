import type { Metadata } from 'next'
import { FaqTopicPage } from '../../../../components/site/FaqPages'
import { faqTopicAt } from '../../../../lib/faqs'
import { buildMetadata } from '../../../../lib/seo'

/** Rendered per request, like every page here (the layout reads the site settings). */
export const dynamic = 'force-dynamic'

/** See `faq/page.tsx` for the folder-name rule. */
const PATH = '/faq/fabrics-and-printing'

export const metadata: Metadata = buildMetadata({
  title: faqTopicAt(PATH).title,
  description: faqTopicAt(PATH).description,
  path: PATH,
})

export default function FaqFabricsPrintingPage() {
  return <FaqTopicPage topic={faqTopicAt(PATH)} />
}
